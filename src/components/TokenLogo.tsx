import type { CSSProperties } from "react";

export function TokenLogo({ symbol, size = 36 }: { symbol: string; size?: number }) {
  const normalized = symbol.toUpperCase();
  const isEurc = normalized === "EURC";

  return (
    <span
      style={{ "--token-logo-size": `${size}px` } as CSSProperties}
      className={`token-logo ${isEurc ? "token-logo-eurc" : "token-logo-usdc"}`}
      aria-label={`${normalized} logo`}
      role="img"
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path className="token-logo-rail" d="M23.2 13.5a22.5 22.5 0 0 0 0 37" />
        <path className="token-logo-rail" d="M40.8 13.5a22.5 22.5 0 0 1 0 37" />
        <text className="token-logo-symbol" x="32" y="33.5">
          {isEurc ? "€" : "$"}
        </text>
      </svg>
    </span>
  );
}
