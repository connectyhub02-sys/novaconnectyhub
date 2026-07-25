"use client";

import Image from "next/image";
import { Copy, CreditCard, Loader2, QrCode, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { MercadoPagoCardBrick } from "@/components/checkout/mercado-pago-card-brick";
import {
  type BillingCheckoutBump,
  type BillingCheckoutBumpCode,
} from "@/lib/billing/plan-checkout-catalog";
import { cn } from "@/lib/utils";

type BillingPlanCheckoutProps = {
  subscriptionId: string;
  planCode: string;
  planName: string;
  planAmountBrl: number;
  includedCredits: number;
  payerEmail: string | null;
  subscriptionStatus: string;
  paymentStatus: string;
  cardPublicKey: string | null;
  availableBumps: BillingCheckoutBump[];
  initialSelectedBumpCodes: BillingCheckoutBumpCode[];
  initialPixQrCode: string | null;
  initialPixQrCodeBase64: string | null;
  initialPixTicketUrl: string | null;
};

type PaymentMethod = "pix" | "card";

type PixState = {
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
};

type NoticeState = {
  tone: "success" | "warning" | "error";
  message: string;
} | null;

export function BillingPlanCheckout({
  subscriptionId,
  planCode,
  planName,
  planAmountBrl,
  includedCredits,
  payerEmail,
  subscriptionStatus,
  paymentStatus,
  cardPublicKey,
  availableBumps,
  initialSelectedBumpCodes,
  initialPixQrCode,
  initialPixQrCodeBase64,
  initialPixTicketUrl,
}: BillingPlanCheckoutProps) {
  const canPay = ["pending", "incomplete", "past_due"].includes(subscriptionStatus)
    && ["pending", "rejected", "in_process"].includes(paymentStatus);
  const [selectedBumpCodes, setSelectedBumpCodes] = useState<BillingCheckoutBumpCode[]>(initialSelectedBumpCodes);
  const [method, setMethod] = useState<PaymentMethod>(cardPublicKey ? "card" : "pix");
  const [pix, setPix] = useState<PixState>({
    qrCode: initialPixQrCode,
    qrCodeBase64: initialPixQrCodeBase64,
    ticketUrl: initialPixTicketUrl,
  });
  const [pixLoading, setPixLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const selectedBumps = useMemo(
    () => availableBumps.filter((bump) => selectedBumpCodes.includes(bump.code)),
    [availableBumps, selectedBumpCodes],
  );
  const bumpsAmount = selectedBumps.reduce((total, bump) => total + bump.priceBrl, 0);
  const totalAmount = Math.round((planAmountBrl + bumpsAmount) * 100) / 100;
  const cardExtraPayload = useMemo(
    () => ({ selectedBumpCodes }),
    [selectedBumpCodes],
  );

  function toggleBump(code: BillingCheckoutBumpCode) {
    setSelectedBumpCodes((current) => {
      const next = current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code];

      return next;
    });
    setPix({ qrCode: null, qrCodeBase64: null, ticketUrl: null });
    setNotice(null);
  }

  async function generatePix() {
    if (!canPay) return;

    setPixLoading(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/dashboard/billing/checkout/${subscriptionId}/pix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedBumpCodes }),
      });
      const data = await response.json().catch(() => null) as {
        error?: string;
        pixQrCode?: string | null;
        pixQrCodeBase64?: string | null;
        pixTicketUrl?: string | null;
        status?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel gerar o Pix.");
      }

      setPix({
        qrCode: data?.pixQrCode ?? null,
        qrCodeBase64: data?.pixQrCodeBase64 ?? null,
        ticketUrl: data?.pixTicketUrl ?? null,
      });
      setNotice({
        tone: data?.status === "approved" ? "success" : "warning",
        message: data?.status === "approved"
          ? "Pagamento aprovado. O plano esta sendo ativado."
          : "Pix gerado. Assim que o pagamento cair, os creditos serao liberados.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel gerar o Pix.",
      });
    } finally {
      setPixLoading(false);
    }
  }

  async function copyPixCode() {
    if (!pix.qrCode) return;

    try {
      await navigator.clipboard.writeText(pix.qrCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <section className="space-y-4">
        <div className="rounded-[8px] border border-cyan-400/25 bg-slate-950/72 p-5 shadow-xl shadow-black/20">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200">
                Checkout ConnectyHub
              </div>
              <h2 className="mt-2 text-2xl font-black text-white">{planName}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Plano {planCode} com {formatCredits(includedCredits)} creditos inclusos. Escolha adicionais antes de pagar.
              </p>
            </div>
            <span className={cn(
              "rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wide",
              canPay
                ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                : "border-cyan-300/30 bg-cyan-400/10 text-cyan-100",
            )}>
              {canPay ? "Aguardando pagamento" : "Checkout fechado"}
            </span>
          </div>
        </div>

        {availableBumps.length > 0 ? (
        <div className="rounded-[8px] border border-white/10 bg-slate-950/72 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">
                Order bumps
              </div>
              <h3 className="mt-2 text-lg font-bold text-white">Aumente seu saldo de creditos</h3>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
                Compre mais creditos agora e mantenha seu agente online por mais tempo, sem pausar atendimentos quando o volume crescer.
              </p>
            </div>
            <Sparkles className="h-5 w-5 text-emerald-300" />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {availableBumps.map((bump) => {
              const selected = selectedBumpCodes.includes(bump.code);

              return (
                <button
                  key={bump.code}
                  type="button"
                  disabled={!canPay}
                  onClick={() => toggleBump(bump.code)}
                  className={cn(
                    "min-h-[168px] rounded-[8px] border p-4 text-left transition",
                    selected
                      ? "border-emerald-300/70 bg-emerald-400/12 shadow-lg shadow-emerald-950/30"
                      : "border-slate-700 bg-slate-900/70 hover:border-cyan-300/40",
                    !canPay ? "cursor-not-allowed opacity-60" : "",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-slate-300">
                      {bump.badge}
                    </span>
                    <span className={cn(
                      "h-4 w-4 rounded border",
                      selected ? "border-emerald-200 bg-emerald-300" : "border-slate-500 bg-slate-950",
                    )} />
                  </div>
                  <p className="mt-4 text-sm font-bold text-white">{bump.title}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{bump.description}</p>
                  <p className="mt-4 font-mono text-sm font-black text-cyan-100">
                    {formatMoney(bump.priceBrl)}
                    <span className="ml-1 text-[10px] font-semibold text-slate-500">
                      {bump.recurrence === "monthly" ? "/mes" : "unico"}
                    </span>
                  </p>
                </button>
              );
            })}
          </div>
        </div>
        ) : null}
      </section>

      <aside className="rounded-[8px] border border-cyan-400/25 bg-slate-950/82 p-5 shadow-xl shadow-black/25">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">
          Carrinho
        </div>
        <div className="mt-4 space-y-3">
          <CartRow label={`Plano ${planName}`} value={formatMoney(planAmountBrl)} />
          {selectedBumps.map((bump) => (
            <CartRow key={bump.code} label={bump.title} value={formatMoney(bump.priceBrl)} />
          ))}
        </div>
        <div className="mt-5 border-t border-slate-700 pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-white">Total hoje</span>
            <strong className="text-2xl font-black text-emerald-300">{formatMoney(totalAmount)}</strong>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Itens recorrentes ficam salvos no checkout para cobranca mensal do plano.
          </p>
        </div>

        {canPay ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-[8px] border border-slate-700 bg-slate-900/70 p-1">
              <PaymentMethodButton
                active={method === "card"}
                disabled={!cardPublicKey}
                icon={<CreditCard className="h-4 w-4" />}
                label="Cartao"
                onClick={() => setMethod("card")}
              />
              <PaymentMethodButton
                active={method === "pix"}
                disabled={false}
                icon={<QrCode className="h-4 w-4" />}
                label="Pix"
                onClick={() => setMethod("pix")}
              />
            </div>

            {method === "card" && cardPublicKey ? (
              <MercadoPagoCardBrick
                key={`${subscriptionId}-${totalAmount}-${selectedBumpCodes.join(".")}`}
                publicKey={cardPublicKey}
                sessionId={subscriptionId}
                amount={totalAmount}
                payerEmail={payerEmail}
                submitPath={`/api/dashboard/billing/checkout/${subscriptionId}/card`}
                extraPayload={cardExtraPayload}
                successMessage="Pagamento aprovado. Seu plano sera ativado agora."
                pendingMessage="Pagamento enviado. Assim que confirmar, os creditos serao liberados."
              />
            ) : (
              <PixPanel
                pix={pix}
                copied={copied}
                loading={pixLoading}
                onCopy={copyPixCode}
                onGenerate={generatePix}
              />
            )}
          </>
        ) : (
          <div className="mt-5 rounded-[8px] border border-emerald-300/30 bg-emerald-400/10 p-4">
            <p className="font-semibold text-white">Plano em processamento</p>
            <p className="mt-2 text-sm leading-6 text-emerald-50/80">
              Se o pagamento ja foi aprovado, os creditos entram automaticamente no painel.
            </p>
          </div>
        )}

        {notice ? (
          <div className={cn(
            "mt-4 rounded-[8px] border px-3 py-2 text-sm leading-5",
            notice.tone === "success"
              ? "border-emerald-300/40 bg-emerald-400/12 text-emerald-100"
              : notice.tone === "warning"
                ? "border-amber-300/40 bg-amber-400/12 text-amber-100"
                : "border-rose-300/40 bg-rose-400/12 text-rose-100",
          )}>
            {notice.message}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function PaymentMethodButton({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-[7px] px-3 text-sm font-semibold transition",
        active
          ? "bg-cyan-300 text-slate-950"
          : "text-slate-300 hover:bg-slate-800 hover:text-white",
        disabled ? "cursor-not-allowed opacity-45" : "",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function CartRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[8px] border border-slate-700/70 bg-slate-900/70 px-3 py-3">
      <span className="text-xs font-semibold text-slate-300">{label}</span>
      <span className="font-mono text-xs font-bold text-cyan-100">{value}</span>
    </div>
  );
}

function PixPanel({
  copied,
  loading,
  onCopy,
  onGenerate,
  pix,
}: {
  copied: boolean;
  loading: boolean;
  onCopy: () => void;
  onGenerate: () => void;
  pix: PixState;
}) {
  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={onGenerate}
        disabled={loading}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-70"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
        {pix.qrCode ? "Atualizar Pix" : "Gerar Pix"}
      </button>

      {pix.qrCodeBase64 ? (
        <div className="mt-5 flex justify-center rounded-[8px] border border-slate-700 bg-white p-4">
          <Image
            src={`data:image/png;base64,${pix.qrCodeBase64}`}
            alt="QR Code Pix"
            width={220}
            height={220}
            unoptimized
            className="h-[220px] w-[220px]"
          />
        </div>
      ) : null}

      {pix.qrCode ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300" htmlFor="billing-pix-code">
              Pix copia e cola
            </label>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex min-h-8 items-center gap-2 rounded-[8px] border border-cyan-300/35 px-3 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/10"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <textarea
            id="billing-pix-code"
            readOnly
            value={pix.qrCode}
            className="mt-2 h-28 w-full resize-none rounded-[8px] border border-slate-700 bg-slate-900 p-3 text-xs leading-5 text-cyan-50 outline-none"
          />
        </div>
      ) : null}

      {pix.ticketUrl ? (
        <a
          href={pix.ticketUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-[8px] border border-cyan-300/35 px-4 text-xs font-bold text-cyan-100 transition hover:bg-cyan-400/10"
        >
          Abrir comprovante Pix
        </a>
      ) : null}
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(value);
}
