"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, Clock3, Loader2, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { parseCheckoutCard, type CheckoutCardHolder } from "@/lib/sales-catalog/card-input";
import { publishCommerceAgentEvent } from "@/lib/commerce-agent/client-events";
import { detectCheckoutCardBrand, type CheckoutCardBrand } from "@/lib/sales-catalog/card-brand";
import { PaymentBrandBadge } from "./payment-brand-badge";

type Quote = { amount: number; revision: number; holder: CheckoutCardHolder; maxInstallments: number; enabled: boolean; paid: boolean; closed: boolean; attempt: { id: string; state: string } | null; shipping: number };
type Props = { sessionId: string; selectedOrderBumpIds: string[]; externalBusy?: boolean; offers?: ReactNode; onBusyChange: (busy: boolean) => void; onApproved: () => void };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const inputClass = "mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50";

export function AsaasCardForm({ sessionId, selectedOrderBumpIds, externalBusy = false, offers, onBusyChange, onApproved }: Props) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [differentHolder, setDifferentHolder] = useState(false);
  const [holder, setHolder] = useState<CheckoutCardHolder | null>(null);
  const [installments, setInstallments] = useState(1);
  const [cardBrand, setCardBrand] = useState<CheckoutCardBrand | null>(null);
  const attemptId = useRef<string | null>(null);
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const busy = sending || waiting || externalBusy;
  const selectedKey = selectedOrderBumpIds.join(",");

  const loadQuote = useCallback(async () => {
    const response = await fetch(`/api/checkout/${sessionId}/card`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Não foi possível conferir seu pedido.");
    const next = data as Quote;
    setQuote(next);
    setHolder(current => current ?? next.holder);
    setWaiting(Boolean(next.attempt && ["processing", "unknown", "pending"].includes(next.attempt.state)));
    return next;
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(loadQuote).catch(error => { if (active) setMessage(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadQuote, selectedKey]);

  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") loadQuote().then(next => { if (next.paid) onApproved(); }).catch(() => null); }, 15000);
    return () => clearInterval(timer);
  }, [waiting, loadQuote, onApproved]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || busy || !quote) return;
    const form = new FormData(event.currentTarget);
    let card;
    let paymentRequested = false;
    try {
      const expiry = String(form.get("expiry") ?? "").split("/");
      card = parseCheckoutCard({ number: form.get("card-number"), holderName: form.get("card-name"), expiryMonth: expiry[0], expiryYear: expiry[1], ccv: form.get("card-code") });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Confira os dados do cartão."); return; }
    submitting.current = true;
    setSending(true);
    setMessage(null);
    try {
      // The server commits offers and freight first. A changed total requires a new explicit confirmation.
      {
        const response = await fetch(`/api/checkout/${sessionId}/cart`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedOrderBumpIds, revision: quote.revision }) });
        const cart = await response.json();
        if (!response.ok) throw new Error(cart.error ?? "Não foi possível atualizar as ofertas.");
        const next = await loadQuote();
        if (next.amount !== quote.amount || next.revision !== quote.revision) {
          router.refresh();
          setMessage("Pedido atualizado com as ofertas e o frete. Confira o total e confirme o pagamento.");
          return;
        }
      }
      attemptId.current ??= crypto.randomUUID();
      publishCommerceAgentEvent("card_payment_submitted", { session_id: sessionId, amount: quote.amount, installments });
      paymentRequested = true;
      const response = await fetch(`/api/checkout/${sessionId}/card`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: attemptId.current, revision: quote.revision, amount: quote.amount, card, differentHolder, ...(differentHolder ? { holder } : {}), installments }),
      });
      // PAN/CVV remain only in the form/request lifetime; never attach them to events or storage.
      formRef.current?.reset();
      const result = await response.json();
      if (!response.ok) { await loadQuote(); throw new Error(result.error ?? "Não foi possível continuar o pagamento."); }
      setMessage(result.message);
      setWaiting(!result.approved && !result.rejected);
      if (result.rejected) attemptId.current = null;
      const next = await loadQuote();
      if (result.approved || next.paid) onApproved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Estamos verificando o pagamento. Atualize o pedido antes de tentar novamente.");
      await loadQuote().catch(() => setWaiting(true));
    } finally {
      if (paymentRequested) formRef.current?.reset();
      card = undefined;
      submitting.current = false;
      setSending(false);
    }
  }

  if (loading) return <p className="mt-5 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Conferindo seu pedido…</p>;
  if (quote?.paid) return <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 className="mb-2 h-6 w-6" /><p className="font-bold">Pagamento aprovado!</p><p className="mt-1 text-sm">Seu pedido está confirmado. Você acompanha os próximos passos pelo WhatsApp.</p></div>;
  if (quote?.closed) return <p className="mt-4 text-sm">Este pedido foi encerrado. Continue pelo WhatsApp para fazer um novo pedido.</p>;
  if (quote && !quote.enabled && !waiting) return <p role="status" className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">O cartão está temporariamente indisponível. Continue pelo WhatsApp para combinar o pagamento com a loja.</p>;
  if (!quote) return <div role="alert" className="mt-4 text-sm text-rose-700">{message}<button type="button" className="mt-3 block underline" onClick={() => loadQuote().catch(error => setMessage(error.message))}>Conferir pedido novamente</button></div>;

  return <form ref={formRef} onSubmit={submit} onReset={() => setCardBrand(null)} aria-label="Pagar com cartão de crédito" data-sensitive="payment" autoComplete="on" className="mt-3 space-y-3">
    {waiting ? <div role="status" className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><Clock3 className="h-5 w-5 shrink-0" /><p>Estamos verificando seu pagamento. O resultado aparece aqui automaticamente. Não é necessário pagar novamente.</p></div> : <fieldset disabled={busy} className="space-y-3">
      <div>
        <div className="flex min-h-6 items-center justify-between gap-2">
          <label htmlFor={`card-number-${sessionId}`} className="text-xs font-semibold text-slate-700">Número do cartão</label>
          <span role="status" aria-label="Bandeira do cartão" className="inline-flex min-h-6 items-center">{cardBrand ? <PaymentBrandBadge brand={cardBrand} /> : null}</span>
        </div>
        <input id={`card-number-${sessionId}`} name="card-number" autoComplete="cc-number" inputMode="numeric" maxLength={23} required placeholder="0000 0000 0000 0000" className={inputClass} onInput={event => setCardBrand(detectCheckoutCardBrand(event.currentTarget.value))} />
      </div>
      <label className="block text-xs font-semibold text-slate-700">Nome impresso no cartão<input name="card-name" autoComplete="cc-name" maxLength={120} required placeholder="Como aparece no cartão" className={inputClass} /></label>
      <div className="grid grid-cols-2 gap-3"><label className="block text-xs font-semibold text-slate-700">Validade<input name="expiry" autoComplete="cc-exp" inputMode="numeric" required placeholder="MM/AA" maxLength={7} className={inputClass} onChange={event => { const value = event.target.value.replace(/\D/g, "").slice(0, 6); event.target.value = value.length > 2 ? `${value.slice(0, 2)}/${value.slice(2)}` : value; }} /></label><label className="block text-xs font-semibold text-slate-700">CVV<input aria-label="Código de segurança (CVV)" name="card-code" autoComplete="cc-csc" inputMode="numeric" type="password" required placeholder="CVV" maxLength={4} className={inputClass} /></label></div>
      {quote.maxInstallments > 1 ? <label className="block text-xs font-semibold text-slate-700">Parcelamento<select value={installments} onChange={event => setInstallments(Number(event.target.value))} className={inputClass}>{Array.from({ length: quote.maxInstallments }, (_, index) => index + 1).map(count => <option key={count} value={count}>{count}x de {money(quote.amount / count)} — total {money(quote.amount)}</option>)}</select></label> : null}
      <label className="flex min-h-11 items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={differentHolder} onChange={event => setDifferentHolder(event.target.checked)} className="h-4 w-4" />O cartão pertence a outra pessoa</label>
      {differentHolder && holder ? <div className="space-y-3 rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-600">Informe os dados do titular para validar o cartão.</p>{([{ key: "name", label: "Nome completo" }, { key: "email", label: "E-mail" }, { key: "cpfCnpj", label: "CPF/CNPJ" }, { key: "phone", label: "Telefone" }, { key: "postalCode", label: "CEP" }, { key: "addressNumber", label: "Número do endereço" }] as const).map(field => <label key={field.key} className="block text-xs font-semibold text-slate-700">{field.label}<input value={holder[field.key]} required type={field.key === "email" ? "email" : "text"} onChange={event => setHolder({ ...holder, [field.key]: event.target.value })} className={inputClass} /></label>)}</div> : null}
    </fieldset>}
    {!waiting ? offers : null}
    {!waiting ? <button type="submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--store-button,#1d4ed8)] px-3 text-sm font-bold text-[color:var(--store-button-text,#fff)] disabled:opacity-60">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}{sending ? "Processando pagamento…" : `Pagar ${money(quote.amount)}`}</button> : null}
    {message ? <p role="status" className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">{message}</p> : null}
  </form>;
}
