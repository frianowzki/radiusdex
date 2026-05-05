"use client";

import { type ReactNode, useState, useEffect, useMemo } from "react";
import { WagmiProvider, http, type Config } from "wagmi";
import {
  RainbowKitProvider,
  darkTheme,
  getDefaultConfig,
} from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { arcTestnet } from "@/config/wagmi";

let cachedConfig: Config | null = null;

function getConfig(): Config {
  if (cachedConfig) return cachedConfig;
  cachedConfig = getDefaultConfig({
    appName: "Radius DEX",
    projectId: "radiusdex-placeholder",
    chains: [arcTestnet],
    transports: {
      [arcTestnet.id]: http("https://rpc.arc.network"),
    },
  });
  return cachedConfig;
}

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <WagmiProvider config={getConfig()}>
      <QueryClientProvider client={new QueryClient()}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#3b82f6",
            accentColorForeground: "white",
            borderRadius: "large",
            fontStack: "system",
            overlayBlur: "small",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
