export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// M4: Shared APR calculation utility used by stats and yield pages
export function calcAPR(rewardRatePerSecond: bigint, totalStaked: bigint): number {
  if (totalStaked === BigInt(0)) return 0;
  const secondsPerYear = BigInt(365 * 24 * 3600);
  return Number((rewardRatePerSecond * secondsPerYear * BigInt(10000)) / totalStaked) / 100;
}
