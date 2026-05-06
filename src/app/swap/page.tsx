"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, parseUnits } from "viem";
import {
  POOL_ADDRESS,
  POOL_ABI,
  ERC20_ABI,
  USDC_ADDRESS,
  EURC_ADDRESS,
  SLIPPAGE_BPS,
} from "@/config/contracts";
import { TOKENS, type Token } from "@/config/tokens";
import { TokenLogo } from "@/components/TokenLogo";
import Navbar from "@/components/Navbar";
import { HistoryIcon } from "@/components/HistoryIcon";
import { TrustBar } from "@/components/TrustBar";
import { useRadiusAuth } from "@/lib/auth";

export default function SwapPage() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { authenticated, address: authAddress } = useRadiusAuth();
  const address = wagmiAddress ?? authAddress;
  const isConnected = wagmiConnected || authenticated;

  const [fromToken, setFromToken] = useState<Token>(TOKENS[0]);
  const [toToken, setToToken] = useState<Token>(TOKENS[1]);
  const [fromAmount, setFromAmount] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [txHistory, setTxHistory] = useState<
    { hash: string; from: string; to: string; amount: string; time: string }[]
  >([]);

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
  const totalLiquidity = Number(formatUnits(usdcReserve, 6)) + Number(formatUnits(eurcReserve, 6));

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

  // Write hooks
  const { mutateAsync: writeContract, isPending: isWritePending, reset: resetWrite } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess && txHash && fromAmount) {
      setTxHistory((prev) => [{ hash: txHash, from: fromToken.symbol, to: toToken.symbol, amount: fromAmount, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
      setFromAmount("");
      setTxHash(undefined);
      resetWrite();
    }
  }, [isSuccess]);

  const needsApproval = allowance !== undefined && parsedAmount !== undefined && allowance < parsedAmount;
  const isProcessing = isWritePending || isConfirming;

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
              <span className="pool-stats-bar-value">0.3%</span>
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
        </div>
      </div>
    </>
  );
}
