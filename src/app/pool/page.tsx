"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, parseUnits } from "viem";
import {
  POOL_ADDRESS,
  POOL_ABI,
  LP_TOKEN_ADDRESS,
  ERC20_ABI,
  USDC_ADDRESS,
  EURC_ADDRESS,
  SLIPPAGE_BPS,
} from "@/config/contracts";
import { USDC, EURC } from "@/config/tokens";
import Navbar from "@/components/Navbar";
import { useRadiusAuth } from "@/lib/auth";

type PoolTab = "add" | "remove";
type RemoveMode = "dual" | "single";

export default function PoolPage() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { authenticated, address: authAddress } = useRadiusAuth();
  const address = wagmiAddress ?? authAddress;
  const isConnected = wagmiConnected || authenticated;
  const [tab, setTab] = useState<PoolTab>("add");
  const [removeMode, setRemoveMode] = useState<RemoveMode>("dual");

  // Add liquidity state
  const [usdcAmount, setUsdcAmount] = useState("");
  const [eurcAmount, setEurcAmount] = useState("");

  // Remove liquidity state
  const [lpAmount, setLpAmount] = useState("");
  const [removeCoinIndex, setRemoveCoinIndex] = useState(0);

  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [txHistory, setTxHistory] = useState<
    { hash: string; action: string; detail: string; time: string }[]
  >([]);

  // Pool data
  const { data: poolData } = useReadContracts({
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
      {
        address: LP_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
      {
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: "totalSupply",
      },
      // Allowances
      {
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: address ? [address, POOL_ADDRESS] : undefined,
      },
      {
        address: EURC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: address ? [address, POOL_ADDRESS] : undefined,
      },
    ],
    query: { enabled: isConnected && !!address, refetchInterval: 10000 },
  });

  const usdcReserve = (poolData?.[0]?.result as bigint) ?? BigInt(0);
  const eurcReserve = (poolData?.[1]?.result as bigint) ?? BigInt(0);
  const fee = (poolData?.[2]?.result as bigint) ?? BigInt(0);
  const lpBalance = (poolData?.[3]?.result as bigint) ?? BigInt(0);
  const lpSupply = (poolData?.[4]?.result as bigint) ?? BigInt(0);
  const usdcAllowance = (poolData?.[5]?.result as bigint) ?? BigInt(0);
  const eurcAllowance = (poolData?.[6]?.result as bigint) ?? BigInt(0);

  // Write hooks
  const {
    mutateAsync: writeContract,
    isPending: isWritePending,
    reset: resetWrite,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (isSuccess && txHash) {
      setTxHistory((prev) => [
        {
          hash: txHash,
          action: tab === "add" ? "Add Liquidity" : "Remove Liquidity",
          detail:
            tab === "add"
              ? `${usdcAmount} USDC + ${eurcAmount} EURC`
              : `${lpAmount} LP`,
          time: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 9),
      ]);
      setUsdcAmount("");
      setEurcAmount("");
      setLpAmount("");
      setTxHash(undefined);
      resetWrite();
    }
  }, [isSuccess]);

  const isProcessing = isWritePending || isConfirming;

  const totalLiquidity =
    Number(formatUnits(usdcReserve, 6)) + Number(formatUnits(eurcReserve, 6));

  const handleAddLiquidity = async () => {
    if (!address || !usdcAmount || !eurcAmount) return;
    const usdcParsed = parseUnits(usdcAmount, 6);
    const eurcParsed = parseUnits(eurcAmount, 6);

    try {
      // Check if USDC approval needed
      if (usdcAllowance < usdcParsed) {
        const h = await writeContract({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [POOL_ADDRESS, usdcParsed],
        });
        setTxHash(h);
        return;
      }
      // Check if EURC approval needed
      if (eurcAllowance < eurcParsed) {
        const h = await writeContract({
          address: EURC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [POOL_ADDRESS, eurcParsed],
        });
        setTxHash(h);
        return;
      }

      const h = await writeContract({
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: "add_liquidity",
        args: [[usdcParsed, eurcParsed], BigInt(0)],
      });
      setTxHash(h);
    } catch (err) {
      console.error("Add liquidity error:", err);
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!address || !lpAmount) return;
    const lpParsed = parseUnits(lpAmount, 18);

    try {
      if (removeMode === "dual") {
        const h = await writeContract({
          address: POOL_ADDRESS,
          abi: POOL_ABI,
          functionName: "remove_liquidity",
          args: [lpParsed, [BigInt(0), BigInt(0)]],
        });
        setTxHash(h);
      } else {
        const h = await writeContract({
          address: POOL_ADDRESS,
          abi: POOL_ABI,
          functionName: "remove_liquidity_one_coin",
          args: [lpParsed, BigInt(removeCoinIndex), BigInt(0)],
        });
        setTxHash(h);
      }
    } catch (err) {
      console.error("Remove liquidity error:", err);
    }
  };

  return (
    <>
      <Navbar />
      <div className="dex-page">
        <div className="dex-container">
          <h1
            style={{
              fontSize: "clamp(24px, 6vw, 32px)",
              fontWeight: 700,
              marginBottom: "32px",
            }}
          >
            Pool
          </h1>

          {/* Pool Info */}
          <div className="dex-card dex-section">
            <div
              className="dex-flex-between"
              style={{ marginBottom: "20px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ display: "flex" }}>
                  <div
                    className="token-logo"
                    style={{ background: USDC.color, marginRight: "-8px", zIndex: 1 }}
                  >
                    U
                  </div>
                  <div
                    className="token-logo"
                    style={{ background: EURC.color }}
                  >
                    E
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "18px" }}>
                    USDC — EURC
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                    Stable Coins Pool
                  </div>
                </div>
              </div>
              <span className="dex-badge">
                <span className="status-dot" />
                Active
              </span>
            </div>

            {/* Stats Grid */}
            <div
              className="dex-grid dex-grid-4"
              style={{ gap: "16px" }}
            >
              <div className="dex-card-sm" style={{ textAlign: "center" }}>
                <div className="dex-stat-label">USDC Reserves</div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    fontFamily: "var(--font-geist-mono, monospace)",
                    marginTop: "8px",
                    color: usdcReserve === BigInt(0) ? "var(--muted)" : undefined,
                  }}
                >
                  {usdcReserve === BigInt(0) ? "No deposits yet" : `$${Number(formatUnits(usdcReserve, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                </div>
              </div>
              <div className="dex-card-sm" style={{ textAlign: "center" }}>
                <div className="dex-stat-label">EURC Reserves</div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    fontFamily: "var(--font-geist-mono, monospace)",
                    marginTop: "8px",
                    color: eurcReserve === BigInt(0) ? "var(--muted)" : undefined,
                  }}
                >
                  {eurcReserve === BigInt(0) ? "No deposits yet" : `€${Number(formatUnits(eurcReserve, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                </div>
              </div>
              <div className="dex-card-sm" style={{ textAlign: "center" }}>
                <div className="dex-stat-label">Total Liquidity</div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    fontFamily: "var(--font-geist-mono, monospace)",
                    marginTop: "8px",
                    color: totalLiquidity === 0 ? "var(--muted)" : undefined,
                  }}
                >
                  {totalLiquidity === 0 ? "No liquidity" : `$${totalLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                </div>
              </div>
              <div className="dex-card-sm" style={{ textAlign: "center" }}>
                <div className="dex-stat-label">LP Supply</div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    fontFamily: "var(--font-geist-mono, monospace)",
                    marginTop: "8px",
                    color: lpSupply === BigInt(0) ? "var(--muted)" : undefined,
                  }}
                >
                  {lpSupply === BigInt(0) ? "No LP tokens" : Number(formatUnits(lpSupply, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </div>
              </div>
            </div>
          </div>

          {/* Add/Remove Liquidity */}
          <div style={{ maxWidth: "600px", margin: "0 auto" }}>
            <div className="dex-card">
              {/* Tabs */}
              <div className="dex-tabs" style={{ marginBottom: "24px" }}>
                <button
                  className={`dex-tab ${tab === "add" ? "active" : ""}`}
                  onClick={() => setTab("add")}
                >
                  Add Liquidity
                </button>
                <button
                  className={`dex-tab ${tab === "remove" ? "active" : ""}`}
                  onClick={() => setTab("remove")}
                >
                  Remove Liquidity
                </button>
              </div>

              {tab === "add" ? (
                <>
                  <div style={{ marginBottom: "16px" }}>
                    <div
                      className="dex-flex-between"
                      style={{
                        marginBottom: "8px",
                        fontSize: "13px",
                        color: "var(--muted)",
                      }}
                    >
                      <span>USDC Amount</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        alignItems: "center",
                      }}
                    >
                      <div className="token-badge">
                        <div
                          className="token-logo"
                          style={{ background: USDC.color }}
                        >
                          U
                        </div>
                        <span style={{ fontWeight: 600 }}>USDC</span>
                      </div>
                      <input
                        className="dex-input"
                        type="text"
                        placeholder="0.00"
                        value={usdcAmount}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^\d*\.?\d*$/.test(v))
                            setUsdcAmount(v);
                        }}
                        style={{ flex: 1, textAlign: "right" }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <div
                      className="dex-flex-between"
                      style={{
                        marginBottom: "8px",
                        fontSize: "13px",
                        color: "var(--muted)",
                      }}
                    >
                      <span>EURC Amount</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        alignItems: "center",
                      }}
                    >
                      <div className="token-badge">
                        <div
                          className="token-logo"
                          style={{ background: EURC.color }}
                        >
                          E
                        </div>
                        <span style={{ fontWeight: 600 }}>EURC</span>
                      </div>
                      <input
                        className="dex-input"
                        type="text"
                        placeholder="0.00"
                        value={eurcAmount}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^\d*\.?\d*$/.test(v))
                            setEurcAmount(v);
                        }}
                        style={{ flex: 1, textAlign: "right" }}
                      />
                    </div>
                  </div>

                  <button
                    className="dex-btn dex-btn-full"
                    disabled={
                      !isConnected ||
                      !usdcAmount ||
                      !eurcAmount ||
                      isProcessing
                    }
                    onClick={handleAddLiquidity}
                  >
                    {isProcessing ? (
                      <>
                        <div className="spinner" /> Processing...
                      </>
                    ) : usdcAllowance < parseUnits(usdcAmount || "0", 6) ? (
                      "Approve USDC"
                    ) : eurcAllowance < parseUnits(eurcAmount || "0", 6) ? (
                      "Approve EURC"
                    ) : (
                      "Add Liquidity"
                    )}
                  </button>
                </>
              ) : (
                <>
                  {/* Remove Mode Toggle */}
                  <div className="dex-tabs" style={{ marginBottom: "20px" }}>
                    <button
                      className={`dex-tab ${removeMode === "dual" ? "active" : ""}`}
                      onClick={() => setRemoveMode("dual")}
                    >
                      Dual Coin
                    </button>
                    <button
                      className={`dex-tab ${removeMode === "single" ? "active" : ""}`}
                      onClick={() => setRemoveMode("single")}
                    >
                      Single Coin
                    </button>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <div
                      className="dex-flex-between"
                      style={{
                        marginBottom: "8px",
                        fontSize: "13px",
                        color: "var(--muted)",
                      }}
                    >
                      <span>LP Token Amount</span>
                      <span>
                        Balance:{" "}
                        {Number(formatUnits(lpBalance, 18)).toFixed(4)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        alignItems: "center",
                      }}
                    >
                      <div className="token-badge">
                        <div
                          className="token-logo"
                          style={{ background: "var(--purple)" }}
                        >
                          L
                        </div>
                        <span style={{ fontWeight: 600 }}>LP</span>
                      </div>
                      <input
                        className="dex-input"
                        type="text"
                        placeholder="0.00"
                        value={lpAmount}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^\d*\.?\d*$/.test(v))
                            setLpAmount(v);
                        }}
                        style={{ flex: 1, textAlign: "right" }}
                      />
                    </div>
                    <div style={{ textAlign: "right", marginTop: "6px" }}>
                      <button
                        className="dex-btn dex-btn-sm dex-btn-outline"
                        style={{ fontSize: "12px", padding: "8px 16px" }}
                        onClick={() =>
                          setLpAmount(formatUnits(lpBalance, 18))
                        }
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  {removeMode === "single" && (
                    <div className="dex-tabs" style={{ marginBottom: "20px" }}>
                      <button
                        className={`dex-tab ${removeCoinIndex === 0 ? "active" : ""}`}
                        onClick={() => setRemoveCoinIndex(0)}
                      >
                        USDC
                      </button>
                      <button
                        className={`dex-tab ${removeCoinIndex === 1 ? "active" : ""}`}
                        onClick={() => setRemoveCoinIndex(1)}
                      >
                        EURC
                      </button>
                    </div>
                  )}

                  <button
                    className="dex-btn dex-btn-full"
                    disabled={
                      !isConnected || !lpAmount || isProcessing
                    }
                    onClick={handleRemoveLiquidity}
                  >
                    {isProcessing ? (
                      <>
                        <div className="spinner" /> Processing...
                      </>
                    ) : (
                      "Remove Liquidity"
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Pool History */}
            {txHistory.length > 0 && (
              <div className="dex-card" style={{ marginTop: "24px" }}>
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    marginBottom: "16px",
                  }}
                >
                  Recent Activity
                </h3>
                {txHistory.map((tx, i) => (
                  <div key={i} className="dex-list-item">
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
                      <span style={{ fontWeight: 500 }}>{tx.action}</span>
                      <span
                        style={{
                          fontSize: "13px",
                          color: "var(--muted)",
                        }}
                      >
                        {tx.detail}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          color: "var(--muted)",
                        }}
                      >
                        {tx.time}
                      </span>
                    </div>
                    <a
                      href={`https://testnet.arcscan.app/tx/${tx.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tx-hash"
                    >
                      {tx.hash.slice(0, 10)}...
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
