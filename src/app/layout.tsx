import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { DynamicBackground } from "@/components/DynamicBackground";
import { Disclaimer } from "@/components/Disclaimer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Radius DEX — Stablecoin Swaps on Arc Network",
  description: "Radius DEX — Decentralized stablecoin exchange on Arc Network",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} data-theme="light">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.dataset.theme="light";document.documentElement.style.colorScheme="light";`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <DynamicBackground />
        <Providers>
          <div style={{ flex: 1 }}>{children}</div>
          <div className="dex-container"><Disclaimer /></div>
        </Providers>
      </body>
    </html>
  );
}
