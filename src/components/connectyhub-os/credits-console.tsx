"use client";

import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { CreditExplainer, formatPreciseCredits } from "./credit-explainer";

type Pack = { id: string; name: string; amount: number; credits: number };
type Card = { id: string; created_at: string; brand: string | null; last_digits: string | null };
export type CreditsData = {
  packs: Pack[];
  cards: Card[];
  wallet: { balance_credits: number; reserved_credits: number } | null;
  canAuthorize: boolean;
  alerts: { absolute_low: number | null; absolute_critical: number | null } | null;
  policy: { enabled: boolean; product_id: string; card_method_id: string; threshold_credits: number; monthly_cap_brl: number; agreed_amount_brl: number; agreed_credits: number; authorized_at: string } | null;
  runs: Array<{ id: string; amount_brl: number; credits: number; created_at: string; billing_card_attempts: { state: string } }>;
};
const money = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const field = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900";
const button = "min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50";
const panel = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
export const billingCardLabel = (card: Card) => `${card.brand?.toUpperCase() ?? "Cartão"} •••• ${card.last_digits ?? "identificação indisponível"}`;

export function CreditsConsole({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<CreditsData | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const requestVersion = useRef(0);
  const locked = useRef(false);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    const response = await fetch("/api/dashboard/credits", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw Error(result.error ?? "Não foi possível carregar os créditos.");
    if (version === requestVersion.current) setData(result);
  }, []);
  useEffect(() => {
    const refresh = () => { void load().catch(error => setNotice(error.message)); };
    refresh();
    window.addEventListener("connectyhub:billing-refresh", refresh);
    window.addEventListener("focus", refresh);
    // Request sequence counter; invalidates pending loads on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { requestVersion.current++; window.removeEventListener("connectyhub:billing-refresh", refresh); window.removeEventListener("focus", refresh); };
  }, [load]);
  async function save(body: Record<string, unknown>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/dashboard/credits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      await load(); setEditing(false);
      setNotice(body.action === "alerts" ? "Avisos de saldo salvos." : body.enabled ? "Recarga automática autorizada. Confira o cartão e os limites abaixo." : "Recarga automática desativada.");
      window.dispatchEvent(new Event("connectyhub:billing-refresh"));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível salvar. Atualize para conferir a autorização."); }
    finally { locked.current = false; setBusy(false); }
  }
  async function buy(id: string) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/dashboard/meus-produtos/comprar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: id }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      window.location.assign(result.checkoutUrl);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível preparar a compra."); locked.current = false; setBusy(false); }
  }
  return <section id="creditos-recargas" className={embedded ? "space-y-4 text-slate-900" : "mx-auto max-w-5xl space-y-6 text-slate-900"}>
    <div>{embedded ? <h2 className="text-xl font-bold">Créditos e recargas</h2> : <h1 className="text-3xl font-bold">Créditos e recargas</h1>}<p className="mt-2 text-sm leading-6 text-slate-600">Recargas adicionam saldo para IA e voz. São independentes da cobrança da mensalidade e não alteram seu plano.</p></div>
    {notice ? <p role="status" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-950">{notice}</p> : null}
    {!data ? <p role="status">Carregando saldo e autorizações…</p> : <>
      {!embedded ? <><section className={panel}><p className="text-sm text-slate-600">Disponível agora</p><p className="mt-2 text-4xl font-bold text-blue-800">{formatPreciseCredits(Math.max(0, Number(data.wallet?.balance_credits ?? 0) - Number(data.wallet?.reserved_credits ?? 0)))}</p><p className="mt-2 text-xs text-slate-500">{formatPreciseCredits(Number(data.wallet?.reserved_credits ?? 0))} reservados em chamadas</p><a href="/dashboard/minha-conta#metodos-pagamento" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline">Gerenciar cartões em Minha Conta</a></section><CreditExplainer /></> : null}
      <section className={panel} aria-labelledby="automatic-topup-title">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="automatic-topup-title" className="text-lg font-bold">Recarga automática de créditos</h3><span className={`rounded-full px-3 py-1 text-sm font-semibold ${data.policy?.enabled ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>{data.policy?.enabled ? "Ativada" : "Desativada"}</span></div>
        <TopupSummary data={data} />
        {data.policy?.enabled && data.canAuthorize ? <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={busy} className={button} onClick={() => setEditing(value => !value)}>{editing ? "Fechar edição" : "Alterar recarga"}</button><button type="button" disabled={busy} className="min-h-11 px-3 text-sm font-semibold text-rose-700 underline" onClick={() => void save({ enabled: false })}>Desativar recarga automática</button></div> : null}
        {!data.canAuthorize ? <p className="mt-3 text-sm text-slate-600">Somente o titular da conta pode autorizar ou alterar a recarga automática e os avisos de saldo.</p> : !data.cards.length ? <p className="mt-3 text-sm leading-6">Adicione um cartão em <a className="font-semibold text-blue-700 underline" href={embedded ? "#metodos-pagamento" : "/dashboard/minha-conta#metodos-pagamento"}>Métodos de pagamento</a> para autorizar recargas.</p> : !data.packs.length ? <p className="mt-3 text-sm">Nenhum pacote disponível para uma nova autorização.</p> : (!data.policy?.enabled || editing) ? <TopupForm key={`${data.policy?.authorized_at ?? "new"}:${data.cards.map(card => card.id).join()}`} data={data} busy={busy} onSave={save} /> : null}
      </section>
      <details className={panel}>
        <summary className="cursor-pointer text-lg font-bold">Comprar créditos agora</summary>
        <p className="my-3 text-sm text-slate-600">Compra avulsa. Escolha um pacote e confira a forma de pagamento no checkout.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.packs.map(pack => <article key={pack.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">{pack.name}</h3><p className="text-xl font-bold">{formatPreciseCredits(pack.credits)} <span className="text-sm font-normal">créditos</span></p><p className="text-sm">{money(pack.amount)} · pagamento único</p><button type="button" disabled={busy} onClick={() => void buy(pack.id)} className={`${button} mt-auto`}>Comprar pacote</button></article>)}</div>
        {!data.packs.length ? <p className="text-sm">Não há pacotes publicados neste momento.</p> : null}
      </details>
      <details className={panel}>
        <summary className="cursor-pointer text-lg font-bold">Avisos de saldo no WhatsApp</summary>
        <p className="my-3 text-sm leading-6 text-slate-600">Avisos em 20%, 10% e ao zerar, sobre a referência de saldo atualizada após recargas. Você pode substituir os percentuais por quantidades de créditos. Os avisos seguem a preferência de notificações da sua conta.</p>
        <p className="mb-3 text-sm font-semibold">Primeiro aviso: {data.alerts?.absolute_low != null ? `${formatPreciseCredits(data.alerts.absolute_low)} créditos` : "20%"} · Aviso crítico: {data.alerts?.absolute_critical != null ? `${formatPreciseCredits(data.alerts.absolute_critical)} créditos` : "10%"}</p>
        {data.canAuthorize ? <form key={`${data.alerts?.absolute_low}:${data.alerts?.absolute_critical}`} className="grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const values = new FormData(event.currentTarget); void save({ action: "alerts", low: values.get("low"), critical: values.get("critical") }); }}>
          <label className="space-y-2 text-sm">Primeiro aviso<input name="low" type="number" min={0} step="0.01" defaultValue={data.alerts?.absolute_low ?? ""} placeholder="Automático: 20%" className={field} disabled={busy} /></label>
          <label className="space-y-2 text-sm">Aviso crítico<input name="critical" type="number" min={0} step="0.01" defaultValue={data.alerts?.absolute_critical ?? ""} placeholder="Automático: 10%" className={field} disabled={busy} /></label>
          <button disabled={busy} className={button}>Salvar avisos de saldo</button>
        </form> : null}
      </details>
      {data.runs.length ? <details className={panel}><summary className="cursor-pointer font-bold">Recargas automáticas recentes</summary>{data.runs.map(run => <p key={run.id} className="mt-3 text-sm">{new Date(run.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {money(run.amount_brl)} · {formatPreciseCredits(Number(run.credits))} créditos · {({ approved: "Aprovada", rejected: "Recusada", processing: "Em processamento", pending: "Pendente", unknown: "Em conferência", error: "Falha", cancelled: "Cancelada", refunded: "Estornada" } as Record<string, string>)[run.billing_card_attempts?.state] ?? "Em conferência"}</p>)}</details> : null}
    </>}
  </section>;
}

export function TopupSummary({ data }: { data: CreditsData }) {
  const policy = data.policy;
  if (!policy?.enabled) return <p className="mt-3 text-sm leading-6 text-slate-600">Nenhuma compra automática de créditos está autorizada. Salvar um cartão não ativa a recarga.</p>;
  const card = data.cards.find(item => item.id === policy.card_method_id);
  return <div className="mt-3 rounded-lg bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
    <p className="font-semibold">{card ? billingCardLabel(card) : "Cartão da autorização indisponível — confira os métodos de pagamento"}</p>
    <p>Comprar {formatPreciseCredits(Number(policy.agreed_credits))} créditos por {money(policy.agreed_amount_brl)} quando o saldo chegar a {formatPreciseCredits(Number(policy.threshold_credits))} créditos ou menos.</p>
    <p>Teto de compras: <strong>{money(policy.monthly_cap_brl)} por mês</strong>. A recarga só ocorre dentro desse limite.</p>
    <p className="mt-2 text-xs">Autorização salva em {new Date(policy.authorized_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Permanece ativa ao sair ou atualizar a página; uma recusa do cartão a desativa.</p>
  </div>;
}

function TopupForm({ data, busy, onSave }: { data: CreditsData; busy: boolean; onSave: (body: Record<string, unknown>) => Promise<void> }) {
  const [packId, setPackId] = useState(data.packs.some(pack => pack.id === data.policy?.product_id) ? data.policy!.product_id : data.packs[0].id);
  const pack = data.packs.find(item => item.id === packId)!;
  const [cap, setCap] = useState(String(data.policy?.monthly_cap_brl ?? pack.amount));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    void onSave({ enabled: true, product_id: pack.id, amount_brl: pack.amount, credits: pack.credits, card_method_id: values.get("card"), threshold_credits: Number(values.get("threshold")), monthly_cap_brl: Number(values.get("cap")), consent_version: "credit_topup_v1" });
  }
  return <form onSubmit={submit} className="mt-4">
    <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
      <label className="space-y-2 text-sm">Pacote<select value={packId} onChange={event => { setPackId(event.target.value); const next = data.packs.find(item => item.id === event.target.value)!; setCap(value => String(Math.max(Number(value), next.amount))); }} className={field}>{data.packs.map(item => <option key={item.id} value={item.id}>{item.name} · {money(item.amount)}</option>)}</select></label>
      <label className="space-y-2 text-sm">Cartão para a recarga<select name="card" defaultValue={data.cards.some(card => card.id === data.policy?.card_method_id) ? data.policy!.card_method_id : data.cards[0].id} className={field}>{data.cards.map(card => <option key={card.id} value={card.id}>{billingCardLabel(card)}</option>)}</select></label>
      <label className="space-y-2 text-sm">Recarregar quando o saldo chegar a<input required name="threshold" type="number" min={0} max={pack.credits - 1} defaultValue={data.policy?.threshold_credits ?? 100} className={field} /><span className="text-xs text-slate-500">Quantidade de créditos restantes</span></label>
      <label className="space-y-2 text-sm">Teto de compras por mês (R$)<input required name="cap" type="number" step="0.01" min={pack.amount} max={100000} value={cap} onChange={event => setCap(event.target.value)} className={field} /></label>
      <p className="text-sm leading-6 text-slate-600 md:col-span-2">No máximo uma tentativa por hora, dentro do teto mensal. Pagamentos em conferência impedem uma nova recarga.</p>
      <label className="flex items-start gap-3 text-sm leading-6 md:col-span-2"><input required type="checkbox" className="mt-1 size-5 shrink-0" />Autorizo compras automáticas de {formatPreciseCredits(pack.credits)} créditos por {money(pack.amount)}, no cartão escolhido e dentro do teto mensal informado. A primeira recarga poderá ocorrer após salvar se o saldo já estiver no limite. Posso desativar a qualquer momento. Mudanças de preço exigem nova autorização.</label>
      <button className={button}>{busy ? "Salvando…" : "Autorizar recarga automática"}</button>
    </fieldset>
  </form>;
}
