"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function DashboardDetails({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function revealAnchor() {
      let id = location.hash.slice(1);
      try { id = decodeURIComponent(id); } catch { return; }
      const target = document.getElementById(id);
      if (target && ref.current?.contains(target)) {
        ref.current.open = true;
        requestAnimationFrame(() => target.scrollIntoView());
      }
    }
    revealAnchor();
    window.addEventListener("hashchange", revealAnchor);
    return () => window.removeEventListener("hashchange", revealAnchor);
  }, []);
  return <details ref={ref} className="ch-home-details"><summary>Indicadores e relatórios completos</summary><div className="pt-4">{children}</div></details>;
}
