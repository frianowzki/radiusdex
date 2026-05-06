"use client";

import { useCallback, useState } from "react";
import { useAccount, useWriteContract as useWagmiWrite, useWaitForTransactionReceipt } from "wagmi";
import type { Abi, Address } from "viem";
import { encodeFunctionData } from "viem";
import { useRadiusAuth } from "@/lib/auth";
import { useSendTransaction as usePrivySendTx } from "@privy-io/react-auth";

/** Strip viem boilerplate into a short user-facing message. */
function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/user rejected|UserRejectedRequest/i.test(raw)) return "Transaction rejected in wallet.";
  if (/insufficient funds/i.test(raw)) return "Insufficient funds for gas.";
  if (/nonce/i.test(raw)) return "Nonce conflict — please retry.";
  if (/execution reverted/i.test(raw)) return "Transaction would revert — check balances & approvals.";
  // Truncate long viem dumps
  const short = raw.split("\n")[0].slice(0, 160);
  return short || "Transaction failed";
}

/**
 * writeContract that works with both wagmi (MetaMask/RainbowKit) and Privy (social login).
 */
export function useWriteContractCompat() {
  const { isConnected: wagmiConnected } = useAccount();
  const { authenticated, address: privyAddress } = useRadiusAuth();
  const wagmiWrite = useWagmiWrite();
  const { sendTransaction: privySendTransaction } = usePrivySendTx({
    onSuccess: ({ hash }) => {
      setTxHash(hash as `0x${string}`);
      setIsPending(false);
    },
    onError: (err) => {
      setError(friendlyError(err));
      setIsPending(false);
    },
  });
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
          const hash = await wagmiWrite.mutateAsync(args as Parameters<typeof wagmiWrite.mutateAsync>[0]);
          setTxHash(hash);
          setIsPending(false);
          return hash;
        }

        if (authenticated && privyAddress) {
          const data = encodeFunctionData({
            abi: args.abi,
            functionName: args.functionName,
            args: args.args as readonly unknown[] | undefined,
          });
          // Privy's sendTransaction handles gas estimation internally
          privySendTransaction({
            to: args.address,
            data,
            chainId: 5042002,
          });
          // Hash will be set by onSuccess callback
          return undefined as unknown as `0x${string}`;
        }

        throw new Error("No wallet connected. Please connect your wallet first.");
      } catch (err: unknown) {
        const msg = friendlyError(err);
        setError(msg);
        setIsPending(false);
        throw err;
      }
    },
    [wagmiConnected, authenticated, privyAddress, wagmiWrite, privySendTransaction]
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
