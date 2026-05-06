"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContracts, useChainId, useSwitchChain } from "wagmi";
import { parseUnits, isAddress } from "viem";
import type { EIP1193Provider } from "viem";
import Navbar from "@/components/Navbar";
import { HistoryIcon } from "@/components/HistoryIcon";
import { ChainLogo } from "@/components/ChainLogo";
import { ERC20_ABI } from "@/config/contracts";
import {
  CHAIN_METADATA,
  CHAIN_USDC_ADDRESSES,
  type CrosschainChain,
} from "@/config/crosschain";
import { arcTestnet } from "@/config/wagmi";
import { useRadiusAuth } from "@/lib/auth";

type BridgeStatus = "idle" | "estimating" | "approving" | "burning" | "attesting" | "minting" | "success" | "error";

const ALL_CHAINS = Object.keys(CHAIN_METADATA) as CrosschainChain[];

export default function BridgePage() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { authenticated, address: authAddress, provider: authProvider, chainId: authChainId, switchChain: switchAuthChain } = useRadiusAuth();
  const address = wagmiAddress ?? authAddress;
  const isConnected = wagmiConnected || authenticated;
  const wagmiChainId = useChainId();
  const activeChainId = wagmiConnected ? wagmiChainId : authChainId;
  const { switchChainAsync } = useSwitchChain();

  const [fromChain, setFromChain] = useState<CrosschainChain>("Arc_Testnet");
  const [toChain, setToChain] = useState<CrosschainChain>("Ethereum_Sepolia");
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [sendToSelf, setSendToSelf] = useState(true);
  const [useForwarder, setUseForwarder] = useState(true);
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [progressLabel, setProgressLabel] = useState("");
  const [history, setHistory] = useState<{ hash: string; label: string; time: string }[]>([]);

  const sourceMeta = CHAIN_METADATA[fromChain];
  const destMeta = CHAIN_METADATA[toChain];
  const isOnSourceChain = activeChainId === sourceMeta.chainId;
  const validAmount = Number(amount) > 0 && Number.isFinite(Number(amount));
  const effectiveRecipient = sendToSelf ? (address ?? "") : recipient;
  const validRecipient = !!effectiveRecipient && isAddress(effectiveRecipient);
  const sourceUsdc = CHAIN_USDC_ADDRESSES[fromChain] as `0x${string}`;

  // Embedded wallets (social login) always need forwarder
  const isEmbeddedWallet = authenticated && !wagmiConnected;

  // Auto-apply forwarder for embedded wallets
  useEffect(() => {
    if (isEmbeddedWallet) setUseForwarder(true);
  }, [isEmbeddedWallet]);

  // Clear recipient when switching to "My wallet"
  useEffect(() => {
    if (sendToSelf && address) setRecipient("");
  }, [sendToSelf, address]);

  useEffect(() => {
    if (!showFromPicker && !showToPicker) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [showFromPicker, showToPicker]);

  const { data: balanceData } = useReadContracts({
    contracts: address ? [{
      address: sourceUsdc,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: [address],
      chainId: sourceMeta.chainId,
    }] : [],
    query: { enabled: !!address },
  });

  const usdcBalance = balanceData?.[0]?.result as bigint | undefined;
  const requestedRaw = validAmount ? parseUnits(amount, 6) : BigInt(0);
  const hasEnough = typeof usdcBalance === "bigint" ? usdcBalance >= requestedRaw : false;
  const formattedBalance = usdcBalance !== undefined ? (Number(usdcBalance) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—";
  const canBridge = isConnected && isOnSourceChain && validAmount && validRecipient && hasEnough && fromChain !== toChain && status !== "estimating" && status !== "approving" && status !== "burning" && status !== "minting";

  function switchDirection() {
    const tmp = fromChain;
    setFromChain(toChain);
    setToChain(tmp);
    setError("");
    setTxHash("");
  }

  function getActiveProvider(): EIP1193Provider | null {
    if (authProvider) return authProvider as EIP1193Provider;
    return (globalThis as typeof globalThis & { ethereum?: EIP1193Provider }).ethereum ?? null;
  }

  async function switchToSource() {
    if (wagmiConnected && switchChainAsync) await switchChainAsync({ chainId: sourceMeta.chainId });
    else if (authenticated) await switchAuthChain(sourceMeta.chainId);
  }

  async function handleBridge(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return;
    if (!validAmount) { setStatus("error"); setError("Enter a valid amount."); return; }
    if (!validRecipient) { setStatus("error"); setError("Enter a valid address."); return; }
    if (!isOnSourceChain) { setStatus("error"); setError(`Switch to ${sourceMeta.label} first.`); return; }
    if (!hasEnough) { setStatus("error"); setError("Insufficient USDC balance."); return; }
    if (fromChain === toChain) { setStatus("error"); setError("Source and destination must differ."); return; }

    const provider = getActiveProvider();
    if (!provider) { setStatus("error"); setError("Wallet provider unavailable."); return; }

    try {
      setStatus("estimating");
      setError("");
      setProgressLabel("Preparing bridge transfer…");

      const { AppKit } = await import("@circle-fin/app-kit");
      const { createViemAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
      const adapter = await createViemAdapterFromProvider({ provider });
      const kit = new AppKit();

      const kitKey = process.env.NEXT_PUBLIC_CIRCLE_KIT_KEY?.trim();
      if (!kitKey) throw new Error("Circle Kit key not configured.");

      const destination = useForwarder
        ? { chain: toChain, recipientAddress: effectiveRecipient, useForwarder: true as const }
        : { adapter, chain: toChain, recipientAddress: effectiveRecipient };

      setProgressLabel("Estimating fees…");
      await kit.estimateBridge({
        from: { adapter, chain: fromChain },
        to: destination,
        amount,
        token: "USDC",
        config: { transferSpeed: "FAST" as const, batchTransactions: false },
      });

      setStatus("burning");
      setProgressLabel("Confirming in wallet…");

      const result = await kit.bridge({
        from: { adapter, chain: fromChain },
        to: destination,
        amount,
        token: "USDC",
        config: { transferSpeed: "FAST" as const, batchTransactions: false },
      });

      const steps = (result as { steps?: { txHash?: string; data?: { txHash?: string } }[] }).steps ?? [];
      let hash = "";
      for (let i = steps.length - 1; i >= 0; i--) {
        hash = steps[i]?.txHash ?? (steps[i]?.data as { txHash?: string })?.txHash ?? "";
        if (hash) break;
      }

      setTxHash(hash);
      setHistory((prev) => [{ hash, label: `${amount} USDC · ${sourceMeta.label} → ${destMeta.label}`, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 20));
      setStatus("success");
      setProgressLabel("");
    } catch (err: unknown) {
      setStatus("error");
      const msg = err instanceof Error ? err.message : "Bridge failed";
      setError(msg.includes("User rejected") ? "Transaction rejected." : msg.slice(0, 220));
      setProgressLabel("");
    }
  }

  function ChainPicker({ open, onClose, onSelect, exclude }: { open: boolean; onClose: () => void; onSelect: (c: CrosschainChain) => void; exclude?: CrosschainChain }) {
    if (!open) return null;
    return (
      <div className="glass-modal-overlay" onClick={onClose}>
        <div className="glass-modal" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Select chain</h3>
            <button onClick={onClose} className="modal-close-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          {ALL_CHAINS.filter((c) => c !== exclude).map((chain) => (
            <button key={chain} onClick={() => { onSelect(chain); onClose(); }} className="chain-picker-row" style={{ marginBottom: 6 }}>
              <ChainLogo chainKey={chain} size={32} />
              <div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{CHAIN_METADATA[chain].label}</span>
                <span className="text-xs text-[var(--muted)] block">Chain ID: {CHAIN_METADATA[chain].chainId}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="dex-page">
      <Navbar />
      <div className="dex-container" style={{ maxWidth: 640, paddingTop: 40 }}>
        <div className="dex-card" style={{ padding: 36 }}>
          <form onSubmit={handleBridge} className="space-y-5">
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--brand)" }}>Cross-chain</p>
                <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em" }}>Bridge USDC</h1>
                <p style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>Circle CCTP · Any chain to any chain</p>
              </div>
              <HistoryIcon entries={history} title="Bridge History" />
            </div>

            {/* Chain selector */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center" }}>
              <button type="button" onClick={() => setShowFromPicker(true)} className="dex-card-sm" style={{ cursor: "pointer", textAlign: "center" }}>
                <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>From</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <ChainLogo chainKey={fromChain} size={24} />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{sourceMeta.label}</span>
                </div>
              </button>
              <button type="button" onClick={switchDirection} className="swap-arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M7 7h11"/><path d="m14 3 4 4-4 4"/><path d="M17 17H6"/><path d="m10 21-4-4 4-4"/></svg>
              </button>
              <button type="button" onClick={() => setShowToPicker(true)} className="dex-card-sm" style={{ cursor: "pointer", textAlign: "center" }}>
                <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>To</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <ChainLogo chainKey={toChain} size={24} />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{destMeta.label}</span>
                </div>
              </button>
            </div>

            {/* Amount */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)" }}>Amount (USDC)</label>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Balance: {formattedBalance}</span>
              </div>
              <input type="text" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} className="dex-input" style={{ fontSize: 24, fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)" }} />
              {!hasEnough && amount && validAmount && <p style={{ marginTop: 8, fontSize: 12, color: "#ef4444" }}>Insufficient USDC balance.</p>}
            </div>

            {/* Recipient */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)" }}>Recipient</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setSendToSelf(true)}
                    style={{
                      fontSize: 12,
                      padding: "5px 14px",
                      borderRadius: 10,
                      border: sendToSelf ? "1px solid rgba(96, 165, 250, 0.3)" : "none",
                      cursor: "pointer",
                      fontWeight: 600,
                      transition: "all 0.15s",
                      background: sendToSelf ? "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #60a5fa 100%)" : "rgba(255, 255, 255, 0.06)",
                      backdropFilter: "blur(8px)",
                      WebkitBackdropFilter: "blur(8px)",
                      color: sendToSelf ? "#fff" : "var(--muted)",
                      boxShadow: sendToSelf ? "0 0 12px rgba(37, 99, 235, 0.25)" : "none",
                    }}
                  >
                    My Wallet
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendToSelf(false)}
                    style={{
                      fontSize: 12,
                      padding: "5px 14px",
                      borderRadius: 10,
                      border: !sendToSelf ? "1px solid rgba(96, 165, 250, 0.3)" : "none",
                      cursor: "pointer",
                      fontWeight: 600,
                      transition: "all 0.15s",
                      background: !sendToSelf ? "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #60a5fa 100%)" : "rgba(255, 255, 255, 0.06)",
                      backdropFilter: "blur(8px)",
                      WebkitBackdropFilter: "blur(8px)",
                      color: !sendToSelf ? "#fff" : "var(--muted)",
                      boxShadow: !sendToSelf ? "0 0 12px rgba(37, 99, 235, 0.25)" : "none",
                    }}
                  >
                    Other Address
                  </button>
                </div>
              </div>
              {!sendToSelf && (
                <input type="text" placeholder="0x…" value={recipient} onChange={(e) => { setRecipient(e.target.value); setError(""); }} className="dex-input" style={{ fontSize: 14 }} />
              )}
              {sendToSelf && address && (
                <div style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  fontFamily: "var(--font-geist-mono, monospace)",
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "rgba(0, 0, 0, 0.18)",
                }}>
                  {address.slice(0, 10)}…{address.slice(-8)} (your wallet)
                </div>
              )}
            </div>

            {/* Auto Forwarder Toggle */}
            <div style={{ marginTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)" }}>Auto Forwarder</label>
                  <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Pays destination minting for convenience.</p>
                </div>
                <button
                  type="button"
                  onClick={() => { if (!isEmbeddedWallet) setUseForwarder((v) => !v); }}
                  disabled={isEmbeddedWallet}
                  style={{
                    width: 48,
                    height: 26,
                    borderRadius: 13,
                    border: "none",
                    cursor: isEmbeddedWallet ? "not-allowed" : "pointer",
                    position: "relative",
                    transition: "background 0.2s",
                    background: useForwarder ? "#2563eb" : "rgba(255, 255, 255, 0.1)",
                    opacity: isEmbeddedWallet ? 0.7 : 1,
                  }}
                  aria-label={isEmbeddedWallet ? "Auto Forwarder required for embedded wallets" : (useForwarder ? "Disable Auto Forwarder" : "Enable Auto Forwarder")}
                >
                  <span style={{
                    position: "absolute",
                    top: 3,
                    left: useForwarder ? 23 : 3,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 0.2s",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                  }} />
                </button>
              </div>
              <div style={{
                fontSize: 12,
                color: "var(--muted)",
                padding: "10px 14px",
                borderRadius: 12,
                background: "rgba(255, 255, 255, 0.06)",
              }}>
                <b style={{ color: "var(--foreground)" }}>Auto Forwarder: {useForwarder ? "On" : "Off"}</b>
                <br />
                {isEmbeddedWallet
                  ? "Auto Forwarder is required for embedded wallets (social login)."
                  : useForwarder
                    ? "Fastest path, but may add a forwarder fee."
                    : "Lower fee path. You may need to confirm minting on the destination chain."}
              </div>
              {isEmbeddedWallet && (
                <p style={{
                  marginTop: 8,
                  fontSize: 12,
                  fontWeight: 500,
                  padding: "8px 14px",
                  borderRadius: 12,
                  background: "rgba(245, 158, 11, 0.1)",
                  color: "#f59e0b",
                }}>
                  Auto Forwarder is required for embedded wallets.
                </p>
              )}
            </div>

            {/* Status */}
            {progressLabel && status !== "success" && (
              <div className="dex-card-sm" style={{ background: "rgba(37,99,235,0.06)", borderColor: "rgba(37,99,235,0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="status-dot" />
                  <span style={{ fontSize: 13, color: "var(--brand)" }}>{progressLabel}</span>
                </div>
              </div>
            )}

            {error && <div style={{ borderRadius: 16, padding: 12, fontSize: 13, background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>{error}</div>}

            {txHash && (
              <a href={`${sourceMeta.explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="tx-hash" style={{ display: "block", borderRadius: 16, padding: 12, fontSize: 13, background: "rgba(34,197,94,0.08)", color: "#22c55e" }}>
                View transaction → {txHash.slice(0, 10)}…{txHash.slice(-8)}
              </a>
            )}

            {/* Action */}
            {!isConnected ? (
              <button className="dex-btn dex-btn-full" disabled>Connect wallet to bridge</button>
            ) : !isOnSourceChain ? (
              <button type="button" onClick={switchToSource} className="dex-btn dex-btn-full">Switch to {sourceMeta.label}</button>
            ) : (
              <button type="submit" disabled={!canBridge} className="dex-btn dex-btn-full">
                {status === "estimating" ? "Estimating…" :
                 status === "approving" ? "Approving…" :
                 status === "burning" ? "Bridging…" :
                 status === "minting" ? "Minting…" :
                 `Bridge to ${destMeta.label}`}
              </button>
            )}
          </form>
        </div>

        {/* How it works */}
        <div className="dex-card" style={{ marginTop: 24, padding: 24 }}>
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>How it works</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14, color: "var(--muted)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}><span className="dex-badge">1</span><span>Approve USDC spend for the Circle bridge contract</span></div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}><span className="dex-badge">2</span><span>USDC is burned on the source chain</span></div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}><span className="dex-badge">3</span><span>Circle attestation confirms the burn (30s–5min)</span></div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}><span className="dex-badge">4</span><span>USDC is minted on the destination chain</span></div>
          </div>
        </div>
      </div>

      <ChainPicker open={showFromPicker} onClose={() => setShowFromPicker(false)} onSelect={setFromChain} exclude={toChain} />
      <ChainPicker open={showToPicker} onClose={() => setShowToPicker(false)} onSelect={setToChain} exclude={fromChain} />
    </div>
  );
}
