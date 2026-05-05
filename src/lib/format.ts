export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatAmount(value: string | number, decimals = 4): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}
