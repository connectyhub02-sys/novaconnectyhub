"use client";
import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { GoogleStoreTag } from "@/lib/google/store-tag-policy";

/** Client pastes the GA4 and Google Ads IDs; the store page loads the tag after visitor consent. */
export function GoogleTagPanel({ companyId }: { companyId: string }) {
  const endpoint = `/api/dashboard/integrations/google/tag?companyId=${encodeURIComponent(companyId)}`;
  const [form, setForm] = useState({ measurementId: "", adsConversionId: "", leadLabel: "", enabled: false });
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(r => r.json())
      .then((d: { tag?: GoogleStoreTag | null }) => {
        if (d.tag) setForm({ measurementId: d.tag.measurementId ?? "", adsConversionId: d.tag.adsConversionId ?? "", leadLabel: d.tag.leadLabel ?? "", enabled: d.tag.enabled });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [endpoint]);

  async function save() {
    setSaving(true); setNotice(null);
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível salvar.");
      setForm({ measurementId: d.tag.measurementId ?? "", adsConversionId: d.tag.adsConversionId ?? "", leadLabel: d.tag.leadLabel ?? "", enabled: d.tag.enabled });
      setNotice({ ok: true, text: d.tag.enabled ? "Tag do Google ativa na sua loja." : "Configuração salva. A tag está desligada." });
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : "Não foi possível salvar." });
    } finally { setSaving(false); }
  }

  const field = "h-10 w-full rounded-lg border px-3 text-[13px] outline-none";
  const style = { background: "var(--ch-surface-2)", borderColor: "var(--ch-border)", color: "var(--ch-text)" };
  return (
    <section id="google-tag" className="scroll-mt-24 rounded-2xl p-4" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <h2 className="text-[16px] font-semibold" style={{ color: "var(--ch-text)" }}>Tag do Google na sua loja</h2>
      <p className="mt-1 text-[12px] leading-5 text-slate-500">
        Mede visitas, produtos vistos, carrinho e pedidos iniciados da sua página para o Google Analytics e o Google Ads. Os IDs ficam no Google Analytics (Administrador → Fluxos de dados) e no Google Ads (Metas → Conversões → Configurar tag).
      </p>
      {loading ? <Loader2 className="mt-3 h-4 w-4 animate-spin text-slate-400" /> : (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-[12px] font-medium text-slate-600">Google Analytics (G-)
            <input className={`${field} mt-1`} style={style} placeholder="G-ABC123XYZ" value={form.measurementId} onChange={e => setForm({ ...form, measurementId: e.target.value })} />
          </label>
          <label className="text-[12px] font-medium text-slate-600">Google Ads (AW-)
            <input className={`${field} mt-1`} style={style} placeholder="AW-123456789" value={form.adsConversionId} onChange={e => setForm({ ...form, adsConversionId: e.target.value })} />
          </label>
          <label className="text-[12px] font-medium text-slate-600">Rótulo da conversão (pedido iniciado)
            <input className={`${field} mt-1`} style={style} placeholder="opcional" value={form.leadLabel} onChange={e => setForm({ ...form, leadLabel: e.target.value })} />
          </label>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--ch-text)" }}>
          <input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> Ativar na minha loja
        </label>
        <button type="button" disabled={saving || loading} onClick={save} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-[13px] font-semibold text-white disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
        </button>
        {notice ? <span role="status" className={`text-[12px] ${notice.ok ? "text-emerald-700" : "text-rose-700"}`}>{notice.text}</span> : null}
      </div>
      <p className="mt-2 text-[11.5px] text-slate-500">O visitante escolhe se permite a medição. Endereços de pagamento nunca são enviados ao Google.</p>
    </section>
  );
}
