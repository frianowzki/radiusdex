"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@/components/ConnectButton";

const NAV_LINKS = [
  { href: "/swap", label: "SWAP" },
  { href: "/bridge", label: "BRIDGE" },
  { href: "/pool", label: "POOL" },
  { href: "/yield", label: "YIELD" },
  { href: "/stats", label: "STATS" },
];

export default function Navbar() {
  const pathname = usePathname();

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
        <ConnectButton />
      </div>
    </nav>
  );
}
