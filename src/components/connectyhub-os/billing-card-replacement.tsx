"use client";

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FocusEvent, type FormEvent } from "react";
import { Dialog } from "radix-ui";
import { CreditCard, LockKeyhole, QrCode, X } from "lucide-react";
import { replacementConsentVersion } from "@/lib/billing/managed-renewal-policy";
import { detectCheckoutCardBrand, type CheckoutCardBrand } from "@/lib/sales-catalog/card-brand";
import { CheckoutAcceptedPayments, PaymentBrandBadge } from "@/components/checkout/payment-brand-badge";
import { formatReplacementCardField, parseReplacementCardDetails, replacementCardFields, validateReplacementCardField, type ReplacementCardErrors, type ReplacementCardField } from "@/lib/billing/replacement-card-input";

type Snapshot = { eligible: boolean; reason: string | null; lastFour: string | null; operation: { state: string; result_code: string | null } | null };
const field = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950 focus:outline-blue-500";
const fieldHints: Record<ReplacementCardField, string> = {
  number: "Confira o número do cartão.", holderName: "Informe o nome completo.",
  expiry: "Use MM/AA e uma data válida.", ccv: "Confira os 3 dígitos (4 no Amex).",
  name: "Informe o nome completo.", email: "Informe um e-mail válido.",
  cpfCnpj: "Confira o CPF/CNPJ.", phone: "Informe telefone com DDD.",
  postalCode: "Informe os 8 dígitos do CEP.", addressNumber: "Informe o número (até 6 dígitos).",
};

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
  const fieldError = (name: ReplacementCardField) => errors[name] ? <span id={`${fieldPrefix}-${name}-error`} className="mt-1 block text-xs font-normal leading-4 text-rose-700">{fieldHints[name]}</span> : null;

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
      <Dialog.Overlay className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 md:p-5">
      <div className="flex min-h-full items-center justify-center">
      <Dialog.Content className="flex h-dvh w-full flex-col bg-white text-slate-950 shadow-2xl outline-none md:h-auto md:max-w-5xl md:rounded-2xl" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => event.preventDefault()}>
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 md:px-6">
          <div><Dialog.Title className="text-lg font-bold">Alterar método de pagamento</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm leading-5 text-slate-600">Próximas renovações de {planName}. Plano, valor e vencimento mantidos. Sem cobrança agora.</Dialog.Description></div>
          <Dialog.Close disabled={busy} aria-label="Fechar modal" className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-60"><X size={20} /></Dialog.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:overflow-visible md:px-6">
        {!done ? <div className="grid gap-2 md:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl border border-blue-600 bg-blue-50 px-3 py-2.5 text-sm"><CreditCard size={20} className="shrink-0 text-blue-700" /><div><strong>Cartão de crédito</strong><p className="mt-0.5 text-xs text-slate-600">{snapshot?.lastFour ? `Substituir cartão •••• ${snapshot.lastFour}` : "Substituir o cartão das próximas renovações"}</p></div><span className="ml-auto text-xs font-semibold text-blue-700">Selecionado</span></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"><button type="button" disabled aria-describedby={`${fieldPrefix}-pix-reason`} className="flex items-center gap-2 text-sm font-semibold text-slate-500"><QrCode size={16} />Pix Automático<span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px]">Indisponível</span></button><p id={`${fieldPrefix}-pix-reason`} className="mt-1 text-xs leading-4 text-slate-600">O Asaas exige um primeiro pagamento. A troca de uma assinatura ativa ainda não está disponível sem cobrança.</p></div>
        </div> : null}
        {!snapshot && !message ? <p role="status" className="mt-3">Conferindo assinatura…</p> : null}
        {snapshot && !snapshot.eligible && !done ? <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">{snapshot.reason}</p> : null}
        {snapshot?.eligible && !done ? <form id={`${fieldPrefix}-form`} ref={formRef} onSubmit={submit} noValidate data-sensitive="payment" className="mt-4">
          <fieldset disabled={busy || uncertain}>
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1"><span className="text-xs text-slate-500">Bandeiras aceitas</span><div className="[&>div]:w-auto [&>div]:justify-start [&>div]:py-0"><CheckoutAcceptedPayments card pix={false} /></div></div>
            <div className="grid gap-5 md:grid-cols-2 md:gap-6">
            <section aria-labelledby={`${fieldPrefix}-card-title`} className="space-y-3">
            <h3 id={`${fieldPrefix}-card-title`} className="text-sm font-semibold">Dados do cartão</h3>
            <label className="block text-xs font-semibold">Número do cartão<div className="relative"><input className={`${field} pr-24`} name="number" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" maxLength={23} required {...fieldBehavior("number")} />{cardBrand ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"><PaymentBrandBadge brand={cardBrand} /></span> : null}</div>{fieldError("number")}</label>
            <label className="block text-xs font-semibold">Nome impresso no cartão<input className={field} name="holderName" autoComplete="cc-name" maxLength={120} required {...fieldBehavior("holderName")} />{fieldError("holderName")}</label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold">Validade (MM/AA)<input className={field} name="expiry" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" maxLength={7} required {...fieldBehavior("expiry")} />{fieldError("expiry")}</label>
              <label className="text-xs font-semibold">Código de segurança<input className={field} name="ccv" type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} placeholder={cardBrand === "american-express" ? "4 dígitos" : "3 dígitos"} required {...fieldBehavior("ccv")} />{fieldError("ccv")}</label>
            </div>
            </section>
            <section aria-labelledby={`${fieldPrefix}-holder-title`} className="space-y-3 md:border-l md:border-slate-100 md:pl-6">
            <h3 id={`${fieldPrefix}-holder-title`} className="text-sm font-semibold">Dados do titular</h3>
            <div className="grid grid-cols-2 gap-3">{([
              ["name", "Nome completo", "text", "name"], ["email", "E-mail", "email", "email"],
              ["cpfCnpj", "CPF/CNPJ", "text", "off"], ["phone", "Telefone", "tel", "tel-national"],
              ["postalCode", "CEP", "text", "postal-code"], ["addressNumber", "Número do endereço", "text", "off"],
            ] as const).map(([name, label, type, autoComplete]) => <label key={name} className="text-xs font-semibold">{label}<input className={field} name={name} type={type} inputMode={["cpfCnpj", "phone", "postalCode", "addressNumber"].includes(name) ? "numeric" : name === "email" ? "email" : "text"} autoComplete={autoComplete} maxLength={name === "email" ? 254 : 120} required {...fieldBehavior(name)} />{fieldError(name)}</label>)}</div>
            </section>
            </div>
            <label className="mt-5 flex items-start gap-2 text-xs leading-5 text-slate-600"><input name="consent" type="checkbox" required className="mt-1 size-4 shrink-0" />Autorizo substituir o cartão das próximas renovações e das recargas automáticas que já autorizei. As condições, limites e datas permanecem iguais.</label>
          </fieldset>
        </form> : null}
        {message ? <p role="status" className={Object.values(errors).some(Boolean) ? "sr-only" : "mt-3 rounded-lg bg-slate-50 p-3 text-sm"}>{message}</p> : null}
        {uncertain || !snapshot ? <button type="button" disabled={busy} className="mt-3 min-h-11 text-sm text-blue-700 underline" onClick={() => void load().catch(error => setMessage(error.message))}>Conferir resultado</button> : null}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:rounded-b-2xl md:px-6">
          <p className="mr-auto flex w-full items-center gap-2 text-[11px] leading-4 text-slate-500 md:w-auto"><LockKeyhole size={14} className="shrink-0" />Número completo e código de segurança não são salvos.</p>
          <Dialog.Close disabled={busy} className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold disabled:opacity-60 md:flex-none">{done ? "Concluir" : "Fechar"}</Dialog.Close>
          {snapshot?.eligible && !done ? <button form={`${fieldPrefix}-form`} type="submit" disabled={busy || uncertain} className="min-h-11 flex-1 rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white disabled:opacity-60 md:flex-none">{busy ? "Salvando cartão…" : "Salvar novo cartão"}</button> : null}
        </footer>
      </Dialog.Content>
      </div>
      </Dialog.Overlay>
    </Dialog.Portal>
  </Dialog.Root>;
}
