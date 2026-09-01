"use client";

import { FormEvent, useMemo, useState, type ReactNode } from "react";
import { CreditCard, Loader2, LockKeyhole, MapPin, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CardPaymentStatusChange, RejectedPaymentCopy } from "./mercado-pago-card-brick";

type JsonRecord = Record<string, unknown>;

type PagBankCardFormProps = {
  sessionId: string;
  amount: number;
  payerEmail: string | null;
  payerPhone?: string | null;
  submitPath: string;
  cardSessionPath?: string;
  maxInstallments?: number;
  extraPayload?: JsonRecord;
  successMessage?: string;
  pendingMessage?: string;
  rejectedMessage?: string;
  onPaymentStatusChange?: (result: CardPaymentStatusChange) => void;
  onAlternativePaymentRequest?: () => void;
};

type PagBankCardSessionResponse = {
  ok?: boolean;
  error?: string;
  publicKey?: string;
  threeDSSession?: string;
  sdkEnvironment?: "PROD" | "SANDBOX";
};

type PagBankEncryptResult = {
  encryptedCard?: string;
  hasErrors?: boolean;
  errors?: Array<{ code?: string; message?: string; description?: string }>;
};

type PagBankThreeDSResult = {
  status?: string;
  authenticationStatus?: string;
  id?: string;
};

type PagBankSdk = {
  setUp: (input: { session: string; env: "PROD" | "SANDBOX" }) => void;
  encryptCard: (input: {
    publicKey: string;
    holder: string;
    number: string;
    expMonth: string;
    expYear: string;
    securityCode: string;
  }) => PagBankEncryptResult;
  authenticate3DS: (input: JsonRecord) => Promise<PagBankThreeDSResult>;
  PagSeguroError?: new (...args: unknown[]) => Error;
};

declare global {
  interface Window {
    PagSeguro?: PagBankSdk;
  }
}

let pagBankSdkPromise: Promise<void> | null = null;

const pagBankSdkUrl = "https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js";

export function PagBankCardForm({
  sessionId,
  amount,
  payerEmail,
  payerPhone,
  submitPath,
  cardSessionPath,
  maxInstallments = 12,
  extraPayload,
  successMessage = "Pagamento aprovado. Seu plano sera ativado agora.",
  pendingMessage = "Pagamento enviado. Assim que confirmar, os creditos serao liberados.",
  rejectedMessage = "Pagamento recusado. Nenhuma cobranca foi concluida. Confira os dados do cartao ou use Pix.",
  onPaymentStatusChange,
  onAlternativePaymentRequest,
}: PagBankCardFormProps) {
  const [holderName, setHolderName] = useState("");
  const [holderTaxId, setHolderTaxId] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [securityCode, setSecurityCode] = useState("");
  const [installments, setInstallments] = useState("1");
  const [phone, setPhone] = useState(() => digits(payerPhone ?? "").slice(0, 13));
  const [postalCode, setPostalCode] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [city, setCity] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);
  const installmentLimit = normalizeInstallmentLimit(maxInstallments);
  const amountCents = Math.max(100, Math.round(amount * 100));
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => Array.from({ length: 16 }, (_, index) => String(currentYear + index)),
    [currentYear],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const normalized = normalizeDraft({
        holderName,
        holderTaxId,
        cardNumber,
        expMonth,
        expYear,
        securityCode,
        installments,
        phone,
        postalCode,
        street,
        number,
        city,
        regionCode,
      });
      await loadPagBankSdk();

      if (!window.PagSeguro) {
        throw new Error("SDK PagBank indisponivel. Atualize a pagina e tente novamente.");
      }

      const session = await loadPagBankCardSession(cardSessionPath ?? `/api/dashboard/billing/checkout/${sessionId}/pagbank-card-session`);
      window.PagSeguro.setUp({
        session: session.threeDSSession,
        env: session.sdkEnvironment,
      });
      const encrypted = window.PagSeguro.encryptCard({
        publicKey: session.publicKey,
        holder: normalized.holderName,
        number: normalized.cardNumber,
        expMonth: normalized.expMonth,
        expYear: normalized.expYear,
        securityCode: normalized.securityCode,
      });

      if (encrypted.hasErrors || !encrypted.encryptedCard) {
        throw new Error(formatPagBankEncryptErrors(encrypted.errors));
      }

      const threeDS = await authenticatePagBank3DS({
        encryptedCard: encrypted.encryptedCard,
        amountCents,
        holderName: normalized.holderName,
        holderTaxId: normalized.holderTaxId,
        payerEmail,
        payerPhone: normalized.phone,
        installments: normalized.installments,
        billingAddress: normalized.billingAddress,
      });
      const response = await fetch(submitPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(extraPayload ?? {}),
          formData: {
            encrypted_card: encrypted.encryptedCard,
            security_code: normalized.securityCode,
            holder_name: normalized.holderName,
            holder_tax_id: normalized.holderTaxId,
            installments: normalized.installments,
            payment_method_type: "CREDIT_CARD",
            authentication_method_id: threeDS.authenticationMethodId,
            authentication_status: threeDS.authenticationStatus,
            authentication_flow_status: threeDS.status,
            transaction_amount: amount,
            payer: {
              email: payerEmail,
              identification: {
                type: normalized.holderTaxId.length === 14 ? "CNPJ" : "CPF",
                number: normalized.holderTaxId,
              },
              phone: normalized.phone.raw,
            },
            billing_address: normalized.billingAddress,
          },
        }),
      });
      const data = await response.json().catch(() => null) as {
        error?: string;
        checkoutUrl?: string;
        status?: string;
        providerStatus?: string | null;
        providerStatusDetail?: string | null;
        providerPaymentId?: string | null;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel processar o cartao PagBank.");
      }

      const paymentStatus = normalizePaymentStatus(data?.status);
      const providerStatus = normalizePaymentStatus(data?.providerStatus);
      const approved = paymentStatus === "approved" || providerStatus === "approved" || providerStatus === "paid";
      const rejected = isRejectedPaymentStatus(paymentStatus) || isRejectedPaymentStatus(providerStatus);
      const rejection = rejected ? buildPagBankRejectedPaymentCopy(data?.providerStatusDetail, rejectedMessage) : null;

      onPaymentStatusChange?.({
        status: data?.status ?? null,
        providerStatus: data?.providerStatus ?? null,
        providerStatusDetail: data?.providerStatusDetail ?? null,
        providerPaymentId: data?.providerPaymentId ?? null,
        checkoutUrl: data?.checkoutUrl ?? null,
        approved,
        rejected,
        pending: !approved && !rejected,
        hasThreeDSChallenge: false,
        rejection,
      });

      setResult({
        tone: approved ? "success" : rejected ? "error" : "warning",
        message: approved
          ? successMessage
          : rejected
            ? rejection?.inlineMessage ?? rejectedMessage
            : pendingMessage,
      });
    } catch (error) {
      setResult({
        tone: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel processar o cartao PagBank.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function authenticatePagBank3DS(input: {
    encryptedCard: string;
    amountCents: number;
    holderName: string;
    holderTaxId: string;
    payerEmail: string | null;
    payerPhone: NormalizedPhone;
    installments: number;
    billingAddress: BillingAddress;
  }) {
    if (!window.PagSeguro) {
      throw new Error("SDK PagBank indisponivel para 3DS.");
    }

    const result = await window.PagSeguro.authenticate3DS({
      data: {
        customer: {
          name: input.holderName,
          email: payerEmail ?? "cliente@connectyhub.local",
          phones: [{
            country: "55",
            area: input.payerPhone.area,
            number: input.payerPhone.number,
            type: "MOBILE",
          }],
        },
        paymentMethod: {
          type: "CREDIT_CARD",
          installments: input.installments,
          card: {
            encrypted: input.encryptedCard,
            holder: {
              name: input.holderName,
            },
          },
        },
        amount: {
          value: input.amountCents,
          currency: "BRL",
        },
        billingAddress: input.billingAddress,
        dataOnly: false,
      },
    }).catch((error: unknown) => {
      throw new Error(readPagBank3DSError(error));
    });
    const status = normalize3DSStatus(result.status);

    if (status === "CHANGE_PAYMENT_METHOD") {
      throw new Error("O PagBank recusou a autenticacao 3DS. Use outro cartao ou Pix.");
    }

    if (status === "AUTH_FLOW_COMPLETED") {
      if (!result.id) {
        throw new Error("3DS concluido sem identificador de autenticacao.");
      }

      return {
        status,
        authenticationStatus: normalizePaymentStatus(result.authenticationStatus),
        authenticationMethodId: result.id,
      };
    }

    if (status === "AUTH_NOT_SUPPORTED") {
      return {
        status,
        authenticationStatus: "not_supported",
        authenticationMethodId: null,
      };
    }

    throw new Error("3DS PagBank nao foi concluido. Tente novamente ou use Pix.");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 rounded-[8px] border border-amber-100 bg-white p-4 text-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black">Cartao de credito</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Checkout transparente PagBank com 3DS e token para renovacoes.
          </p>
        </div>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin text-amber-600" /> : <ShieldCheck className="h-4 w-4 text-emerald-600" />}
      </div>

      <div className="mt-4 grid gap-3">
        <InputField label="Nome no cartao" value={holderName} autoComplete="cc-name" onChange={setHolderName} />
        <InputField label="CPF/CNPJ do titular" value={holderTaxId} inputMode="numeric" onChange={(value) => setHolderTaxId(formatDocument(value))} />
        <InputField label="Numero do cartao" value={cardNumber} autoComplete="cc-number" inputMode="numeric" onChange={(value) => setCardNumber(formatCardNumber(value))} />
        <div className="grid grid-cols-[1fr_1fr_96px] gap-2">
          <SelectField label="Mes" value={expMonth} onChange={setExpMonth}>
            <option value="">MM</option>
            {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((month) => (
              <option key={month} value={month}>{month}</option>
            ))}
          </SelectField>
          <SelectField label="Ano" value={expYear} onChange={setExpYear}>
            <option value="">AAAA</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </SelectField>
          <InputField label="CVV" value={securityCode} autoComplete="cc-csc" inputMode="numeric" maxLength={4} onChange={(value) => setSecurityCode(digits(value).slice(0, 4))} />
        </div>
        <SelectField label="Parcelas" value={installments} onChange={setInstallments}>
          {Array.from({ length: installmentLimit }, (_, index) => index + 1).map((option) => (
            <option key={option} value={String(option)}>
              {option}x de {formatMoney(amount / option)}
            </option>
          ))}
        </SelectField>
        <InputField label="Telefone do titular" value={phone} inputMode="numeric" onChange={(value) => setPhone(digits(value).slice(0, 13))} />
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-slate-200 pt-4 text-xs font-black uppercase text-slate-600">
        <MapPin className="h-3.5 w-3.5" />
        Endereco de cobranca
      </div>
      <div className="mt-3 grid gap-3">
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <InputField label="CEP" value={postalCode} inputMode="numeric" onChange={(value) => setPostalCode(digits(value).slice(0, 8))} />
          <InputField label="UF" value={regionCode} maxLength={2} onChange={(value) => setRegionCode(value.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase())} />
        </div>
        <InputField label="Rua" value={street} onChange={setStreet} />
        <div className="grid grid-cols-[96px_1fr] gap-2">
          <InputField label="Numero" value={number} onChange={(value) => setNumber(value.slice(0, 12))} />
          <InputField label="Cidade" value={city} onChange={setCity} />
        </div>
      </div>

      {result ? (
        <div className={cn(
          "mt-4 rounded-[8px] border px-3 py-2 text-sm leading-5",
          result.tone === "success"
            ? "border-emerald-200 bg-emerald-50 text-[#128C4A]"
            : result.tone === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-rose-200 bg-rose-50 text-rose-700",
        )} role="status" aria-live="polite">
          {result.message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[7px] bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-70"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
        {submitting ? "Validando 3DS" : `Pagar ${formatMoney(amount)}`}
      </button>
      <button
        type="button"
        onClick={onAlternativePaymentRequest}
        className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[7px] border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
      >
        <CreditCard className="h-4 w-4" />
        Usar Pix
      </button>
    </form>
  );
}

type BillingAddress = {
  street: string;
  number: string;
  city: string;
  regionCode: string;
  country: "BRA";
  postalCode: string;
};

function normalizeInstallmentLimit(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) {
    return 12;
  }

  return Math.max(1, Math.min(12, Math.trunc(value as number)));
}

function normalizeDraft(input: {
  holderName: string;
  holderTaxId: string;
  cardNumber: string;
  expMonth: string;
  expYear: string;
  securityCode: string;
  installments: string;
  phone: string;
  postalCode: string;
  street: string;
  number: string;
  city: string;
  regionCode: string;
}) {
  const holderName = input.holderName.replace(/\s+/g, " ").trim();
  const holderTaxId = digits(input.holderTaxId);
  const cardNumber = digits(input.cardNumber);
  const expMonth = digits(input.expMonth).padStart(2, "0");
  const expYear = digits(input.expYear);
  const securityCode = digits(input.securityCode);
  const installments = Number.parseInt(input.installments, 10);
  const phone = normalizePhone(input.phone);
  const postalCode = digits(input.postalCode);
  const street = input.street.replace(/\s+/g, " ").trim();
  const number = input.number.replace(/\s+/g, " ").trim();
  const city = input.city.replace(/\s+/g, " ").trim();
  const regionCode = input.regionCode.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase();

  if (!holderName.includes(" ")) throw new Error("Informe nome e sobrenome do titular do cartao.");
  if (holderTaxId.length !== 11 && holderTaxId.length !== 14) throw new Error("Informe CPF ou CNPJ valido do titular.");
  if (cardNumber.length < 13 || cardNumber.length > 21) throw new Error("Informe um numero de cartao valido.");
  if (!/^(0[1-9]|1[0-2])$/.test(expMonth)) throw new Error("Informe o mes de validade do cartao.");
  if (expYear.length !== 4) throw new Error("Informe o ano de validade com 4 digitos.");
  if (securityCode.length < 3 || securityCode.length > 4) throw new Error("Informe o CVV do cartao.");
  if (!Number.isFinite(installments) || installments < 1 || installments > 12) throw new Error("Escolha uma parcela valida.");
  if (!phone) throw new Error("Informe um telefone valido do titular do cartao.");
  if (postalCode.length < 5) throw new Error("Informe o CEP do endereco de cobranca.");
  if (!street || !number || !city || regionCode.length !== 2) throw new Error("Complete o endereco de cobranca.");

  return {
    holderName,
    holderTaxId,
    cardNumber,
    expMonth,
    expYear,
    securityCode,
    installments,
    phone,
    billingAddress: {
      street,
      number,
      city,
      regionCode,
      country: "BRA" as const,
      postalCode,
    },
  };
}

type NormalizedPhone = {
  raw: string;
  area: string;
  number: string;
};

function normalizePhone(value: string): NormalizedPhone | null {
  const allDigits = digits(value);
  const local = allDigits.startsWith("55") && allDigits.length > 11 ? allDigits.slice(2) : allDigits;

  if (local.length < 10 || local.length > 11) {
    return null;
  }

  return {
    raw: allDigits.startsWith("55") ? allDigits : `55${local}`,
    area: local.slice(0, 2),
    number: local.slice(2),
  };
}

async function loadPagBankCardSession(path: string): Promise<{
  publicKey: string;
  threeDSSession: string;
  sdkEnvironment: "PROD" | "SANDBOX";
}> {
  const response = await fetch(path, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => null) as PagBankCardSessionResponse | null;

  if (!response.ok || !data?.publicKey || !data.threeDSSession) {
    throw new Error(data?.error ?? "Nao foi possivel preparar a sessao PagBank.");
  }

  const sdkEnvironment: "PROD" | "SANDBOX" = data.sdkEnvironment === "SANDBOX" ? "SANDBOX" : "PROD";

  return {
    publicKey: data.publicKey,
    threeDSSession: data.threeDSSession,
    sdkEnvironment,
  };
}

function loadPagBankSdk() {
  if (window.PagSeguro) {
    return Promise.resolve();
  }

  if (pagBankSdkPromise) {
    return pagBankSdkPromise;
  }

  pagBankSdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${pagBankSdkUrl}"]`);

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Nao foi possivel carregar o SDK PagBank.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = pagBankSdkUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Nao foi possivel carregar o SDK PagBank."));
    document.body.appendChild(script);
  });

  return pagBankSdkPromise;
}

function formatPagBankEncryptErrors(errors: PagBankEncryptResult["errors"]) {
  const message = errors?.map((error) => error.message ?? error.description ?? error.code).filter(Boolean).join(" ");

  return message || "Nao foi possivel criptografar o cartao PagBank.";
}

function readPagBank3DSError(error: unknown) {
  if (error && typeof error === "object") {
    const record = error as JsonRecord;
    const detail = record.detail && typeof record.detail === "object" ? record.detail as JsonRecord : null;
    const messages = Array.isArray(detail?.errorMessages)
      ? detail.errorMessages
          .map((item) => item && typeof item === "object" ? item as JsonRecord : null)
          .map((item) => item?.description ?? item?.message ?? item?.code)
          .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      : [];
    const message = typeof detail?.message === "string" ? detail.message : typeof record.message === "string" ? record.message : null;

    return [...messages, message].filter(Boolean).join(" ") || "Nao foi possivel autenticar 3DS no PagBank.";
  }

  return "Nao foi possivel autenticar 3DS no PagBank.";
}

function normalizePaymentStatus(status: string | null | undefined) {
  return typeof status === "string" ? status.trim().toLowerCase() : null;
}

function normalize3DSStatus(status: string | null | undefined) {
  return typeof status === "string" ? status.trim().toUpperCase() : null;
}

function isRejectedPaymentStatus(status: string | null) {
  return status === "rejected"
    || status === "cancelled"
    || status === "canceled"
    || status === "expired"
    || status === "declined"
    || status === "error";
}

function buildPagBankRejectedPaymentCopy(statusDetail: string | null | undefined, fallback: string): RejectedPaymentCopy {
  const detail = normalizePaymentStatus(statusDetail);

  return {
    inlineMessage: fallback,
    title: "Nao conseguimos aprovar este pagamento",
    description: "A tentativa foi enviada ao PagBank, mas nao foi autorizada pelo provedor de pagamento ou pelo banco emissor.",
    reason: detail ?? "Pagamento nao autorizado.",
    recommendation: "Confira os dados, tente outro cartao ou escolha Pix.",
    nextSteps: [
      "Confira numero, validade, CVV, CPF/CNPJ e nome do titular.",
      "Tente outro cartao ou use Pix para liberar o plano agora.",
    ],
    statusDetail: detail,
  };
}

function InputField({
  autoComplete,
  inputMode,
  label,
  maxLength,
  onChange,
  value,
}: {
  autoComplete?: string;
  inputMode?: "numeric";
  label: string;
  maxLength?: number;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <input
        autoComplete={autoComplete}
        className="mt-1 h-11 w-full rounded-[7px] border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
        inputMode={inputMode}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  children,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <select
        className="mt-1 h-11 w-full rounded-[7px] border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function formatDocument(value: string) {
  return digits(value).slice(0, 14);
}

function formatCardNumber(value: string) {
  return digits(value).slice(0, 21).replace(/(.{4})/g, "$1 ").trim();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
