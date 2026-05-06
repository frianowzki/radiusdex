"use client";

import { useState, useCallback } from "react";
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
import { TokenLogo } from "@/components/TokenLogo";
import Navbar from "@/components/Navbar";
import { useRadiusAuth } from "@/lib/auth";
import { useWriteContractCompat } from "@/lib/useWriteContractCompat";

type PoolTab = "add" | "remove";

export default function PoolPage() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { authenticated, address: authAddress } = useRadiusAuth();
  const address = wagmiAddress ?? authAddress;
  const isConnected = wagmiConnected || authenticated;
  const [tab, setTab] = useState<PoolTab>("add");

  const [usdcAmount, setUsdcAmount] = useState("");
  const [eurcAmount, setEurcAmount] = useState("");
  const [lpAmount, setLpAmount] = useState("");
  const [txHistory, setTxHistory] = useState<
    { hash: string; action: string; detail: string; time: string }[]
  >([]);

  const { writeContractAsync, isPending, txHash, setTxHash, error: txError, reset, isConfirming, isSuccess } = useWriteContractCompat();

  // Track multi-step flow
  const [approveStep, setApproveStep] = useState<"none" | "usdc-approved" | "both-approved">("none");

  // Pool data
  const { data: poolData, refetch: refetchPool } = useReadContracts({
    contracts: [
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: "balances", args: [BigInt(0)] },
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: "balances", args: [BigInt(1)] },
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: "fee" },
      { address: LP_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined },
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: "totalSupply" },
      { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "allowance", args: address ? [address, POOL_ADDRESS] : undefined },
      { address: EURC_ADDRESS, abi: ERC20_ABI, functionName: "allowance", args: address ? [address, POOL_ADDRESS] : undefined },
      // 7: user USDC balance
      { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined },
      // 8: user EURC balance
      { address: EURC_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined },
    ],
    query: { enabled: isConnected && !!address, refetchInterval: 5000 },
  });

  const usdcReserve = (poolData?.[0]?.result as bigint) ?? BigInt(0);
  const eurcReserve = (poolData?.[1]?.result as bigint) ?? BigInt(0);
  const lpBalance = (poolData?.[3]?.result as bigint) ?? BigInt(0);
  const usdcAllowance = (poolData?.[5]?.result as bigint) ?? BigInt(0);
  const eurcAllowance = (poolData?.[6]?.result as bigint) ?? BigInt(0);
  const userUsdcBalance = (poolData?.[7]?.result as bigint) ?? BigInt(0);
  const userEurcBalance = (poolData?.[8]?.result as bigint) ?? BigInt(0);

  const isProcessing = isPending || isConfirming;

  // Safe parse for button label
  const safeParse = (v: string, decimals: number) => {
    try { return parseUnits(v || "0", decimals); } catch { return BigInt(0); }
  };
  const usdcParsedSafe = safeParse(usdcAmount, 6);
  const eurcParsedSafe = safeParse(eurcAmount, 6);
  const needsUsdcApproval = approveStep === "none" && usdcParsedSafe > BigInt(0) && usdcAllowance < usdcParsedSafe;
  const needsEurcApproval = (approveStep === "usdc-approved" || approveStep === "none") && eurcParsedSafe > BigInt(0) && eurcAllowance < eurcParsedSafe && !needsUsdcApproval;

  const handleAddLiquidity = useCallback(async () => {
    if (!address || !usdcAmount || !eurcAmount) return;
    const usdcParsed = parseUnits(usdcAmount, 6);
    const eurcParsed = parseUnits(eurcAmount, 6);

    try {
      if (approveStep === "none" && usdcAllowance < usdcParsed) {
        // Step 1: Approve USDC
        await writeContractAsync({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "approve", args: [POOL_ADDRESS, usdcParsed] });
        setApproveStep("usdc-approved");
        reset();
        refetchPool();
        return;
      }
      if ((approveStep === "none" || approveStep === "usdc-approved") && eurcAllowance < eurcParsed) {
        // Step 2: Approve EURC
        await writeContractAsync({ address: EURC_ADDRESS, abi: ERC20_ABI, functionName: "approve", args: [POOL_ADDRESS, eurcParsed] });
        setApproveStep("both-approved");
        reset();
        refetchPool();
        return;
      }
      // Step 3: Add liquidity
      await writeContractAsync({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "add_liquidity", args: [[usdcParsed, eurcParsed], BigInt(0)] });
      setTxHistory((prev) => [
        { hash: txHash ?? "", action: "Add Liquidity", detail: `${usdcAmount} USDC + ${eurcAmount} EURC`, time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 9),
      ]);
      setUsdcAmount("");
      setEurcAmount("");
      setApproveStep("none");
      reset();
      refetchPool();
    } catch {
      // Error is already set by useWriteContractCompat
    }
  }, [address, usdcAmount, eurcAmount, usdcAllowance, eurcAllowance, approveStep, writeContractAsync, txHash, reset, refetchPool]);

  const handleRemoveLiquidity = useCallback(async () => {
    if (!address || !lpAmount) return;
    const lpParsed = parseUnits(lpAmount, 18);

    try {
      await writeContractAsync({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "remove_liquidity", args: [lpParsed, [BigInt(0), BigInt(0)]] });
      setTxHistory((prev) => [
        { hash: txHash ?? "", action: "Remove Liquidity", detail: `${lpAmount} LP`, time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 9),
      ]);
      setLpAmount("");
      reset();
      refetchPool();
    } catch {
      // Error is already set by useWriteContractCompat
    }
  }, [address, lpAmount, writeContractAsync, txHash, reset, refetchPool]);

  const getButtonText = () => {
    if (isProcessing) return <><span className="spinner" /> Processing…</>;
    if (needsUsdcApproval) return "Approve USDC";
    if (needsEurcApproval || approveStep === "usdc-approved") return "Approve EURC";
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
                  <div style={{ marginRight: "-8px", zIndex: 1 }}><TokenLogo symbol="USDC" size={28} /></div>
                  <TokenLogo symbol="EURC" size={28} />
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
                <div className="dex-stat-label">Your USDC</div>
                <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", marginTop: "8px" }}>
                  ${Number(formatUnits(userUsdcBalance, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="dex-card-sm" style={{ textAlign: "center" }}>
                <div className="dex-stat-label">Your EURC</div>
                <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", marginTop: "8px" }}>
                  €{Number(formatUnits(userEurcBalance, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          {/* Add/Remove Liquidity */}
          <div style={{ maxWidth: "600px", margin: "0 auto" }}>
            <div className="dex-card">
              <div className="dex-tabs" style={{ marginBottom: "24px" }}>
                <button className={`dex-tab ${tab === "add" ? "active" : ""}`} onClick={() => { setTab("add"); setApproveStep("none"); reset(); }}>Add Liquidity</button>
                <button className={`dex-tab ${tab === "remove" ? "active" : ""}`} onClick={() => { setTab("remove"); setApproveStep("none"); reset(); }}>Remove Liquidity</button>
              </div>

              {/* Approval progress hint */}
              {approveStep !== "none" && !isProcessing && (
                <div style={{ background: "rgba(34,197,94,0.08)", color: "#22c55e", borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 16 }}>
                  {approveStep === "usdc-approved" ? "USDC approved ✓ Click again to approve EURC." : "Both tokens approved ✓ Click again to add liquidity."}
                </div>
              )}

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
                        <TokenLogo symbol="USDC" size={24} />
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
                        <TokenLogo symbol="EURC" size={24} />
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
                  <div style={{ marginBottom: "16px" }}>
                    <div className="dex-flex-between" style={{ marginBottom: "8px", fontSize: "13px", color: "var(--muted)" }}>
                      <span>LP Token Amount</span>
                      <span>Balance: {Number(formatUnits(lpBalance, 18)).toFixed(4)}</span>
                    </div>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <div className="token-badge">
                        <div className="token-logo" style={{ background: "linear-gradient(135deg, #2563eb, #60a5fa)", fontSize: 10, fontWeight: 800 }}>LP</div>
                        <span style={{ fontWeight: 600 }}>LP</span>
                      </div>
                      <input className="dex-input" type="text" placeholder="0.00" value={lpAmount} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setLpAmount(v); }} style={{ flex: 1, textAlign: "right" }} />
                    </div>
                    <div style={{ textAlign: "right", marginTop: "6px" }}>
                      <button className="dex-btn dex-btn-sm dex-btn-outline" style={{ fontSize: "11px", padding: "4px 12px" }} onClick={() => setLpAmount(formatUnits(lpBalance, 18))}>MAX</button>
                    </div>
                  </div>

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
