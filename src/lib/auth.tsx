"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  PrivyProvider,
  getEmbeddedConnectedWallet,
  useLogin,
  useLogout,
  usePrivy,
  useSignMessage,
  useWallets,
  type ConnectedWallet,
  type LoginModalOptions,
  type User,
} from "@privy-io/react-auth";
import type { EIP1193Provider } from "viem";
import { arcTestnet } from "@/config/wagmi";

export type SocialLoginMethod = "email" | "google" | "github" | "twitter" | "apple";

type RadiusUser = {
  id?: string;
  name?: string;
  email?: string;
  raw?: User;
};

type RadiusAuthContextValue = {
  initialized: boolean;
  authenticated: boolean;
  address?: `0x${string}`;
  chainId?: number;
  provider: EIP1193Provider | null;
  privyWallet: ConnectedWallet | null;
  user: RadiusUser | null;
  login: (method?: SocialLoginMethod) => Promise<void>;
  logout: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
  signMessage: (message: string) => Promise<string>;
};

const RadiusAuthContext = createContext<RadiusAuthContextValue | null>(null);

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
const privyClientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID?.trim() ?? "";
const hasConfiguredPrivy = Boolean(privyAppId);

function parsePrivyChainId(chainId?: string) {
  if (!chainId) return undefined;
  const raw = chainId.includes(":") ? chainId.split(":").at(-1) : chainId;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pickWallet(wallets: ConnectedWallet[]) {
  return getEmbeddedConnectedWallet(wallets) ?? wallets.find((wallet) => wallet.type === "ethereum") ?? null;
}

function normalizeUser(user: User | null | undefined): RadiusUser | null {
  if (!user) return null;
  const name =
    user.google?.name ||
    user.twitter?.name ||
    user.twitter?.username ||
    user.github?.name ||
    user.github?.username ||
    user.email?.address ||
    user.apple?.email ||
    undefined;
  const email = user.email?.address || user.google?.email || user.github?.email || user.apple?.email || undefined;
  return { id: user.id, name, email, raw: user };
}

function RadiusPrivyBridgeProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { logout: privyLogout } = useLogout();
  const { signMessage: privySignMessage } = useSignMessage();
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const [address, setAddress] = useState<`0x${string}` | undefined>();
  const [chainId, setChainId] = useState<number | undefined>();
  const wallet = useMemo(() => pickWallet(wallets), [wallets]);

  const refreshWallet = useCallback(async () => {
    if (!ready || !authenticated || !wallet) {
      setProvider(null);
      setAddress(undefined);
      setChainId(undefined);
      return;
    }
    try {
      const nextProvider = (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
      setProvider(nextProvider);
      setAddress(wallet.address as `0x${string}`);
      setChainId(parsePrivyChainId(wallet.chainId));
    } catch (error) {
      console.error("Privy provider unavailable", error);
      setProvider(null);
      setAddress(undefined);
      setChainId(undefined);
    }
  }, [authenticated, ready, wallet]);

  useEffect(() => { void refreshWallet(); }, [refreshWallet]);

  const { login: openPrivyLogin } = useLogin({
    onComplete: () => {
      if (typeof window !== "undefined" && localStorage.getItem("radiusdex-login-pending") === "true") {
        localStorage.removeItem("radiusdex-login-pending");
        window.location.replace("/");
      }
    },
    onError: (error) => {
      console.error("Privy login failed", error);
      if (typeof window !== "undefined") localStorage.removeItem("radiusdex-login-pending");
    },
  });

  const login = useCallback(
    async (method?: SocialLoginMethod) => {
      if (!hasConfiguredPrivy) throw new Error("Privy is not configured");
      const options: LoginModalOptions | undefined = method ? { loginMethods: [method] } : undefined;
      openPrivyLogin(options);
    },
    [openPrivyLogin]
  );

  const logout = useCallback(async () => {
    await privyLogout();
    setProvider(null);
    setAddress(undefined);
    setChainId(undefined);
  }, [privyLogout]);

  const signMessage = useCallback(
    async (message: string) => {
      if (!address) throw new Error("Wallet unavailable");
      const { signature } = await privySignMessage({ message }, { address });
      return signature;
    },
    [address, privySignMessage]
  );

  const switchChain = useCallback(
    async (targetChainId: number) => {
      if (!wallet) throw new Error("Privy wallet unavailable");
      await wallet.switchChain(targetChainId);
      const nextProvider = (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
      setProvider(nextProvider);
      setChainId(targetChainId);
    },
    [wallet]
  );

  const value = useMemo<RadiusAuthContextValue>(
    () => ({
      initialized: ready,
      authenticated: authenticated && Boolean(address),
      address,
      chainId,
      provider,
      privyWallet: wallet,
      user: normalizeUser(user),
      login,
      logout,
      switchChain,
      signMessage,
    }),
    [address, authenticated, chainId, login, logout, provider, ready, switchChain, signMessage, user, wallet]
  );

  return <RadiusAuthContext.Provider value={value}>{children}</RadiusAuthContext.Provider>;
}

export function RadiusAuthProvider({ children }: { children: ReactNode }) {
  if (!hasConfiguredPrivy) {
    return (
      <RadiusAuthContext.Provider
        value={{
          initialized: true,
          authenticated: false,
          provider: null,
          privyWallet: null,
          user: null,
          login: async () => { throw new Error("Privy is not configured"); },
          logout: async () => undefined,
          switchChain: async () => { throw new Error("Privy is not configured"); },
          signMessage: async () => { throw new Error("Privy is not configured"); },
        }}
      >
        {children}
      </RadiusAuthContext.Provider>
    );
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      clientId={privyClientId || undefined}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#3b82f6",
          logo: "https://radiusdex.vercel.app/icon-512.png",
          landingHeader: "Continue to Radius DEX",
          loginMessage: "Swap stablecoins on Arc Testnet with near-zero slippage.",
          showWalletLoginFirst: false,
          walletChainType: "ethereum-only",
        },
        loginMethods: ["google", "email", "github", "twitter", "apple", "wallet"],
        supportedChains: [arcTestnet],
        defaultChain: arcTestnet,
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <RadiusPrivyBridgeProvider>{children}</RadiusPrivyBridgeProvider>
    </PrivyProvider>
  );
}

export function useRadiusAuth() {
  const ctx = useContext(RadiusAuthContext);
  if (!ctx) throw new Error("useRadiusAuth must be used inside RadiusAuthProvider");
  return ctx;
}

export { hasConfiguredPrivy };
