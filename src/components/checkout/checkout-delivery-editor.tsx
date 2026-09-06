"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Truck } from "lucide-react";
import type { CheckoutCustomerOrder } from "@/lib/sales-catalog/checkout-customer";
import type { OrderDeliveryQuote } from "@/lib/sales-catalog/order-shipping";
import { publishCommerceAgentEvent } from "@/lib/commerce-agent/client-events";

type Customer = Omit<CheckoutCustomerOrder, "id" | "lead_id">;
type Quote = { customer: Customer; requireAddress: boolean; physical: boolean; quotes: OrderDeliveryQuote[]; selectedId: string; revision: number; subtotal: number; discount: number; error: string | null };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const fields = [
  { key: "customer_name", label: "Nome completo", autoComplete: "name", type: "text", max: 120 },
  { key: "customer_email", label: "E-mail", autoComplete: "email", type: "email", max: 254 },
  { key: "customer_phone", label: "Telefone", autoComplete: "tel", type: "tel", max: 22 },
  { key: "customer_document", label: "CPF/CNPJ", autoComplete: "off", type: "text", max: 18 },
  { key: "destination_cep", label: "CEP", autoComplete: "postal-code", type: "text", max: 9 },
  { key: "destination_address", label: "Endereço completo", autoComplete: "street-address", type: "text", max: 500 },
] as const;

export function CheckoutDeliveryEditor({ sessionId, initialCustomer, initiallyOpen = false, children }: { sessionId: string; initialCustomer: Customer; initiallyOpen?: boolean; children?: ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = useState(initiallyOpen);
  const [customer, setCustomer] = useState(initialCustomer);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [needsQuote, setNeedsQuote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const quoteRequest = useRef(0);

  useEffect(() => {
    if (!editing) return;
    const controller = new AbortController();
    const version = ++quoteRequest.current;
    fetch(`/api/checkout/${sessionId}/delivery`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (version === quoteRequest.current) { setQuote(result); setServiceId(result.selectedId); }
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [editing, sessionId]);

  async function calculate() {
    const version = ++quoteRequest.current;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/checkout/${sessionId}/delivery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "quote", customer }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (version !== quoteRequest.current) return;
      setQuote(result); setServiceId(result.selectedId); setNeedsQuote(false);
      publishCommerceAgentEvent("shipping_quotes_viewed", { session_id: sessionId, option_count: result.quotes.length });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível calcular a entrega."); }
    finally { setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !quote || needsQuote) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/checkout/${sessionId}/delivery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", customer, serviceId, revision: quote.revision }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      publishCommerceAgentEvent("checkout_delivery_saved", { session_id: sessionId, service_id: serviceId, amount: result.amount, shipping: result.shipping });
      setEditing(false); setQuote(null); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar a entrega."); }
    finally { setBusy(false); }
  }

  if (!editing) return <>{children}<button type="button" onClick={() => { setEditing(true); setMessage(null); publishCommerceAgentEvent("checkout_delivery_edit_started", { session_id: sessionId }); }} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-emerald-700 underline underline-offset-2"><Pencil className="h-3.5 w-3.5" />Alterar dados e entrega</button></>;
  const selected = quote?.quotes.find(option => option.id === serviceId);
  return <form onSubmit={save} data-sensitive="customer" aria-label="Dados e entrega do pedido" className="mt-3 space-y-3">
    <p className="text-xs leading-5 text-slate-600">Confira seu endereço e escolha a entrega para continuar por aqui.</p>
    <fieldset disabled={busy} className="grid min-w-0 grid-cols-2 gap-2.5">
      {fields.map(field => <label key={field.key} className={`min-w-0 text-xs font-medium text-slate-700 ${["customer_phone", "customer_document"].includes(field.key) ? "" : "col-span-2"}`}>{field.label}
        <input type={field.type} autoComplete={field.autoComplete} inputMode={["destination_cep", "customer_document"].includes(field.key) ? "numeric" : undefined} maxLength={field.max} required={!field.key.startsWith("destination_") || quote?.requireAddress !== false} value={customer[field.key] ?? ""} placeholder={field.key === "destination_address" ? "Rua, número, bairro, cidade e complemento" : undefined} onChange={event => {
          setCustomer(current => ({ ...current, [field.key]: event.target.value }));
          if (field.key.startsWith("destination_")) setNeedsQuote(true);
        }} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-base font-normal text-slate-950 outline-none focus:border-blue-600" />
      </label>)}
    </fieldset>
    {needsQuote || !quote ? <button type="button" disabled={busy} onClick={calculate} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}Calcular entrega</button> : <>
      {quote.physical ? <fieldset disabled={busy} className="space-y-2"><legend className="mb-2 text-xs font-semibold">Opções de entrega</legend>{quote.quotes.map(option => <label key={option.id} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"><input type="radio" name="delivery-service" value={option.id} checked={serviceId === option.id} onChange={() => { setServiceId(option.id); publishCommerceAgentEvent("shipping_option_selected", { session_id: sessionId, service_id: option.id, shipping: option.amount }); }} /><span className="min-w-0 flex-1"><span className="block font-semibold">{option.name}</span>{option.maxDays !== null ? <span className="mt-0.5 block text-slate-500">{option.minDays !== null && option.minDays !== option.maxDays ? `${option.minDays}–` : ""}{option.maxDays} dias úteis</span> : null}</span><strong className="shrink-0">{option.amount ? money(option.amount) : "Grátis"}</strong></label>)}{quote.error ? <p className="text-xs leading-5 text-amber-800">{quote.error}</p> : null}</fieldset> : null}
      {!quote.physical || selected ? <><div className="flex justify-between gap-2 text-xs"><span>Total com entrega</span><strong>{money(quote.subtotal - quote.discount + (selected?.amount ?? 0))}</strong></div><button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[color:var(--store-button,#1d4ed8)] px-3 text-sm font-semibold text-[color:var(--store-button-text,#fff)] disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Confirmar dados e entrega</button></> : null}
    </>}
    {message ? <p role="alert" className="rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-900">{message}</p> : null}
    {!initiallyOpen ? <button type="button" disabled={busy} onClick={() => setEditing(false)} className="min-h-11 text-xs text-slate-500 underline">Cancelar alteração</button> : null}
  </form>;
}
