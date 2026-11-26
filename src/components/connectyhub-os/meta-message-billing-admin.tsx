"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { META_BILLING_MODE_LABELS, META_MESSAGE_CATEGORY_LABELS, formatBrl, metaBillingMode } from "@/lib/meta/message-billing-policy";

type Report = {
  month: string;
  by_category: Array<{ category: string; charged_messages: number; free_messages: number; revenue_brl: number; meta_cost_brl: number; shortfall_brl: number }>;
  by_organization: Array<{ organization_id: string; name: string; charged_messages: number; revenue_brl: number; meta_cost_brl: number }>;
  topups_brl: number;
  adjustments_brl: number;
  wallets: { balance_brl: number; reserved_brl: number; debt_brl: number; wallets: number };
  open: { reserved: number; reserved_old: number; rate_missing: number };
  senders: Array<{ organization_id: string; organization: string; phone_number_id: string; display_phone: string; verified_name: string | null; waba_id: string; billing_mode: string; billing_mode_changed_at: string | null; coexistence: boolean | null }>;
  rates: Array<{ id: string; market: string; category: string; provider_cost_brl: number; multiplier: number; customer_price_brl: number; effective_from: string; effective_to: string | null; source: string | null }>;
};

const panel = "rounded-xl border border-slate-200 bg-white p-5";
const field = "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm";
const button = "min-h-10 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";
const sum = (rows: Array<Record<string, unknown>>, key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);

// Admin finance: official WhatsApp messages, in BRL, kept apart from the AI credit cost center.
export function MetaMessageBillingAdmin({ month }: { month: string }) {
  const [data, setData] = useState<Report | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/billing/meta-messages?month=${encodeURIComponent(month)}`, { cache: "no-store" });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error);
    setData(value);
  }, [month]);
  useEffect(() => {
    const refresh = () => { void load().catch((error) => setNotice(error instanceof Error ? error.message : "Falha ao carregar.")); };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);

  async function post(body: Record<string, unknown>, done: string) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/admin/billing/meta-messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setNotice(done); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }

  const revenue = data ? sum(data.by_category, "revenue_brl") : 0;
  const cost = data ? sum(data.by_category, "meta_cost_brl") : 0;
  const current = data?.rates.filter((r) => !r.effective_to) ?? [];

  return <section className={`${panel} mt-6 space-y-5 text-slate-900`} aria-labelledby="meta-messages-admin-title">
    <div>
      <h2 id="meta-messages-admin-title" className="flex items-center gap-2 text-lg font-semibold"><MessageCircle size={20} className="text-emerald-700" aria-hidden /> WhatsApp oficial (Meta) — {month}</h2>
      <p className="mt-1 text-sm text-slate-600">Em reais, separado dos créditos de IA. Só números faturados pela linha de crédito da ConnectyHub entram aqui. Cada mensagem cobrada pela Meta custa ao cliente o multiplicador da tarifa; as gratuitas não são cobradas.</p>
    </div>
    {notice ? <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-950">{notice}</p> : null}
    {!data ? <p role="status">Carregando…</p> : <>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-emerald-50 p-3"><dt className="text-xs">Receita de mensagens</dt><dd className="text-xl font-bold">{formatBrl(revenue)}</dd></div>
        <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs">Custo Meta (tabela)</dt><dd className="text-xl font-bold">{formatBrl(cost)}</dd></div>
        <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs">Margem bruta</dt><dd className="text-xl font-bold">{formatBrl(revenue - cost)}</dd></div>
        <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs">Recargas no mês</dt><dd className="text-xl font-bold">{formatBrl(data.topups_brl)}</dd>{Number(data.adjustments_brl) ? <p className="text-xs">+ {formatBrl(data.adjustments_brl)} em ajustes</p> : null}</div>
      </dl>
      <p className="text-sm text-slate-600">Saldo guardado para clientes (a usar): <strong>{formatBrl(data.wallets.balance_brl)}</strong> em {data.wallets.wallets} carteiras · reservado {formatBrl(data.wallets.reserved_brl)} · diferenças pendentes {formatBrl(data.wallets.debt_brl, true)}. Margem antes de impostos, taxas do checkout e custos fixos; o custo real é o da fatura da Meta.</p>
      {data.open.rate_missing || data.open.reserved_old ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{data.open.rate_missing} envios entregues sem tarifa cadastrada · {data.open.reserved_old} reservas há mais de 3 dias sem confirmação de entrega.</p> : null}

      <div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-sm">
        <thead><tr className="text-xs text-slate-500"><th className="py-2">Categoria</th><th>Cobradas</th><th>Gratuitas</th><th>Receita</th><th>Custo Meta</th><th>Diferença pendente</th></tr></thead>
        <tbody>{data.by_category.map((r) => <tr key={r.category} className="border-t border-slate-100"><td className="py-2 font-semibold">{META_MESSAGE_CATEGORY_LABELS[r.category] ?? r.category}</td><td>{r.charged_messages}</td><td>{r.free_messages}</td><td>{formatBrl(r.revenue_brl)}</td><td>{formatBrl(r.meta_cost_brl)}</td><td>{formatBrl(r.shortfall_brl, true)}</td></tr>)}
          {!data.by_category.length ? <tr><td colSpan={6} className="py-3 text-slate-500">Nenhuma mensagem faturada neste mês.</td></tr> : null}</tbody>
      </table></div>
      {data.by_organization.length ? <details><summary className="cursor-pointer font-semibold">Por cliente</summary><ul className="mt-2 text-sm">{data.by_organization.map((o) => <li key={o.organization_id} className="py-1">{o.name}: {o.charged_messages} cobradas · receita {formatBrl(o.revenue_brl)} · custo {formatBrl(o.meta_cost_brl)}</li>)}</ul></details> : null}

      <details open>
        <summary className="cursor-pointer font-semibold">Quem paga a Meta em cada número</summary>
        <p className="mt-2 text-xs leading-5 text-slate-600">Só mude para “Faturado pela ConnectyHub” depois de compartilhar a linha de crédito (Solution Partner ou parceiro) com a conta WhatsApp (WABA) do número. Antes disso, a Meta continua cobrando o cartão do cliente e ele pagaria duas vezes.</p>
        <ul className="mt-2 space-y-3 text-sm">{data.senders.map((s) => {
          const mode = metaBillingMode(s.billing_mode);
          return <li key={s.phone_number_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
            <span><strong>{s.organization}</strong> · {s.verified_name ?? ""} {s.display_phone}<br /><span className="text-xs text-slate-500">WABA {s.waba_id} · {META_BILLING_MODE_LABELS[mode]}</span></span>
            {mode === "customer_meta"
              ? <button type="button" disabled={busy} className={button} onClick={() => { if (window.confirm(`Confirmar que a linha de crédito da ConnectyHub já foi compartilhada com a WABA ${s.waba_id}? A partir daqui, cada mensagem cobrada pela Meta será debitada do saldo de ${s.organization}.`)) void post({ action: "billing_mode", phoneNumberId: s.phone_number_id, mode: "connectyhub_credit_line", confirmCreditLine: true }, "Número passou a ser faturado pela ConnectyHub."); }}>Faturar pela ConnectyHub</button>
              : <button type="button" disabled={busy} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold" onClick={() => { if (window.confirm("Voltar este número para cobrança direta da Meta ao cliente?")) void post({ action: "billing_mode", phoneNumberId: s.phone_number_id, mode: "customer_meta" }, "Número voltou para cobrança direta da Meta."); }}>Voltar para cobrança da Meta</button>}
          </li>;
        })}{!data.senders.length ? <li className="text-slate-500">Nenhum número oficial conectado.</li> : null}</ul>
      </details>

      <details>
        <summary className="cursor-pointer font-semibold">Tarifas vigentes</summary>
        <table className="mt-2 w-full text-left text-sm"><thead><tr className="text-xs text-slate-500"><th className="py-1">Mercado</th><th>Categoria</th><th>Custo Meta</th><th>×</th><th>Cliente paga</th><th>Desde</th></tr></thead>
          <tbody>{current.map((r) => <tr key={r.id} className="border-t border-slate-100"><td className="py-1">{r.market}</td><td>{META_MESSAGE_CATEGORY_LABELS[r.category] ?? r.category}</td><td>{formatBrl(r.provider_cost_brl, true)}</td><td>{Number(r.multiplier)}</td><td>{formatBrl(r.customer_price_brl, true)}</td><td>{new Date(r.effective_from).toLocaleDateString("pt-BR")}</td></tr>)}</tbody></table>
        <form className="mt-3 grid gap-2 sm:grid-cols-5" onSubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); void post({ action: "rate", market: f.get("market"), category: f.get("category"), providerCostBrl: f.get("cost"), multiplier: f.get("multiplier"), effectiveFrom: f.get("from"), source: f.get("source") }, "Tarifa registrada. Envios a partir da vigência usam o novo preço."); }}>
          <input name="market" defaultValue="BR" maxLength={2} className={field} aria-label="Mercado" />
          <select name="category" className={field} aria-label="Categoria">{["marketing", "utility", "authentication", "service"].map((c) => <option key={c} value={c}>{META_MESSAGE_CATEGORY_LABELS[c]}</option>)}</select>
          <input name="cost" type="number" step="0.000001" min={0} required placeholder="Custo Meta (R$)" className={field} aria-label="Custo Meta em reais" />
          <input name="multiplier" type="number" step="0.001" min={1} defaultValue={2} className={field} aria-label="Multiplicador" />
          <input name="from" type="datetime-local" required className={field} aria-label="Início da vigência" />
          <input name="source" placeholder="Fonte (ex.: tabela Meta jan/2027)" className={`${field} sm:col-span-4`} aria-label="Fonte" />
          <button disabled={busy} className={button}>Registrar tarifa</button>
        </form>
      </details>

      <details>
        <summary className="cursor-pointer font-semibold">Ajuste manual de saldo</summary>
        <form className="mt-2 grid gap-2 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); if (window.confirm("Creditar este valor no saldo do WhatsApp oficial da empresa?")) void post({ action: "adjustment", organizationId: f.get("org"), amountBrl: f.get("amount"), reason: f.get("reason") }, "Saldo creditado."); }}>
          <select name="org" required className={field} aria-label="Empresa">{[...new Map(data.senders.map((s) => [s.organization_id, s.organization])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          <input name="amount" type="number" step="0.01" min={0.01} required placeholder="Valor (R$)" className={field} aria-label="Valor" />
          <input name="reason" required minLength={5} placeholder="Motivo" className={field} aria-label="Motivo" />
          <button disabled={busy || !data.senders.length} className={button}>Creditar</button>
        </form>
      </details>
    </>}
  </section>;
}
