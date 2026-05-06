"use client";

import Link from "next/link";
import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import {
  POOL_ADDRESS,
  POOL_ABI,
  LP_TOKEN_ADDRESS,
  ERC20_ABI,
  USDC_INDEX,
  EURC_INDEX,
} from "@/config/contracts";
import Navbar from "@/components/Navbar";
import { TrustBar } from "@/components/TrustBar";

const NAV_ITEMS = [
  { href: "/swap", label: "Swap", desc: "Exchange USDC ↔ EURC", color: "#2563eb" },
  { href: "/bridge", label: "Bridge", desc: "Cross-chain USDC transfers", color: "#7c3aed" },
  { href: "/pool", label: "Pool", desc: "Provide liquidity", color: "#0891b2" },
  { href: "/yield", label: "Yield", desc: "Stake LP, earn RAD", color: "#059669" },
  { href: "/stats", label: "Stats", desc: "Protocol analytics", color: "#d97706" },
];

export default function HomePage() {
  const { data } = useReadContracts({
    contracts: [
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: "balances", args: [BigInt(USDC_INDEX)] },
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: "balances", args: [BigInt(EURC_INDEX)] },
      { address: POOL_ADDRESS, abi: POOL_ABI, functionName: "fee" },
      { address: LP_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: [POOL_ADDRESS] },
    ],
    query: { refetchInterval: 15000 },
  });

  const usdcReserve = data?.[0]?.result ?? BigInt(0);
  const eurcReserve = data?.[1]?.result ?? BigInt(0);
  const fee = data?.[2]?.result ?? BigInt(0);

  const tvl = Number(formatUnits(usdcReserve, 6)) + Number(formatUnits(eurcReserve, 6));
  const feePercent = Number(formatUnits(fee, 10));

  return (
    <>
      <Navbar />
      <div className="dex-page">
        <div className="dex-container">
          {/* Hero */}
          <section style={{ textAlign: "center", paddingTop: "80px", paddingBottom: "40px" }}>
            <h1
              className="hero-title-lg"
              style={{
                fontSize: "72px",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                background: "linear-gradient(135deg, #f1f5f9 0%, #60a5fa 50%, #8b5cf6 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              RADIUS DEX
            </h1>
            <p style={{ fontSize: "20px", color: "var(--muted)", marginTop: "20px", maxWidth: "500px", margin: "20px auto 0" }}>
              Stablecoin swaps on Arc Network.
              <br />
              Low slippage. Deep liquidity. Powered by Radius.
            </p>

            <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginTop: "40px" }}>
              <Link
                href="/swap"
                className="dex-btn"
                style={{
                  padding: "16px 42px",
                  fontSize: "16px",
                  borderRadius: "999px",
                  background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #60a5fa 100%)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid rgba(96, 165, 250, 0.3)",
                  color: "#fff",
                  fontWeight: 600,
                  boxShadow: "0 0 20px rgba(37, 99, 235, 0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              >
                Launch App →
              </Link>
            </div>
          </section>

          {/* Navigation Grid — always visible, especially on mobile */}
          <section className="dex-section">
            <div className="home-nav-grid">
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} className="home-nav-card">
                  <div className="home-nav-dot" style={{ background: item.color }} />
                  <div>
                    <div className="home-nav-label">{item.label}</div>
                    <div className="home-nav-desc">{item.desc}</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto", opacity: 0.4 }}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              ))}
            </div>
          </section>

          {/* Stats Row */}
          <section className="dex-section">
            <div
              className="dex-card home-stats-grid"
              style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", textAlign: "center" }}
            >
              <div className="dex-stat">
                <div className="dex-stat-value">
                  ${tvl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
                <div className="dex-stat-label">Total Value Locked</div>
              </div>
              <div className="dex-stat">
                <div className="dex-stat-value">—</div>
                <div className="dex-stat-label">Total Volume</div>
              </div>
              <div className="dex-stat">
                <div className="dex-stat-value">{feePercent > 0 ? `${feePercent.toFixed(4)}%` : "—"}</div>
                <div className="dex-stat-label">Pool Fee</div>
              </div>
            </div>
          </section>

          {/* Feature Cards */}
          <section className="dex-section">
            <div className="dex-grid dex-grid-2">
              <Link href="/swap" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="dex-card" style={{ cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "20px" }}>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #60a5fa, #2563eb)", flexShrink: 0, boxShadow: "0 0 20px rgba(59,130,246,0.35)" }} />
                    <div>
                      <h3 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "10px" }}>Swap</h3>
                      <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                        Exchange USDC and EURC with minimal slippage through our Radius Swap pool. Curve-style pricing ensures deep liquidity for stablecoin pairs.
                      </p>
                    </div>
                  </div>
                </div>
              </Link>

              <Link href="/yield" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="dex-card" style={{ cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "20px" }}>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #a78bfa, #7c3aed)", flexShrink: 0, boxShadow: "0 0 20px rgba(139,92,246,0.35)" }} />
                    <div>
                      <h3 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "10px" }}>Yield</h3>
                      <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                        Stake your Radius LP tokens and earn RAD rewards. The more you stake, the more you earn. No lockup — unstake anytime.
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </section>

          {/* Trust & Transparency */}
          <section style={{ marginBottom: "48px" }}>
            <TrustBar />
          </section>

          {/* Footer */}
          <footer className="dex-footer">
            <div className="dex-flex-between">
              <span className="dex-nav-logo">RADIUS DEX</span>
              <span style={{ fontSize: "13px", color: "var(--muted)" }}>
                Built on Arc Testnet • Powered by Radius
              </span>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
