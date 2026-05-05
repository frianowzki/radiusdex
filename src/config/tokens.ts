import { USDC_ADDRESS, EURC_ADDRESS } from "./contracts";

export interface Token {
  name: string;
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  index: number;
  color: string;
}

export const USDC: Token = {
  name: "USD Coin",
  symbol: "USDC",
  address: USDC_ADDRESS,
  decimals: 6,
  index: 0,
  color: "#2775ca",
};

export const EURC: Token = {
  name: "Euro Coin",
  symbol: "EURC",
  address: EURC_ADDRESS,
  decimals: 6,
  index: 1,
  color: "#0052ff",
};

export const TOKENS: Token[] = [USDC, EURC];

export function getTokenByIndex(index: number): Token | undefined {
  return TOKENS.find((t) => t.index === index);
}

export function getTokenBySymbol(symbol: string): Token | undefined {
  return TOKENS.find((t) => t.symbol === symbol);
}
