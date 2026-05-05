"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContracts, useChainId, useSwitchChain } from "wagmi";
import { parseUnits, isAddress } from "viem";
import type { EIP1193Provider } from "viem";
import Navbar from "@/components/Navbar";
import { ERC20_ABI } from "@/config/contracts";
import { TOKENS } from "@/config/tokens";
import {
  CHAIN_METADATA,
  CHAIN_USDC_ADDRESSES,
  CROSSCHAIN_ROUTES,
  type CrosschainChain,
  type CrosschainRoute,
} from "@/config/crosschain";
import { arcTestnet } from "@/config/wagmi";
import { useRadiusAuth } from "@/lib/auth";

type BridgeStatus = "idle" | "estimating" | "approving" | "burning" | "attesting" | "minting" | "success" | "error";

const bridgeRoutes = CROSSCHAIN_ROUTES.filter((r) => r.mode === "bridge");

export default function BridgePage() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { authenticated, address: authAddress, provider: authProvider, chainId: authChainId, switchChain: switchAuthChain } = useRadiusAuth();
  const address = wagmiAddress ?? authAddress;
  const isConnected = wagmiConnected || authenticated;
  const wagmiChainId = useChainId();
  const activeChainId = wagmiConnected ? wagmiChainId : authChainId;
  const { switchChainAsync } = useSwitchChain();

  const [selectedRoute, setSelectedRoute] = useState<CrosschainRoute["id"]>(bridgeRoutes[0]?.id ?? "arc-to-ethereum-sepolia");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [progressLabel, setProgressLabel] = useState("");

  const routeConfig = bridgeRoutes.find((r) => r.id === selectedRoute) ?? bridgeRoutes[0];
  const sourceMeta = CHAIN_METADATA[routeConfig.fromChain];
  const destMeta = CHAIN_METADATA[routeConfig.toChain];
  const isOnSourceChain = activeChainId === sourceMeta.chainId;
  const validAmount = Number(amount) > 0 && Number.isFinite(Number(amount));
  const validRecipient = !!recipient && isAddress(recipient);
  const sourceUsdc = CHAIN_USDC_ADDRESSES[routeConfig.fromChain];

  useEffect(() => {
    if (!address || recipient) return;
    setRecipient(address);
  }, [address, recipient]);

  const { data: balanceData } = useReadContracts({
    contracts: address ? [{
      address: sourceUsdc as `0x${string}`,
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
  const canBridge = isConnected && isOnSourceChain && validAmount && validRecipient && hasEnough && status !== "estimating" && status !== "approving" && status !== "burning" && status !== "minting";

  const formattedBalance = usdcBalance !== undefined ? (Number(usdcBalance) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—";

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
    if (!validRecipient) { setStatus("error"); setError("Enter a valid Ethereum address."); return; }
    if (!isOnSourceChain) { setStatus("error"); setError(`Switch to ${sourceMeta.label} first.`); return; }
    if (!hasEnough) { setStatus("error"); setError("Insufficient USDC balance."); return; }

    const provider = getActiveProvider();
    if (!provider) { setStatus("error"); setError("Wallet provider unavailable."); return; }

    try {
      setStatus("estimating");
      setError("");
      setProgressLabel("Preparing bridge transfer…");

      // Dynamic import Circle App Kit (same as arc app)
      const { AppKit } = await import("@circle-fin/app-kit");
      const { createViemAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
      const adapter = await createViemAdapterFromProvider({ provider });
      const kit = new AppKit();

      const kitKey = process.env.NEXT_PUBLIC_CIRCLE_KIT_KEY?.trim();
      if (!kitKey) throw new Error("Circle Kit key not configured.");

      const useForwarder = true;
      const destination = useForwarder
        ? { chain: routeConfig.toChain, recipientAddress: recipient, useForwarder: true as const }
        : { adapter, chain: routeConfig.toChain, recipientAddress: recipient };

      // Estimate
      setProgressLabel("Estimating fees and route…");
      const estimate = await kit.estimateBridge({
        from: { adapter, chain: routeConfig.fromChain },
        to: destination,
        amount,
        token: "USDC",
        config: { transferSpeed: "FAST" as const, batchTransactions: false },
      });

      const fees = Array.isArray((estimate as { fees?: unknown[] }).fees) ? (estimate as { fees: { amount?: string }[] }).fees : [];
      const totalFees = fees.reduce((sum: number, f) => {
        const a = typeof f.amount === "string" ? Number(f.amount) : 0;
        return Number.isFinite(a) ? sum + a : sum;
      }, 0);

      if (useForwarder && totalFees >= Number(amount)) {
        setStatus("error");
        setError(`Forwarder fee (~${totalFees.toFixed(6)} USDC) exceeds transfer amount. Try a larger amount.`);
        return;
      }

      // Execute bridge
      setStatus("burning");
      setProgressLabel("Confirming in wallet…");

      const result = await kit.bridge({
        from: { adapter, chain: routeConfig.fromChain },
        to: destination,
        amount,
        token: "USDC",
        config: { transferSpeed: "FAST" as const, batchTransactions: false },
      });

      // Extract tx hash from result
      const steps = (result as { steps?: { txHash?: string; data?: { txHash?: string } }[] }).steps ?? [];
      let hash = "";
      for (let i = steps.length - 1; i >= 0; i--) {
        hash = steps[i]?.txHash ?? (steps[i]?.data as { txHash?: string })?.txHash ?? "";
        if (hash) break;
      }

      setTxHash(hash);
      setStatus("success");
      setProgressLabel("");
    } catch (err: unknown) {
      setStatus("error");
      const msg = err instanceof Error ? err.message : "Bridge failed";
      setError(msg.includes("User rejected") ? "Transaction rejected." : msg.slice(0, 220));
      setProgressLabel("");
    }
  }

  return (
    <div className="dex-page">
      <Navbar />
      <div className="dex-container" style={{ maxWidth: 640, paddingTop: 40 }}>
        <div className="dex-card" style={{ padding: 36 }}>
          <form onSubmit={handleBridge} className="space-y-5">
            {/* Header */}
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand)]">Cross-chain</p>
              <h1 className="text-2xl font-black tracking-tight text-[var(--foreground)]">Bridge USDC</h1>
              <p className="mt-1 text-xs text-[var(--muted)]">Move USDC between Arc and other testnets via Circle CCTP.</p>
            </div>

            {/* Route selector */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)] mb-2 block">Route</label>
              <select
                value={selectedRoute}
                onChange={(e) => { setSelectedRoute(e.target.value); setError(""); setTxHash(""); }}
                className="dex-input"
                style={{ fontSize: 14, padding: "12px 14px", appearance: "auto" }}
              >
                <optgroup label="From Arc">
                  {bridgeRoutes.filter((r) => r.fromChain === "Arc_Testnet").map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </optgroup>
                <optgroup label="To Arc">
                  {bridgeRoutes.filter((r) => r.toChain === "Arc_Testnet").map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Chain display */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="dex-card-sm text-center">
                <p className="text-xs text-[var(--muted)] mb-1">From</p>
                <p className="text-sm font-bold">{sourceMeta.label}</p>
              </div>
              <div className="swap-arrow" style={{ width: 36, height: 36, borderRadius: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </div>
              <div className="dex-card-sm text-center">
                <p className="text-xs text-[var(--muted)] mb-1">To</p>
                <p className="text-sm font-bold">{destMeta.label}</p>
              </div>
            </div>

            {/* Amount */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Amount (USDC)</label>
                <span className="text-xs text-[var(--muted)]">Balance: {formattedBalance}</span>
              </div>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(""); }}
                className="dex-input"
                style={{ fontSize: 24, fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)" }}
              />
              {!hasEnough && amount && validAmount && (
                <p className="mt-2 text-xs text-red-500">Insufficient USDC balance.</p>
              )}
            </div>

            {/* Recipient */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)] mb-2 block">Recipient address</label>
              <input
                type="text"
                placeholder="0x..."
                value={recipient}
                onChange={(e) => { setRecipient(e.target.value); setError(""); }}
                className="dex-input"
                style={{ fontSize: 14 }}
              />
            </div>

            {/* Status messages */}
            {progressLabel && status !== "success" && (
              <div className="dex-card-sm" style={{ background: "rgba(37,99,235,0.06)", borderColor: "rgba(37,99,235,0.2)" }}>
                <div className="flex items-center gap-3">
                  <div className="status-dot" />
                  <span className="text-sm text-[var(--brand)]">{progressLabel}</span>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-2xl p-3 text-xs font-medium" style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>
                {error}
              </div>
            )}

            {txHash && (
              <a
                href={`${sourceMeta.explorerUrl}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tx-hash block rounded-2xl p-3 text-xs font-semibold"
                style={{ background: "rgba(34,197,94,0.08)", color: "#22c55e" }}
              >
                View transaction → {txHash.slice(0, 10)}…{txHash.slice(-8)}
              </a>
            )}

            {/* Action */}
            {!isConnected ? (
              <div className="dex-card-sm text-center text-sm text-[var(--muted)]">
                Connect your wallet to bridge USDC.
              </div>
            ) : !isOnSourceChain ? (
              <button type="button" onClick={switchToSource} className="dex-btn dex-btn-full">
                Switch to {sourceMeta.label}
              </button>
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

        {/* Bridge info */}
        <div className="dex-card mt-6" style={{ padding: 24 }}>
          <p className="dex-section-title" style={{ marginBottom: 12 }}>How it works</p>
          <div className="space-y-3 text-sm text-[var(--muted)]">
            <div className="flex items-start gap-3">
              <span className="dex-badge">1</span>
              <span>Approve USDC spend for the Circle bridge contract</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="dex-badge">2</span>
              <span>USDC is burned on the source chain</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="dex-badge">3</span>
              <span>Circle attestation confirms the burn (30s–5min)</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="dex-badge">4</span>
              <span>USDC is minted on the destination chain</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
