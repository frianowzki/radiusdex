"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContracts, useChainId, useSwitchChain } from "wagmi";
import { parseUnits, isAddress } from "viem";
import type { EIP1193Provider } from "viem";
import Navbar from "@/components/Navbar";
import { HistoryIcon } from "@/components/HistoryIcon";
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

const CHAIN_ICONS: Record<string, string> = {
  Arc_Testnet: "A",
  Ethereum_Sepolia: "E",
  Base_Sepolia: "B",
  Arbitrum_Sepolia: "A",
  Avalanche_Fuji: "AV",
  Optimism_Sepolia: "O",
  Polygon_Amoy_Testnet: "P",
  Linea_Sepolia: "L",
  Unichain_Sepolia: "U",
  World_Chain_Sepolia: "W",
  Ink_Testnet: "I",
  Monad_Testnet: "M",
  HyperEVM_Testnet: "H",
  Plume_Testnet: "PL",
  Sei_Testnet: "S",
  XDC_Apothem: "X",
  Codex_Testnet: "C",
};

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

  useEffect(() => {
    if (sendToSelf && address) setRecipient(address);
  }, [address, sendToSelf]);

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

      const useForwarder = true;
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
      <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
        <div className="dex-card" style={{ maxWidth: 420, width: "90%", maxHeight: "60vh", overflow: "auto", padding: 28 }} onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-4">
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Select chain</h3>
            <button onClick={onClose} className="dex-btn-ghost" style={{ padding: 6 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="space-y-1">
            {ALL_CHAINS.filter((c) => c !== exclude).map((chain) => (
              <button
                key={chain}
                onClick={() => { onSelect(chain); onClose(); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--foreground)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(37,99,235,0.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div className="token-logo" style={{ background: "var(--brand)", fontSize: 11 }}>{CHAIN_ICONS[chain]}</div>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{CHAIN_METADATA[chain].label}</span>
                  <span className="text-xs text-[var(--muted)] block">Chain ID: {CHAIN_METADATA[chain].chainId}</span>
                </div>
              </button>
            ))}
          </div>
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
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand)]">Cross-chain</p>
                <h1 className="text-2xl font-black tracking-tight text-[var(--foreground)]">Bridge USDC</h1>
                <p className="mt-1 text-xs text-[var(--muted)]">Circle CCTP · Any chain to any chain</p>
              </div>
              <HistoryIcon entries={history} title="Bridge History" />
            </div>

            {/* Chain selector — popup style */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <button type="button" onClick={() => setShowFromPicker(true)} className="dex-card-sm text-center" style={{ cursor: "pointer" }}>
                <p className="text-xs text-[var(--muted)] mb-1">From</p>
                <div className="flex items-center justify-center gap-2">
                  <div className="token-logo" style={{ background: "var(--brand)", fontSize: 10, width: 24, height: 24 }}>{CHAIN_ICONS[fromChain]}</div>
                  <span className="text-sm font-bold">{sourceMeta.label}</span>
                </div>
              </button>
              <button type="button" onClick={switchDirection} className="swap-arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M7 7h11"/><path d="m14 3 4 4-4 4"/><path d="M17 17H6"/><path d="m10 21-4-4 4-4"/></svg>
              </button>
              <button type="button" onClick={() => setShowToPicker(true)} className="dex-card-sm text-center" style={{ cursor: "pointer" }}>
                <p className="text-xs text-[var(--muted)] mb-1">To</p>
                <div className="flex items-center justify-center gap-2">
                  <div className="token-logo" style={{ background: "var(--purple)", fontSize: 10, width: 24, height: 24 }}>{CHAIN_ICONS[toChain]}</div>
                  <span className="text-sm font-bold">{destMeta.label}</span>
                </div>
              </button>
            </div>

            {/* Amount */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Amount (USDC)</label>
                <span className="text-xs text-[var(--muted)]">Balance: {formattedBalance}</span>
              </div>
              <input type="text" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} className="dex-input" style={{ fontSize: 24, fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)" }} />
              {!hasEnough && amount && validAmount && <p className="mt-2 text-xs text-red-500">Insufficient USDC balance.</p>}
            </div>

            {/* Recipient */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Recipient</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setSendToSelf(true)} className={`text-xs px-2 py-1 rounded-lg transition-colors ${sendToSelf ? "bg-[var(--brand)] text-white" : "text-[var(--muted)]"}`} style={{ border: "none", cursor: "pointer" }}>My wallet</button>
                  <button type="button" onClick={() => setSendToSelf(false)} className={`text-xs px-2 py-1 rounded-lg transition-colors ${!sendToSelf ? "bg-[var(--brand)] text-white" : "text-[var(--muted)]"}`} style={{ border: "none", cursor: "pointer" }}>Other address</button>
                </div>
              </div>
              {!sendToSelf && (
                <input type="text" placeholder="0x…" value={recipient} onChange={(e) => { setRecipient(e.target.value); setError(""); }} className="dex-input" style={{ fontSize: 14 }} />
              )}
              {sendToSelf && address && (
                <div className="dex-card-sm text-xs text-[var(--muted)]" style={{ fontFamily: "var(--font-geist-mono, monospace)" }}>
                  {address.slice(0, 10)}…{address.slice(-8)} (your wallet)
                </div>
              )}
            </div>

            {/* Status */}
            {progressLabel && status !== "success" && (
              <div className="dex-card-sm" style={{ background: "rgba(37,99,235,0.06)", borderColor: "rgba(37,99,235,0.2)" }}>
                <div className="flex items-center gap-3">
                  <div className="status-dot" />
                  <span className="text-sm text-[var(--brand)]">{progressLabel}</span>
                </div>
              </div>
            )}

            {error && <div className="rounded-2xl p-3 text-xs font-medium" style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>{error}</div>}

            {txHash && (
              <a href={`${sourceMeta.explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="tx-hash block rounded-2xl p-3 text-xs font-semibold" style={{ background: "rgba(34,197,94,0.08)", color: "#22c55e" }}>
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
        <div className="dex-card mt-6" style={{ padding: 24 }}>
          <p className="dex-section-title" style={{ marginBottom: 12 }}>How it works</p>
          <div className="space-y-3 text-sm text-[var(--muted)]">
            <div className="flex items-start gap-3"><span className="dex-badge">1</span><span>Approve USDC spend for the Circle bridge contract</span></div>
            <div className="flex items-start gap-3"><span className="dex-badge">2</span><span>USDC is burned on the source chain</span></div>
            <div className="flex items-start gap-3"><span className="dex-badge">3</span><span>Circle attestation confirms the burn (30s–5min)</span></div>
            <div className="flex items-start gap-3"><span className="dex-badge">4</span><span>USDC is minted on the destination chain</span></div>
          </div>
        </div>
      </div>

      <ChainPicker open={showFromPicker} onClose={() => setShowFromPicker(false)} onSelect={setFromChain} exclude={toChain} />
      <ChainPicker open={showToPicker} onClose={() => setShowToPicker(false)} onSelect={setToChain} exclude={fromChain} />
    </div>
  );
}
