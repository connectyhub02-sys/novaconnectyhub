"use client";

import Image from "next/image";
import { Copy, CreditCard, Loader2, QrCode } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CheckoutPaymentFeedbackModal,
  type CheckoutPaymentFeedbackItem,
  type CheckoutPaymentFeedbackPayload,
} from "./checkout-payment-feedback-modal";
import { MercadoPagoCardBrick, type CardPaymentStatusChange } from "./mercado-pago-card-brick";
import { AsaasCardForm } from "./asaas-card-form";
import { CheckoutOrderBumps, type CheckoutOrderBumpOption } from "./checkout-order-bumps";
import { PagBankCardForm } from "./pagbank-card-form";
import { publishCommerceAgentEvent } from "@/lib/commerce-agent/client-events";
import { cn } from "@/lib/utils";

type CheckoutPaymentOptionsProps = {
  sessionId: string;
  amount: number;
  payerEmail: string | null;
  payerPhone: string | null;
  paymentProvider: "mercado_pago" | "pagbank" | "asaas";
  canUsePix: boolean;
  canUseCard: boolean;
  cardPublicKey: string | null;
  pagBankCardPaymentMethodTypes?: PagBankCardPaymentMethodType[];
  pixQrCode: string | null;
  pixAmount?: number | null;
  pixNeedsRefresh?: boolean;
  pixQrCodeBase64: string | null;
  pixTicketUrl: string | null;
  paymentProviderLabel: string;
  initialPaymentMethod: PaymentMethod | null;
  maxInstallments: number;
  organizationName: string;
  orderCode: string;
  items: CheckoutPaymentFeedbackItem[];
  orderBumps: CheckoutOrderBumpOption[];
  initialSelectedOrderBumpIds?: string[];
  whatsappHref: string | null;
};

type PaymentMethod = "pix" | "card";
type PagBankCardPaymentMethodType = "CREDIT_CARD" | "DEBIT_CARD";

export function CheckoutPaymentOptions({
  sessionId,
  amount,
  payerEmail,
  payerPhone,
  paymentProvider,
  canUsePix,
  canUseCard,
  cardPublicKey,
  pagBankCardPaymentMethodTypes,
  pixQrCode,
  pixAmount,
  pixNeedsRefresh,
  pixQrCodeBase64,
  pixTicketUrl,
  paymentProviderLabel,
  initialPaymentMethod,
  maxInstallments,
  organizationName,
  orderCode,
  items,
  orderBumps,
  initialSelectedOrderBumpIds = [],
  whatsappHref,
}: CheckoutPaymentOptionsProps) {
  const router = useRouter();
  const cartMutating = useRef(false);
  const [cartUpdating, setCartUpdating] = useState(false);
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const showCard = canUseCard && (paymentProvider === "asaas" || paymentProvider === "pagbank" || Boolean(cardPublicKey));
  const defaultMethod = initialPaymentMethod ?? (canUsePix && showCard ? null : canUsePix ? "pix" : showCard ? "card" : null);
  const [method, setMethod] = useState<PaymentMethod | null>(defaultMethod);
  const [feedback, setFeedback] = useState<CheckoutPaymentFeedbackPayload | null>(null);
  const [selectedOrderBumpIds, setSelectedOrderBumpIds] = useState<string[]>(initialSelectedOrderBumpIds);
  const [pixUpdating, setPixUpdating] = useState(false);
  const [pixUpdateError, setPixUpdateError] = useState<string | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const activeMethod = method === "card" && showCard ? "card" : method === "pix" && canUsePix ? "pix" : null;
  const selectedOrderBumps = useMemo(
    () => orderBumps.filter((item) => selectedOrderBumpIds.includes(item.productId)),
    [orderBumps, selectedOrderBumpIds],
  );
  const orderBumpTotal = selectedOrderBumps.reduce((sum, item) => sum + item.price, 0);
  const alreadyIncludedBumpTotal = orderBumps.filter(item => initialSelectedOrderBumpIds.includes(item.productId)).reduce((sum, item) => sum + item.price, 0);
  const totalAmount = serverTotal ?? roundMoney(amount - alreadyIncludedBumpTotal + orderBumpTotal);
  const needsPixUpdate = pixNeedsRefresh || !pixQrCode || selectedOrderBumpIds.length > 0 || initialSelectedOrderBumpIds.length > 0 || (pixAmount != null && pixAmount !== totalAmount);
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

  function recordOfferShown(productId: string) {
    publishCommerceAgentEvent("order_bump_shown", {
      session_id: sessionId,
      order_bump_count: orderBumps.length,
      product_id: productId,
      product_ids: [productId],
      total_available_amount: roundMoney(orderBumps.reduce((sum, item) => sum + item.price, 0)),
    });
  }

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

  async function toggleOrderBump(productId: string) {
    if (cardBusy || cartMutating.current) return;
    setPixUpdateError(null);
    const selected = !selectedOrderBumpIds.includes(productId);
    const option = orderBumps.find((item) => item.productId === productId);

    const nextIds = selected ? [...selectedOrderBumpIds, productId] : selectedOrderBumpIds.filter(id => id !== productId);
    if (paymentProvider === "asaas") {
      cartMutating.current = true;
      setCartUpdating(true);
      try {
        const quoteResponse = await fetch(`/api/checkout/${sessionId}/card`, { cache: "no-store" });
        const quote = await quoteResponse.json();
        if (!quoteResponse.ok) throw new Error(quote.error ?? "Não foi possível conferir o pedido.");
        const response = await fetch(`/api/checkout/${sessionId}/cart`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedOrderBumpIds: nextIds, revision: quote.revision }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar a oferta.");
        setServerTotal(result.amount);
        router.refresh();
      } catch (error) { setPixUpdateError(error instanceof Error ? error.message : "Confira o pedido e tente novamente."); return; }
      finally { cartMutating.current = false; setCartUpdating(false); }
    }

    publishCommerceAgentEvent(selected ? "order_bump_selected" : "order_bump_unselected", {
      session_id: sessionId,
      product_id: productId,
      offer_product_id: productId,
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
    if (cardBusy || cartMutating.current) return;
    setMethod(nextMethod);
    setPixUpdateError(null);
    publishCommerceAgentEvent("payment_method_selected", {
      session_id: sessionId,
      payment_method: nextMethod,
      selected_order_bump_ids: selectedOrderBumpIds,
      total_amount: totalAmount,
    });
  }

  async function updatePixWithOrderBumps() {
    if (cardBusy || cartMutating.current) return;

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

  const offers = orderBumps.length > 0 ? (
    <CheckoutOrderBumps
      items={orderBumps}
      selectedIds={selectedOrderBumpIds}
      disabled={cardBusy || cartUpdating || pixUpdating}
      onToggle={toggleOrderBump}
      onView={recordOfferShown}
      onNavigate={(productId, index) => publishCommerceAgentEvent("order_bump_carousel_navigated", { session_id: sessionId, product_id: productId, position: index + 1, order_bump_count: orderBumps.length })}
    />
  ) : null;

  return (
    <div>
      {cartUpdating ? <p role="status" className="mb-3 text-xs text-slate-600">Atualizando pedido e frete…</p> : pixUpdateError ? <p role="alert" className="mb-3 text-xs text-rose-700">{pixUpdateError}</p> : null}
      {showCard && canUsePix ? (
        <div className={cn(
          "grid gap-1 rounded-xl bg-slate-100 p-1",
          showCard && canUsePix ? "grid-cols-2" : "grid-cols-1",
        )}>
          {canUsePix ? (
            <PaymentMethodButton
              active={activeMethod === "pix"}
              icon={<QrCode className="h-4 w-4" />}
              label="Pix"
              onClick={() => selectPaymentMethod("pix")}
            />
          ) : null}
          {showCard ? (
            <PaymentMethodButton
              active={activeMethod === "card"}
              icon={<CreditCard className="h-4 w-4" />}
              label="Cartão"
              onClick={() => selectPaymentMethod("card")}
            />
          ) : null}
        </div>
      ) : null}

      {!(activeMethod === "card" && paymentProvider === "asaas") && offers ? <div className="mt-3">{offers}</div> : null}

      {activeMethod === "card" && paymentProvider === "asaas" ? (
        <AsaasCardForm sessionId={sessionId} selectedOrderBumpIds={selectedOrderBumpIds} externalBusy={cartUpdating} offers={offers} onBusyChange={setCardBusy} onApproved={() => window.location.reload()} />
      ) : activeMethod === "card" && paymentProvider === "mercado_pago" && cardPublicKey ? (
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
          enabledPaymentMethodTypes={pagBankCardPaymentMethodTypes}
          maxInstallments={maxInstallments}
          extraPayload={cardExtraPayload}
          rejectedMessage="Pagamento recusado pelo PagBank. Nenhuma cobranca foi concluida. Confira os dados do cartao ou use Pix."
          onPaymentStatusChange={handleCardPaymentStatusChange}
          onAlternativePaymentRequest={() => setMethod("pix")}
        />
      ) : activeMethod === null ? (
        <PaymentMethodEmptyState
          canUseCard={showCard}
          canUsePix={canUsePix}
        />
      ) : !canUsePix ? (
        <div className="mt-5 rounded-[8px] border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-black text-slate-950">Pix desativado nesta loja</p>
          <p className="mt-2 text-xs leading-5 text-slate-600">Escolha outra forma habilitada para concluir o pedido.</p>
        </div>
      ) : needsPixUpdate ? (
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

function PaymentMethodEmptyState({
  canUseCard,
  canUsePix,
}: {
  canUseCard: boolean;
  canUsePix: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-black text-slate-950">Escolha como deseja pagar</p>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        {canUsePix && canUseCard
          ? "Selecione Pix para pagar por QR code ou cartao para abrir o checkout seguro."
          : "Selecione uma forma habilitada para continuar."}
      </p>
    </div>
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
      <p className="text-sm font-black text-slate-950">Pague por Pix</p>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        Gere o código Pix deste pedido no valor de {totalLabel}.
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
        Gerar código Pix
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
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition",
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
