"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { formatGoogleAdsCustomerId } from "@/lib/google/customer-selection";

/** Choose which Google Ads account feeds the dashboards when the login reaches several. */
export function GoogleAccountPicker({ companyId, accessible, selected }: { companyId: string; accessible: string[]; selected: string | null }) {
  const router = useRouter();
  const [choice, setChoice] = useState(selected ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  if (accessible.length < 2) return null;

  async function save() {
    setBusy(true); setNotice(null);
    try {
      const r = await fetch("/api/dashboard/integrations/oauth/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, providerId: "google-growth", selection: { customerId: choice } }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || "Não foi possível salvar a conta.");
      setNotice({ ok: true, text: `Conta ${formatGoogleAdsCustomerId(choice)} selecionada.` });
      router.refresh();
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : "Não foi possível salvar a conta." });
    } finally { setBusy(false); }
  }

  return (
    <section className="mb-4 rounded-2xl border p-4" style={{ background: "var(--ch-surface)", borderColor: selected ? "var(--ch-border)" : "rgba(var(--ch-warning-rgb),0.45)" }}>
      <h2 className="text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>Conta Google Ads deste painel</h2>
      <p className="mt-1 text-[12px] text-slate-500">
        {selected ? "O login Google acessa mais de uma conta. Confira se esta é a conta certa." : "O login Google acessa mais de uma conta. Escolha qual alimenta este painel."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={choice} onChange={e => setChoice(e.target.value)} className="h-9 rounded-lg border px-2 text-[13px]" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)", color: "var(--ch-text)" }}>
          <option value="" disabled>Escolha a conta</option>
          {accessible.map(id => <option key={id} value={id}>{formatGoogleAdsCustomerId(id)}{id === selected ? " (atual)" : ""}</option>)}
        </select>
        <button type="button" disabled={!choice || choice === selected || busy} onClick={save} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-[13px] font-semibold text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Usar esta conta
        </button>
        {notice ? <span role="status" className={`text-[12px] ${notice.ok ? "text-emerald-700" : "text-rose-700"}`}>{notice.text}</span> : null}
      </div>
    </section>
  );
}
