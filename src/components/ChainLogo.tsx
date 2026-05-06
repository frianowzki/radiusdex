"use client";

import type { CrosschainChain } from "@/config/crosschain";

const CHAIN_LOGOS: Partial<Record<CrosschainChain, string>> = {
  Arc_Testnet: "/chains/arc.png",
  Ethereum_Sepolia: "/chains/ethereum.png",
  Base_Sepolia: "/chains/base.png",
  Arbitrum_Sepolia: "/chains/arbitrum.png",
  Avalanche_Fuji: "/chains/avalanche.png",
  Optimism_Sepolia: "/chains/optimism.png",
  Polygon_Amoy_Testnet: "/chains/polygon.png",
  Linea_Sepolia: "/chains/linea.png",
  Unichain_Sepolia: "/chains/unichain.png",
  World_Chain_Sepolia: "/chains/world.png",
  Ink_Testnet: "/chains/ink.png",
  Monad_Testnet: "/chains/monad.png",
  HyperEVM_Testnet: "/chains/hyperliquid.png",
  Plume_Testnet: "/chains/plume.png",
  Sei_Testnet: "/chains/sei.png",
  XDC_Apothem: "/chains/xdc.png",
  Codex_Testnet: "/chains/codex.png",
};

const FALLBACK_COLORS: Partial<Record<CrosschainChain, string>> = {
  Arc_Testnet: "#2563eb",
  Ethereum_Sepolia: "#627eea",
  Base_Sepolia: "#0052ff",
  Arbitrum_Sepolia: "#28a0f0",
  Avalanche_Fuji: "#e84142",
  Optimism_Sepolia: "#ff0420",
  Polygon_Amoy_Testnet: "#8247e5",
  Linea_Sepolia: "#61dfff",
  Unichain_Sepolia: "#ff007a",
  World_Chain_Sepolia: "#000000",
  Ink_Testnet: "#7132f5",
  Monad_Testnet: "#8b6cef",
  HyperEVM_Testnet: "#00d4aa",
  Plume_Testnet: "#e41111",
  Sei_Testnet: "#596877",
  XDC_Apothem: "#f5a623",
  Codex_Testnet: "#008462",
};

const CHAIN_SHORT: Record<string, string> = {
  Arc_Testnet: "A",
  Ethereum_Sepolia: "E",
  Base_Sepolia: "B",
  Arbitrum_Sepolia: "A",
  Avalanche_Fuji: "AV",
  Optimism_Sepolia: "O",
  Polygon_Amoy_Testnet: "P",
  Linea_Sepolia: "L",
  Unichain_Sepolia: "U",
  World_Chain_Sepolia: "W",
  Ink_Testnet: "I",
  Monad_Testnet: "M",
  HyperEVM_Testnet: "H",
  Plume_Testnet: "PL",
  Sei_Testnet: "S",
  XDC_Apothem: "X",
  Codex_Testnet: "C",
};

interface ChainLogoProps {
  chainKey: CrosschainChain;
  size?: number;
}

export function ChainLogo({ chainKey, size = 32 }: ChainLogoProps) {
  const src = CHAIN_LOGOS[chainKey];
  const color = FALLBACK_COLORS[chainKey] ?? "var(--brand)";
  const short = CHAIN_SHORT[chainKey] ?? chainKey.charAt(0);

  if (src) {
    return (
      <img
        src={src}
        alt={chainKey}
        width={size}
        height={size}
        style={{ borderRadius: 999, objectFit: "cover", display: "block" }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: color,
        color: "#fff",
        display: "grid",
        placeItems: "center",
        fontSize: size * 0.35,
        fontWeight: 800,
        lineHeight: 1,
        fontFamily: "var(--font-geist-sans, sans-serif)",
      }}
    >
      {short}
    </div>
  );
}
