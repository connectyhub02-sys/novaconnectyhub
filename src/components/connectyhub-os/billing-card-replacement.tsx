"use client";

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FocusEvent, type FormEvent } from "react";
import { Dialog } from "radix-ui";
import { replacementConsentVersion } from "@/lib/billing/managed-renewal-policy";
import { detectCheckoutCardBrand, type CheckoutCardBrand } from "@/lib/sales-catalog/card-brand";
import { CheckoutAcceptedPayments, PaymentBrandBadge } from "@/components/checkout/payment-brand-badge";
import { formatReplacementCardField, parseReplacementCardDetails, replacementCardFields, validateReplacementCardField, type ReplacementCardErrors, type ReplacementCardField } from "@/lib/billing/replacement-card-input";
import { PixAutomaticUnavailable } from "./pix-automatic-unavailable";

type Snapshot = { eligible: boolean; reason: string | null; lastFour: string | null; operation: { state: string; result_code: string | null } | null };
const field = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950 focus:outline-blue-500";

export function BillingCardReplacement({ subscriptionId, planName, onClose }: { subscriptionId: string; planName: string; onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [done, setDone] = useState(false);
  const [cardBrand, setCardBrand] = useState<CheckoutCardBrand | null>(null);
  const [errors, setErrors] = useState<ReplacementCardErrors>({});
  const fieldPrefix = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const requestId = useRef<string | null>(null);
  const locked = useRef(false);
  const endpoint = `/api/dashboard/billing/subscriptions/${subscriptionId}/payment-method`;
  const load = useCallback(async () => {
    const response = await fetch(`${endpoint}${requestId.current ? `?requestId=${requestId.current}` : ""}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Não foi possível conferir o cartão.");
    const next = data as Snapshot;
    setSnapshot(next);
    if (next.operation?.state === "succeeded") {
      setDone(true); setUncertain(false);
      setMessage("Cartão alterado para futuras cobranças. Plano, valor e vencimento preservados. Nenhuma cobrança foi criada.");
    } else if (next.operation?.state === "failed") {
      setUncertain(false); requestId.current = null;
    }
    return next;
  }, [endpoint]);
  useEffect(() => { void load().catch(error => setMessage(error.message)); }, [load]);

  function fieldBehavior(name: ReplacementCardField) {
    const check = (input: HTMLInputElement) => {
      const numberInput = input.form?.elements.namedItem("number") as HTMLInputElement | null;
      return validateReplacementCardField(name, input.value, numberInput?.value ?? "") ?? undefined;
    };
    return {
      "aria-invalid": Boolean(errors[name]),
      "aria-describedby": errors[name] ? `${fieldPrefix}-${name}-error` : undefined,
      onChange(event: ChangeEvent<HTMLInputElement>) {
        event.target.value = formatReplacementCardField(name, event.target.value);
        if (name === "number") setCardBrand(detectCheckoutCardBrand(event.target.value));
        if (errors[name]) { const error = check(event.target); setErrors(current => ({ ...current, [name]: error })); }
      },
      onBlur(event: FocusEvent<HTMLInputElement>) {
        const error = check(event.target); setErrors(current => ({ ...current, [name]: error }));
      },
    };
  }
  const fieldError = (name: ReplacementCardField) => errors[name] ? <span id={`${fieldPrefix}-${name}-error`} className="mt-1 block text-xs font-normal text-rose-700">{errors[name]}</span> : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || uncertain || !snapshot?.eligible) return;
    const values = new FormData(event.currentTarget);
    const invalid: ReplacementCardErrors = {};
    for (const name of replacementCardFields) {
      const error = validateReplacementCardField(name, String(values.get(name) ?? ""), String(values.get("number") ?? ""));
      if (error) invalid[name] = error;
    }
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      setMessage("Confira os campos indicados antes de salvar.");
      (formRef.current?.elements.namedItem(Object.keys(invalid)[0]) as HTMLInputElement | null)?.focus();
      return;
    }
    if (values.get("consent") !== "on") { setMessage("Confirme a autorização de substituição antes de salvar."); return; }
    const expiry = String(values.get("expiry") ?? "").split("/");
    let card, holder;
    try {
      ({ card, holder } = parseReplacementCardDetails(
        { number: values.get("number"), holderName: values.get("holderName"), expiryMonth: expiry[0], expiryYear: expiry[1], ccv: values.get("ccv") },
        Object.fromEntries(["name", "email", "cpfCnpj", "phone", "postalCode", "addressNumber"].map(key => [key, values.get(key)])),
      ));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Confira os dados."); return; }
    locked.current = true; setBusy(true); setMessage("");
    requestId.current = crypto.randomUUID();
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "card", requestId: requestId.current, card, holder, acceptReplacement: values.get("consent") === "on", consentVersion: replacementConsentVersion }),
      });
      const data = await response.json();
      if (response.ok) {
        setDone(true); setMessage(data.message);
        await load().catch(() => null);
        return;
      }
      else {
        setMessage(data.error ?? "Não foi possível confirmar a troca.");
        // Internal/processing responses may follow a committed transaction.
        setUncertain(["internal_error", "processing"].includes(data.code));
        if (!["internal_error", "processing"].includes(data.code)) requestId.current = null;
      }
      await load();
    } catch {
      setUncertain(true);
      setMessage("A conexão foi interrompida. Confira o resultado antes de enviar outra troca. Esta ação não cria cobranças.");
    } finally {
      formRef.current?.reset(); setCardBrand(null); setErrors({}); locked.current = false; setBusy(false);
    }
  }

  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/60" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-5 text-slate-950 shadow-xl" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => event.preventDefault()}>
        <Dialog.Title className="text-lg font-bold">Alterar método de pagamento</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm text-slate-600">Escolha como pagar as próximas renovações de {planName}. A troca mantém plano, valor, ciclo e vencimento. Nenhuma cobrança será criada agora.</Dialog.Description>
        {!done ? <div className="mt-4 space-y-3"><div className="rounded-lg border-2 border-blue-600 bg-blue-50 p-3 text-sm"><strong>Cartão de crédito</strong><p className="mt-1 text-slate-600">Cadastre um novo cartão para substituir o atual.</p></div><PixAutomaticUnavailable context="replacement" /></div> : null}
        {snapshot?.lastFour ? <p className="mt-3 text-sm">Cartão atual: •••• {snapshot.lastFour}</p> : null}
        {!snapshot && !message ? <p role="status" className="mt-3">Conferindo assinatura…</p> : null}
        {snapshot && !snapshot.eligible && !done ? <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">{snapshot.reason}</p> : null}
        {snapshot?.eligible && !done ? <form ref={formRef} onSubmit={submit} noValidate data-sensitive="payment" className="mt-4 space-y-3">
          <fieldset disabled={busy || uncertain} className="space-y-3">
            <div><p className="mb-2 text-xs text-slate-500">Bandeiras aceitas · somente crédito</p><CheckoutAcceptedPayments card pix={false} /></div>
            <label className="block text-xs font-semibold">Número do cartão<div className="relative"><input className={`${field} pr-24`} name="number" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" maxLength={23} required {...fieldBehavior("number")} />{cardBrand ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"><PaymentBrandBadge brand={cardBrand} /></span> : null}</div>{fieldError("number")}</label>
            <label className="block text-xs font-semibold">Nome impresso no cartão<input className={field} name="holderName" autoComplete="cc-name" maxLength={120} required {...fieldBehavior("holderName")} />{fieldError("holderName")}</label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold">Validade (MM/AA)<input className={field} name="expiry" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" maxLength={7} required {...fieldBehavior("expiry")} />{fieldError("expiry")}</label>
              <label className="text-xs font-semibold">Código de segurança<input className={field} name="ccv" type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} placeholder={cardBrand === "american-express" ? "4 dígitos" : "3 dígitos"} required {...fieldBehavior("ccv")} />{fieldError("ccv")}</label>
            </div>
            <p className="text-sm font-semibold">Dados do titular do novo cartão</p>
            <div className="grid gap-3 sm:grid-cols-2">{([
              ["name", "Nome completo", "text", "name"], ["email", "E-mail", "email", "email"],
              ["cpfCnpj", "CPF/CNPJ", "text", "off"], ["phone", "Telefone", "tel", "tel-national"],
              ["postalCode", "CEP", "text", "postal-code"], ["addressNumber", "Número do endereço", "text", "off"],
            ] as const).map(([name, label, type, autoComplete]) => <label key={name} className="text-xs font-semibold">{label}<input className={field} name={name} type={type} inputMode={["cpfCnpj", "phone", "postalCode", "addressNumber"].includes(name) ? "numeric" : name === "email" ? "email" : "text"} autoComplete={autoComplete} maxLength={name === "email" ? 254 : 120} required {...fieldBehavior(name)} />{fieldError(name)}</label>)}</div>
            <label className="flex items-start gap-2 text-sm"><input name="consent" type="checkbox" required className="mt-1" />Autorizo substituir o cartão das próximas renovações e das recargas automáticas que já autorizei. As condições, limites e datas permanecem iguais.</label>
            <p className="text-xs text-slate-500">O cartão é tokenizado pelo provedor. Número completo e código de segurança não são salvos.</p>
            <button disabled={busy || uncertain} className="min-h-11 w-full rounded-lg bg-blue-700 px-4 font-semibold text-white disabled:opacity-60">{busy ? "Salvando cartão…" : "Salvar novo cartão"}</button>
          </fieldset>
        </form> : null}
        {message ? <p role="status" className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">{message}</p> : null}
        {uncertain || !snapshot ? <button type="button" disabled={busy} className="mt-3 min-h-11 text-sm text-blue-700 underline" onClick={() => void load().catch(error => setMessage(error.message))}>Conferir resultado</button> : null}
        <Dialog.Close disabled={busy} className="mt-4 min-h-11 w-full rounded-lg border border-slate-300 px-4 text-sm disabled:opacity-60">{done ? "Concluir" : "Fechar"}</Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
