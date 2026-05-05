export const CHAIN_USDC_ADDRESSES = {
  Arc_Testnet: "0x3600000000000000000000000000000000000000",
  Ethereum_Sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  Base_Sepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  Arbitrum_Sepolia: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  Avalanche_Fuji: "0x5425890298aed601595a70AB815c96711a31Bc65",
  Optimism_Sepolia: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
  Polygon_Amoy_Testnet: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  Linea_Sepolia: "0xfece4462d57bd51a6a552365a011b95f0e16d9b7",
  Unichain_Sepolia: "0x31d0220469e10c4E71834a79b1f276d740d3768F",
  World_Chain_Sepolia: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88",
  Ink_Testnet: "0xFabab97dCE620294D2B0b0e46C68964e326300Ac",
  Monad_Testnet: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
  HyperEVM_Testnet: "0x2B3370eE501B4a559b57D449569354196457D8Ab",
  Plume_Testnet: "0xcB5f30e335672893c7eb944B374c196392C19D18",
  Sei_Testnet: "0x4fCF1784B31630811181f670Aea7A7bEF803eaED",
  XDC_Apothem: "0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4",
  Codex_Testnet: "0x6d7f141b6819C2c9CC2f818e6ad549E7Ca090F8f",
} as const;

export const CHAIN_METADATA = {
  Arc_Testnet: { label: "Arc Testnet", chainId: 5042002, explorerUrl: "https://testnet.arcscan.app" },
  Ethereum_Sepolia: { label: "Ethereum Sepolia", chainId: 11155111, explorerUrl: "https://sepolia.etherscan.io" },
  Base_Sepolia: { label: "Base Sepolia", chainId: 84532, explorerUrl: "https://sepolia.basescan.org" },
  Arbitrum_Sepolia: { label: "Arbitrum Sepolia", chainId: 421614, explorerUrl: "https://sepolia.arbiscan.io" },
  Avalanche_Fuji: { label: "Avalanche Fuji", chainId: 43113, explorerUrl: "https://testnet.snowtrace.io" },
  Optimism_Sepolia: { label: "OP Sepolia", chainId: 11155420, explorerUrl: "https://optimism-sepolia.blockscout.com" },
  Polygon_Amoy_Testnet: { label: "Polygon Amoy", chainId: 80002, explorerUrl: "https://amoy.polygonscan.com" },
  Linea_Sepolia: { label: "Linea Sepolia", chainId: 59141, explorerUrl: "https://sepolia.lineascan.build" },
  Unichain_Sepolia: { label: "Unichain Sepolia", chainId: 1301, explorerUrl: "https://sepolia.uniscan.xyz" },
  World_Chain_Sepolia: { label: "World Chain Sepolia", chainId: 4801, explorerUrl: "https://sepolia.worldscan.org" },
  Ink_Testnet: { label: "Ink Testnet", chainId: 763373, explorerUrl: "https://explorer-sepolia.inkonchain.com" },
  Monad_Testnet: { label: "Monad Testnet", chainId: 10143, explorerUrl: "https://testnet.monadexplorer.com" },
  HyperEVM_Testnet: { label: "HyperEVM Testnet", chainId: 998, explorerUrl: "https://testnet.purrsec.com" },
  Plume_Testnet: { label: "Plume Testnet", chainId: 98867, explorerUrl: "https://testnet-explorer.plume.org" },
  Sei_Testnet: { label: "Sei Testnet", chainId: 1328, explorerUrl: "https://testnet.seiscan.io" },
  XDC_Apothem: { label: "XDC Apothem", chainId: 51, explorerUrl: "https://testnet.xdcscan.com" },
  Codex_Testnet: { label: "Codex Testnet", chainId: 812242, explorerUrl: "https://explorer.codex-stg.xyz" },
} as const;

export type CrosschainChain = keyof typeof CHAIN_METADATA;

type Route = {
  id: string;
  label: string;
  fromChain: CrosschainChain;
  toChain: CrosschainChain;
  token: "USDC";
  mode: "same-chain" | "bridge";
};

const BRIDGE_CHAINS = (Object.keys(CHAIN_METADATA).filter((chain) => chain !== "Arc_Testnet") as CrosschainChain[]);
const bridgeRoutes: Route[] = BRIDGE_CHAINS.flatMap((chain) => [
  {
    id: `arc-to-${chain.toLowerCase().replaceAll("_", "-")}`,
    label: `Arc → ${CHAIN_METADATA[chain].label}`,
    fromChain: "Arc_Testnet" as CrosschainChain,
    toChain: chain,
    token: "USDC" as const,
    mode: "bridge" as const,
  },
  {
    id: `${chain.toLowerCase().replaceAll("_", "-")}-to-arc`,
    label: `${CHAIN_METADATA[chain].label} → Arc`,
    fromChain: chain,
    toChain: "Arc_Testnet" as CrosschainChain,
    token: "USDC" as const,
    mode: "bridge" as const,
  },
]);

export const CROSSCHAIN_ROUTES = [
  {
    id: "arc-to-arc",
    label: "Arc → Arc",
    fromChain: "Arc_Testnet" as CrosschainChain,
    toChain: "Arc_Testnet" as CrosschainChain,
    token: "USDC" as const,
    mode: "same-chain" as const,
  },
  ...bridgeRoutes,
] as const satisfies readonly Route[];

export type CrosschainRoute = (typeof CROSSCHAIN_ROUTES)[number];
