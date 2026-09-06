"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { parseCheckoutCard, type CheckoutCardHolder } from "@/lib/sales-catalog/card-input";
import type { CardPaymentStatusChange } from "@/components/checkout/mercado-pago-card-brick";

type Quote = { amount: number; recurringAmount: number; recurrenceLabel: string; revision: number; holder: CheckoutCardHolder; paid: boolean; attempt: { id: string; state: string } | null };
const money = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const field = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950 focus:outline-blue-500";

export function BillingAsaasCardForm({ subscriptionId, cartSyncing, onBusyChange, onStatusChange }: { subscriptionId: string; cartSyncing: boolean; onBusyChange: (busy: boolean) => void; onStatusChange: (result: CardPaymentStatusChange) => void }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [holder, setHolder] = useState<CheckoutCardHolder | null>(null);
  const [editHolder, setEditHolder] = useState(false);
  const [sending, setSending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const locked = useRef(false);
  const waiting = uncertain || Boolean(quote?.attempt && ["processing", "unknown", "pending"].includes(quote.attempt.state));
  const busy = sending || waiting;
  const endpoint = `/api/dashboard/billing/checkout/${subscriptionId}/card`;
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" }); const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Não foi possível conferir o pagamento.");
    const next = data as Quote; setQuote(next); setHolder(current => current ?? next.holder); setUncertain(false); return next;
  }, [endpoint]);
  useEffect(() => { if (cartSyncing) return; const timer = setTimeout(() => { void load().catch(e => setMessage(e.message)); }, 0); return () => clearTimeout(timer); }, [cartSyncing, load]);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load().then(next => {
      if (next.paid) onStatusChange(statusChange("approved"));
    }).catch(() => null); }, 15000);
    return () => clearInterval(timer);
  }, [waiting, load, onStatusChange]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked.current || busy || cartSyncing || !quote || !holder) return;
    const form = new FormData(event.currentTarget); const expiry = String(form.get("expiry") ?? "").split("/");
    let card;
    try { card = parseCheckoutCard({ number: form.get("number"), holderName: form.get("holderName"), expiryMonth: expiry[0], expiryYear: expiry[1], ccv: form.get("ccv") }); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Confira o cartão."); return; }
    locked.current = true; setSending(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: crypto.randomUUID(), amount: quote.amount, revision: quote.revision, card, holder, acceptRecurring: form.get("recurring") === "on" }) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error ?? "Não foi possível concluir o pagamento."); await load(); return; }
      setMessage(data.message ?? "Pagamento em conferência.");
      await load();
      onStatusChange(statusChange(data.status, data.providerPaymentId));
    } catch { setUncertain(true); setMessage("A conexão foi interrompida. Estamos verificando o resultado; não repita a cobrança."); }
    finally { for (const name of ["number", "holderName", "expiry", "ccv"]) { const input = formRef.current?.elements.namedItem(name); if (input instanceof HTMLInputElement) input.value = ""; } locked.current = false; setSending(false); }
  }
  if (!quote || !holder) return <p role="status" className="mt-4 text-sm text-slate-200">{message || "Conferindo seu pagamento…"}</p>;
  if (quote.paid) return <p role="status" className="mt-4 text-emerald-200">Pagamento confirmado. Seu plano está sendo atualizado.</p>;
  const needsHolder = editHolder || !quote.holder.name || !quote.holder.email || !quote.holder.cpfCnpj || !quote.holder.phone || !quote.holder.postalCode || !quote.holder.addressNumber;
  return <form ref={formRef} onSubmit={submit} data-sensitive="payment" className="mt-4 space-y-4 rounded-xl bg-white p-4 text-slate-900">
    <div><h3 className="font-bold">Pague aqui no painel</h3><p className="mt-1 text-xs text-slate-600">Hoje: {money(quote.amount)}. {quote.recurringAmount > 0 ? `Renovação ${quote.recurrenceLabel.toLowerCase()}: ${money(quote.recurringAmount)}. Adicionais avulsos não entram nas renovações.` : "Pagamento único, sem renovação automática."}</p></div>
    {waiting ? <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm">Estamos conferindo o resultado do pagamento. Você receberá a atualização pelo WhatsApp.</p> : <fieldset disabled={sending || cartSyncing} className="space-y-3">
      <div className="rounded-lg bg-slate-50 p-3 text-xs"><strong>{holder.name}</strong><p>{holder.email}</p><button type="button" className="mt-2 text-blue-700 underline" onClick={() => setEditHolder(!editHolder)}>Conferir dados do titular</button></div>
      {needsHolder ? <div className="grid gap-3 sm:grid-cols-2">{([{ key: "name", label: "Nome completo" }, { key: "email", label: "E-mail" }, { key: "cpfCnpj", label: "CPF/CNPJ" }, { key: "phone", label: "Telefone" }, { key: "postalCode", label: "CEP" }, { key: "addressNumber", label: "Número do endereço" }] as const).filter(f => editHolder || !quote.holder[f.key]).map(f => <label key={f.key} className="text-xs font-semibold">{f.label}<input className={field} required value={holder[f.key]} type={f.key === "email" ? "email" : "text"} onChange={e => setHolder({ ...holder, [f.key]: e.target.value })} /></label>)}</div> : null}
      <label className="block text-xs font-semibold">Número do cartão<input name="number" required inputMode="numeric" autoComplete="cc-number" maxLength={23} placeholder="0000 0000 0000 0000" className={field} /></label>
      <label className="block text-xs font-semibold">Nome impresso no cartão<input name="holderName" required autoComplete="cc-name" className={field} /></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold">Validade<input name="expiry" required inputMode="numeric" autoComplete="cc-exp" maxLength={7} placeholder="MM/AA" className={field} onChange={e => { const digits = e.target.value.replace(/\D/g, "").slice(0, 6); e.target.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits; }} /></label><label className="text-xs font-semibold">Código de segurança<input name="ccv" required type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} placeholder="CVV" className={field} /></label></div>
      {quote.recurringAmount > 0 ? <label className="flex items-start gap-2 text-xs leading-5"><input name="recurring" type="checkbox" required className="mt-1" />Autorizo o pagamento de {money(quote.amount)} e a renovação {quote.recurrenceLabel.toLowerCase()} de {money(quote.recurringAmount)} enquanto o contrato estiver ativo.</label> : null}
      <button disabled={sending || cartSyncing} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 font-bold text-white disabled:opacity-60"><LockKeyhole size={16} />{sending ? "Processando…" : `Pagar ${money(quote.amount)}`}</button>
    </fieldset>}
    {message ? <p role="status" className="rounded-lg bg-slate-50 p-3 text-sm">{message}</p> : null}
  </form>;
}

function statusChange(state: string, paymentId: string | null = null): CardPaymentStatusChange {
 const rejected = ["rejected", "error", "cancelled"].includes(state);
 return { status: state === "unknown" ? "in_process" : state, providerStatus: state, providerStatusDetail: null, providerPaymentId: paymentId, checkoutUrl: null, approved: state === "approved", rejected, pending: !rejected && state !== "approved", hasThreeDSChallenge: false, rejection: null };
}
