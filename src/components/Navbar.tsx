"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useRadiusAuth } from "@/lib/auth";
import { SocialLoginButton } from "@/components/SocialLoginButton";

const NAV_LINKS = [
  { href: "/swap", label: "SWAP" },
  { href: "/bridge", label: "BRIDGE" },
  { href: "/pool", label: "POOL" },
  { href: "/yield", label: "YIELD" },
  { href: "/stats", label: "STATS" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { authenticated, user, login, logout } = useRadiusAuth();

  return (
    <nav className="dex-nav">
      <Link href="/" className="dex-nav-logo">
        <Image src="/icon-192.png" alt="Radius" width={32} height={32} className="rounded-full" />
        <span>RADIUS DEX</span>
      </Link>

      <div className="dex-nav-links">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`dex-nav-link ${pathname === link.href ? "active" : ""}`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-3">
        {authenticated ? (
          <div className="flex items-center gap-2">
            <div className="dex-badge" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", borderColor: "rgba(34,197,94,0.2)" }}>
              <span className="status-dot" style={{ marginRight: 4 }} />
              {user?.name ?? "Embedded wallet"}
            </div>
            <button onClick={() => logout()} className="dex-btn-ghost text-xs">
              Disconnect
            </button>
          </div>
        ) : (
          <SocialLoginButton method="modal" label="Social Login" />
        )}
        <ConnectButton
          chainStatus="icon"
          showBalance={false}
          accountStatus="address"
        />
      </div>
    </nav>
  );
}
