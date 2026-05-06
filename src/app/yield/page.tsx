"use client";

import { useState, useEffect, useRef } from "react";
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
  const [stepLabel, setStepLabel] = useState("");
  const [txHistory, setTxHistory] = useState<
    { hash: string; action: string; amount: string; time: string }[]
  >([]);

  const { writeContractAsync, isPending, txHash, setTxHash, error: txError, reset, isConfirming, isSuccess } = useWriteContractCompat();
  const pendingStepRef = useRef<"approve" | "stake" | "unstake" | "claim" | null>(null);

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

  const isProcessing = isPending || isConfirming || !!stepLabel;

  // Calculate APR: rewardRate * seconds_per_year * 100 / totalStaked
  const secondsPerYear = BigInt(365 * 24 * 3600);
  const apr = totalStaked > BigInt(0)
    ? Number((rewardRate * secondsPerYear * BigInt(10000)) / totalStaked) / 100
    : 0;

  // Safe parse for button label
  const safeParse = (() => {
    try { return parseUnits(amount || "0", 18); } catch { return BigInt(0); }
  })();
  const needsApproval = action === "stake" && safeParse > BigInt(0) && lpAllowance < safeParse;

  // Auto-continue on success
  useEffect(() => {
    if (isSuccess && txHash) {
      const step = pendingStepRef.current;
      if (step === "approve") {
        pendingStepRef.current = "stake";
        setStepLabel("Staking…");
        setTxHash(undefined);
        reset();
        setTimeout(async () => {
          try {
            const parsed = parseUnits(amount, 18);
            await writeContractAsync({ address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "stake", args: [parsed] });
          } catch (err) {
            console.error("Auto-stake error:", err);
            setStepLabel("");
            pendingStepRef.current = null;
          }
        }, 2000);
      } else if (step === "stake" || step === "unstake" || step === "claim") {
        setTxHistory((prev) => [
          {
            hash: txHash,
            action: step === "stake" ? "Staked" : step === "unstake" ? "Unstaked" : "Claimed",
            amount: step === "claim" ? `${formatUnits(userEarned, 18)} RAD` : `${amount} LP`,
            time: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 9),
        ]);
        if (step !== "claim") setAmount("");
        setStepLabel("");
        pendingStepRef.current = null;
        setTxHash(undefined);
        reset();
        refetch();
      }
    }
  }, [isSuccess, txHash]);

  const handleStake = async () => {
    if (!address || !amount) return;
    const parsed = parseUnits(amount, 18);

    try {
      if (lpAllowance < parsed) {
        pendingStepRef.current = "approve";
        setStepLabel("Step 1/2: Approving LP…");
        await writeContractAsync({ address: LP_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "approve", args: [STAKING_ADDRESS, parsed] });
        return;
      }
      pendingStepRef.current = "stake";
      setStepLabel("Staking…");
      await writeContractAsync({ address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "stake", args: [parsed] });
    } catch (err) {
      console.error("Stake error:", err);
      setStepLabel("");
      pendingStepRef.current = null;
    }
  };

  const handleUnstake = async () => {
    if (!address || !amount) return;
    const parsed = parseUnits(amount, 18);
    try {
      pendingStepRef.current = "unstake";
      setStepLabel("Unstaking…");
      await writeContractAsync({ address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "withdraw", args: [parsed] });
    } catch (err) {
      console.error("Unstake error:", err);
      setStepLabel("");
      pendingStepRef.current = null;
    }
  };

  const handleClaim = async () => {
    if (!address || userEarned === BigInt(0)) return;
    try {
      pendingStepRef.current = "claim";
      setStepLabel("Claiming RAD…");
      await writeContractAsync({ address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "claim", args: [] });
    } catch (err) {
      console.error("Claim error:", err);
      setStepLabel("");
      pendingStepRef.current = null;
    }
  };

  const getButtonText = () => {
    if (stepLabel) return <><span className="spinner" /> {stepLabel}</>;
    if (isProcessing) return <><span className="spinner" /> Processing…</>;
    if (action === "stake") {
      if (needsApproval) return "Stake LP (auto-approve)";
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
                {apr > 0 ? `${apr.toFixed(2)}%` : "—"}
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
                <button className={`dex-tab ${action === "stake" ? "active" : ""}`} onClick={() => { setAction("stake"); setAmount(""); }}>Stake</button>
                <button className={`dex-tab ${action === "unstake" ? "active" : ""}`} onClick={() => { setAction("unstake"); setAmount(""); }}>Unstake</button>
              </div>

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
                    <div className="token-logo" style={{ background: "#8b5cf6" }}>LP</div>
                    <span style={{ fontWeight: 600 }}>radLP</span>
                  </div>
                  <input
                    className="dex-input"
                    type="text"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
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
                    <a href={`https://testnet.arcscan.app/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer" className="tx-hash">{tx.hash.slice(0, 10)}…</a>
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
