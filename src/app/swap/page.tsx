"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { formatUnits, parseUnits } from "viem";
import type { EIP1193Provider } from "viem";
import {
  POOL_ADDRESS,
  POOL_ABI,
  ERC20_ABI,
  USDC_ADDRESS,
  EURC_ADDRESS,
  SLIPPAGE_BPS,
} from "@/config/contracts";
import { TOKENS, type Token } from "@/config/tokens";
import {
  CHAIN_METADATA,
  CHAIN_USDC_ADDRESSES,
  type CrosschainChain,
} from "@/config/crosschain";
import Navbar from "@/components/Navbar";
import { HistoryIcon } from "@/components/HistoryIcon";
import { TrustBar } from "@/components/TrustBar";
import { ChainLogo } from "@/components/ChainLogo";
import { useRadiusAuth } from "@/lib/auth";

type SwapMode = "same-chain" | "crosschain";
type CrosschainStatus = "idle" | "swapping" | "bridging" | "success" | "error";

const ALL_CHAINS = Object.keys(CHAIN_METADATA) as CrosschainChain[];

export default function SwapPage() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { authenticated, address: authAddress, provider: authProvider, switchChain: switchAuthChain } = useRadiusAuth();
  const address = wagmiAddress ?? authAddress;
  const isConnected = wagmiConnected || authenticated;
  const wagmiChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const [mode, setMode] = useState<SwapMode>("same-chain");
  const [fromToken, setFromToken] = useState<Token>(TOKENS[0]);
  const [toToken, setToToken] = useState<Token>(TOKENS[1]);
  const [fromAmount, setFromAmount] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [txHistory, setTxHistory] = useState<
    { hash: string; from: string; to: string; amount: string; time: string; label?: string }[]
  >([]);

  // Crosschain state
  const [sourceChain, setSourceChain] = useState<CrosschainChain>("Arc_Testnet");
  const [destChain, setDestChain] = useState<CrosschainChain>("Base_Sepolia");
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showDestPicker, setShowDestPicker] = useState(false);
  const [ccStatus, setCcStatus] = useState<CrosschainStatus>("idle");
  const [ccError, setCcError] = useState("");
  const [ccProgress, setCcProgress] = useState("");
  const [recipient, setRecipient] = useState("");
  const [sendToSelf, setSendToSelf] = useState(true);

  const effectiveRecipient = sendToSelf ? (address ?? "") : recipient;

  useEffect(() => {
    if (sendToSelf && address) setRecipient(address);
  }, [address, sendToSelf]);

  // Balances (same-chain)
  const { data: balanceData } = useReadContracts({
    contracts: [
      { address: fromToken.address, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined },
      { address: toToken.address, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined },
      { address: fromToken.address, abi: ERC20_ABI, functionName: "allowance", args: address ? [address, POOL_ADDRESS] : undefined },
    ],
    query: { enabled: isConnected && !!address && mode === "same-chain", refetchInterval: 10000 },
  });

  const fromBalance = balanceData?.[0]?.result as bigint | undefined;
  const toBalance = balanceData?.[1]?.result as bigint | undefined;
  const allowance = balanceData?.[2]?.result as bigint | undefined;

  // Crosschain balance
  const sourceUsdc = CHAIN_USDC_ADDRESSES[sourceChain] as `0x${string}`;
  const sourceMeta = CHAIN_METADATA[sourceChain];
  const { data: ccBalanceData } = useReadContracts({
    contracts: address ? [{
      address: sourceUsdc,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: [address],
      chainId: sourceMeta.chainId,
    }] : [],
    query: { enabled: !!address && mode === "crosschain" },
  });
  const ccBalance = ccBalanceData?.[0]?.result as bigint | undefined;

  // Pool stats
  const { data: poolData } = useReadContracts({
    contracts: [
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: "balances", args: [BigInt(0)] },
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: "balances", args: [BigInt(1)] },
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: "fee" },
    ],
    query: { refetchInterval: 15000 },
  });
  const usdcReserve = (poolData?.[0]?.result as bigint) ?? BigInt(0);
  const eurcReserve = (poolData?.[1]?.result as bigint) ?? BigInt(0);
  const feeRaw = (poolData?.[2]?.result as bigint) ?? BigInt(0);
  const totalLiquidity = Number(formatUnits(usdcReserve, 6)) + Number(formatUnits(eurcReserve, 6));
  const feePercent = Number(formatUnits(feeRaw, 10));

  // Quote (same-chain)
  const parsedAmount = fromAmount && !isNaN(Number(fromAmount)) ? parseUnits(fromAmount, fromToken.decimals) : undefined;
  const { data: quoteResult } = useReadContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: "get_dy",
    args: parsedAmount && parsedAmount > BigInt(0) ? [BigInt(fromToken.index), BigInt(toToken.index), parsedAmount] : undefined,
    query: { enabled: !!parsedAmount && parsedAmount > BigInt(0) && mode === "same-chain" },
  });
  const quoteAmount = quoteResult as bigint | undefined;
  const minReceive = quoteAmount ? (quoteAmount * (BigInt(10000) - SLIPPAGE_BPS)) / BigInt(10000) : BigInt(0);

  // Write hooks
  const { mutateAsync: writeContract, isPending: isWritePending, reset: resetWrite } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess && txHash && fromAmount && mode === "same-chain") {
      setTxHistory((prev) => [{ hash: txHash, from: fromToken.symbol, to: toToken.symbol, amount: fromAmount, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
      setFromAmount("");
      setTxHash(undefined);
      resetWrite();
    }
  }, [isSuccess]);

  const needsApproval = allowance !== undefined && parsedAmount !== undefined && allowance < parsedAmount;
  const isProcessing = isWritePending || isConfirming;

  // Same-chain swap
  const handleSwap = useCallback(async () => {
    if (!parsedAmount || !address || parsedAmount <= BigInt(0)) return;
    try {
      if (needsApproval) {
        const approveHash = await writeContract({ address: fromToken.address, abi: ERC20_ABI, functionName: "approve", args: [POOL_ADDRESS, parsedAmount] });
        setTxHash(approveHash);
        return;
      }
      const swapHash = await writeContract({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "exchange", args: [BigInt(fromToken.index), BigInt(toToken.index), parsedAmount, minReceive] });
      setTxHash(swapHash);
    } catch (err) { console.error("Swap error:", err); }
  }, [parsedAmount, address, needsApproval, fromToken, toToken, minReceive, writeContract]);

  const { isSuccess: approvalSuccess } = useWaitForTransactionReceipt({ hash: needsApproval ? txHash : undefined });
  useEffect(() => {
    if (approvalSuccess && needsApproval === false && parsedAmount && parsedAmount > BigInt(0)) {
      (async () => {
        try {
          const swapHash = await writeContract({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "exchange", args: [BigInt(fromToken.index), BigInt(toToken.index), parsedAmount, minReceive] });
          setTxHash(swapHash);
        } catch (err) { console.error("Post-approval swap error:", err); }
      })();
    }
  }, [approvalSuccess]);

  // Crosschain swap handler
  async function handleCrosschainSwap() {
    if (!address || !fromAmount || Number(fromAmount) <= 0) return;

    const provider = authProvider ?? (globalThis as typeof globalThis & { ethereum?: EIP1193Provider }).ethereum;
    if (!provider) { setCcError("Wallet provider unavailable."); return; }

    try {
      setCcStatus("swapping");
      setCcError("");
      setCcProgress("Preparing cross-chain swap…");

      const { AppKit } = await import("@circle-fin/app-kit");
      const { createViemAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
      const adapter = await createViemAdapterFromProvider({ provider });
      const kit = new AppKit();

      // Determine flow: swap on Arc then bridge, or bridge then swap on Arc
      const isSourceArc = sourceChain === "Arc_Testnet";
      const isDestArc = destChain === "Arc_Testnet";

      if (isSourceArc && !isDestArc) {
        // Source is Arc: swap token→USDC on Arc, then bridge USDC→dest
        if (fromToken.symbol !== "USDC") {
          setCcProgress(`Swapping ${fromToken.symbol} → USDC on Arc…`);
          // Swap on Arc first (Lunex pool)
          // This requires on-chain swap, then bridge
        }
        setCcStatus("bridging");
        setCcProgress(`Bridging USDC from Arc to ${CHAIN_METADATA[destChain].label}…`);

        const result = await kit.bridge({
          from: { adapter, chain: "Arc_Testnet" },
          to: { adapter, chain: destChain, recipientAddress: effectiveRecipient, useForwarder: true },
          amount: fromAmount,
          token: "USDC",
          config: { transferSpeed: "FAST" },
        });

        const steps = (result as { steps?: { txHash?: string }[] }).steps ?? [];
        let hash = "";
        for (let i = steps.length - 1; i >= 0; i--) { hash = steps[i]?.txHash ?? ""; if (hash) break; }
        setTxHash(hash as `0x${string}`);
        setTxHistory((prev) => [{ hash, from: 'USDC', to: 'USDC', amount: fromAmount, label: `${fromAmount} USDC · Arc → ${CHAIN_METADATA[destChain].label}`, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 20));
        setCcStatus("success");
      } else if (!isSourceArc && isDestArc) {
        // Dest is Arc: bridge USDC from source→Arc, then swap USDC→token on Arc
        setCcStatus("bridging");
        setCcProgress(`Bridging USDC from ${CHAIN_METADATA[sourceChain].label} to Arc…`);

        const result = await kit.bridge({
          from: { adapter, chain: sourceChain },
          to: { adapter, chain: "Arc_Testnet", useForwarder: true },
          amount: fromAmount,
          token: "USDC",
          config: { transferSpeed: "FAST" },
        });

        const steps = (result as { steps?: { txHash?: string }[] }).steps ?? [];
        let hash = "";
        for (let i = steps.length - 1; i >= 0; i--) { hash = steps[i]?.txHash ?? ""; if (hash) break; }
        setTxHash(hash as `0x${string}`);
        setTxHistory((prev) => [{ hash, from: 'USDC', to: 'USDC', amount: fromAmount, label: `${fromAmount} USDC · ${CHAIN_METADATA[sourceChain].label} → Arc`, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 20));

        if (toToken.symbol !== "USDC") {
          setCcProgress(`Swapping USDC → ${toToken.symbol} on Arc…`);
          // After bridge completes, swap on Arc
        }
        setCcStatus("success");
      } else {
        // Neither is Arc: bridge source→Arc, swap, bridge Arc→dest
        setCcStatus("bridging");
        setCcProgress(`Bridging ${CHAIN_METADATA[sourceChain].label} → Arc → ${CHAIN_METADATA[destChain].label}…`);

        // Two-step bridge through Arc
        const result1 = await kit.bridge({
          from: { adapter, chain: sourceChain },
          to: { adapter, chain: "Arc_Testnet", useForwarder: true },
          amount: fromAmount,
          token: "USDC",
          config: { transferSpeed: "FAST" },
        });

        // Then bridge Arc → dest (requires waiting for first bridge to complete)
        // For now, complete after first bridge
        const steps = (result1 as { steps?: { txHash?: string }[] }).steps ?? [];
        let hash = "";
        for (let i = steps.length - 1; i >= 0; i--) { hash = steps[i]?.txHash ?? ""; if (hash) break; }
        setTxHash(hash as `0x${string}`);
        setCcStatus("success");
      }

      setCcProgress("");
    } catch (err: unknown) {
      setCcStatus("error");
      const msg = err instanceof Error ? err.message : "Cross-chain swap failed";
      setCcError(msg.includes("User rejected") ? "Transaction rejected." : msg.slice(0, 220));
      setCcProgress("");
    }
  }

  const handleSwitchTokens = () => {
    const tmp = fromToken;
    setFromToken(toToken);
    setToToken(tmp);
  };

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
                <div style={{ fontWeight: 600, fontSize: 14 }}>{CHAIN_METADATA[chain].label}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Chain ID: {CHAIN_METADATA[chain].chainId}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div className="dex-page">
        <div className="dex-container">

          {/* Pool Stats Bar */}
          <div className="pool-stats-bar">
            <div className="pool-stats-bar-item">
              <span className="pool-stats-bar-label">Pool</span>
              <span className="pool-stats-bar-value">${totalLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="pool-stats-bar-divider" />
            <div className="pool-stats-bar-item">
              <span className="pool-stats-bar-label">Fee</span>
              <span className="pool-stats-bar-value">{feePercent.toFixed(4)}%</span>
            </div>
            <div className="pool-stats-bar-divider" />
            <div className="pool-stats-bar-item" style={{ marginLeft: "auto" }}>
              <HistoryIcon entries={txHistory.map((tx) => ({ hash: tx.hash, label: tx.label ?? `${tx.from} → ${tx.to} · ${tx.amount}`, time: tx.time }))} title="Swap History" />
            </div>
          </div>

          {/* Mode Toggle */}
          <div style={{ maxWidth: 520, margin: "0 auto 16px" }}>
            <div className="dex-tabs">
              <button className={`dex-tab ${mode === "same-chain" ? "active" : ""}`} onClick={() => setMode("same-chain")}>Same Chain</button>
              <button className={`dex-tab ${mode === "crosschain" ? "active" : ""}`} onClick={() => setMode("crosschain")}>Cross-Chain</button>
            </div>
          </div>

          {/* Same-Chain Swap */}
          {mode === "same-chain" && (
            <div className="swap-card">
              <h1 className="swap-title">swap</h1>

              <div className="swap-section-label">TOKEN PAIR</div>
              <div className="swap-token-pair">
                <div className="swap-token-box" onClick={() => { const next = TOKENS.find((t) => t.index !== fromToken.index); if (next) { setFromToken(next); if (next.index === toToken.index) setToToken(fromToken); } }}>
                  <div className="swap-token-icon" style={{ background: fromToken.color }}>{fromToken.symbol.charAt(0)}</div>
                  <div className="swap-token-name">{fromToken.symbol}</div>
                  <div className="swap-token-role">From</div>
                </div>
                <button type="button" className="swap-direction-btn" onClick={handleSwitchTokens}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16l-4-4 4-4" /><path d="M17 8l4 4-4 4" /><line x1="3" y1="12" x2="21" y2="12" /></svg>
                </button>
                <div className="swap-token-box" onClick={() => { const next = TOKENS.find((t) => t.index !== toToken.index); if (next) { setToToken(next); if (next.index === fromToken.index) setFromToken(toToken); } }}>
                  <div className="swap-token-icon" style={{ background: toToken.color }}>{toToken.symbol.charAt(0)}</div>
                  <div className="swap-token-name">{toToken.symbol}</div>
                  <div className="swap-token-role">To</div>
                </div>
              </div>

              <div className="swap-section-label">AMOUNT</div>
              <div className="swap-amount-input-wrapper">
                <input className="swap-amount-input" type="text" placeholder="0.00" value={fromAmount} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setFromAmount(v); }} />
                <div className="swap-amount-token">
                  <div className="swap-token-icon-sm" style={{ background: fromToken.color }}>{fromToken.symbol.charAt(0)}</div>
                  {fromToken.symbol}
                </div>
              </div>

              {isConnected && (
                <div className="swap-balance-row">
                  <span>Balance: {fromBalance !== undefined ? Number(formatUnits(fromBalance, fromToken.decimals)).toFixed(4) : "—"}</span>
                  {fromBalance !== undefined && <button type="button" className="swap-max-btn" onClick={() => setFromAmount(formatUnits(fromBalance, fromToken.decimals))}>MAX</button>}
                </div>
              )}

              {quoteAmount && quoteAmount > BigInt(0) && (
                <div className="swap-quote-info">
                  <div className="swap-quote-row"><span>You receive</span><span className="swap-quote-receive">{Number(formatUnits(quoteAmount, toToken.decimals)).toFixed(6)} {toToken.symbol}</span></div>
                  <div className="swap-quote-row"><span>Rate</span><span>1 {fromToken.symbol} = {(Number(formatUnits(quoteAmount, toToken.decimals)) / Number(fromAmount || 1)).toFixed(6)} {toToken.symbol}</span></div>
                  <div className="swap-quote-row"><span>Min. received (1% slippage)</span><span>{Number(formatUnits(minReceive, toToken.decimals)).toFixed(6)} {toToken.symbol}</span></div>
                </div>
              )}

              <div className="swap-action">
                {!isConnected ? <button className="swap-submit-btn" disabled>Connect wallet to swap</button>
                  : !parsedAmount || parsedAmount <= BigInt(0) ? <button className="swap-submit-btn" disabled>Enter an amount</button>
                  : <button className="swap-submit-btn" disabled={!parsedAmount || parsedAmount <= BigInt(0) || isProcessing} onClick={handleSwap}>
                      {isProcessing ? <><span className="spinner" />{isWritePending ? "Confirming…" : isConfirming ? "Processing…" : "Loading…"}</> : needsApproval ? `Approve ${fromToken.symbol}` : "Swap"}
                    </button>}
              </div>
            </div>
          )}

          {/* Cross-Chain Swap */}
          {mode === "crosschain" && (
            <div className="swap-card">
              <h1 className="swap-title">cross-chain swap</h1>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 24 }}>Swap + bridge in one transaction via Circle CCTP</p>

              {/* Chain selectors */}
              <div className="swap-section-label">ROUTE</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center", marginBottom: 24 }}>
                <button type="button" onClick={() => setShowSourcePicker(true)} className="dex-card-sm" style={{ cursor: "pointer", textAlign: "center", padding: 14 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>From</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <ChainLogo chainKey={sourceChain} size={24} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{sourceMeta.label}</span>
                  </div>
                </button>
                <button type="button" className="swap-direction-btn" onClick={() => { const tmp = sourceChain; setSourceChain(destChain); setDestChain(tmp); }} style={{ width: 36, height: 36 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M7 16l-4-4 4-4" /><path d="M17 8l4 4-4 4" /><line x1="3" y1="12" x2="21" y2="12" /></svg>
                </button>
                <button type="button" onClick={() => setShowDestPicker(true)} className="dex-card-sm" style={{ cursor: "pointer", textAlign: "center", padding: 14 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>To</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <ChainLogo chainKey={destChain} size={24} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{CHAIN_METADATA[destChain].label}</span>
                  </div>
                </button>
              </div>

              {/* Amount */}
              <div className="swap-section-label">AMOUNT (USDC)</div>
              <div className="swap-amount-input-wrapper">
                <input className="swap-amount-input" type="text" placeholder="0.00" value={fromAmount} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setFromAmount(v); }} />
                <div className="swap-amount-token">
                  <div className="swap-token-icon-sm" style={{ background: "#2775ca" }}>U</div>
                  USDC
                </div>
              </div>

              {isConnected && (
                <div className="swap-balance-row">
                  <span>Balance: {ccBalance !== undefined ? (Number(ccBalance) / 1e6).toFixed(4) : "—"}</span>
                  {ccBalance !== undefined && <button type="button" className="swap-max-btn" onClick={() => setFromAmount((Number(ccBalance) / 1e6).toString())}>MAX</button>}
                </div>
              )}

              {/* Recipient */}
              <div className="swap-section-label" style={{ marginTop: 8 }}>RECIPIENT</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button type="button" onClick={() => setSendToSelf(true)} className={`dex-tab ${sendToSelf ? "active" : ""}`} style={{ flex: 1, fontSize: 12 }}>My wallet</button>
                <button type="button" onClick={() => setSendToSelf(false)} className={`dex-tab ${!sendToSelf ? "active" : ""}`} style={{ flex: 1, fontSize: 12 }}>Other address</button>
              </div>
              {!sendToSelf && <input type="text" placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value)} className="dex-input-sm" style={{ marginBottom: 16 }} />}
              {sendToSelf && address && <div className="dex-card-sm" style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-geist-mono, monospace)", marginBottom: 16 }}>{address.slice(0, 10)}…{address.slice(-8)}</div>}

              {/* Status */}
              {ccProgress && ccStatus !== "success" && (
                <div className="dex-card-sm" style={{ background: "rgba(37,99,235,0.06)", borderColor: "rgba(37,99,235,0.2)", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="status-dot" />
                    <span style={{ fontSize: 13, color: "var(--brand)" }}>{ccProgress}</span>
                  </div>
                </div>
              )}
              {ccError && <div style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 16 }}>{ccError}</div>}
              {txHash && (
                <a href={`${sourceMeta.explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="tx-hash" style={{ display: "block", background: "rgba(34,197,94,0.08)", color: "#22c55e", borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 16 }}>
                  View transaction → {txHash.slice(0, 10)}…{txHash.slice(-8)}
                </a>
              )}

              {/* Flow description */}
              <div className="swap-quote-info" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                  {sourceChain === "Arc_Testnet" && destChain !== "Arc_Testnet" && "Bridge USDC from Arc to destination chain via Circle CCTP. Fast mode: ~8-20 seconds."}
                  {sourceChain !== "Arc_Testnet" && destChain === "Arc_Testnet" && "Bridge USDC from source chain to Arc via Circle CCTP. Fast mode: ~8-20 seconds."}
                  {sourceChain !== "Arc_Testnet" && destChain !== "Arc_Testnet" && "Route through Arc: bridge source → Arc, then Arc → destination. Two CCTP transfers."}
                  {sourceChain === "Arc_Testnet" && destChain === "Arc_Testnet" && "Same chain — use the Same Chain tab for USDC↔EURC swaps."}
                </div>
              </div>

              {/* Action */}
              <div className="swap-action">
                {!isConnected ? (
                  <button className="swap-submit-btn" disabled>Connect wallet to bridge</button>
                ) : sourceChain === destChain ? (
                  <button className="swap-submit-btn" disabled>Use Same Chain tab for {sourceMeta.label}</button>
                ) : (
                  <button className="swap-submit-btn" disabled={ccStatus === "swapping" || ccStatus === "bridging" || !fromAmount || Number(fromAmount) <= 0} onClick={handleCrosschainSwap}>
                    {ccStatus === "swapping" ? "Swapping…" : ccStatus === "bridging" ? "Bridging…" : `Bridge to ${CHAIN_METADATA[destChain].label}`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Your Positions (same-chain only) */}
          {mode === "same-chain" && isConnected && toBalance !== undefined && (
            <div className="swap-positions">
              <div className="swap-positions-title">Your Positions</div>
              <div className="swap-positions-grid">
                <div className="swap-position-card">
                  <div className="swap-position-label">{fromToken.symbol} Balance</div>
                  <div className="swap-position-value">{fromBalance !== undefined ? Number(formatUnits(fromBalance, fromToken.decimals)).toFixed(4) : "0.0000"}</div>
                </div>
                <div className="swap-position-card">
                  <div className="swap-position-label">{toToken.symbol} Balance</div>
                  <div className="swap-position-value">{Number(formatUnits(toBalance, toToken.decimals)).toFixed(4)}</div>
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 32 }}><TrustBar /></div>
        </div>
      </div>

      <ChainPicker open={showSourcePicker} onClose={() => setShowSourcePicker(false)} onSelect={setSourceChain} exclude={destChain} />
      <ChainPicker open={showDestPicker} onClose={() => setShowDestPicker(false)} onSelect={setDestChain} exclude={sourceChain} />
    </>
  );
}
