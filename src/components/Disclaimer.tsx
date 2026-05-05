export function Disclaimer() {
  return (
    <footer className="disclaimer-glass" style={{ marginTop: 48 }}>
      <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6, textAlign: "center", margin: 0 }}>
        <strong>Disclaimer:</strong> Radius DEX is experimental software running on Arc Testnet.{" "}
        Smart contracts are unaudited and may contain bugs. No real funds are at risk on testnet.{" "}
        Use at your own risk. Not financial advice.{" "}
        <a
          href="https://docs.arc.network"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--brand)", textDecoration: "underline" }}
        >
          Documentation
        </a>
      </p>
    </footer>
  );
}
