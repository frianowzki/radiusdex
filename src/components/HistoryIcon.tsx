"use client";

import { useState, useEffect } from "react";

interface HistoryEntry {
  hash: string;
  label: string;
  time: string;
}

export function HistoryIcon({ entries, title }: { entries: HistoryEntry[]; title: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (entries.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="dex-btn-ghost"
        style={{ padding: "8px 12px", fontSize: 12, position: "relative" }}
        title={`${title} history`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span style={{
          position: "absolute", top: 2, right: 2, width: 8, height: 8,
          borderRadius: "50%", background: "var(--brand)",
        }} />
      </button>

      {open && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setOpen(false)}
        >
          <div
            className="dex-card"
            style={{ maxWidth: 480, width: "90%", maxHeight: "70vh", overflow: "auto", padding: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h3>
              <button onClick={() => setOpen(false)} className="dex-btn-ghost" style={{ padding: 6 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="space-y-2">
              {entries.map((entry, i) => (
                <a
                  key={i}
                  href={`https://testnet.arcscan.app/tx/${entry.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tx-item"
                  style={{ textDecoration: "none" }}
                >
                  <div>
                    <span style={{ fontWeight: 500 }}>{entry.label}</span>
                    <span className="text-xs text-[var(--muted)] block">{entry.time}</span>
                  </div>
                  <span className="tx-hash">{entry.hash.slice(0, 8)}…{entry.hash.slice(-6)}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
