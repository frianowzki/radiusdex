"use client";

import { useState, useCallback } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { formatUnits, parseUnits } from "viem";
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

export default function YieldPage() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { authenticated, address: authAddress } = useRadiusAuth();
  const address = wagmiAddress ?? authAddress;
  const isConnected = wagmiConnected || authenticated;

  const [amount, setAmount] = useState("");
  const [action, setAction] = useState<"stake" | "unstake">("stake");
  const [txHistory, setTxHistory] = useState<
    { hash: string; action: string; amount: string; time: string }[]
  >([]);

  const { writeContractAsync, isPending, error: txError, reset, isConfirming } = useWriteContractCompat();

  // Read staking + token data
  const { data: stakingData, refetch } = useReadContracts({
    contracts: [
      // 0: user staked LP
      { address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "staked", args: address ? [address] : undefined },
      // 1: user earned RAD
      { address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "earned", args: address ? [address] : undefined },
      // 2: total staked
      { address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "totalStaked" },
      // 3: reward rate
      { address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "rewardRatePerSecond" },
      // 4: user LP balance
      { address: LP_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined },
      // 5: LP allowance for staking
      { address: LP_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "allowance", args: address ? [address, STAKING_ADDRESS] : undefined },
      // 6: user RAD balance
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

  // Track whether approval was just completed (skip re-check on next click)
  const [postApprove, setPostApprove] = useState(false);

  // Calculate APR
  const secondsPerYear = BigInt(365 * 24 * 3600);
  const apr = totalStaked > BigInt(0)
    ? Number((rewardRate * secondsPerYear * BigInt(10000)) / totalStaked) / 100
    : 0;

  // Safe parse
  const safeParse = (() => {
    try { return parseUnits(amount || "0", 18); } catch { return BigInt(0); }
  })();
  const needsApproval = action === "stake" && !postApprove && safeParse > BigInt(0) && lpAllowance < safeParse;

  const handleStake = useCallback(async () => {
    if (!address || !amount) return;
    const parsed = parseUnits(amount, 18);

    try {
      if (!postApprove && lpAllowance < parsed) {
        // Step 1: Approve LP
        await writeContractAsync({ address: LP_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "approve", args: [STAKING_ADDRESS, parsed] });
        setPostApprove(true);
        reset();
        refetch();
        return;
      }
      // Step 2: Stake
      await writeContractAsync({ address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "stake", args: [parsed] });
      setTxHistory((prev) => [
        { hash: "", action: "Staked", amount: `${amount} LP`, time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 9),
      ]);
      setAmount("");
      setPostApprove(false);
      reset();
      refetch();
    } catch {
      // Error already set by useWriteContractCompat
    }
  }, [address, amount, lpAllowance, postApprove, writeContractAsync, reset, refetch]);

  const handleUnstake = useCallback(async () => {
    if (!address || !amount) return;
    const parsed = parseUnits(amount, 18);
    try {
      await writeContractAsync({ address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "withdraw", args: [parsed] });
      setTxHistory((prev) => [
        { hash: "", action: "Unstaked", amount: `${amount} LP`, time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 9),
      ]);
      setAmount("");
      reset();
      refetch();
    } catch {
      // Error already set by useWriteContractCompat
    }
  }, [address, amount, writeContractAsync, reset, refetch]);

  const handleClaim = useCallback(async () => {
    if (!address || userEarned === BigInt(0)) return;
    try {
      await writeContractAsync({ address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "claim", args: [] });
      setTxHistory((prev) => [
        { hash: "", action: "Claimed", amount: `${formatUnits(userEarned, 18)} RAD`, time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 9),
      ]);
      reset();
      refetch();
    } catch {
      // Error already set by useWriteContractCompat
    }
  }, [address, userEarned, writeContractAsync, reset, refetch]);

  const getButtonText = () => {
    if (isProcessing) return <><span className="spinner" /> Processing…</>;
    if (action === "stake") {
      if (needsApproval) return "Approve LP";
      return "Stake LP";
    }
    return "Unstake LP";
  };

  return (
    <>
      <Navbar />
      <div className="dex-page">
        <div className="dex-container">
          {/* Hero */}
          <section style={{ textAlign: "center", paddingTop: "40px", paddingBottom: "32px" }}>
            <h1
              style={{
                fontSize: "48px",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                background: "linear-gradient(135deg, #f1f5f9 0%, #60a5fa 40%, #a78bfa 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Provide Liquidity. Earn RAD.
            </h1>
            <p
              style={{
                fontSize: "18px",
                color: "var(--muted)",
                marginTop: "16px",
                maxWidth: "520px",
                margin: "16px auto 0",
                lineHeight: 1.6,
              }}
            >
              Stake your Radius LP tokens and earn RAD rewards.
              <br />
              The more you stake, the more you earn.
            </p>
          </section>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
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

          {/* Main Card */}
          <div style={{ maxWidth: "520px", margin: "0 auto" }}>
            <div className="dex-card">
              {/* Pending Rewards */}
              {userEarned > BigInt(0) && (
                <div
                  style={{
                    background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(167,139,250,0.08))",
                    borderRadius: 14,
                    padding: "16px 20px",
                    marginBottom: "20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Pending Rewards</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", color: "#60a5fa" }}>
                      {Number(formatUnits(userEarned, 18)).toFixed(6)} RAD
                    </div>
                  </div>
                  <button
                    className="dex-btn dex-btn-sm"
                    style={{ padding: "8px 20px", fontSize: 13 }}
                    disabled={isProcessing || userEarned === BigInt(0)}
                    onClick={handleClaim}
                  >
                    Claim
                  </button>
                </div>
              )}

              {/* Tabs */}
              <div className="dex-tabs" style={{ marginBottom: "20px" }}>
                <button className={`dex-tab ${action === "stake" ? "active" : ""}`} onClick={() => { setAction("stake"); setAmount(""); setPostApprove(false); reset(); }}>Stake</button>
                <button className={`dex-tab ${action === "unstake" ? "active" : ""}`} onClick={() => { setAction("unstake"); setAmount(""); setPostApprove(false); reset(); }}>Unstake</button>
              </div>

              {/* Post-approve hint */}
              {postApprove && !isProcessing && action === "stake" && (
                <div style={{ background: "rgba(34,197,94,0.08)", color: "#22c55e", borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 16 }}>
                  LP approved ✓ Click &quot;Stake LP&quot; to complete.
                </div>
              )}

              {/* Error feedback */}
              {txError && (
                <div style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 16 }}>
                  {txError}
                </div>
              )}

              {/* Amount Input */}
              <div style={{ marginBottom: "20px" }}>
                <div className="dex-flex-between" style={{ marginBottom: "8px", fontSize: "13px", color: "var(--muted)" }}>
                  <span>{action === "stake" ? "Amount to Stake" : "Amount to Unstake"}</span>
                  <span>
                    Balance: {action === "stake"
                      ? Number(formatUnits(lpBalance, 18)).toFixed(4)
                      : Number(formatUnits(userStaked, 18)).toFixed(4)} LP
                  </span>
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <div className="token-badge">
                    <div className="token-logo" style={{ background: "linear-gradient(135deg, #2563eb, #60a5fa)", fontSize: 10, fontWeight: 800 }}>LP</div>
                    <span style={{ fontWeight: 600 }}>radLP</span>
                  </div>
                  <input
                    className="dex-input"
                    type="text"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d*$/.test(v)) {
                        setAmount(v);
                        setPostApprove(false); // reset if amount changes
                      }
                    }}
                    style={{ flex: 1, textAlign: "right" }}
                  />
                </div>
                <div style={{ textAlign: "right", marginTop: "6px" }}>
                  <button
                    className="dex-btn dex-btn-sm dex-btn-outline"
                    style={{ fontSize: "11px", padding: "4px 12px" }}
                    onClick={() => {
                      const bal = action === "stake" ? lpBalance : userStaked;
                      setAmount(formatUnits(bal, 18));
                      setPostApprove(false);
                    }}
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Action Button */}
              <button
                className="dex-btn dex-btn-full"
                disabled={!isConnected || !amount || isProcessing}
                onClick={action === "stake" ? handleStake : handleUnstake}
              >
                {!isConnected ? "Connect wallet to continue" : getButtonText()}
              </button>
            </div>

            {/* Info */}
            <div className="dex-card" style={{ marginTop: "20px", padding: "20px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>How it works</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                <div style={{ display: "flex", gap: 10 }}><span className="dex-badge">1</span><span>Add liquidity to the USDC–EURC pool on the Pool page to receive radLP tokens</span></div>
                <div style={{ display: "flex", gap: 10 }}><span className="dex-badge">2</span><span>Stake your radLP tokens here to start earning RAD rewards</span></div>
                <div style={{ display: "flex", gap: 10 }}><span className="dex-badge">3</span><span>Claim RAD anytime. Unstake LP whenever you want — no lockup</span></div>
              </div>
            </div>

            {/* History */}
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
