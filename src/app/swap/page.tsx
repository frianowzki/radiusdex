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
      {
        address: fromToken.address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
      {
        address: toToken.address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
      {
        address: fromToken.address,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: address ? [address, POOL_ADDRESS] : undefined,
      },
    ],
    query: { enabled: isConnected && !!address, refetchInterval: 10000 },
  });

  const fromBalance = balanceData?.[0]?.result as bigint | undefined;
  const toBalance = balanceData?.[1]?.result as bigint | undefined;
  const allowance = balanceData?.[2]?.result as bigint | undefined;

  // Quote
  const parsedAmount =
    fromAmount && !isNaN(Number(fromAmount))
      ? parseUnits(fromAmount, fromToken.decimals)
      : undefined;

  const { data: quoteResult } = useReadContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: "get_dy",
    args:
      parsedAmount && parsedAmount > BigInt(0)
        ? [BigInt(fromToken.index), BigInt(toToken.index), parsedAmount]
        : undefined,
    query: { enabled: !!parsedAmount && parsedAmount > BigInt(0) },
  });

  const quoteAmount = quoteResult as bigint | undefined;
  const minReceive = quoteAmount
    ? (quoteAmount * (BigInt(10000) - SLIPPAGE_BPS)) / BigInt(10000)
    : BigInt(0);

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

  // Write hooks
  const {
    mutateAsync: writeContract,
    isPending: isWritePending,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // After successful swap, add to history
  useEffect(() => {
    if (isSuccess && txHash && fromAmount) {
      setTxHistory((prev) => [
        {
          hash: txHash,
          from: fromToken.symbol,
          to: toToken.symbol,
          amount: fromAmount,
          time: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 9),
      ]);
      setFromAmount("");
      setTxHash(undefined);
      resetWrite();
    }
  }, [isSuccess]);

  const needsApproval =
    allowance !== undefined &&
    parsedAmount !== undefined &&
    allowance < parsedAmount;

  const handleSwap = useCallback(async () => {
    if (!parsedAmount || !address || parsedAmount <= BigInt(0)) return;

    try {
      if (needsApproval) {
        const approveHash = await writeContract({
          address: fromToken.address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [POOL_ADDRESS, parsedAmount],
        });
        setTxHash(approveHash);
        return;
      }

      const swapHash = await writeContract({
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: "exchange",
        args: [
          BigInt(fromToken.index),
          BigInt(toToken.index),
          parsedAmount,
          minReceive,
        ],
      });
      setTxHash(swapHash);
    } catch (err) {
      console.error("Swap error:", err);
    }
  }, [
    parsedAmount,
    address,
    needsApproval,
    fromToken,
    toToken,
    minReceive,
    writeContract,
  ]);

  // After approval completes, auto-swap
  const { isSuccess: approvalSuccess } = useWaitForTransactionReceipt({
    hash: needsApproval ? txHash : undefined,
  });

  useEffect(() => {
    if (approvalSuccess && needsApproval === false && parsedAmount && parsedAmount > BigInt(0)) {
      const doSwap = async () => {
        try {
          const swapHash = await writeContract({
            address: POOL_ADDRESS,
            abi: POOL_ABI,
            functionName: "exchange",
            args: [
              BigInt(fromToken.index),
              BigInt(toToken.index),
              parsedAmount,
              minReceive,
            ],
          });
          setTxHash(swapHash);
        } catch (err) {
          console.error("Post-approval swap error:", err);
        }
      };
      doSwap();
    }
  }, [approvalSuccess]);

  const handleSwitchTokens = () => {
    const tmp = fromToken;
    setFromToken(toToken);
    setToToken(tmp);
  };

  const isProcessing = isWritePending || isConfirming;

  return (
    <>
      <Navbar />
      <div className="dex-page">
        <div className="dex-container">

          {/* Pool Stats Bar */}
          <div className="pool-stats-bar">
            <div className="pool-stats-bar-item">
              <span className="pool-stats-bar-label">Pool</span>
              <span className="pool-stats-bar-value">
                ${totalLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="pool-stats-bar-divider" />
            <div className="pool-stats-bar-item">
              <span className="pool-stats-bar-label">Fee</span>
              <span className="pool-stats-bar-value">{feePercent.toFixed(4)}%</span>
            </div>
            <div className="pool-stats-bar-divider" />
            <div className="pool-stats-bar-item" style={{ marginLeft: "auto" }}>
              <HistoryIcon
                entries={txHistory.map((tx) => ({ hash: tx.hash, label: `${tx.from} → ${tx.to} · ${tx.amount}`, time: tx.time }))}
                title="Swap History"
              />
            </div>
          </div>

          {/* Swap Card */}
          <div className="swap-card">
            <h1 className="swap-title">swap</h1>

            {/* Token Pair */}
            <div className="swap-section-label">TOKEN PAIR</div>
            <div className="swap-token-pair">
              <div className="swap-token-box" onClick={() => {
                const next = TOKENS.find((t) => t.index !== fromToken.index);
                if (next) { setFromToken(next); if (next.index === toToken.index) setToToken(fromToken); }
              }}>
                <div className="swap-token-icon" style={{ background: fromToken.color }}>
                  {fromToken.symbol.charAt(0)}
                </div>
                <div className="swap-token-name">{fromToken.symbol}</div>
                <div className="swap-token-role">From</div>
              </div>

              <button type="button" className="swap-direction-btn" onClick={handleSwitchTokens}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 16l-4-4 4-4" />
                  <path d="M17 8l4 4-4 4" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                </svg>
              </button>

              <div className="swap-token-box" onClick={() => {
                const next = TOKENS.find((t) => t.index !== toToken.index);
                if (next) { setToToken(next); if (next.index === fromToken.index) setFromToken(toToken); }
              }}>
                <div className="swap-token-icon" style={{ background: toToken.color }}>
                  {toToken.symbol.charAt(0)}
                </div>
                <div className="swap-token-name">{toToken.symbol}</div>
                <div className="swap-token-role">To</div>
              </div>
            </div>

            {/* Amount Input */}
            <div className="swap-section-label">AMOUNT</div>
            <div className="swap-amount-input-wrapper">
              <input
                className="swap-amount-input"
                type="text"
                placeholder="0.00"
                value={fromAmount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d*$/.test(v)) setFromAmount(v);
                }}
              />
              <div className="swap-amount-token">
                <div className="swap-token-icon-sm" style={{ background: fromToken.color }}>
                  {fromToken.symbol.charAt(0)}
                </div>
                {fromToken.symbol}
              </div>
            </div>

            {/* Balance + MAX */}
            {isConnected && (
              <div className="swap-balance-row">
                <span>
                  Balance:{" "}
                  {fromBalance !== undefined
                    ? Number(formatUnits(fromBalance, fromToken.decimals)).toFixed(4)
                    : "—"}
                </span>
                {fromBalance !== undefined && (
                  <button
                    type="button"
                    className="swap-max-btn"
                    onClick={() => setFromAmount(formatUnits(fromBalance, fromToken.decimals))}
                  >
                    MAX
                  </button>
                )}
              </div>
            )}

            {/* Quote Info */}
            {quoteAmount && quoteAmount > BigInt(0) && (
              <div className="swap-quote-info">
                <div className="swap-quote-row">
                  <span>You receive</span>
                  <span className="swap-quote-receive">
                    {Number(formatUnits(quoteAmount, toToken.decimals)).toFixed(6)} {toToken.symbol}
                  </span>
                </div>
                <div className="swap-quote-row">
                  <span>Rate</span>
                  <span>1 {fromToken.symbol} = {(Number(formatUnits(quoteAmount, toToken.decimals)) / Number(fromAmount || 1)).toFixed(6)} {toToken.symbol}</span>
                </div>
                <div className="swap-quote-row">
                  <span>Min. received (1% slippage)</span>
                  <span>{Number(formatUnits(minReceive, toToken.decimals)).toFixed(6)} {toToken.symbol}</span>
                </div>
                <div className="swap-quote-row">
                  <span>Route</span>
                  <span>{fromToken.symbol} → {toToken.symbol} (StableSwap)</span>
                </div>
              </div>
            )}

            {/* Action Button */}
            <div className="swap-action">
              {!isConnected ? (
                <button className="swap-submit-btn" disabled>
                  Connect wallet to swap
                </button>
              ) : !parsedAmount || parsedAmount <= BigInt(0) ? (
                <button className="swap-submit-btn" disabled>
                  Enter an amount to see a quote
                </button>
              ) : (
                <button
                  className="swap-submit-btn"
                  disabled={!parsedAmount || parsedAmount <= BigInt(0) || isProcessing}
                  onClick={handleSwap}
                >
                  {isProcessing ? (
                    <>
                      <span className="spinner" />
                      {isWritePending ? "Confirming..." : isConfirming ? "Processing..." : "Loading..."}
                    </>
                  ) : needsApproval ? (
                    `Approve ${fromToken.symbol}`
                  ) : (
                    "Swap"
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Your Positions */}
          {isConnected && toBalance !== undefined && (
            <div className="swap-positions">
              <div className="swap-positions-title">Your Positions</div>
              <div className="swap-positions-grid">
                <div className="swap-position-card">
                  <div className="swap-position-label">{fromToken.symbol} Balance</div>
                  <div className="swap-position-value">
                    {fromBalance !== undefined
                      ? Number(formatUnits(fromBalance, fromToken.decimals)).toFixed(4)
                      : "0.0000"}
                  </div>
                </div>
                <div className="swap-position-card">
                  <div className="swap-position-label">{toToken.symbol} Balance</div>
                  <div className="swap-position-value">
                    {Number(formatUnits(toBalance, toToken.decimals)).toFixed(4)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Trust Bar */}
          <div style={{ marginTop: 32 }}>
            <TrustBar />
          </div>
        </div>
      </div>
    </>
  );
}
