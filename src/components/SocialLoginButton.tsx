"use client";

import { useState } from "react";
import { hasConfiguredPrivy, type SocialLoginMethod, useRadiusAuth } from "@/lib/auth";

type LoginMode = SocialLoginMethod | "modal";

export function SocialLoginButton({
  className = "",
  method = "modal",
  label = "Social Login",
}: {
  className?: string;
  method?: LoginMode;
  label?: string;
}) {
  const { login, initialized } = useRadiusAuth();
  const [busy, setBusy] = useState(false);

  async function handleLogin() {
    if (!hasConfiguredPrivy || busy) return;
    setBusy(true);
    try {
      await login(method === "modal" ? undefined : method);
    } catch (error) {
      console.error("Privy login failed", error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogin}
      disabled={!initialized || !hasConfiguredPrivy || busy}
      className={className || "dex-btn-primary text-xs px-4 py-2"}
    >
      {busy ? "Opening…" : label}
    </button>
  );
}
