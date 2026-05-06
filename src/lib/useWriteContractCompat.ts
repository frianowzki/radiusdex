"use client";

import { useCallback, useState } from "react";
import { useAccount, useWriteContract as useWagmiWrite, useWaitForTransactionReceipt } from "wagmi";
import type { Abi, Address } from "viem";
import { createWalletClient, custom } from "viem";
import { arcTestnet } from "@/config/wagmi";
import { useRadiusAuth } from "@/lib/auth";

/**
 * writeContract that works with both wagmi (MetaMask/RainbowKit) and Privy (social login).
 * Falls back to the Privy provider when wagmi has no connected wallet.
 */
export function useWriteContractCompat() {
  const { isConnected: wagmiConnected } = useAccount();
  const { provider: privyProvider, authenticated } = useRadiusAuth();
  const wagmiWrite = useWagmiWrite();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  const writeContractAsync = useCallback(
    async (args: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }) => {
      setError(null);
      setIsPending(true);
      try {
        if (wagmiConnected) {
          // Use wagmi — standard flow
          const hash = await wagmiWrite.mutateAsync(args as Parameters<typeof wagmiWrite.mutateAsync>[0]);
          setTxHash(hash);
          return hash;
        }

        if (authenticated && privyProvider) {
          // Use Privy provider directly via viem
          const client = createWalletClient({
            chain: arcTestnet,
            transport: custom(privyProvider as import("viem").EIP1193Provider),
          });
          const [account] = await client.getAddresses();
          const hash = await client.writeContract({
            ...args,
            account,
          } as Parameters<typeof client.writeContract>[0]);
          setTxHash(hash);
          return hash;
        }

        throw new Error("No wallet connected. Please connect your wallet first.");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Transaction failed";
        setError(msg);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [wagmiConnected, privyProvider, authenticated, wagmiWrite]
  );

  const reset = useCallback(() => {
    setTxHash(undefined);
    setError(null);
    wagmiWrite.reset();
  }, [wagmiWrite]);

  return {
    writeContractAsync,
    isPending,
    txHash,
    setTxHash,
    error,
    reset,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    isWritePending: isPending,
  };
}
