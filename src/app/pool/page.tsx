"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  useAccount,
  useReadContracts,
} from "wagmi";
import { formatUnits, parseUnits } from "viem";
import {
  POOL_ADDRESS,
  POOL_ABI,
  LP_TOKEN_ADDRESS,
  ERC20_ABI,
  USDC_ADDRESS,
  EURC_ADDRESS,
} from "@/config/contracts";
import { USDC, EURC } from "@/config/tokens";
import Navbar from "@/components/Navbar";
import { useRadiusAuth } from "@/lib/auth";
import { useWriteContractCompat } from "@/lib/useWriteContractCompat";

type PoolTab = "add" | "remove";
type RemoveMode = "dual" | "single";

export default function PoolPage() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { authenticated, address: authAddress } = useRadiusAuth();
  const address = wagmiAddress ?? authAddress;
  const isConnected = wagmiConnected || authenticated;
  const [tab, setTab] = useState<PoolTab>("add");
  const [removeMode, setRemoveMode] = useState<RemoveMode>("dual");

  const [usdcAmount, setUsdcAmount] = useState("");
  const [eurcAmount, setEurcAmount] = useState("");
  const [lpAmount, setLpAmount] = useState("");
  const [removeCoinIndex, setRemoveCoinIndex] = useState(0);
  const [txHistory, setTxHistory] = useState<
    { hash: string; action: string; detail: string; time: string }[]
  >([]);
  const [stepLabel, setStepLabel] = useState("");

  const { writeContractAsync, isPending, txHash, setTxHash, error: txError, reset, isConfirming, isSuccess } = useWriteContractCompat();

  // Pool data
  const { data: poolData } = useReadContracts({
    contracts: [
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: "balances", args: [BigInt(0)] },
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: "balances", args: [BigInt(1)] },
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: "fee" },
      { address: LP_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined },
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: "totalSupply" },
      { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "allowance", args: address ? [address, POOL_ADDRESS] : undefined },
      { address: EURC_ADDRESS, abi: ERC20_ABI, functionName: "allowance", args: address ? [address, POOL_ADDRESS] : undefined },
    ],
    query: { enabled: isConnected && !!address, refetchInterval: 5000 },
  });

  const usdcReserve = (poolData?.[0]?.result as bigint) ?? BigInt(0);
  const eurcReserve = (poolData?.[1]?.result as bigint) ?? BigInt(0);
  const lpBalance = (poolData?.[3]?.result as bigint) ?? BigInt(0);
  const lpSupply = (poolData?.[4]?.result as bigint) ?? BigInt(0);
  const usdcAllowance = (poolData?.[5]?.result as bigint) ?? BigInt(0);
  const eurcAllowance = (poolData?.[6]?.result as bigint) ?? BigInt(0);

  const isProcessing = isPending || isConfirming;
  const totalLiquidity = Number(formatUnits(usdcReserve, 6)) + Number(formatUnits(eurcReserve, 6));

  // Track what step we're on for auto-continuation
  const pendingStepRef = useRef<"approve-usdc" | "approve-eurc" | "add-liquidity" | "remove-liquidity" | null>(null);

  // When a tx succeeds, auto-continue to next step
  const handleTxSuccess = useCallback(async () => {
    if (!txHash) return;
    const step = pendingStepRef.current;

    if (step === "approve-usdc") {
      // USDC approved, now approve EURC
      pendingStepRef.current = "approve-eurc";
      setStepLabel("Approving EURC…");
      setTxHash(undefined);
      reset();
      // Small delay to let allowance refetch
      await new Promise(r => setTimeout(r, 2000));
      try {
        const eurcParsed = parseUnits(eurcAmount, 6);
        await writeContractAsync({ address: EURC_ADDRESS, abi: ERC20_ABI, functionName: "approve", args: [POOL_ADDRESS, eurcParsed] });
      } catch (err) {
        console.error("EURC approve error:", err);
        setStepLabel("");
        pendingStepRef.current = null;
      }
    } else if (step === "approve-eurc") {
      // EURC approved, now add liquidity
      pendingStepRef.current = "add-liquidity";
      setStepLabel("Adding liquidity…");
      setTxHash(undefined);
      reset();
      await new Promise(r => setTimeout(r, 2000));
      try {
        const usdcParsed = parseUnits(usdcAmount, 6);
        const eurcParsed = parseUnits(eurcAmount, 6);
        await writeContractAsync({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "add_liquidity", args: [[usdcParsed, eurcParsed], BigInt(0)] });
      } catch (err) {
        console.error("Add liquidity error:", err);
        setStepLabel("");
        pendingStepRef.current = null;
      }
    } else if (step === "add-liquidity" || step === "remove-liquidity") {
      // Final step done
      setTxHistory((prev) => [
        {
          hash: txHash,
          action: step === "add-liquidity" ? "Add Liquidity" : "Remove Liquidity",
          detail: step === "add-liquidity" ? `${usdcAmount} USDC + ${eurcAmount} EURC` : `${lpAmount} LP`,
          time: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 9),
      ]);
      setUsdcAmount("");
      setEurcAmount("");
      setLpAmount("");
      setStepLabel("");
      pendingStepRef.current = null;
      setTxHash(undefined);
      reset();
    }
  }, [txHash, usdcAmount, eurcAmount, lpAmount, writeContractAsync, setTxHash, reset]);

  useEffect(() => {
    if (isSuccess && txHash && pendingStepRef.current) {
      handleTxSuccess();
    }
  }, [isSuccess, txHash]);

  // Safe parse for button label
  const safeParse = (v: string, decimals: number) => {
    try { return parseUnits(v || "0", decimals); } catch { return BigInt(0); }
  };
  const usdcParsedSafe = safeParse(usdcAmount, 6);
  const eurcParsedSafe = safeParse(eurcAmount, 6);
  const needsUsdcApproval = usdcParsedSafe > BigInt(0) && usdcAllowance < usdcParsedSafe;
  const needsEurcApproval = eurcParsedSafe > BigInt(0) && eurcAllowance < eurcParsedSafe;

  const handleAddLiquidity = async () => {
    if (!address || !usdcAmount || !eurcAmount) return;
    const usdcParsed = parseUnits(usdcAmount, 6);
    const eurcParsed = parseUnits(eurcAmount, 6);

    try {
      if (usdcAllowance < usdcParsed) {
        // Step 1: Approve USDC (auto-continues to EURC approve, then add_liquidity)
        pendingStepRef.current = "approve-usdc";
        setStepLabel("Step 1/3: Approving USDC…");
        await writeContractAsync({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "approve", args: [POOL_ADDRESS, usdcParsed] });
        return;
      }
      if (eurcAllowance < eurcParsed) {
        // Step 2: Approve EURC (auto-continues to add_liquidity)
        pendingStepRef.current = "approve-eurc";
        setStepLabel("Step 2/3: Approving EURC…");
        await writeContractAsync({ address: EURC_ADDRESS, abi: ERC20_ABI, functionName: "approve", args: [POOL_ADDRESS, eurcParsed] });
        return;
      }
      // Step 3: Add liquidity directly
      pendingStepRef.current = "add-liquidity";
      setStepLabel("Adding liquidity…");
      await writeContractAsync({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "add_liquidity", args: [[usdcParsed, eurcParsed], BigInt(0)] });
    } catch (err) {
      console.error("Add liquidity error:", err);
      setStepLabel("");
      pendingStepRef.current = null;
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!address || !lpAmount) return;
    const lpParsed = parseUnits(lpAmount, 18);

    try {
      pendingStepRef.current = "remove-liquidity";
      setStepLabel("Removing liquidity…");
      if (removeMode === "dual") {
        await writeContractAsync({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "remove_liquidity", args: [lpParsed, [BigInt(0), BigInt(0)]] });
      } else {
        await writeContractAsync({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "remove_liquidity_one_coin", args: [lpParsed, BigInt(removeCoinIndex), BigInt(0)] });
      }
    } catch (err) {
      console.error("Remove liquidity error:", err);
      setStepLabel("");
      pendingStepRef.current = null;
    }
  };

  const getButtonText = () => {
    if (stepLabel) return <><span className="spinner" /> {stepLabel}</>;
    if (isProcessing) return <><span className="spinner" /> Processing…</>;
    if (needsUsdcApproval) return "Add Liquidity (auto-approve)";
    if (needsEurcApproval) return "Add Liquidity (auto-approve)";
    return "Add Liquidity";
  };

  return (
    <>
      <Navbar />
      <div className="dex-page">
        <div className="dex-container">
          <h1 style={{ fontSize: "32px", fontWeight: 700, marginBottom: "32px" }}>Pool</h1>

          {/* Pool Info */}
          <div className="dex-card dex-section">
            <div className="dex-flex-between" style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ display: "flex" }}>
                  <div className="token-logo" style={{ background: USDC.color, marginRight: "-8px", zIndex: 1 }}>U</div>
                  <div className="token-logo" style={{ background: EURC.color }}>E</div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "18px" }}>USDC — EURC</div>
                  <div style={{ fontSize: "13px", color: "var(--muted)" }}>Radius Swap Pool</div>
                </div>
              </div>
              <span className="dex-badge"><span className="status-dot" />Active</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
              <div className="dex-card-sm" style={{ textAlign: "center" }}>
                <div className="dex-stat-label">USDC Reserves</div>
                <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", marginTop: "8px", color: usdcReserve === BigInt(0) ? "var(--muted)" : undefined }}>
                  {usdcReserve === BigInt(0) ? "No deposits yet" : `$${Number(formatUnits(usdcReserve, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                </div>
              </div>
              <div className="dex-card-sm" style={{ textAlign: "center" }}>
                <div className="dex-stat-label">EURC Reserves</div>
                <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", marginTop: "8px", color: eurcReserve === BigInt(0) ? "var(--muted)" : undefined }}>
                  {eurcReserve === BigInt(0) ? "No deposits yet" : `€${Number(formatUnits(eurcReserve, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                </div>
              </div>
              <div className="dex-card-sm" style={{ textAlign: "center" }}>
                <div className="dex-stat-label">Total Liquidity</div>
                <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", marginTop: "8px", color: totalLiquidity === 0 ? "var(--muted)" : undefined }}>
                  {totalLiquidity === 0 ? "No liquidity" : `$${totalLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                </div>
              </div>
              <div className="dex-card-sm" style={{ textAlign: "center" }}>
                <div className="dex-stat-label">LP Supply</div>
                <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", marginTop: "8px", color: lpSupply === BigInt(0) ? "var(--muted)" : undefined }}>
                  {lpSupply === BigInt(0) ? "No LP tokens" : Number(formatUnits(lpSupply, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </div>
              </div>
            </div>
          </div>

          {/* Add/Remove Liquidity */}
          <div style={{ maxWidth: "600px", margin: "0 auto" }}>
            <div className="dex-card">
              <div className="dex-tabs" style={{ marginBottom: "24px" }}>
                <button className={`dex-tab ${tab === "add" ? "active" : ""}`} onClick={() => setTab("add")}>Add Liquidity</button>
                <button className={`dex-tab ${tab === "remove" ? "active" : ""}`} onClick={() => setTab("remove")}>Remove Liquidity</button>
              </div>

              {/* Error feedback */}
              {txError && (
                <div style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 16 }}>
                  {txError}
                </div>
              )}

              {tab === "add" ? (
                <>
                  <div style={{ marginBottom: "16px" }}>
                    <div className="dex-flex-between" style={{ marginBottom: "8px", fontSize: "13px", color: "var(--muted)" }}>
                      <span>USDC Amount</span>
                    </div>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <div className="token-badge">
                        <div className="token-logo" style={{ background: USDC.color }}>U</div>
                        <span style={{ fontWeight: 600 }}>USDC</span>
                      </div>
                      <input className="dex-input" type="text" placeholder="0.00" value={usdcAmount} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setUsdcAmount(v); }} style={{ flex: 1, textAlign: "right" }} />
                    </div>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <div className="dex-flex-between" style={{ marginBottom: "8px", fontSize: "13px", color: "var(--muted)" }}>
                      <span>EURC Amount</span>
                    </div>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <div className="token-badge">
                        <div className="token-logo" style={{ background: EURC.color }}>E</div>
                        <span style={{ fontWeight: 600 }}>EURC</span>
                      </div>
                      <input className="dex-input" type="text" placeholder="0.00" value={eurcAmount} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setEurcAmount(v); }} style={{ flex: 1, textAlign: "right" }} />
                    </div>
                  </div>

                  <button
                    className="dex-btn dex-btn-full"
                    disabled={!isConnected || !usdcAmount || !eurcAmount || isProcessing}
                    onClick={handleAddLiquidity}
                  >
                    {!isConnected ? "Connect wallet to add liquidity" : getButtonText()}
                  </button>
                </>
              ) : (
                <>
                  <div className="dex-tabs" style={{ marginBottom: "20px" }}>
                    <button className={`dex-tab ${removeMode === "dual" ? "active" : ""}`} onClick={() => setRemoveMode("dual")}>Dual Coin</button>
                    <button className={`dex-tab ${removeMode === "single" ? "active" : ""}`} onClick={() => setRemoveMode("single")}>Single Coin</button>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <div className="dex-flex-between" style={{ marginBottom: "8px", fontSize: "13px", color: "var(--muted)" }}>
                      <span>LP Token Amount</span>
                      <span>Balance: {Number(formatUnits(lpBalance, 18)).toFixed(4)}</span>
                    </div>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <div className="token-badge">
                        <div className="token-logo" style={{ background: "var(--purple)" }}>L</div>
                        <span style={{ fontWeight: 600 }}>LP</span>
                      </div>
                      <input className="dex-input" type="text" placeholder="0.00" value={lpAmount} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setLpAmount(v); }} style={{ flex: 1, textAlign: "right" }} />
                    </div>
                    <div style={{ textAlign: "right", marginTop: "6px" }}>
                      <button className="dex-btn dex-btn-sm dex-btn-outline" style={{ fontSize: "11px", padding: "4px 12px" }} onClick={() => setLpAmount(formatUnits(lpBalance, 18))}>MAX</button>
                    </div>
                  </div>

                  {removeMode === "single" && (
                    <div className="dex-tabs" style={{ marginBottom: "20px" }}>
                      <button className={`dex-tab ${removeCoinIndex === 0 ? "active" : ""}`} onClick={() => setRemoveCoinIndex(0)}>USDC</button>
                      <button className={`dex-tab ${removeCoinIndex === 1 ? "active" : ""}`} onClick={() => setRemoveCoinIndex(1)}>EURC</button>
                    </div>
                  )}

                  <button
                    className="dex-btn dex-btn-full"
                    disabled={!isConnected || !lpAmount || isProcessing}
                    onClick={handleRemoveLiquidity}
                  >
                    {!isConnected ? "Connect wallet to remove liquidity" : isProcessing ? <><span className="spinner" /> Processing...</> : "Remove Liquidity"}
                  </button>
                </>
              )}
            </div>

            {/* Pool History */}
            {txHistory.length > 0 && (
              <div className="dex-card" style={{ marginTop: "24px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>Recent Activity</h3>
                {txHistory.map((tx, i) => (
                  <div key={i} className="dex-list-item">
                    <div>
                      <span style={{ fontWeight: 500 }}>{tx.action}</span>
                      <span style={{ fontSize: "13px", color: "var(--muted)", marginLeft: "12px" }}>{tx.detail}</span>
                      <span style={{ fontSize: "12px", color: "var(--muted)", marginLeft: "8px" }}>{tx.time}</span>
                    </div>
                    <a href={`https://testnet.arcscan.app/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer" className="tx-hash">{tx.hash.slice(0, 10)}...</a>
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
