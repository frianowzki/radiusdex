"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@/components/ConnectButton";

const NAV_LINKS = [
  { href: "/swap", label: "Swap", color: "#2563eb", letter: "S" },
  { href: "/bridge", label: "Bridge", color: "#7c3aed", letter: "B" },
  { href: "/pool", label: "Pool", color: "#0891b2", letter: "P" },
  { href: "/yield", label: "Yield", color: "#059669", letter: "Y" },
  { href: "/stats", label: "Stats", color: "#d97706", letter: "T" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Escape key to close
  useEffect(() => {
    if (!menuOpen) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [menuOpen]);

  // Lock body scroll when drawer open
  useEffect(() => {
    if (menuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [menuOpen]);

  return (
    <>
      <nav className="dex-nav">
        {/* Hamburger — left side, mobile only */}
        <button
          type="button"
          className="nav-hamburger"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

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

        <div className="dex-nav-right">
          <ConnectButton />
        </div>
      </nav>

      {/* Mobile slide-out drawer */}
      {menuOpen && (
        <div className="nav-drawer-overlay" onClick={() => setMenuOpen(false)}>
          <div className="nav-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="nav-drawer-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Image src="/icon-192.png" alt="Radius" width={28} height={28} className="rounded-full" />
                <span style={{ fontWeight: 700, fontSize: 15 }}>RADIUS DEX</span>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="modal-close-btn"
                aria-label="Close menu"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="nav-drawer-links">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`nav-drawer-link ${pathname === link.href ? "active" : ""}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <div
                    className="nav-drawer-icon-circle"
                    style={{ background: link.color }}
                  >
                    {link.letter}
                  </div>
                  <span className="nav-drawer-label">{link.label}</span>
                  {pathname === link.href && <span className="nav-drawer-active-dot" />}
                </Link>
              ))}
            </div>
            <div className="nav-drawer-footer">
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Arc Testnet • v1.0</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
