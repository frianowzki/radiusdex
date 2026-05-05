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

export default function HomePage() {
  const { data } = useReadContracts({
    contracts: [
      {
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: "balances",
        args: [BigInt(USDC_INDEX)],
      },
      {
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: "balances",
        args: [BigInt(EURC_INDEX)],
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
        args: [POOL_ADDRESS],
      },
    ],
    query: { refetchInterval: 15000 },
  });

  const usdcReserve = data?.[0]?.result ?? BigInt(0);
  const eurcReserve = data?.[1]?.result ?? BigInt(0);
  const fee = data?.[2]?.result ?? BigInt(0);

  const tvl =
    Number(formatUnits(usdcReserve, 6)) + Number(formatUnits(eurcReserve, 6));
  const feePercent = Number(formatUnits(fee, 10));

  return (
    <>
      <Navbar />
      <div className="dex-page">
        <div className="dex-container">
          {/* Hero */}
          <section
            style={{ textAlign: "center", paddingTop: "80px", paddingBottom: "60px" }}
          >
            <h1
              style={{
                fontSize: "72px",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                background:
                  "linear-gradient(135deg, #f1f5f9 0%, #60a5fa 50%, #8b5cf6 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              RADIUS DEX
            </h1>
            <p
              style={{
                fontSize: "20px",
                color: "var(--muted)",
                marginTop: "20px",
                maxWidth: "500px",
                margin: "20px auto 0",
              }}
            >
              Stablecoin swaps on Arc Network.
              <br />
              Low slippage. Deep liquidity. Powered by Radius.
            </p>

            <div
              style={{
                display: "flex",
                gap: "16px",
                justifyContent: "center",
                marginTop: "40px",
              }}
            >
              <Link href="/swap" className="dex-btn" style={{ padding: "16px 36px", fontSize: "16px" }}>
                Launch App →
              </Link>
              <a
                href="https://testnet.arcscan.app"
                target="_blank"
                rel="noopener noreferrer"
                className="dex-btn dex-btn-outline"
                style={{ padding: "16px 36px", fontSize: "16px" }}
              >
                Learn More →
              </a>
            </div>
          </section>

          {/* Stats Row */}
          <section className="dex-section">
            <div
              className="dex-card"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "24px",
                textAlign: "center",
              }}
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
                <div className="dex-stat-value">
                  {feePercent > 0 ? `${feePercent.toFixed(4)}%` : "—"}
                </div>
                <div className="dex-stat-label">Pool Fee</div>
              </div>
              <div className="dex-stat">
                <div className="dex-stat-value">StableSwap</div>
                <div className="dex-stat-label">Pool Type</div>
              </div>
            </div>
          </section>

          {/* Feature Cards */}
          <section className="dex-section">
            <div className="dex-grid dex-grid-2">
              <Link href="/swap" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="dex-card" style={{ cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "20px" }}>
                    <span
                      style={{
                        fontSize: "48px",
                        fontWeight: 800,
                        background:
                          "linear-gradient(135deg, var(--brand), var(--purple))",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                        lineHeight: 1,
                      }}
                    >
                      01
                    </span>
                    <div>
                      <h3
                        style={{
                          fontSize: "24px",
                          fontWeight: 700,
                          marginBottom: "10px",
                        }}
                      >
                        Swap
                      </h3>
                      <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                        Exchange USDC and EURC with minimal slippage through our
                        StableSwap pool. Curve-style pricing ensures deep
                        liquidity for stablecoin pairs.
                      </p>
                    </div>
                  </div>
                </div>
              </Link>

              <Link href="/yield" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="dex-card" style={{ cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "20px" }}>
                    <span
                      style={{
                        fontSize: "48px",
                        fontWeight: 800,
                        background:
                          "linear-gradient(135deg, var(--purple), var(--aurora-3))",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                        lineHeight: 1,
                      }}
                    >
                      02
                    </span>
                    <div>
                      <h3
                        style={{
                          fontSize: "24px",
                          fontWeight: 700,
                          marginBottom: "10px",
                        }}
                      >
                        Yield
                      </h3>
                      <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                        Deposit into Radius USDC or Radius EURC vaults to earn yield on
                        your stablecoins. Automated strategies optimize returns
                        while preserving capital.
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
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
