import { parseUnits } from "viem";

export function parseTokenAmount(value: string, decimals: number): bigint | undefined {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+(?:\.\d*)?$|^\.\d+$/.test(trimmed)) return undefined;

  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) return undefined;

  try {
    return parseUnits(`${whole || "0"}${fraction ? `.${fraction}` : ""}`, decimals);
  } catch {
    return undefined;
  }
}

export function isValidTokenAmount(value: string, decimals: number): boolean {
  const parsed = parseTokenAmount(value, decimals);
  return parsed !== undefined && parsed > BigInt(0);
}
