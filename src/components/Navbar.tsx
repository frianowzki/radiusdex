"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV_LINKS = [
  { href: "/swap", label: "SWAP" },
  { href: "/pool", label: "POOL" },
  { href: "/yield", label: "YIELD" },
  { href: "/stats", label: "STATS" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="dex-nav">
      <Link href="/" className="dex-nav-logo">
        RADIUS DEX
      </Link>

      <div className="dex-nav-links">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`dex-nav-link ${
              pathname === link.href ? "active" : ""
            }`}
          >
            {link.label}
          </Link>
        ))}

      </div>

      <ConnectButton
        chainStatus="icon"
        showBalance={false}
        accountStatus="address"
      />
    </nav>
  );
}
