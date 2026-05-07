"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
} from "wagmi";
import { formatUnits, parseUnits } from "viem";
import {
  POOL_ADDRESS,
  POOL_ABI,
  ERC20_ABI,
  SLIPPAGE_BPS,
} from "@/config/contracts";
import { TOKENS, type Token } from "@/config/tokens";
import { TokenLogo } from "@/components/TokenLogo";
import Navbar from "@/components/Navbar";
import { HistoryIcon } from "@/components/HistoryIcon";
import { TrustBar } from "@/components/TrustBar";
import { useRadiusAuth } from "@/lib/auth";
import { useWriteContractCompat } from "@/lib/useWriteContractCompat";

export default function SwapPage() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { authenticated, address: authAddress } = useRadiusAuth();
  const address = wagmiAddress ?? authAddress;
  const isConnected = wagmiConnected || authenticated;

  const [fromToken, setFromToken] = useState<Token>(TOKENS[0]);
  const [toToken, setToToken] = useState<Token>(TOKENS[1]);
  const [fromAmount, setFromAmount] = useState("");
  const [txHistory, setTxHistory] = useState<
    { hash: string; from: string; to: string; amount: string; time: string }[]
  >([]);

  const { writeContractAsync, isPending: isWritePending, txHash, setTxHash, error: txError, reset, isConfirming, isSuccess } = useWriteContractCompat();

  // Balances
  const { data: balanceData } = useReadContracts({
    contracts: [
      { address: fromToken.address, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined },
      { address: toToken.address, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined },
      { address: fromToken.address, abi: ERC20_ABI, functionName: "allowance", args: address ? [address, POOL_ADDRESS] : undefined },
    ],
    query: { enabled: isConnected && !!address, refetchInterval: 10000 },
  });

  const fromBalance = balanceData?.[0]?.result as bigint | undefined;
  const toBalance = balanceData?.[1]?.result as bigint | undefined;
  const allowance = balanceData?.[2]?.result as bigint | undefined;

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
  const poolFee = (poolData?.[2]?.result as bigint) ?? BigInt(0);
  const totalLiquidity = Number(formatUnits(usdcReserve, 6)) + Number(formatUnits(eurcReserve, 6));
  const feePercent = Number(formatUnits(poolFee, 10));

  // Quote
  const parsedAmount = fromAmount && !isNaN(Number(fromAmount)) ? parseUnits(fromAmount, fromToken.decimals) : undefined;
  const { data: quoteResult } = useReadContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: "get_dy",
    args: parsedAmount && parsedAmount > BigInt(0) ? [BigInt(fromToken.index), BigInt(toToken.index), parsedAmount] : undefined,
    query: { enabled: !!parsedAmount && parsedAmount > BigInt(0) },
  });
  const quoteAmount = quoteResult as bigint | undefined;
  const minReceive = quoteAmount ? (quoteAmount * (BigInt(10000) - SLIPPAGE_BPS)) / BigInt(10000) : BigInt(0);

  const needsApproval = allowance !== undefined && parsedAmount !== undefined && allowance < parsedAmount;
  const isProcessing = isWritePending || isConfirming;

  // Track step for auto-continuation
  const pendingStepRef = useRef<"approve" | "swap" | null>(null);
  // C2: Ref to capture current swap params for use in useEffect
  const swapParamsRef = useRef({ fromToken, toToken, parsedAmount, minReceive, fromAmount });
  swapParamsRef.current = { fromToken, toToken, parsedAmount, minReceive, fromAmount };

  // Auto-continue: approval → swap
  useEffect(() => {
    if (!isSuccess || !txHash) return;
    const step = pendingStepRef.current;
    if (!step) return;

    if (step === "approve") {
      setTxHash(undefined);
      reset();
      // Allowance refetch, then auto-swap
      // C3: Wrap setTimeout in useEffect cleanup
      const timer = setTimeout(async () => {
        try {
          const { fromToken: ft, toToken: tt, parsedAmount: pa, minReceive: mr } = swapParamsRef.current;
          pendingStepRef.current = "swap";
          await writeContractAsync({
            address: POOL_ADDRESS, abi: POOL_ABI, functionName: "exchange",
            args: [BigInt(ft.index), BigInt(tt.index), pa!, mr],
          });
        } catch {
          pendingStepRef.current = null;
        }
      }, 2000);
      return () => clearTimeout(timer);
    } else if (step === "swap") {
      const { fromToken: ft, toToken: tt, fromAmount: fa } = swapParamsRef.current;
      setTxHistory(prev => [{ hash: txHash, from: ft.symbol, to: tt.symbol, amount: fa, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
      setFromAmount("");
      pendingStepRef.current = null;
      setTxHash(undefined);
      reset();
    }
  }, [isSuccess, txHash]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwap = useCallback(async () => {
    if (!parsedAmount || !address || parsedAmount <= BigInt(0)) return;
    try {
      if (needsApproval) {
        pendingStepRef.current = "approve";
        await writeContractAsync({ address: fromToken.address, abi: ERC20_ABI, functionName: "approve", args: [POOL_ADDRESS, parsedAmount] });
        return;
      }
      pendingStepRef.current = "swap";
      await writeContractAsync({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "exchange", args: [BigInt(fromToken.index), BigInt(toToken.index), parsedAmount, minReceive] });
    } catch {
      pendingStepRef.current = null;
    }
  }, [parsedAmount, address, needsApproval, fromToken, toToken, minReceive, writeContractAsync]);

  const handleSwitchTokens = () => {
    const tmp = fromToken;
    setFromToken(toToken);
    setToToken(tmp);
  };

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
              <span className="pool-stats-bar-value">{feePercent > 0 ? `${feePercent.toFixed(4)}%` : "—"}</span>
            </div>
            <div className="pool-stats-bar-divider" />
            <div className="pool-stats-bar-item" style={{ marginLeft: "auto" }}>
              <HistoryIcon entries={txHistory.map((tx) => ({ hash: tx.hash, label: `${tx.from} → ${tx.to} · ${tx.amount}`, time: tx.time }))} title="Swap History" />
            </div>
          </div>

          {/* Swap Card */}
          <div className="swap-card">
            <h1 className="swap-title">swap</h1>

            {/* From Token */}
            <div className="swap-section-label">FROM</div>
            <div className="swap-amount-input-wrapper">
              <input className="swap-amount-input" type="text" placeholder="0.00" value={fromAmount} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setFromAmount(v); }} />
              <div className="swap-amount-token" onClick={() => { const next = TOKENS.find((t) => t.index !== fromToken.index); if (next) { setFromToken(next); if (next.index === toToken.index) setToToken(fromToken); } }} style={{ cursor: "pointer" }}>
                <div className="swap-token-icon-sm"><TokenLogo symbol={fromToken.symbol} size={24} /></div>
                {fromToken.symbol}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 4 }}><path d="M6 9l6 6 6-6" /></svg>
              </div>
            </div>

            {isConnected && (
              <div className="swap-balance-row">
                <span>Balance: {fromBalance !== undefined ? Number(formatUnits(fromBalance, fromToken.decimals)).toFixed(4) : "—"}</span>
                {fromBalance !== undefined && <button type="button" className="swap-max-btn" onClick={() => setFromAmount(formatUnits(fromBalance, fromToken.decimals))}>MAX</button>}
              </div>
            )}

            {/* Switch Direction */}
            <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
              <button type="button" className="bridge-switch-btn" onClick={handleSwitchTokens} style={{ width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16l-4-4 4-4" /><path d="M17 8l4 4-4 4" /><line x1="3" y1="12" x2="21" y2="12" /></svg>
              </button>
            </div>

            {/* To Token */}
            <div className="swap-section-label">TO</div>
            <div className="swap-amount-input-wrapper">
              <div className="swap-amount-input" style={{ display: "flex", alignItems: "center", color: quoteAmount && quoteAmount > BigInt(0) ? "var(--foreground)" : "var(--muted)" }}>
                {quoteAmount && quoteAmount > BigInt(0)
                  ? Number(formatUnits(quoteAmount, toToken.decimals)).toFixed(6)
                  : "0.00"}
              </div>
              <div className="swap-amount-token" onClick={() => { const next = TOKENS.find((t) => t.index !== toToken.index); if (next) { setToToken(next); if (next.index === fromToken.index) setFromToken(toToken); } }} style={{ cursor: "pointer" }}>
                <div className="swap-token-icon-sm"><TokenLogo symbol={toToken.symbol} size={24} /></div>
                {toToken.symbol}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 4 }}><path d="M6 9l6 6 6-6" /></svg>
              </div>
            </div>

            {isConnected && toBalance !== undefined && (
              <div className="swap-balance-row">
                <span>Balance: {Number(formatUnits(toBalance, toToken.decimals)).toFixed(4)}</span>
              </div>
            )}

            {/* Quote Info */}
            {quoteAmount && quoteAmount > BigInt(0) && (
              <div className="swap-quote-info">
                <div className="swap-quote-row"><span>Rate</span><span>1 {fromToken.symbol} = {(Number(formatUnits(quoteAmount, toToken.decimals)) / Number(fromAmount || 1)).toFixed(6)} {toToken.symbol}</span></div>
                <div className="swap-quote-row"><span>Min. received (1% slippage)</span><span>{Number(formatUnits(minReceive, toToken.decimals)).toFixed(6)} {toToken.symbol}</span></div>
              </div>
            )}

            {/* Error */}
            {txError && (
              <div style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", borderRadius: 12, padding: 12, fontSize: 13, marginTop: 12 }}>
                {txError}
              </div>
            )}

            {/* Action */}
            <div className="swap-action">
              {!isConnected ? <button className="swap-submit-btn" disabled>Connect wallet to swap</button>
                : !parsedAmount || parsedAmount <= BigInt(0) ? <button className="swap-submit-btn" disabled>Enter an amount</button>
                : <button className="swap-submit-btn" disabled={!parsedAmount || parsedAmount <= BigInt(0) || isProcessing} onClick={handleSwap}>
                    {isProcessing ? <><span className="spinner" />{isWritePending ? "Confirming…" : isConfirming ? "Processing…" : "Loading…"}</> : needsApproval ? `Approve ${fromToken.symbol}` : "Swap"}
                  </button>}
            </div>
          </div>

          <div style={{ marginTop: 32 }}><TrustBar /></div>

          {/* Inline Swap History */}
          {txHistory.length > 0 && (
            <div className="dex-card" style={{
              maxWidth: 520, margin: "24px auto 0",
              background: "var(--glass-bg-strong)",
              backdropFilter: "var(--glass-blur)",
            }}>
              <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>Recent Swaps</h3>
              {txHistory.map((tx, i) => (
                <div key={i} className="tx-item">
                  <div>
                    <span style={{ fontWeight: 500 }}>{tx.from} → {tx.to}</span>
                    <span style={{ fontSize: "13px", color: "var(--muted)", marginLeft: "12px" }}>{tx.amount}</span>
                    <span style={{ fontSize: "12px", color: "var(--muted)", marginLeft: "8px" }}>{tx.time}</span>
                  </div>
                  {tx.hash && (
                    <a href={`https://testnet.arcscan.app/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer" className="tx-hash">
                      {tx.hash.slice(0, 8)}…{tx.hash.slice(-6)}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
