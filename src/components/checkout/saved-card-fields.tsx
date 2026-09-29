"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { CreditCard, LockKeyhole } from "lucide-react";
import { detectCheckoutCardBrand } from "@/lib/sales-catalog/card-brand";
import { formatReplacementCardField, type ReplacementCardField } from "@/lib/billing/replacement-card-input";
import { CheckoutAcceptedPayments, PaymentBrandBadge } from "./payment-brand-badge";

export const savedCardInputClass = "billing-card-input mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base font-normal text-slate-950 shadow-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 aria-invalid:border-rose-500";

/** Shared by first registration and replacement. Card values remain in the form
 * only, never copied to preview state, browser storage, analytics or logs. */
export function SavedCardFields({ inputProps, errorFor }: {
  inputProps?: (name: ReplacementCardField) => InputHTMLAttributes<HTMLInputElement>;
  errorFor?: (name: ReplacementCardField) => React.ReactNode;
}) {
  const id = useId();
  const [brand, setBrand] = useState<ReturnType<typeof detectCheckoutCardBrand>>(null);
  const behavior = (name: ReplacementCardField): InputHTMLAttributes<HTMLInputElement> => {
    const extra = inputProps?.(name);
    return { ...extra, onChange(event) {
      event.target.value = formatReplacementCardField(name, event.target.value);
      if (name === "number") setBrand(detectCheckoutCardBrand(event.target.value));
      extra?.onChange?.(event);
    } };
  };
  return <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
    <div className="mb-4 flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><CreditCard size={22} /></span><div><h3 id={`${id}-title`} className="text-sm font-semibold text-slate-950">Dados do cartão</h3><p className="mt-0.5 text-xs text-slate-500">Cadastro seguro · sem cobrança agora</p></div></div>
    <div className="space-y-4">
      <div><div className="flex min-h-6 items-center justify-between gap-2"><label htmlFor={`${id}-number`} className="text-xs font-semibold text-slate-700">Número do cartão</label><span role="status" aria-label="Bandeira do cartão">{brand ? <PaymentBrandBadge brand={brand} /> : <CreditCard size={18} className="text-slate-400" />}</span></div><input id={`${id}-number`} className={`${savedCardInputClass} font-mono tracking-wider`} name="number" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" maxLength={23} required {...behavior("number")} />{errorFor?.("number")}</div>
      <label className="block text-xs font-semibold text-slate-700">Nome impresso no cartão<input className={savedCardInputClass} name="holderName" autoComplete="cc-name" placeholder="Como aparece no cartão" maxLength={120} required {...behavior("holderName")} />{errorFor?.("holderName")}</label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-slate-700">Validade<input className={savedCardInputClass} name="expiry" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" maxLength={7} required {...behavior("expiry")} />{errorFor?.("expiry")}</label>
        <label className="block text-xs font-semibold text-slate-700">CVV<input aria-label="Código de segurança (CVV)" className={savedCardInputClass} name="ccv" type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} placeholder={brand === "american-express" ? "4 dígitos" : "3 dígitos"} required {...behavior("ccv")} />{errorFor?.("ccv")}</label>
      </div>
      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><LockKeyhole size={14} className="mt-0.5 shrink-0" />O CVV fica no verso do cartão. No Amex, são 4 dígitos na frente.</p>
      <div className="border-t border-slate-200 pt-3"><span className="text-[11px] text-slate-500">Bandeiras aceitas</span><div className="[&>div]:w-auto [&>div]:justify-start [&>div]:py-1"><CheckoutAcceptedPayments card pix={false} /></div></div>
    </div>
  </section>;
}
