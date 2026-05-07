"use client";

import { type ReactNode, useState, useEffect } from "react";
import { WagmiProvider, http, type Config, createConfig } from "wagmi";
import {
  RainbowKitProvider,
  lightTheme,
  getDefaultConfig,
} from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { arcTestnet } from "@/config/wagmi";
import { RadiusAuthProvider } from "@/lib/auth";

let cachedConfig: Config | null = null;

function getConfig(): Config {
  if (cachedConfig) return cachedConfig;
  cachedConfig = getDefaultConfig({
    appName: "Radius DEX",
    // L10: TODO: Replace placeholder with real WalletConnect projectId for production
    projectId: "radiusdex-placeholder",
    chains: [arcTestnet],
    transports: {
      [arcTestnet.id]: http(),
    },
  });
  return cachedConfig;
}

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [queryClient] = useState(() => new QueryClient());

  if (!mounted) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <RadiusAuthProvider>
        <WagmiProvider config={getConfig()}>
          <RainbowKitProvider
            theme={lightTheme({
              accentColor: "#3b82f6",
              accentColorForeground: "white",
              borderRadius: "large",
              fontStack: "system",
              overlayBlur: "small",
            })}
          >
            {children}
          </RainbowKitProvider>
        </WagmiProvider>
      </RadiusAuthProvider>
    </QueryClientProvider>
  );
}
