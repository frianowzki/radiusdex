"use client";

import { useState } from "react";

const POOL_ADDRESS = "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8";
const EXPLORER_URL = "https://testnet.arcscan.app";

export function TrustBar() {
  const [copied, setCopied] = useState(false);

  function copyContract() {
    navigator.clipboard.writeText(POOL_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="dex-card" style={{ padding: "16px 24px" }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Testnet badge */}
        <div className="flex items-center gap-3">
          <span className="dex-badge" style={{ background: "rgba(234,179,8,0.1)", color: "#ca8a04", borderColor: "rgba(234,179,8,0.2)", fontSize: 13, padding: "6px 14px" }}>
            ⚠ Testnet — No real funds
          </span>
          <span className="dex-badge" style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", borderColor: "rgba(239,68,68,0.15)" }}>
            Unaudited
          </span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-4 text-xs">
          {/* Contract */}
          <button
            onClick={copyContract}
            className="flex items-center gap-1.5 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            title="Copy pool contract address"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            {copied ? "Copied!" : "Contract"}
          </button>

          {/* Explorer */}
          <a
            href={`${EXPLORER_URL}/address/${POOL_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Explorer
          </a>

          {/* GitHub */}
          <a
            href="https://github.com/frianowzki/radiusdex"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            Source
          </a>

          {/* Docs */}
          <a
            href="https://lunex.finance/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            Docs
          </a>
        </div>
      </div>

      {/* Risk disclaimer */}
      <p className="mt-3 text-[11px] text-[var(--muted)] leading-relaxed" style={{ borderTop: "1px solid var(--card-border)", paddingTop: 12 }}>
        <strong>Disclaimer:</strong> Radius DEX is experimental software running on Arc Testnet. 
        Smart contracts are unaudited and may contain bugs. No real funds are at risk on testnet. 
        Use at your own risk. Not financial advice.
      </p>
    </div>
  );
}
