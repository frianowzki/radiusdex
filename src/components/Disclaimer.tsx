export function Disclaimer() {
  return (
    <footer className="dex-card" style={{ padding: "16px 24px", marginTop: 48 }}>
      <p className="text-[11px] text-[var(--muted)] leading-relaxed text-center">
        <strong>Disclaimer:</strong> Radius DEX is experimental software running on Arc Testnet. 
        Smart contracts are unaudited and may contain bugs. No real funds are at risk on testnet. 
        Use at your own risk. Not financial advice.{" "}
        <a href="https://docs.arc.network" target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)", textDecoration: "underline" }}>
          Documentation
        </a>
      </p>
    </footer>
  );
}
