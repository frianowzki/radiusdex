"use client";

import { useState, useEffect, useRef } from "react";
import {
  useAccount,
  useReadContracts,
} from "wagmi";
import { formatUnits, parseUnits } from "viem";
import {
  USDC_VAULT_ADDRESS,
  EURC_VAULT_ADDRESS,
  USDC_ADDRESS,
  EURC_ADDRESS,
  ERC20_ABI,
  VAULT_ABI,
} from "@/config/contracts";
import { USDC, EURC, type Token } from "@/config/tokens";
import Navbar from "@/components/Navbar";
import { useRadiusAuth } from "@/lib/auth";
import { useWriteContractCompat } from "@/lib/useWriteContractCompat";

type VaultTab = "deposit" | "withdraw";

interface VaultInfo {
  name: string;
  symbol: string;
  token: Token;
  vaultAddress: `0x${string}`;
  color: string;
}

const VAULTS: VaultInfo[] = [
  { name: "Radius USDC", symbol: "radUSDC", token: USDC, vaultAddress: USDC_VAULT_ADDRESS, color: "#2775ca" },
  { name: "Radius EURC", symbol: "radEURC", token: EURC, vaultAddress: EURC_VAULT_ADDRESS, color: "#0052ff" },
];

export default function YieldPage() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { authenticated, address: authAddress } = useRadiusAuth();
  const address = wagmiAddress ?? authAddress;
  const isConnected = wagmiConnected || authenticated;
  const [activeVault, setActiveVault] = useState(0);
  const [vaultTab, setVaultTab] = useState<VaultTab>("deposit");
  const [amount, setAmount] = useState("");

  const [txHistory, setTxHistory] = useState<
    { hash: string; action: string; vault: string; amount: string; time: string }[]
  >([]);
  const [stepLabel, setStepLabel] = useState("");

  const vault = VAULTS[activeVault];

  const { writeContractAsync, isPending, txHash, setTxHash, error: txError, reset, isConfirming, isSuccess } = useWriteContractCompat();

  // Read vault data + balances
  const { data: vaultData } = useReadContracts({
    contracts: [
      { address: vault.vaultAddress, abi: VAULT_ABI, functionName: "totalAssets" },
      { address: vault.vaultAddress, abi: VAULT_ABI, functionName: "totalSupply" },
      { address: vault.vaultAddress, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined },
      { address: vault.token.address, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined },
      { address: vault.token.address, abi: ERC20_ABI, functionName: "allowance", args: address ? [address, vault.vaultAddress] : undefined },
      { address: vault.vaultAddress, abi: VAULT_ABI, functionName: "convertToAssets", args: [BigInt(10 ** 18)] },
    ],
    query: { enabled: isConnected && !!address, refetchInterval: 10000 },
  });

  const totalAssets = (vaultData?.[0]?.result as bigint) ?? BigInt(0);
  const userShares = (vaultData?.[2]?.result as bigint) ?? BigInt(0);
  const tokenBalance = (vaultData?.[3]?.result as bigint) ?? BigInt(0);
  const allowance = (vaultData?.[4]?.result as bigint) ?? BigInt(0);
  const sharePrice = (vaultData?.[5]?.result as bigint) ?? BigInt(0);

  const tvl = Number(formatUnits(totalAssets, vault.token.decimals));
  const sharePriceNum = Number(formatUnits(sharePrice, vault.token.decimals));
  const userSharesValue = Number(formatUnits(userShares, 18)) * sharePriceNum;

  // Auto-continue: after approval succeeds, trigger deposit
  const pendingStepRef = useRef<"approve" | "deposit" | "withdraw" | null>(null);

  useEffect(() => {
    if (isSuccess && txHash) {
      const step = pendingStepRef.current;
      if (step === "approve") {
        // Approval done, now deposit
        pendingStepRef.current = "deposit";
        setStepLabel("Depositing…");
        setTxHash(undefined);
        reset();
        setTimeout(async () => {
          try {
            const parsed = parseUnits(amount, vault.token.decimals);
            await writeContractAsync({ address: vault.vaultAddress, abi: VAULT_ABI, functionName: "deposit", args: [parsed, address!] });
          } catch (err) { console.error("Auto-deposit error:", err); setStepLabel(""); pendingStepRef.current = null; }
        }, 2000);
      } else if (step === "deposit" || step === "withdraw") {
        setTxHistory((prev) => [
          { hash: txHash, action: step === "deposit" ? "Deposit" : "Withdraw", vault: vault.symbol, amount, time: new Date().toLocaleTimeString() },
          ...prev.slice(0, 9),
        ]);
        setAmount("");
        setStepLabel("");
        pendingStepRef.current = null;
        setTxHash(undefined);
        reset();
      }
    }
  }, [isSuccess, txHash]);

  const isProcessing = isPending || isConfirming;

  // Safe parse for button label
  const safeParseAmount = (() => {
    try { return parseUnits(amount || "0", vault.token.decimals); } catch { return BigInt(0); }
  })();
  const needsApproval = vaultTab === "deposit" && safeParseAmount > BigInt(0) && allowance < safeParseAmount;

  const handleAction = async () => {
    if (!address || !amount) return;
    const parsed = parseUnits(amount, vault.token.decimals);

    try {
      if (vaultTab === "deposit") {
        if (allowance < parsed) {
          pendingStepRef.current = "approve";
          setStepLabel("Step 1/2: Approving…");
          await writeContractAsync({ address: vault.token.address, abi: ERC20_ABI, functionName: "approve", args: [vault.vaultAddress, parsed] });
          return;
        }
        pendingStepRef.current = "deposit";
        setStepLabel("Depositing…");
        await writeContractAsync({ address: vault.vaultAddress, abi: VAULT_ABI, functionName: "deposit", args: [parsed, address] });
      } else {
        pendingStepRef.current = "withdraw";
        setStepLabel("Withdrawing…");
        await writeContractAsync({ address: vault.vaultAddress, abi: VAULT_ABI, functionName: "withdraw", args: [parsed, address, address] });
      }
    } catch (err) {
      console.error("Vault action error:", err);
      setStepLabel("");
      pendingStepRef.current = null;
    }
  };

  const getButtonText = () => {
    if (stepLabel) return <><span className="spinner" /> {stepLabel}</>;
    if (isProcessing) return <><span className="spinner" /> Processing…</>;
    if (needsApproval) return `Deposit ${vault.token.symbol} (auto-approve)`;
    if (vaultTab === "deposit") return `Deposit ${vault.token.symbol}`;
    return `Withdraw ${vault.symbol}`;
  };

  return (
    <>
      <Navbar />
      <div className="dex-page">
        <div className="dex-container">
          <h1 style={{ fontSize: "32px", fontWeight: 700, marginBottom: "32px" }}>Yield Vaults</h1>

          {/* Vault Cards */}
          <div className="dex-grid dex-grid-2 dex-section">
            {VAULTS.map((v, i) => (
              <div
                key={v.symbol}
                className="dex-card"
                style={{ cursor: "pointer", borderColor: i === activeVault ? "rgba(59, 130, 246, 0.4)" : undefined }}
                onClick={() => { setActiveVault(i); setAmount(""); }}
              >
                <div className="dex-flex-between" style={{ marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div className="token-logo" style={{ background: v.color, width: "36px", height: "36px", fontSize: "14px" }}>{v.symbol.charAt(4)}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "18px" }}>{v.symbol}</div>
                      <div style={{ fontSize: "13px", color: "var(--muted)" }}>{v.token.symbol} Vault</div>
                    </div>
                  </div>
                  {i === activeVault && <span className="dex-badge">Selected</span>}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                  <div style={{ textAlign: "center" }}>
                    <div className="dex-stat-label">TVL</div>
                    <div style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", marginTop: "4px" }}>
                      ${tvl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div className="dex-stat-label">Share Price</div>
                    <div style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", marginTop: "4px" }}>
                      {sharePriceNum.toFixed(6)}
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div className="dex-stat-label">Your Shares</div>
                    <div style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-geist-mono, monospace)", marginTop: "4px" }}>
                      {Number(formatUnits(userShares, 18)).toFixed(4)}
                    </div>
                  </div>
                </div>

                {isConnected && userShares > BigInt(0) && (
                  <div style={{ marginTop: "16px", padding: "12px", background: "rgba(59, 130, 246, 0.08)", borderRadius: "10px", textAlign: "center", fontSize: "13px" }}>
                    Your position: ~${userSharesValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Deposit / Withdraw Form */}
          <div style={{ maxWidth: "500px", margin: "0 auto" }}>
            <div className="dex-card">
              <div className="dex-tabs" style={{ marginBottom: "24px" }}>
                <button className={`dex-tab ${vaultTab === "deposit" ? "active" : ""}`} onClick={() => { setVaultTab("deposit"); setAmount(""); }}>Deposit</button>
                <button className={`dex-tab ${vaultTab === "withdraw" ? "active" : ""}`} onClick={() => { setVaultTab("withdraw"); setAmount(""); }}>Withdraw</button>
              </div>

              {/* Error feedback */}
              {txError && (
                <div style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 16 }}>
                  {txError}
                </div>
              )}

              <div style={{ marginBottom: "20px" }}>
                <div className="dex-flex-between" style={{ marginBottom: "8px", fontSize: "13px", color: "var(--muted)" }}>
                  <span>{vaultTab === "deposit" ? `Deposit ${vault.token.symbol}` : `Withdraw ${vault.symbol}`}</span>
                  <span>Balance: {vaultTab === "deposit" ? Number(formatUnits(tokenBalance, vault.token.decimals)).toFixed(4) : userSharesValue.toFixed(4)}</span>
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <div className="token-badge">
                    <div className="token-logo" style={{ background: vaultTab === "deposit" ? vault.token.color : vault.color }}>
                      {vaultTab === "deposit" ? vault.token.symbol.charAt(0) : vault.symbol.charAt(4)}
                    </div>
                    <span style={{ fontWeight: 600 }}>{vaultTab === "deposit" ? vault.token.symbol : vault.symbol}</span>
                  </div>
                  <input className="dex-input" type="text" placeholder="0.00" value={amount} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v); }} style={{ flex: 1, textAlign: "right" }} />
                </div>
                <div style={{ textAlign: "right", marginTop: "6px" }}>
                  <button className="dex-btn dex-btn-sm dex-btn-outline" style={{ fontSize: "11px", padding: "4px 12px" }} onClick={() => {
                    if (vaultTab === "deposit") {
                      setAmount(formatUnits(tokenBalance, vault.token.decimals));
                    } else {
                      setAmount(userSharesValue > 0 ? userSharesValue.toFixed(vault.token.decimals) : "0");
                    }
                  }}>MAX</button>
                </div>
              </div>

              <button
                className="dex-btn dex-btn-full"
                disabled={!isConnected || !amount || isProcessing}
                onClick={handleAction}
              >
                {!isConnected ? "Connect wallet to continue" : getButtonText()}
              </button>
            </div>

            {/* Vault History */}
            {txHistory.length > 0 && (
              <div className="dex-card" style={{ marginTop: "24px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>Vault Activity</h3>
                {txHistory.map((tx, i) => (
                  <div key={i} className="dex-list-item">
                    <div>
                      <span style={{ fontWeight: 500 }}>{tx.action}</span>
                      <span style={{ fontSize: "13px", color: "var(--muted)", marginLeft: "12px" }}>{tx.amount} {tx.vault}</span>
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
