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

export default function SwapPage() {
  const { address, isConnected } = useAccount();

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
        // Wait a bit then swap
        setTxHash(approveHash);
        // The approval tx will complete, then we swap
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
      // Approval done, now do the swap
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
    // preserve amount — quote will recalc via get_dy
  };

  const isProcessing = isWritePending || isConfirming;

  return (
    <>
      <Navbar />
      <div className="dex-page">
        <div className="dex-container">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 360px",
              gap: "32px",
              maxWidth: "900px",
              margin: "0 auto",
            }}
          >
            {/* Swap Widget */}
            <div>
              <div className="dex-card" style={{ maxWidth: "520px" }}>
                <div className="dex-flex-between" style={{ marginBottom: "24px" }}>
                  <h2 style={{ fontSize: "20px", fontWeight: 700 }}>Swap</h2>
                  <HistoryIcon
                    entries={txHistory.map((tx) => ({ hash: tx.hash, label: `${tx.from} → ${tx.to} · ${tx.amount}`, time: tx.time }))}
                    title="Swap History"
                  />
                </div>

                {/* FROM */}
                <div style={{ marginBottom: "4px" }}>
                  <div
                    className="dex-flex-between"
                    style={{ marginBottom: "8px", fontSize: "13px", color: "var(--muted)" }}
                  >
                    <span>From</span>
                    <span>
                      Balance:{" "}
                      {fromBalance !== undefined
                        ? Number(
                            formatUnits(fromBalance, fromToken.decimals)
                          ).toFixed(4)
                        : "—"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      alignItems: "center",
                    }}
                  >
                    <div className="token-badge" onClick={() => {
                      const next = TOKENS.find((t) => t.index !== fromToken.index);
                      if (next) { setFromToken(next); if (next.index === toToken.index) setToToken(fromToken); }
                    }}>
                      <div
                        className="token-logo"
                        style={{ background: fromToken.color }}
                      >
                        {fromToken.symbol.charAt(0)}
                      </div>
                      <span style={{ fontWeight: 600 }}>{fromToken.symbol}</span>
                      <span style={{ color: "var(--muted)", fontSize: "12px" }}>▼</span>
                    </div>
                    <input
                      className="dex-input"
                      type="text"
                      placeholder="0.00"
                      value={fromAmount}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^\d*\.?\d*$/.test(v)) setFromAmount(v);
                      }}
                      style={{ flex: 1, textAlign: "right" }}
                    />
                  </div>
                  {fromBalance !== undefined && (
                    <div style={{ textAlign: "right", marginTop: "6px" }}>
                      <button
                        className="dex-btn dex-btn-sm dex-btn-outline"
                        style={{ fontSize: "11px", padding: "4px 12px" }}
                        onClick={() =>
                          setFromAmount(
                            formatUnits(fromBalance, fromToken.decimals)
                          )
                        }
                      >
                        MAX
                      </button>
                    </div>
                  )}
                </div>

                {/* Arrow */}
                <div
                  className="swap-arrow"
                  onClick={handleSwitchTokens}
                  style={{ margin: "8px auto" }}
                >
                  ↓
                </div>

                {/* TO */}
                <div style={{ marginBottom: "24px" }}>
                  <div
                    className="dex-flex-between"
                    style={{ marginBottom: "8px", fontSize: "13px", color: "var(--muted)" }}
                  >
                    <span>To</span>
                    <span>
                      Balance:{" "}
                      {toBalance !== undefined
                        ? Number(
                            formatUnits(toBalance, toToken.decimals)
                          ).toFixed(4)
                        : "—"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      alignItems: "center",
                    }}
                  >
                    <div className="token-badge" onClick={() => {
                      const next = TOKENS.find((t) => t.index !== toToken.index);
                      if (next) { setToToken(next); if (next.index === fromToken.index) setFromToken(toToken); }
                    }}>
                      <div
                        className="token-logo"
                        style={{ background: toToken.color }}
                      >
                        {toToken.symbol.charAt(0)}
                      </div>
                      <span style={{ fontWeight: 600 }}>{toToken.symbol}</span>
                      <span style={{ color: "var(--muted)", fontSize: "12px" }}>▼</span>
                    </div>
                    <input
                      className="dex-input"
                      type="text"
                      placeholder="0.00"
                      value={
                        quoteAmount && quoteAmount > BigInt(0)
                          ? Number(
                              formatUnits(quoteAmount, toToken.decimals)
                            ).toFixed(6)
                          : ""
                      }
                      readOnly
                      style={{ flex: 1, textAlign: "right" }}
                    />
                  </div>
                </div>

                {/* Quote Info */}
                {quoteAmount && quoteAmount > BigInt(0) && (
                  <div
                    className="dex-card-sm"
                    style={{ marginBottom: "20px", fontSize: "13px" }}
                  >
                    <div className="dex-list-item">
                      <span style={{ color: "var(--muted)" }}>Rate</span>
                      <span>
                        1 {fromToken.symbol} ={" "}
                        {(
                          Number(
                            formatUnits(quoteAmount, toToken.decimals)
                          ) / Number(fromAmount || 1)
                        ).toFixed(6)}{" "}
                        {toToken.symbol}
                      </span>
                    </div>
                    <div className="dex-list-item">
                      <span style={{ color: "var(--muted)" }}>
                        Min. received (1% slippage)
                      </span>
                      <span>
                        {Number(
                          formatUnits(minReceive, toToken.decimals)
                        ).toFixed(6)}{" "}
                        {toToken.symbol}
                      </span>
                    </div>
                    <div className="dex-list-item">
                      <span style={{ color: "var(--muted)" }}>Route</span>
                      <span>
                        {fromToken.symbol} → {toToken.symbol} (StableSwap)
                      </span>
                    </div>
                  </div>
                )}

                {/* Action Button */}
                {!isConnected ? (
                  <button className="dex-btn dex-btn-full" disabled>
                    Connect wallet to swap
                  </button>
                ) : !parsedAmount || parsedAmount <= BigInt(0) ? (
                  <button className="dex-btn dex-btn-full" disabled>
                    Enter an amount
                  </button>
                ) : (
                  <button
                    className="dex-btn dex-btn-full"
                    disabled={
                      !parsedAmount ||
                      parsedAmount <= BigInt(0) ||
                      isProcessing
                    }
                    onClick={handleSwap}
                  >
                    {isProcessing ? (
                      <>
                        <div className="spinner" />
                        {isWritePending
                          ? "Confirming..."
                          : isConfirming
                          ? "Processing..."
                          : "Loading..."}
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

            {/* Pool Stats Sidebar */}
            <div>
              <PoolStatsSidebar />
            </div>
          </div>

          {/* Trust Bar */}
          <div style={{ marginTop: 32 }}>
            <TrustBar />
          </div>
        </div>
      </div>
    </>
  );
}

function PoolStatsSidebar() {
  const { data } = useReadContracts({
    contracts: [
      {
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: "balances",
        args: [BigInt(0)],
      },
      {
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: "balances",
        args: [BigInt(1)],
      },
      {
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: "fee",
      },
    ],
    query: { refetchInterval: 15000 },
  });

  const usdcReserve = (data?.[0]?.result as bigint) ?? BigInt(0);
  const eurcReserve = (data?.[1]?.result as bigint) ?? BigInt(0);
  const fee = (data?.[2]?.result as bigint) ?? BigInt(0);

  return (
    <div className="dex-card">
      <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "20px" }}>
        Pool Stats
      </h3>
      <div className="dex-list-item">
        <span style={{ color: "var(--muted)", fontSize: "13px" }}>USDC Reserve</span>
        <span style={{ fontFamily: "var(--font-geist-mono, monospace)", fontSize: "14px" }}>
          ${Number(formatUnits(usdcReserve, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="dex-list-item">
        <span style={{ color: "var(--muted)", fontSize: "13px" }}>EURC Reserve</span>
        <span style={{ fontFamily: "var(--font-geist-mono, monospace)", fontSize: "14px" }}>
          €{Number(formatUnits(eurcReserve, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="dex-list-item">
        <span style={{ color: "var(--muted)", fontSize: "13px" }}>Total Liquidity</span>
        <span style={{ fontFamily: "var(--font-geist-mono, monospace)", fontSize: "14px" }}>
          ${(Number(formatUnits(usdcReserve, 6)) + Number(formatUnits(eurcReserve, 6))).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="dex-list-item">
        <span style={{ color: "var(--muted)", fontSize: "13px" }}>Pool Fee</span>
        <span style={{ fontFamily: "var(--font-geist-mono, monospace)", fontSize: "14px" }}>
          {Number(formatUnits(fee, 10)).toFixed(4)}%
        </span>
      </div>

    </div>
  );
}
