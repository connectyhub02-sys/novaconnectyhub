"use client";

import Image from "next/image";
import { BadgePercent, Check, Copy, CreditCard, Loader2, QrCode } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckoutPaymentFeedbackModal,
  type CheckoutPaymentFeedbackItem,
  type CheckoutPaymentFeedbackPayload,
} from "./checkout-payment-feedback-modal";
import { MercadoPagoCardBrick, type CardPaymentStatusChange } from "./mercado-pago-card-brick";
import { PagBankCardForm } from "./pagbank-card-form";
import { publishCommerceAgentEvent } from "@/lib/commerce-agent/client-events";
import { cn } from "@/lib/utils";

type CheckoutPaymentOptionsProps = {
  sessionId: string;
  amount: number;
  payerEmail: string | null;
  payerPhone: string | null;
  paymentProvider: "mercado_pago" | "pagbank";
  canUseCard: boolean;
  cardPublicKey: string | null;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  pixTicketUrl: string | null;
  paymentProviderLabel: string;
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
  payerPhone,
  paymentProvider,
  canUseCard,
  cardPublicKey,
  pixQrCode,
  pixQrCodeBase64,
  pixTicketUrl,
  paymentProviderLabel,
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
  const showCard = canUseCard && (paymentProvider === "pagbank" || Boolean(cardPublicKey));
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

  useEffect(() => {
    if (orderBumps.length === 0) return;

    publishCommerceAgentEvent("order_bump_shown", {
      session_id: sessionId,
      order_bump_count: orderBumps.length,
      product_ids: orderBumps.map((item) => item.productId),
      total_available_amount: roundMoney(orderBumps.reduce((sum, item) => sum + item.price, 0)),
    });
  }, [orderBumps, sessionId]);

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
    const selected = !selectedOrderBumpIds.includes(productId);
    const option = orderBumps.find((item) => item.productId === productId);

    publishCommerceAgentEvent(selected ? "order_bump_selected" : "order_bump_unselected", {
      session_id: sessionId,
      product_id: productId,
      product_title: option?.title ?? null,
      price: option?.price ?? null,
      active_payment_method: activeMethod,
    });

    setSelectedOrderBumpIds((current) => (
      current.includes(productId)
        ? current.filter((item) => item !== productId)
        : [...current, productId]
    ));
  }

  function selectPaymentMethod(nextMethod: PaymentMethod) {
    setMethod(nextMethod);
    publishCommerceAgentEvent("payment_method_selected", {
      session_id: sessionId,
      payment_method: nextMethod,
      selected_order_bump_ids: selectedOrderBumpIds,
      total_amount: totalAmount,
    });
  }

  async function updatePixWithOrderBumps() {
    if (selectedOrderBumpIds.length === 0) return;

    setPixUpdating(true);
    setPixUpdateError(null);
    publishCommerceAgentEvent("order_bump_update_started", {
      session_id: sessionId,
      selected_order_bump_ids: selectedOrderBumpIds,
      total_amount: totalAmount,
    });

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

      publishCommerceAgentEvent("order_bump_accepted", {
        session_id: sessionId,
        selected_order_bump_ids: selectedOrderBumpIds,
        total_amount: totalAmount,
      });
      window.location.href = data?.checkoutUrl ?? `/checkout/${sessionId}`;
    } catch (error) {
      publishCommerceAgentEvent("order_bump_failed", {
        session_id: sessionId,
        selected_order_bump_ids: selectedOrderBumpIds,
        reason: error instanceof Error ? error.message : "unknown_error",
      });
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
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-[8px] border border-blue-100 bg-blue-50 p-1">
          <PaymentMethodButton
            active={activeMethod === "pix"}
            icon={<QrCode className="h-4 w-4" />}
            label="Pix"
            onClick={() => selectPaymentMethod("pix")}
          />
          <PaymentMethodButton
            active={activeMethod === "card"}
            icon={<CreditCard className="h-4 w-4" />}
            label="Cartao"
            onClick={() => selectPaymentMethod("card")}
          />
        </div>
      ) : null}

      {activeMethod === "card" && paymentProvider === "mercado_pago" && cardPublicKey ? (
        <MercadoPagoCardBrick
          publicKey={cardPublicKey}
          sessionId={sessionId}
          amount={totalAmount}
          payerEmail={payerEmail}
          extraPayload={cardExtraPayload}
          showRejectionModal={false}
          onPaymentStatusChange={handleCardPaymentStatusChange}
        />
      ) : activeMethod === "card" && paymentProvider === "pagbank" ? (
        <PagBankCardForm
          sessionId={sessionId}
          amount={totalAmount}
          payerEmail={payerEmail}
          payerPhone={payerPhone}
          submitPath={`/api/checkout/${sessionId}/card`}
          cardSessionPath={`/api/checkout/${sessionId}/pagbank-card-session`}
          extraPayload={cardExtraPayload}
          rejectedMessage="Pagamento recusado pelo PagBank. Nenhuma cobranca foi concluida. Confira os dados do cartao ou use Pix."
          onPaymentStatusChange={handleCardPaymentStatusChange}
          onAlternativePaymentRequest={() => setMethod("pix")}
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
          paymentProviderLabel={paymentProviderLabel}
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
    <section className="rounded-[8px] border border-amber-200 bg-amber-50 p-4 text-[color:var(--store-card-text,#0f172a)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-black text-slate-950">
            <BadgePercent className="h-4 w-4 text-amber-600" />
            Ofertas extras
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">Adicione ao pedido e pague tudo em uma unica compra.</p>
        </div>
        <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-bold text-amber-700">
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
                  ? "border-[#25D366] bg-emerald-50"
                  : "border-blue-100 bg-white hover:border-amber-300",
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
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[7px] border border-amber-200 bg-amber-100">
                  <BadgePercent className="h-5 w-5 text-amber-700" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-black text-[color:var(--store-card-text,#0f172a)]">{item.title}</span>
                  {item.badge ? (
                    <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                {item.description ? (
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-600">{item.description}</span>
                ) : null}
                <span className="mt-2 block text-sm font-black text-[color:var(--store-card-text,#0f172a)]">{item.priceLabel}</span>
              </span>
              <span className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border",
                selected
                  ? "border-[#25D366] bg-[#25D366] text-white"
                  : "border-blue-100 text-slate-400",
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
    <div className="mt-5 rounded-[8px] border border-blue-100 bg-blue-50 p-4">
      <p className="text-sm font-black text-slate-950">Atualize o Pix com as ofertas</p>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        O QR Code atual ainda esta no valor anterior. Gere um novo Pix com total de {totalLabel}.
      </p>
      <button
        type="button"
        onClick={onUpdate}
        disabled={loading}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border px-4 text-sm font-bold transition brightness-100 hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
        style={{
          backgroundColor: "var(--store-button, #2563eb)",
          borderColor: "var(--store-button-border, #2563eb)",
          color: "var(--store-button-text, #ffffff)",
        }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
        Gerar Pix atualizado
      </button>
      {error ? (
        <p className="mt-3 rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
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
          ? "border shadow-sm shadow-blue-950/20"
          : "text-slate-600 hover:bg-white hover:text-blue-700",
      )}
      style={active ? {
        backgroundColor: "var(--store-button, #2563eb)",
        borderColor: "var(--store-button-border, #2563eb)",
        color: "var(--store-button-text, #ffffff)",
      } : undefined}
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
  paymentProviderLabel,
}: {
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  pixTicketUrl: string | null;
  paymentProviderLabel: string;
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
        <div className="flex justify-center rounded-[8px] border border-blue-100 bg-white p-4">
          <Image
            src={`data:image/png;base64,${pixQrCodeBase64}`}
            alt="QR Code Pix"
            width={220}
            height={220}
            unoptimized
            className="h-[220px] w-[220px]"
          />
        </div>
      ) : pixQrCode ? (
        <div className="rounded-[8px] border border-blue-100 bg-blue-50 p-4">
          <p className="font-bold text-slate-950">Pix pronto</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">Use o codigo copia e cola abaixo para pagar no app do seu banco.</p>
        </div>
      ) : (
        <div className="rounded-[8px] border border-blue-100 bg-blue-50 p-4">
          <p className="font-bold text-slate-950">Pix sendo gerado</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">Aguarde alguns instantes ou solicite um novo link pelo WhatsApp.</p>
        </div>
      )}

      {pixQrCode ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-bold uppercase text-blue-700" htmlFor="pix-code">
              Pix copia e cola
            </label>
            <button
              type="button"
              onClick={copyPixCode}
              className="inline-flex min-h-9 items-center gap-2 rounded-[8px] border border-blue-100 bg-white px-3 text-xs font-bold text-blue-700 transition hover:border-blue-300"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copiado" : "Copiar codigo"}
            </button>
          </div>
          <textarea
            id="pix-code"
            readOnly
            value={pixQrCode}
            className="mt-2 h-32 w-full resize-none rounded-[8px] border border-blue-100 bg-white p-3 text-xs leading-5 text-slate-700 outline-none focus:border-blue-300"
          />
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Depois de pagar, volte para a conversa no WhatsApp. O pedido sera atualizado automaticamente.
          </p>
        </div>
      ) : null}

      {pixTicketUrl ? (
        <a
          href={pixTicketUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[8px] border px-4 text-sm font-bold transition brightness-100 hover:brightness-110"
          style={{
            backgroundColor: "var(--store-button, #25D366)",
            borderColor: "var(--store-button-border, #25D366)",
            color: "var(--store-button-text, #ffffff)",
          }}
        >
          Abrir pagamento no {paymentProviderLabel}
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
