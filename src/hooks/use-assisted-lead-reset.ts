"use client";
import { useEffect, useState } from "react";

// Visibility follows a server decision, never sessionStorage or a platform flag.
export function useAssistedLeadReset(enabled: boolean) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let generation = 0;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const revoke = () => { generation++; clearTimeout(expiry); setAllowed(false); };
    const check = async () => {
      const current = ++generation;
      try {
        const response = await fetch("/api/dashboard/leads/reset", { cache: "no-store" });
        const data = await response.json();
        if (disposed || current !== generation) return;
        clearTimeout(expiry);
        const remaining = Date.parse(data.expiresAt ?? "") - Date.now();
        const valid = response.ok && data.canResetLead === true && remaining > 0;
        setAllowed(valid);
        if (valid) expiry = setTimeout(revoke, remaining);
      } catch { if (!disposed && current === generation) revoke(); }
    };
    const onFocus = () => { revoke(); void check(); };
    void check();
    const interval = setInterval(() => void check(), 15_000);
    window.addEventListener("focus", onFocus);
    window.addEventListener("connectyhub:assisted-access-ended", revoke);
    return () => {
      disposed = true;
      clearInterval(interval); clearTimeout(expiry);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("connectyhub:assisted-access-ended", revoke);
    };
  }, [enabled]);
  return enabled && allowed;
}
