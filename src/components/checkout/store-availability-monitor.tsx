"use client";
import { useEffect } from "react";

export function StoreAvailabilityMonitor({organizationId}:{organizationId:string}) {
  useEffect(() => {
    let disposed = false;
    let checking = false;
    const controller = new AbortController();
    async function check() {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const response = await fetch(`/api/public/sales-catalog/availability?organization_id=${encodeURIComponent(organizationId)}`,{cache:"no-store",signal:controller.signal});
        const data = await response.json();
        // Reload removes stale product/payment controls and any mounted agent widget.
        if (!disposed && response.ok && data.available === false) window.location.reload();
      } catch { /* Transaction APIs independently enforce access even while offline. */ }
      finally { checking = false; }
    }
    void check();
    const timer = setInterval(check,15000);
    document.addEventListener("visibilitychange",check);
    window.addEventListener("pageshow",check);
    return () => { disposed=true;controller.abort();clearInterval(timer);document.removeEventListener("visibilitychange",check);window.removeEventListener("pageshow",check); };
  },[organizationId]);
  return null;
}
