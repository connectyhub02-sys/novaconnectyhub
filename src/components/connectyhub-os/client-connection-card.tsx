"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Settings2 } from "lucide-react";
import { AccountDialog, AccountTile } from "./social-accounts-console";
import type { SocialBrand } from "./social-brand-marks";

/** Keep existing deep links working while the full form lives inside Gerenciar. */
export function ClientConnectionCard({ id, name, brands = [], icon, status, account = null, tone = "idle", children, feedback }: {
  id: string;
  name: string;
  brands?: SocialBrand[];
  icon?: ReactNode;
  status: string;
  account?: string | null;
  tone?: "ok" | "attention" | "idle";
  children: ReactNode;
  feedback?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const sync = () => setOpen(window.location.hash === `#${id}` || (id === "google-ads-guiado" && window.location.hash === "#google-tag"));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [id]);

  function close() {
    setOpen(false);
    if (window.location.hash === `#${id}` || (id === "google-ads-guiado" && window.location.hash === "#google-tag")) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
  }

  return <>
    <AccountTile brands={brands} icon={icon} name={name} status={status} account={account} tone={tone}>
      <button type="button" aria-label={`Gerenciar ${name}`} onClick={() => setOpen(true)} className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50">
        <Settings2 size={14} />Gerenciar
      </button>
    </AccountTile>
    <AccountDialog open={open} onClose={close} brands={brands} icon={icon} title={name} status={status} account={account} clientForm>
      {feedback}
      {children}
    </AccountDialog>
  </>;
}
