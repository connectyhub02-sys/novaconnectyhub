"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Sparkles } from "lucide-react";
import { formatPreciseCredits } from "./credit-explainer";
import { MetaPaymentNotice } from "./meta-payment-notice";
import { META_MESSAGE_CATEGORY_HINTS, META_MESSAGE_CATEGORY_LABELS, formatBrl } from "@/lib/meta/message-billing-policy";

type Summary = {
  wallet: { balance_brl: number; reserved_brl: number; debt_brl: number } | null;
  shared_wallet: boolean;
  senders: Array<{ phone_number_id: string; display_phone: string; verified_name: string | null; billing_mode: string }>;
  rates: Array<{ market: string; category: string; customer_price_brl: number }>;
  month: Array<{ category: string; status: string; messages: number; charged_brl: number }>;
  ledger: Array<{ id: string; entry_type: string; amount_brl: number; balance_after_brl: number; description: string; created_at: string }>;
  packages: Array<{ id: string; name: string; amount_brl: number }>;
  aiCredits: { balance_credits: number; reserved_credits: number } | null;
};

const panel = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
const button = "min-h-11 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";
const rateOrder = ["marketing", "utility", "authentication", "service"];
const entryLabel: Record<string, string> = { topup: "Recarga", charge: "Mensagem entregue", debt: "Diferença pendente", adjustment: "Ajuste" };
const date = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

// Two separate balances: AI credits (units) and the official WhatsApp balance (BRL).
export function MessageBalanceConsole() {
  const [data, setData] = useState<Summary | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/dashboard/message-balance", { cache: "no-store" });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error);
    setData(value);
  }, []);
  useEffect(() => {
    const refresh = () => { void load().catch((error) => setNotice(error instanceof Error ? error.message : "Não foi possível carregar os saldos.")); };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);

  async function buy(id: string) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/dashboard/meus-produtos/comprar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: id }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      window.location.assign(result.checkoutUrl);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível preparar a recarga."); locked.current = false; setBusy(false); }
  }

  const wallet = data?.wallet;
  const available = wallet ? Math.max(0, Number(wallet.balance_brl) - Number(wallet.reserved_brl)) : 0;
  const aiAvailable = data?.aiCredits ? Math.max(0, Number(data.aiCredits.balance_credits) - Number(data.aiCredits.reserved_credits)) : 0;
  const billedSenders = data?.senders.filter((s) => s.billing_mode === "connectyhub_credit_line") ?? [];
  const metaSenders = data?.senders.filter((s) => s.billing_mode !== "connectyhub_credit_line") ?? [];
  const rates = (data?.rates ?? []).filter((r) => r.market === "BR").sort((a, b) => rateOrder.indexOf(a.category) - rateOrder.indexOf(b.category));
  // Top-ups only make sense once a number is billed through ConnectyHub (or money is already there).
  const usesWallet = billedSenders.length > 0 || Number(wallet?.balance_brl ?? 0) > 0 || Number(wallet?.debt_brl ?? 0) > 0;
  const monthCharged = (data?.month ?? []).filter((m) => m.status === "charged");
  const monthFree = (data?.month ?? []).filter((m) => m.status === "free").reduce((sum, m) => sum + Number(m.messages), 0);
  const monthTotal = monthCharged.reduce((sum, m) => sum + Number(m.charged_brl), 0);

  return <section className="space-y-6 text-slate-900">
    <div>
      <h1 className="text-3xl font-bold">Saldo e créditos</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Sua conta tem dois saldos separados. Um não paga o outro: créditos de IA não pagam mensagens do WhatsApp oficial, e o saldo do WhatsApp oficial não paga IA.</p>
    </div>
    {notice ? <p role="status" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-950">{notice}</p> : null}
    <div className="grid gap-4 md:grid-cols-2">
      <a href="#creditos-recargas" className={`${panel} block border-l-4 border-l-blue-600 hover:border-slate-300`}>
        <p className="flex items-center gap-2 text-sm font-semibold text-blue-800"><Sparkles size={18} aria-hidden /> Créditos de IA</p>
        <p className="mt-3 text-3xl font-bold">{data ? formatPreciseCredits(aiAvailable) : "…"} <span className="text-base font-normal text-slate-600">créditos</span></p>
        <p className="mt-1 text-xs text-slate-500">disponíveis{data && Number(data.aiCredits?.reserved_credits ?? 0) > 0 ? ` · ${formatPreciseCredits(Number(data.aiCredits?.reserved_credits))} reservados em operações em andamento (saldo total ${formatPreciseCredits(Number(data.aiCredits?.balance_credits ?? 0))})` : ""}</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">Usados pelos agentes, respostas automáticas, voz e API de IA.</p>
      </a>
      <a href="#saldo-whatsapp" className={`${panel} block border-l-4 border-l-emerald-600 hover:border-slate-300`}>
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><MessageCircle size={18} aria-hidden /> Saldo WhatsApp oficial</p>
        <p className="mt-3 text-3xl font-bold">{data ? formatBrl(available) : "…"}</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{usesWallet ? "Em reais. Usado nas mensagens enviadas pela API oficial da Meta, cobradas só quando entregues." : "Em reais. Ainda não está em uso: hoje a Meta cobra as mensagens oficiais no seu cartão."}</p>
      </a>
    </div>

    <section id="saldo-whatsapp" className={`${panel} scroll-mt-24 space-y-5`} aria-labelledby="saldo-whatsapp-title">
      <div>
        <h2 id="saldo-whatsapp-title" className="text-xl font-bold">Saldo WhatsApp oficial</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{usesWallet ? "Você recarrega aqui e as mensagens da API oficial são descontadas deste saldo. Não é preciso cadastrar cartão na Meta para os números faturados pela ConnectyHub." : "Hoje as mensagens da API oficial são cobradas pela Meta, no cartão cadastrado na sua conta da Meta. Este saldo em reais será usado quando o faturamento passar para a ConnectyHub; até lá, não é preciso recarregar."}</p>
      </div>
      {!data ? <p role="status">Carregando saldo…</p> : <>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-emerald-50 p-4"><dt className="text-xs text-emerald-900">Disponível</dt><dd className="mt-1 text-2xl font-bold text-emerald-950">{formatBrl(available)}</dd></div>
          <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs text-slate-600">Reservado em envios</dt><dd className="mt-1 text-2xl font-bold">{formatBrl(wallet?.reserved_brl ?? 0)}</dd><p className="mt-1 text-xs text-slate-500">Volta ao saldo se a mensagem não for entregue.</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs text-slate-600">Gasto neste mês</dt><dd className="mt-1 text-2xl font-bold">{formatBrl(monthTotal)}</dd><p className="mt-1 text-xs text-slate-500">{monthCharged.reduce((s, m) => s + Number(m.messages), 0)} cobradas · {monthFree} gratuitas</p></div>
        </dl>
        {Number(wallet?.debt_brl ?? 0) > 0 ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900">Há uma diferença pendente de {formatBrl(wallet!.debt_brl, true)}: a Meta cobrou uma categoria mais cara que a prevista. A próxima recarga regulariza e os envios voltam a funcionar.</p> : null}
        {data.shared_wallet ? <p className="text-sm text-slate-600">Este saldo é compartilhado com a empresa responsável pela cobrança da sua conta.</p> : null}

        <div>
          <h3 className="font-semibold">Seus números oficiais</h3>
          {!data.senders.length ? <p className="mt-2 text-sm text-slate-600">Nenhum número da API oficial conectado. Conecte em Integrações.</p> : <ul className="mt-2 space-y-2 text-sm">
            {billedSenders.map((s) => <li key={s.phone_number_id} className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">Faturado pela ConnectyHub</span>{s.verified_name ?? s.display_phone} · {s.display_phone}</li>)}
            {metaSenders.map((s) => <li key={s.phone_number_id}><span className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Cobrado pela Meta</span>{s.verified_name ?? s.display_phone} · {s.display_phone}</span><MetaPaymentNotice compact url={`/api/dashboard/integrations/meta/whatsapp?payment=${encodeURIComponent(s.phone_number_id)}`} /></li>)}
          </ul>}
          {metaSenders.length ? <p className="mt-2 text-xs leading-5 text-slate-500">Números “Cobrado pela Meta” usam o cartão cadastrado na sua conta da Meta e não descontam deste saldo.</p> : null}
        </div>

        <div>
          <h3 className="font-semibold">{usesWallet ? "Quanto custa cada mensagem entregue" : "Preço por mensagem entregue quando o faturamento for pela ConnectyHub"}</h3>
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[28rem] text-left text-sm">
            <thead><tr className="text-xs text-slate-500"><th className="py-2 pr-3 font-medium">Tipo</th><th className="py-2 pr-3 font-medium">Quando é usado</th><th className="py-2 font-medium">Preço (Brasil)</th></tr></thead>
            <tbody>{rates.map((r) => <tr key={r.category} className="border-t border-slate-100"><td className="py-2 pr-3 font-semibold">{META_MESSAGE_CATEGORY_LABELS[r.category] ?? r.category}</td><td className="py-2 pr-3 text-slate-600">{META_MESSAGE_CATEGORY_HINTS[r.category] ?? ""}</td><td className="py-2">{formatBrl(r.customer_price_brl, true)}</td></tr>)}</tbody>
          </table></div>
          <p className="mt-2 text-xs leading-5 text-slate-500">Grátis: mensagens que a Meta não cobra, como as primeiras 1.000 respostas de atendimento do mês por número e as conversas iniciadas por anúncios que levam ao WhatsApp. Mensagens não entregues não são cobradas.</p>
        </div>

        {usesWallet ? <div>
          <h3 className="font-semibold">Recarregar</h3>
          {data.packages.length ? <div className="mt-2 flex flex-wrap gap-3">{data.packages.map((p) => <button key={p.id} type="button" disabled={busy} className={button} onClick={() => void buy(p.id)}>{formatBrl(p.amount_brl)}</button>)}</div> : <p className="mt-2 text-sm text-slate-600">Recargas indisponíveis no momento.</p>}
          <p className="mt-2 text-xs text-slate-500">Pagamento por Pix ou cartão no checkout. O valor entra integralmente no saldo após a confirmação.</p>
        </div> : null}

        <details>
          <summary className="cursor-pointer font-semibold">Extrato</summary>
          {!data.ledger.length ? <p className="mt-2 text-sm text-slate-600">Nenhuma movimentação ainda.</p> : <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {data.ledger.map((entry) => <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-2"><span><strong>{entryLabel[entry.entry_type] ?? entry.entry_type}</strong> · {entry.description} · <span className="text-slate-500">{date(entry.created_at)}</span></span><span className={Number(entry.amount_brl) > 0 ? "font-semibold text-emerald-800" : "font-semibold"}>{Number(entry.amount_brl) > 0 ? "+" : ""}{formatBrl(entry.amount_brl, true)}</span></li>)}
          </ul>}
        </details>
      </>}
    </section>
  </section>;
}
