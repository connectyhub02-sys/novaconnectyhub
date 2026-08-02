"use client";

import Image from "next/image";
import { BadgePercent, Check, Copy, CreditCard, Loader2, QrCode } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  CheckoutPaymentFeedbackModal,
  type CheckoutPaymentFeedbackItem,
  type CheckoutPaymentFeedbackPayload,
} from "./checkout-payment-feedback-modal";
import { MercadoPagoCardBrick, type CardPaymentStatusChange } from "./mercado-pago-card-brick";
import { cn } from "@/lib/utils";

type CheckoutPaymentOptionsProps = {
  sessionId: string;
  amount: number;
  payerEmail: string | null;
  canUseCard: boolean;
  cardPublicKey: string | null;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  pixTicketUrl: string | null;
  organizationName: string;
  orderCode: string;
  items: CheckoutPaymentFeedbackItem[];
  orderBumps: CheckoutOrderBumpOption[];
  whatsappHref: string | null;
};

type PaymentMethod = "pix" | "card";

type CheckoutOrderBumpOption = {
  productId: string;
  title: string;
  description: string | null;
  badge: string | null;
  price: number;
  priceLabel: string;
  mediaUrl: string | null;
};

export function CheckoutPaymentOptions({
  sessionId,
  amount,
  payerEmail,
  canUseCard,
  cardPublicKey,
  pixQrCode,
  pixQrCodeBase64,
  pixTicketUrl,
  organizationName,
  orderCode,
  items,
  orderBumps,
  whatsappHref,
}: CheckoutPaymentOptionsProps) {
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [feedback, setFeedback] = useState<CheckoutPaymentFeedbackPayload | null>(null);
  const [selectedOrderBumpIds, setSelectedOrderBumpIds] = useState<string[]>([]);
  const [pixUpdating, setPixUpdating] = useState(false);
  const [pixUpdateError, setPixUpdateError] = useState<string | null>(null);
  const showCard = canUseCard && Boolean(cardPublicKey);
  const activeMethod = method === "card" && showCard ? "card" : "pix";
  const selectedOrderBumps = useMemo(
    () => orderBumps.filter((item) => selectedOrderBumpIds.includes(item.productId)),
    [orderBumps, selectedOrderBumpIds],
  );
  const orderBumpTotal = selectedOrderBumps.reduce((sum, item) => sum + item.price, 0);
  const totalAmount = roundMoney(amount + orderBumpTotal);
  const totalAmountLabel = formatCurrency(totalAmount);
  const feedbackItems = useMemo(
    () => [
      ...items,
      ...selectedOrderBumps.map((item) => ({
        title: item.title,
        quantity: 1,
        total: item.priceLabel,
      })),
    ],
    [items, selectedOrderBumps],
  );
  const cardExtraPayload = useMemo(
    () => selectedOrderBumpIds.length > 0 ? { selectedOrderBumpIds } : undefined,
    [selectedOrderBumpIds],
  );

  function handleCardPaymentStatusChange(result: CardPaymentStatusChange) {
    if (!result.approved && !result.rejected) return;

    setFeedback({
      status: result.approved ? "approved" : "rejected",
      organizationName,
      orderCode,
      amountLabel: totalAmountLabel,
      items: feedbackItems,
      providerStatusDetail: result.providerStatusDetail,
      rejection: result.rejection,
    });
  }

  function toggleOrderBump(productId: string) {
    setPixUpdateError(null);
    setSelectedOrderBumpIds((current) => (
      current.includes(productId)
        ? current.filter((item) => item !== productId)
        : [...current, productId]
    ));
  }

  async function updatePixWithOrderBumps() {
    if (selectedOrderBumpIds.length === 0) return;

    setPixUpdating(true);
    setPixUpdateError(null);

    try {
      const response = await fetch(`/api/checkout/${sessionId}/pix`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ selectedOrderBumpIds }),
      });
      const data = await response.json().catch(() => null) as { checkoutUrl?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel atualizar o Pix com as ofertas.");
      }

      window.location.href = data?.checkoutUrl ?? `/checkout/${sessionId}`;
    } catch (error) {
      setPixUpdateError(error instanceof Error ? error.message : "Nao foi possivel atualizar o Pix com as ofertas.");
    } finally {
      setPixUpdating(false);
    }
  }

  return (
    <div className="mt-6">
      {orderBumps.length > 0 ? (
        <OrderBumpSelector
          items={orderBumps}
          selectedIds={selectedOrderBumpIds}
          totalLabel={totalAmountLabel}
          onToggle={toggleOrderBump}
        />
      ) : null}

      {showCard ? (
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-[8px] border border-slate-700 bg-slate-900/70 p-1">
          <PaymentMethodButton
            active={activeMethod === "pix"}
            icon={<QrCode className="h-4 w-4" />}
            label="Pix"
            onClick={() => setMethod("pix")}
          />
          <PaymentMethodButton
            active={activeMethod === "card"}
            icon={<CreditCard className="h-4 w-4" />}
            label="Cartao"
            onClick={() => setMethod("card")}
          />
        </div>
      ) : null}

      {activeMethod === "card" && cardPublicKey ? (
        <MercadoPagoCardBrick
          publicKey={cardPublicKey}
          sessionId={sessionId}
          amount={totalAmount}
          payerEmail={payerEmail}
          extraPayload={cardExtraPayload}
          showRejectionModal={false}
          onPaymentStatusChange={handleCardPaymentStatusChange}
        />
      ) : selectedOrderBumpIds.length > 0 ? (
        <PixOrderBumpUpdatePanel
          totalLabel={totalAmountLabel}
          loading={pixUpdating}
          error={pixUpdateError}
          onUpdate={updatePixWithOrderBumps}
        />
      ) : (
        <PixPaymentPanel
          pixQrCode={pixQrCode}
          pixQrCodeBase64={pixQrCodeBase64}
          pixTicketUrl={pixTicketUrl}
        />
      )}
      <CheckoutPaymentFeedbackModal
        feedback={feedback}
        whatsappHref={whatsappHref}
        onRetryCard={() => setMethod("card")}
        onUsePix={() => setMethod("pix")}
        onClose={() => setFeedback(null)}
      />
    </div>
  );
}

function OrderBumpSelector({
  items,
  selectedIds,
  totalLabel,
  onToggle,
}: {
  items: CheckoutOrderBumpOption[];
  selectedIds: string[];
  totalLabel: string;
  onToggle: (productId: string) => void;
}) {
  return (
    <section className="rounded-[8px] border border-amber-300/35 bg-amber-400/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
            <BadgePercent className="h-4 w-4 text-amber-200" />
            Ofertas extras
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-50/80">Adicione ao pedido e pague tudo em uma unica compra.</p>
        </div>
        <span className="rounded-full border border-amber-200/35 bg-amber-300/15 px-3 py-1 text-xs font-semibold text-amber-100">
          Total {totalLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {items.map((item) => {
          const selected = selectedIds.includes(item.productId);

          return (
            <button
              key={item.productId}
              type="button"
              onClick={() => onToggle(item.productId)}
              className={cn(
                "flex min-h-[88px] items-center gap-3 rounded-[8px] border p-3 text-left transition",
                selected
                  ? "border-emerald-300/45 bg-emerald-400/12"
                  : "border-slate-700 bg-slate-900/65 hover:border-amber-200/45",
              )}
            >
              {item.mediaUrl ? (
                <Image
                  src={item.mediaUrl}
                  alt=""
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-[7px] object-cover"
                  unoptimized
                />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[7px] border border-amber-200/25 bg-amber-300/10">
                  <BadgePercent className="h-5 w-5 text-amber-100" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-white">{item.title}</span>
                  {item.badge ? (
                    <span className="rounded-full border border-amber-200/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                {item.description ? (
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-300">{item.description}</span>
                ) : null}
                <span className="mt-2 block text-sm font-semibold text-amber-100">{item.priceLabel}</span>
              </span>
              <span className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border",
                selected
                  ? "border-emerald-200 bg-emerald-300 text-emerald-950"
                  : "border-slate-600 text-slate-400",
              )}>
                {selected ? <Check className="h-4 w-4" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PixOrderBumpUpdatePanel({
  totalLabel,
  loading,
  error,
  onUpdate,
}: {
  totalLabel: string;
  loading: boolean;
  error: string | null;
  onUpdate: () => void;
}) {
  return (
    <div className="mt-5 rounded-[8px] border border-cyan-300/35 bg-cyan-400/10 p-4">
      <p className="text-sm font-semibold text-white">Atualize o Pix com as ofertas</p>
      <p className="mt-2 text-xs leading-5 text-cyan-50/80">
        O QR Code atual ainda esta no valor anterior. Gere um novo Pix com total de {totalLabel}.
      </p>
      <button
        type="button"
        onClick={onUpdate}
        disabled={loading}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-70"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
        Gerar Pix atualizado
      </button>
      {error ? (
        <p className="mt-3 rounded-[8px] border border-rose-300/35 bg-rose-400/12 px-3 py-2 text-xs leading-5 text-rose-100">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PaymentMethodButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-[7px] px-3 text-sm font-semibold transition",
        active
          ? "bg-cyan-300 text-slate-950"
          : "text-slate-300 hover:bg-slate-800 hover:text-white",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function PixPaymentPanel({
  pixQrCode,
  pixQrCodeBase64,
  pixTicketUrl,
}: {
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  pixTicketUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copyPixCode() {
    if (!pixQrCode) return;

    try {
      await navigator.clipboard.writeText(pixQrCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-5">
      {pixQrCodeBase64 ? (
        <div className="flex justify-center rounded-[8px] border border-slate-700 bg-white p-4">
          <Image
            src={`data:image/png;base64,${pixQrCodeBase64}`}
            alt="QR Code Pix"
            width={220}
            height={220}
            unoptimized
            className="h-[220px] w-[220px]"
          />
        </div>
      ) : (
        <div className="rounded-[8px] border border-cyan-300/40 bg-cyan-400/12 p-4">
          <p className="font-semibold text-white">Pix sendo gerado</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">Aguarde alguns instantes ou solicite um novo link pelo WhatsApp.</p>
        </div>
      )}

      {pixQrCode ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300" htmlFor="pix-code">
              Pix copia e cola
            </label>
            <button
              type="button"
              onClick={copyPixCode}
              className="inline-flex min-h-9 items-center gap-2 rounded-[8px] border border-cyan-300/35 px-3 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/10"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copiado" : "Copiar codigo"}
            </button>
          </div>
          <textarea
            id="pix-code"
            readOnly
            value={pixQrCode}
            className="mt-2 h-32 w-full resize-none rounded-[8px] border border-slate-700 bg-slate-900 p-3 text-xs leading-5 text-cyan-50 outline-none"
          />
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Depois de pagar, volte para a conversa no WhatsApp. O pedido sera atualizado automaticamente.
          </p>
        </div>
      ) : null}

      {pixTicketUrl ? (
        <a
          href={pixTicketUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[8px] bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
        >
          Abrir pagamento no Mercado Pago
        </a>
      ) : null}
    </div>
  );
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
