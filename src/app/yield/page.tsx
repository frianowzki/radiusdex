"use client";

import { useState, useCallback } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import {
  STAKING_ADDRESS,
  STAKING_ABI,
  LP_TOKEN_ADDRESS,
  RAD_TOKEN_ADDRESS,
  ERC20_ABI,
} from "@/config/contracts";
import Navbar from "@/components/Navbar";
import { useRadiusAuth } from "@/lib/auth";
import { useWriteContractCompat } from "@/lib/useWriteContractCompat";
import { calcAPR } from "@/lib/format";
import { parseTokenAmount } from "@/lib/amount";

export default function YieldPage() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { authenticated, address: authAddress } = useRadiusAuth();
  const address = wagmiAddress ?? authAddress;
  const isConnected = wagmiConnected || authenticated;

  const [amount, setAmount] = useState("");
  const [action, setAction] = useState<"stake" | "unstake">("stake");
  const [postApprove, setPostApprove] = useState(false);
  const [txHistory, setTxHistory] = useState<
    { hash: string; action: string; amount: string; time: string }[]
  >([]);

  const { writeContractAsync, isPending, error: txError, reset, isConfirming } = useWriteContractCompat();

  const { data: stakingData, refetch } = useReadContracts({
    contracts: [
      { address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "staked", args: address ? [address] : undefined },
      { address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "earned", args: address ? [address] : undefined },
      { address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "totalStaked" },
      { address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "rewardRatePerSecond" },
      { address: LP_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined },
      { address: LP_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "allowance", args: address ? [address, STAKING_ADDRESS] : undefined },
      { address: RAD_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined },
    ],
    query: { enabled: isConnected && !!address, refetchInterval: 10000 },
  });

  const userStaked = (stakingData?.[0]?.result as bigint) ?? BigInt(0);
  const userEarned = (stakingData?.[1]?.result as bigint) ?? BigInt(0);
  const totalStaked = (stakingData?.[2]?.result as bigint) ?? BigInt(0);
  const rewardRate = (stakingData?.[3]?.result as bigint) ?? BigInt(0);
  const lpBalance = (stakingData?.[4]?.result as bigint) ?? BigInt(0);
  const lpAllowance = (stakingData?.[5]?.result as bigint) ?? BigInt(0);
  const radBalance = (stakingData?.[6]?.result as bigint) ?? BigInt(0);

  const isProcessing = isPending || isConfirming;

  const apr = calcAPR(rewardRate, totalStaked);

  const parsedAmount = parseTokenAmount(amount, 18);
  const needsApproval = action === "stake" && !postApprove && parsedAmount !== undefined && parsedAmount > BigInt(0) && lpAllowance < parsedAmount;
  const canStake = Boolean(isConnected && parsedAmount && parsedAmount > BigInt(0) && parsedAmount <= lpBalance && !isProcessing);
  const canUnstake = Boolean(isConnected && parsedAmount && parsedAmount > BigInt(0) && parsedAmount <= userStaked && !isProcessing);

  const handleStake = useCallback(async () => {
    if (!address || !parsedAmount || parsedAmount <= BigInt(0)) return;
    const parsed = parsedAmount;
    try {
      if (!postApprove && lpAllowance < parsed) {
        await writeContractAsync({ address: LP_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "approve", args: [STAKING_ADDRESS, parsed] });
        setPostApprove(true);
        reset();
        refetch();
        return;
      }
      await writeContractAsync({ address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "stake", args: [parsed] });
      setTxHistory(prev => [{ hash: "", action: "Staked", amount: `${amount} LP`, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
      setAmount("");
      setPostApprove(false);
      reset();
      refetch();
    } catch { /* Error set by hook */ }
  }, [address, amount, parsedAmount, lpAllowance, postApprove, writeContractAsync, reset, refetch]);

  const handleUnstake = useCallback(async () => {
    if (!address || !parsedAmount || parsedAmount <= BigInt(0)) return;
    try {
      await writeContractAsync({ address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "withdraw", args: [parsedAmount] });
      setTxHistory(prev => [{ hash: "", action: "Unstaked", amount: `${amount} LP`, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
      setAmount("");
      reset();
      refetch();
    } catch { /* Error set by hook */ }
  }, [address, amount, parsedAmount, writeContractAsync, reset, refetch]);

  const handleClaim = useCallback(async () => {
    if (!address || userEarned === BigInt(0)) return;
    try {
      await writeContractAsync({ address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "claim", args: [] });
      setTxHistory(prev => [{ hash: "", action: "Claimed", amount: `${formatUnits(userEarned, 18)} RAD`, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
      reset();
      refetch();
    } catch { /* Error set by hook */ }
  }, [address, userEarned, writeContractAsync, reset, refetch]);

  const getButtonText = () => {
    if (isProcessing) return <><span className="spinner" /> Processing…</>;
    if (needsApproval) return "Approve LP";
    if (action === "unstake") return "Unstake LP";
    return "Stake LP";
  };

  return (
    <>
      <Navbar />
      <div className="dex-page">
        <div className="dex-container">
          <section style={{ textAlign: "center", paddingTop: "40px", paddingBottom: "32px" }}>
            <h1 className="hero-title-md" style={{ fontSize: "48px", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, background: "linear-gradient(135deg, #f1f5f9 0%, #60a5fa 40%, #a78bfa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Provide Liquidity. Earn RAD.
            </h1>
            <p style={{ fontSize: "18px", color: "var(--muted)", marginTop: "16px", maxWidth: "520px", margin: "16px auto 0", lineHeight: 1.6 }}>
              Stake your Radius LP tokens and earn RAD rewards.<br />The more you stake, the more you earn.
            </p>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }} className="yield-stats-grid">
            <div className="dex-card" style={{ textAlign: "center", padding: "20px" }}>
              <div className="dex-stat-label">Total Staked</div>
              <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", marginTop: "8px" }}>
                {totalStaked === BigInt(0) ? "0" : Number(formatUnits(totalStaked, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })} LP
              </div>
            </div>
            <div className="dex-card" style={{ textAlign: "center", padding: "20px" }}>
              <div className="dex-stat-label">APR</div>
              <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", marginTop: "8px", color: "#22c55e" }}>
                {apr > 0 ? (apr > 999.99 ? "999.99%+" : `${apr.toFixed(2)}%`) : "—"}
              </div>
            </div>
            <div className="dex-card" style={{ textAlign: "center", padding: "20px" }}>
              <div className="dex-stat-label">Your Staked</div>
              <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", marginTop: "8px" }}>
                {Number(formatUnits(userStaked, 18)).toFixed(4)} LP
              </div>
            </div>
            <div className="dex-card" style={{ textAlign: "center", padding: "20px" }}>
              <div className="dex-stat-label">Your RAD</div>
              <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", marginTop: "8px", color: "#60a5fa" }}>
                {Number(formatUnits(radBalance, 18)).toFixed(2)}
              </div>
            </div>
          </div>

          {isConnected && userStaked > BigInt(0) && (
            <div className="yield-staking-status" style={{
              maxWidth: "520px", margin: "0 auto 24px",
              background: "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(139,92,246,0.06))",
              border: "1px solid rgba(37,99,235,0.15)",
              borderRadius: 16, padding: "16px 24px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Your Staked</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)" }}>
                  {Number(formatUnits(userStaked, 18)).toFixed(4)} LP
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Your Earned</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", color: "#60a5fa" }}>
                  {Number(formatUnits(userEarned, 18)).toFixed(6)} RAD
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Your Share</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", color: "#22c55e" }}>
                  {totalStaked > BigInt(0) ? ((Number(userStaked) / Number(totalStaked)) * 100).toFixed(2) : "0.00"}%
                </div>
              </div>
            </div>
          )}

          <div style={{ maxWidth: "520px", margin: "0 auto" }}>
            <div className="dex-card">
              {userEarned > BigInt(0) && (
                <div style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(167,139,250,0.08))", borderRadius: 14, padding: "16px 20px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Pending Rewards</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", color: "#60a5fa" }}>
                      {Number(formatUnits(userEarned, 18)).toFixed(6)} RAD
                    </div>
                  </div>
                  <button className="dex-btn dex-btn-sm" style={{ padding: "8px 20px", fontSize: 13 }} disabled={isProcessing} onClick={handleClaim}>Claim</button>
                </div>
              )}

              <div className="dex-tabs" style={{ marginBottom: "20px" }}>
                <button className={`dex-tab ${action === "stake" ? "active" : ""}`} onClick={() => { setAction("stake"); setAmount(""); setPostApprove(false); reset(); }}>Stake</button>
                <button className={`dex-tab ${action === "unstake" ? "active" : ""}`} onClick={() => { setAction("unstake"); setAmount(""); setPostApprove(false); reset(); }}>Unstake</button>
              </div>

              {postApprove && !isProcessing && action === "stake" && (
                <div style={{ background: "rgba(34,197,94,0.08)", color: "#22c55e", borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 16 }}>
                  LP approved ✓ Click &quot;Stake LP&quot; to complete.
                </div>
              )}

              {txError && (
                <div style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 16 }}>
                  {txError}
                </div>
              )}

              <div style={{ marginBottom: "20px" }}>
                <div className="dex-flex-between" style={{ marginBottom: "8px", fontSize: "13px", color: "var(--muted)" }}>
                  <span>{action === "stake" ? "Amount to Stake" : "Amount to Unstake"}</span>
                  <span>Balance: {action === "stake" ? Number(formatUnits(lpBalance, 18)).toFixed(4) : Number(formatUnits(userStaked, 18)).toFixed(4)} LP</span>
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <div className="token-badge">
                    <div className="token-logo" style={{ background: "linear-gradient(135deg, #2563eb, #60a5fa)", fontSize: 10, fontWeight: 800 }}>LP</div>
                    <span style={{ fontWeight: 600 }}>radLP</span>
                  </div>
                  <input className="dex-input" type="text" placeholder="0.00" value={amount} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) { setAmount(v); setPostApprove(false); } }} style={{ flex: 1, textAlign: "right" }} />
                </div>
                <div style={{ textAlign: "right", marginTop: "6px" }}>
                  <button className="dex-btn dex-btn-sm dex-btn-outline" style={{ fontSize: "11px", padding: "4px 12px" }} onClick={() => { setAmount(formatUnits(action === "stake" ? lpBalance : userStaked, 18)); setPostApprove(false); }}>MAX</button>
                </div>
              </div>

              <button className="dex-btn dex-btn-full" disabled={action === "stake" ? !canStake : !canUnstake} onClick={action === "stake" ? handleStake : handleUnstake}>
                {!isConnected ? "Connect wallet to continue" : getButtonText()}
              </button>
            </div>

            <div className="dex-card" style={{ marginTop: "20px", padding: "20px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>How it works</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                <div style={{ display: "flex", gap: 10 }}><span className="dex-badge">1</span><span>Add liquidity to the USDC–EURC pool on the Pool page to receive radLP tokens</span></div>
                <div style={{ display: "flex", gap: 10 }}><span className="dex-badge">2</span><span>Stake your radLP tokens here to start earning RAD rewards</span></div>
                <div style={{ display: "flex", gap: 10 }}><span className="dex-badge">3</span><span>Claim RAD anytime. Unstake LP whenever you want — no lockup</span></div>
              </div>
            </div>

            {txHistory.length > 0 && (
              <div className="dex-card" style={{ marginTop: "20px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>Activity</h3>
                {txHistory.map((tx, i) => (
                  <div key={i} className="dex-list-item">
                    <div>
                      <span style={{ fontWeight: 500 }}>{tx.action}</span>
                      <span style={{ fontSize: "13px", color: "var(--muted)", marginLeft: "12px" }}>{tx.amount}</span>
                      <span style={{ fontSize: "12px", color: "var(--muted)", marginLeft: "8px" }}>{tx.time}</span>
                    </div>
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
