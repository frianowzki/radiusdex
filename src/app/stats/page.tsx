"use client";

import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import {
  POOL_ADDRESS,
  POOL_ABI,
  LP_TOKEN_ADDRESS,
  ERC20_ABI,
  USDC_VAULT_ADDRESS,
  EURC_VAULT_ADDRESS,
  VAULT_ABI,
} from "@/config/contracts";
import { USDC, EURC } from "@/config/tokens";
import Navbar from "@/components/Navbar";

export default function StatsPage() {
  const { data } = useReadContracts({
    contracts: [
      // 0: USDC reserve
      {
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: "balances",
        args: [BigInt(0)],
      },
      // 1: EURC reserve
      {
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: "balances",
        args: [BigInt(1)],
      },
      // 2: Pool fee
      {
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: "fee",
      },
      // 3: LP supply
      {
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: "totalSupply",
      },
      // 4: USDC vault totalAssets
      {
        address: USDC_VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "totalAssets",
      },
      // 5: EURC vault totalAssets
      {
        address: EURC_VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "totalAssets",
      },
      // 6: USDC vault share price
      {
        address: USDC_VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "convertToAssets",
        args: [BigInt(10 ** 18)],
      },
      // 7: EURC vault share price
      {
        address: EURC_VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "convertToAssets",
        args: [BigInt(10 ** 18)],
      },
    ],
    query: { refetchInterval: 15000 },
  });

  const usdcReserve = (data?.[0]?.result as bigint) ?? BigInt(0);
  const eurcReserve = (data?.[1]?.result as bigint) ?? BigInt(0);
  const fee = (data?.[2]?.result as bigint) ?? BigInt(0);
  const lpSupply = (data?.[3]?.result as bigint) ?? BigInt(0);
  const usdcVaultAssets = (data?.[4]?.result as bigint) ?? BigInt(0);
  const eurcVaultAssets = (data?.[5]?.result as bigint) ?? BigInt(0);
  const usdcSharePrice = (data?.[6]?.result as bigint) ?? BigInt(0);
  const eurcSharePrice = (data?.[7]?.result as bigint) ?? BigInt(0);

  const usdcReserveNum = Number(formatUnits(usdcReserve, 6));
  const eurcReserveNum = Number(formatUnits(eurcReserve, 6));
  const tvl = usdcReserveNum + eurcReserveNum;
  const feePercent = Number(formatUnits(fee, 10));
  const lpSupplyNum = Number(formatUnits(lpSupply, 18));
  const usdcVaultNum = Number(formatUnits(usdcVaultAssets, 6));
  const eurcVaultNum = Number(formatUnits(eurcVaultAssets, 6));
  const usdcSharePriceNum = Number(formatUnits(usdcSharePrice, 6));
  const eurcSharePriceNum = Number(formatUnits(eurcSharePrice, 6));

  const usdcPercent = tvl > 0 ? (usdcReserveNum / tvl) * 100 : 0;
  const eurcPercent = tvl > 0 ? (eurcReserveNum / tvl) * 100 : 0;

  return (
    <>
      <Navbar />
      <div className="dex-page">
        <div className="dex-container">
          <h1
            style={{
              fontSize: "32px",
              fontWeight: 700,
              marginBottom: "32px",
            }}
          >
            Protocol Statistics
          </h1>

          {/* Protocol Analytics */}
          <section className="dex-section">
            <div className="dex-section-title">Protocol Analytics</div>
            <div className="dex-grid dex-grid-4">
              <div className="dex-card" style={{ textAlign: "center" }}>
                <div className="dex-stat-value">
                  $
                  {tvl.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="dex-stat-label">Total Value Locked</div>
              </div>
              <div className="dex-card" style={{ textAlign: "center" }}>
                <div className="dex-stat-value">—</div>
                <div className="dex-stat-label">Total Volume</div>
              </div>
              <div className="dex-card" style={{ textAlign: "center" }}>
                <div className="dex-stat-value">
                  {feePercent > 0 ? `${feePercent.toFixed(4)}%` : "—"}
                </div>
                <div className="dex-stat-label">Estimated Fees</div>
              </div>
              <div className="dex-card" style={{ textAlign: "center" }}>
                <div className="dex-stat-value">StableSwap</div>
                <div className="dex-stat-label">Pool Type</div>
              </div>
            </div>
          </section>

          {/* Reserve Distribution */}
          <section className="dex-section">
            <div className="dex-section-title">Reserve Distribution</div>
            <div className="dex-card">
              {/* Visual bar */}
              <div
                style={{
                  height: "12px",
                  borderRadius: "6px",
                  overflow: "hidden",
                  display: "flex",
                  marginBottom: "20px",
                  background: "rgba(15, 23, 42, 0.5)",
                }}
              >
                <div
                  style={{
                    width: `${usdcPercent}%`,
                    background: USDC.color,
                    transition: "width 0.5s",
                  }}
                />
                <div
                  style={{
                    width: `${eurcPercent}%`,
                    background: EURC.color,
                    transition: "width 0.5s",
                  }}
                />
              </div>

              <div className="dex-grid dex-grid-2">
                <div className="dex-card-sm">
                  <div
                    className="dex-flex-between"
                    style={{ marginBottom: "12px" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <div
                        className="token-logo"
                        style={{ background: USDC.color }}
                      >
                        U
                      </div>
                      <span style={{ fontWeight: 600 }}>USDC</span>
                    </div>
                    <span style={{ fontSize: "13px", color: "var(--muted)" }}>
                      {usdcPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "24px",
                      fontWeight: 700,
                      fontFamily: "var(--font-geist-mono, monospace)",
                    }}
                  >
                    $
                    {usdcReserveNum.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
                <div className="dex-card-sm">
                  <div
                    className="dex-flex-between"
                    style={{ marginBottom: "12px" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <div
                        className="token-logo"
                        style={{ background: EURC.color }}
                      >
                        E
                      </div>
                      <span style={{ fontWeight: 600 }}>EURC</span>
                    </div>
                    <span style={{ fontSize: "13px", color: "var(--muted)" }}>
                      {eurcPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "24px",
                      fontWeight: 700,
                      fontFamily: "var(--font-geist-mono, monospace)",
                    }}
                  >
                    €
                    {eurcReserveNum.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Protocol Transparency */}
          <section className="dex-section">
            <div className="dex-section-title">Protocol Transparency</div>
            <div className="dex-card">
              <div className="dex-list-item">
                <span style={{ color: "var(--muted)" }}>LP Token Supply</span>
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono, monospace)",
                    fontWeight: 600,
                  }}
                >
                  {lpSupplyNum.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}
                </span>
              </div>
              <div className="dex-list-item">
                <span style={{ color: "var(--muted)" }}>Pool Fee</span>
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono, monospace)",
                    fontWeight: 600,
                  }}
                >
                  {feePercent.toFixed(4)}%
                </span>
              </div>
              <div className="dex-list-item">
                <span style={{ color: "var(--muted)" }}>Swap Contract</span>
                <a
                  href={`https://testnet.arcscan.app/address/${POOL_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tx-hash"
                >
                  {POOL_ADDRESS.slice(0, 10)}...{POOL_ADDRESS.slice(-8)}
                </a>
              </div>
              <div className="dex-list-item">
                <span style={{ color: "var(--muted)" }}>LP Token Contract</span>
                <a
                  href={`https://testnet.arcscan.app/address/${LP_TOKEN_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tx-hash"
                >
                  {LP_TOKEN_ADDRESS.slice(0, 10)}...{LP_TOKEN_ADDRESS.slice(-8)}
                </a>
              </div>
              <div className="dex-list-item">
                <span style={{ color: "var(--muted)" }}>Network</span>
                <span className="dex-badge">
                  <span className="status-dot" />
                  Arc Testnet
                </span>
              </div>
            </div>
          </section>

          {/* Yield Index */}
          <section className="dex-section">
            <div className="dex-section-title">Standard Yield Index</div>
            <div className="dex-grid dex-grid-2">
              <div className="dex-card">
                <div
                  className="dex-flex-between"
                  style={{ marginBottom: "16px" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <div
                      className="token-logo"
                      style={{ background: USDC.color }}
                    >
                      U
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>Radius USDC</div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--muted)",
                        }}
                      >
                        USDC Vault
                      </div>
                    </div>
                  </div>
                </div>
                <div className="dex-list-item">
                  <span style={{ color: "var(--muted)", fontSize: "13px" }}>
                    TVL
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-geist-mono, monospace)",
                      fontWeight: 600,
                    }}
                  >
                    $
                    {usdcVaultNum.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="dex-list-item">
                  <span style={{ color: "var(--muted)", fontSize: "13px" }}>
                    Share Price
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-geist-mono, monospace)",
                      fontWeight: 600,
                    }}
                  >
                    {usdcSharePriceNum.toFixed(6)}
                  </span>
                </div>
              </div>

              <div className="dex-card">
                <div
                  className="dex-flex-between"
                  style={{ marginBottom: "16px" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <div
                      className="token-logo"
                      style={{ background: EURC.color }}
                    >
                      E
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>Radius EURC</div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--muted)",
                        }}
                      >
                        EURC Vault
                      </div>
                    </div>
                  </div>
                </div>
                <div className="dex-list-item">
                  <span style={{ color: "var(--muted)", fontSize: "13px" }}>
                    TVL
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-geist-mono, monospace)",
                      fontWeight: 600,
                    }}
                  >
                    $
                    {eurcVaultNum.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="dex-list-item">
                  <span style={{ color: "var(--muted)", fontSize: "13px" }}>
                    Share Price
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-geist-mono, monospace)",
                      fontWeight: 600,
                    }}
                  >
                    {eurcSharePriceNum.toFixed(6)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="dex-footer">
            <div className="dex-flex-between">
              <span className="dex-nav-logo">RADIUS DEX</span>
              <span style={{ fontSize: "13px", color: "var(--muted)" }}>
                Data refreshed every 15 seconds • Arc Testnet
              </span>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
