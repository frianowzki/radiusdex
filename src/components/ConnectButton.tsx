"use client";

import { useState, useRef, useEffect } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { useRadiusAuth } from "@/lib/auth";
import { formatAddress } from "@/lib/format";

const ARC_CHAIN_ID = 5042002;

export function ConnectButton() {
  const { isConnected: wagmiConnected, address: wagmiAddr } = useAccount();
  const wagmiChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const {
    authenticated,
    address: authAddr,
    chainId: authChainId,
    user,
    login,
    logout,
    initialized,
  } = useRadiusAuth();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const connected = wagmiConnected || authenticated;
  const address = wagmiAddr ?? authAddr;
  const activeChainId = wagmiConnected ? wagmiChainId : authChainId;
  const isOnArc = activeChainId === ARC_CHAIN_ID;

  // Bug 1: When connected, check chain — prompt to switch if not on Arc Testnet
  useEffect(() => {
    if (!connected || !wagmiConnected) return;
    if (wagmiChainId !== ARC_CHAIN_ID) {
      // Auto-prompt switch to Arc for wagmi wallets
      switchChainAsync({ chainId: ARC_CHAIN_ID }).catch(() => {
        // User rejected or error — show switch button instead
      });
    }
  }, [connected, wagmiConnected, wagmiChainId, switchChainAsync]);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    // Bug 2: Also handle touch events for mobile
    function onTouchOutside(e: TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("touchstart", onTouchOutside);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("touchstart", onTouchOutside);
    };
  }, []);

  async function handleConnect() {
    if (busy) return;
    setBusy(true);
    try {
      await login();
    } catch (e) {
      console.error("Connect failed:", e);
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitchToArc() {
    if (wagmiConnected) {
      await switchChainAsync({ chainId: ARC_CHAIN_ID });
    }
  }

  // Bug 2: Unified handler for both click and touch
  function handleDisconnect() {
    logout();
    setOpen(false);
  }

  function handleCopyAddress() {
    navigator.clipboard.writeText(address!);
    setOpen(false);
  }

  // Disconnected state — single frosted glass button
  if (!connected) {
    return (
      <button
        type="button"
        onClick={handleConnect}
        onTouchEnd={(e) => { e.preventDefault(); handleConnect(); }}
        disabled={!initialized || busy}
        className="connect-btn"
      >
        {busy ? (
          <span className="connect-btn-spinner" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="14" rx="2" />
            <path d="M2 10h20" />
            <path d="M12 14h.01" />
          </svg>
        )}
        {busy ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  // Connected state — address badge with dropdown
  return (
    <div className="connect-wrapper" ref={ref}>
      {!isOnArc && (
        <button type="button" onClick={handleSwitchToArc} onTouchEnd={(e) => { e.preventDefault(); handleSwitchToArc(); }} className="connect-switch-btn">
          Switch to Arc
        </button>
      )}
      <button type="button" onClick={() => setOpen(!open)} onTouchEnd={(e) => { e.preventDefault(); setOpen(!open); }} className="connect-badge">
        <span className="connect-dot" />
        <span className="connect-addr">
          {user?.name || formatAddress(address!)}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0)" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="connect-dropdown" onTouchStart={(e) => e.stopPropagation()}>
          <div className="connect-dropdown-header">
            <span className="connect-dot" style={{ width: 10, height: 10 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {user?.name || "Connected"}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-geist-mono, monospace)" }}>
                {formatAddress(address!)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyAddress}
            onTouchEnd={(e) => { e.preventDefault(); handleCopyAddress(); }}
            className="connect-dropdown-item"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy address
          </button>
          <a
            href="https://faucet.circle.com"
            target="_blank"
            rel="noopener noreferrer"
            className="connect-dropdown-item"
            onClick={() => setOpen(false)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
            Arc Faucet
          </a>
          <button
            type="button"
            onClick={handleDisconnect}
            onTouchEnd={(e) => { e.preventDefault(); handleDisconnect(); }}
            className="connect-dropdown-item connect-dropdown-logout"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
