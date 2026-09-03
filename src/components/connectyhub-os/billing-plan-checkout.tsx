"use client";

import Image from "next/image";
import { CheckCircle2, Copy, CreditCard, ExternalLink, FileImage, FileVideo, Files, HardDrive, Loader2, QrCode, RefreshCw, Rocket, ShieldAlert, Sparkles, Trophy, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  buildRejectedPaymentCopy,
  MercadoPagoCardBrick,
  type CardPaymentStatusChange,
  type RejectedPaymentCopy,
} from "@/components/checkout/mercado-pago-card-brick";
import { PagBankCardForm } from "@/components/checkout/pagbank-card-form";
import {
  type BillingCheckoutBump,
  type BillingCheckoutBumpCode,
} from "@/lib/billing/plan-checkout-catalog";
import { InfinityMark } from "./infinity-loader";
import { cn } from "@/lib/utils";

type BillingPlanCheckoutProps = {
  subscriptionId: string;
  planCode: string;
  planName: string;
  planAmountBrl: number;
  includedCredits: number;
  storageLimitBytes: number;
  storageFileLimit: number;
  storageImageMaxBytes: number;
  storageVideoMaxBytes: number;
  storageFileMaxBytes: number;
  payerEmail: string | null;
  payerPhone: string | null;
  subscriptionStatus: string;
  paymentStatus: string;
  initialProviderPaymentId: string | null;
  billingProvider: "mercado_pago" | "pagbank" | "asaas";
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

type PaymentFeedbackModalState =
  | {
      kind: "success";
      title: string;
      description: string;
      planName: string;
      credits: number;
      amountBrl: number;
    }
  | {
      kind: "rejected";
      rejection: RejectedPaymentCopy;
    }
  | {
      kind: "processing";
      title: string;
      description: string;
    };

type CheckoutStatusResponse = {
  ok?: boolean;
  error?: string;
  subscriptionStatus?: string;
  invoiceStatus?: string;
  paymentStatus?: string;
  providerStatus?: string | null;
  providerPaymentId?: string | null;
  confirmed?: boolean;
  pixQrCode?: string | null;
  pixQrCodeBase64?: string | null;
  pixTicketUrl?: string | null;
};

export function BillingPlanCheckout({
  subscriptionId,
  planCode,
  planName,
  planAmountBrl,
  includedCredits,
  storageLimitBytes,
  storageFileLimit,
  storageImageMaxBytes,
  storageVideoMaxBytes,
  storageFileMaxBytes,
  payerEmail,
  payerPhone,
  subscriptionStatus,
  paymentStatus,
  initialProviderPaymentId,
  billingProvider,
  cardPublicKey,
  availableBumps,
  initialSelectedBumpCodes,
  initialPixQrCode,
  initialPixQrCodeBase64,
  initialPixTicketUrl,
}: BillingPlanCheckoutProps) {
  const router = useRouter();
  const approvalRefreshQueuedRef = useRef(false);
  const shownFeedbackKeysRef = useRef(new Set<string>());
  const [subscriptionStatusOverride, setSubscriptionStatusOverride] = useState<string | null>(null);
  const [paymentStatusOverride, setPaymentStatusOverride] = useState<string | null>(null);
  const [providerPaymentId, setProviderPaymentId] = useState<string | null>(initialProviderPaymentId);
  const [cardStatusPolling, setCardStatusPolling] = useState(
    Boolean(initialProviderPaymentId) && ["pending", "in_process"].includes(paymentStatus) && !initialPixQrCode,
  );
  const [selectedBumpCodes, setSelectedBumpCodes] = useState<BillingCheckoutBumpCode[]>(initialSelectedBumpCodes);
  const cardEnabled = billingProvider === "asaas" || billingProvider === "pagbank" || (billingProvider === "mercado_pago" && Boolean(cardPublicKey));
  const providerLabel = billingProvider === "asaas" ? "Asaas" : billingProvider === "pagbank" ? "PagBank" : "Mercado Pago";
  const [method, setMethod] = useState<PaymentMethod>(initialPixQrCode ? "pix" : cardEnabled ? "card" : "pix");
  const [pix, setPix] = useState<PixState>({
    qrCode: initialPixQrCode,
    qrCodeBase64: initialPixQrCodeBase64,
    ticketUrl: initialPixTicketUrl,
  });
  const [pixLoading, setPixLoading] = useState(false);
  const [cardCheckoutLoading, setCardCheckoutLoading] = useState(false);
  const [statusChecking, setStatusChecking] = useState(false);
  const [cartSyncing, setCartSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [feedbackModal, setFeedbackModal] = useState<PaymentFeedbackModalState | null>(null);
  const currentSubscriptionStatus = subscriptionStatusOverride ?? subscriptionStatus;
  const currentPaymentStatus = paymentStatusOverride ?? paymentStatus;
  const canPay = ["pending", "incomplete", "past_due", "active"].includes(currentSubscriptionStatus)
    && ["pending", "rejected", "in_process"].includes(currentPaymentStatus);
  const paymentRejected = currentPaymentStatus === "rejected";
  const checkoutConfirmed = currentPaymentStatus === "approved";
  const shouldPollExistingProviderPayment = Boolean(providerPaymentId)
    && ["pending", "in_process"].includes(currentPaymentStatus)
    && !checkoutConfirmed
    && !paymentRejected;
  const selectedBumps = useMemo(
    () => availableBumps.filter((bump) => selectedBumpCodes.includes(bump.code)),
    [availableBumps, selectedBumpCodes],
  );
  const paymentStatusNotice = useMemo(() => buildPaymentStatusNotice(currentPaymentStatus, providerLabel), [currentPaymentStatus, providerLabel]);
  const bumpsAmount = selectedBumps.reduce((total, bump) => total + bump.priceBrl, 0);
  const totalAmount = Math.round((planAmountBrl + bumpsAmount) * 100) / 100;
  const cardExtraPayload = useMemo(
    () => ({ selectedBumpCodes }),
    [selectedBumpCodes],
  );
  const activeNotice = notice ?? paymentStatusNotice;

  const queueCheckoutRefresh = useCallback(() => {
    if (approvalRefreshQueuedRef.current) return;

    approvalRefreshQueuedRef.current = true;
    window.setTimeout(() => router.refresh(), 1800);
  }, [router]);

  const openApprovedFeedback = useCallback(() => {
    const feedbackKey = `approved:${providerPaymentId ?? subscriptionId}`;
    if (shownFeedbackKeysRef.current.has(feedbackKey)) return;

    shownFeedbackKeysRef.current.add(feedbackKey);
    setFeedbackModal({
      kind: "success",
      title: "Pagamento aprovado. Agora e hora de vender.",
      description: "Parabens pela ativacao. Seus creditos foram liberados e sua operacao ja pode seguir para atender mais leads, responder mais rapido e transformar conversas em vendas.",
      planName,
      credits: includedCredits,
      amountBrl: totalAmount,
    });
  }, [includedCredits, planName, providerPaymentId, subscriptionId, totalAmount]);

  const openRejectedFeedback = useCallback((rejection?: RejectedPaymentCopy | null) => {
    const fallbackRejection = buildRejectedPaymentCopy(
      null,
      "Pagamento recusado. Nenhuma cobranca foi concluida. Tente outro cartao ou use Pix.",
    );
    const feedbackKey = `rejected:${providerPaymentId ?? subscriptionId}:${rejection?.statusDetail ?? "unknown"}`;
    if (shownFeedbackKeysRef.current.has(feedbackKey)) return;

    shownFeedbackKeysRef.current.add(feedbackKey);
    setFeedbackModal({
      kind: "rejected",
      rejection: rejection ?? fallbackRejection,
    });
  }, [providerPaymentId, subscriptionId]);

  const checkPaymentStatus = useCallback(async ({ manual = false }: { manual?: boolean } = {}) => {
    if (manual) {
      setStatusChecking(true);
      setNotice(null);
    }

    try {
      const response = await fetch(`/api/dashboard/billing/checkout/${subscriptionId}/status`, {
        cache: "no-store",
      });
      const data = await response.json().catch(() => null) as CheckoutStatusResponse | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel consultar o pagamento.");
      }

      if (data?.subscriptionStatus) {
        setSubscriptionStatusOverride(data.subscriptionStatus);
      }

      if (data?.paymentStatus) {
        setPaymentStatusOverride(data.paymentStatus);
      }

      if (data?.providerPaymentId) {
        setProviderPaymentId(data.providerPaymentId);
      }

      setPix((current) => ({
        qrCode: data?.pixQrCode ?? current.qrCode,
        qrCodeBase64: data?.pixQrCodeBase64 ?? current.qrCodeBase64,
        ticketUrl: data?.pixTicketUrl ?? current.ticketUrl,
      }));

      if (data?.confirmed || data?.paymentStatus === "approved") {
        setNotice({
          tone: "success",
          message: "Pagamento confirmado. Plano ativo e creditos liberados.",
        });
        openApprovedFeedback();
        setCardStatusPolling(false);
        queueCheckoutRefresh();
        return;
      }

      if (data?.paymentStatus === "rejected") {
        setCardStatusPolling(false);
        openRejectedFeedback();
      }

      if (manual) {
        setNotice({
          tone: "warning",
          message: data?.providerStatus
            ? `${providerLabel} retornou ${data.providerStatus}. Ainda estamos aguardando a confirmacao.`
            : "Pagamento ainda aguardando confirmacao.",
        });
      }
    } catch (error) {
      if (manual) {
        setNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "Nao foi possivel consultar o pagamento.",
        });
      }
    } finally {
      if (manual) {
        setStatusChecking(false);
      }
    }
  }, [openApprovedFeedback, openRejectedFeedback, providerLabel, queueCheckoutRefresh, subscriptionId]);

  useEffect(() => {
    if (checkoutConfirmed) {
      openApprovedFeedback();
      return;
    }

    if (paymentRejected) {
      openRejectedFeedback();
    }
  }, [checkoutConfirmed, openApprovedFeedback, openRejectedFeedback, paymentRejected]);

  useEffect(() => {
    const shouldPollPixStatus = method === "pix" && Boolean(pix.qrCode);
    const shouldPollCardStatus = cardStatusPolling || shouldPollExistingProviderPayment;

    if (!canPay || (!shouldPollPixStatus && !shouldPollCardStatus)) return;

    const firstCheck = window.setTimeout(() => {
      void checkPaymentStatus();
    }, shouldPollCardStatus ? 2500 : 3000);
    const interval = window.setInterval(() => {
      void checkPaymentStatus();
    }, shouldPollCardStatus ? 6000 : 8000);

    return () => {
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
    };
  }, [canPay, cardStatusPolling, checkPaymentStatus, method, pix.qrCode, shouldPollExistingProviderPayment]);

  const handleCardPaymentStatusChange = useCallback((result: CardPaymentStatusChange) => {
    if (result.providerPaymentId) {
      setProviderPaymentId(result.providerPaymentId);
    }

    if (result.status) {
      setPaymentStatusOverride(result.status);
    }

    if (result.approved) {
      setCardStatusPolling(false);
      setNotice({
        tone: "success",
        message: "Pagamento confirmado. Plano ativo e creditos liberados.",
      });
      openApprovedFeedback();
      queueCheckoutRefresh();
      return;
    }

    if (result.rejected) {
      setCardStatusPolling(false);
      setNotice({
        tone: "error",
        message: "Pagamento recusado. Nenhuma cobranca foi concluida. Veja a orientacao na tela ou escolha Pix para liberar o plano.",
      });
      openRejectedFeedback(result.rejection);
      return;
    }

    setCardStatusPolling(true);
    setNotice({
      tone: "warning",
      message: result.hasThreeDSChallenge
        ? "Confirme sua identidade no banco. Depois disso, vamos atualizar o checkout automaticamente."
        : `Pagamento enviado. Estamos consultando a confirmacao do ${providerLabel} automaticamente.`,
    });

    window.setTimeout(() => {
      void checkPaymentStatus();
    }, 2500);
  }, [checkPaymentStatus, openApprovedFeedback, openRejectedFeedback, providerLabel, queueCheckoutRefresh]);

  const handleCardThreeDSComplete = useCallback(() => {
    setCardStatusPolling(true);
    setNotice({
      tone: "warning",
      message: "Autenticacao concluida. Estamos verificando o status do pagamento.",
    });
    void checkPaymentStatus();
  }, [checkPaymentStatus]);

  function toggleBump(code: BillingCheckoutBumpCode) {
    const next = selectedBumpCodes.includes(code)
      ? selectedBumpCodes.filter((item) => item !== code)
      : [...selectedBumpCodes, code];

    setSelectedBumpCodes(next);
    setPix({ qrCode: null, qrCodeBase64: null, ticketUrl: null });
    setProviderPaymentId(null);
    setCardStatusPolling(false);
    setNotice(null);
    void syncCartSelection(next);
  }

  async function syncCartSelection(nextSelectedBumpCodes: BillingCheckoutBumpCode[]) {
    if (!canPay) return;

    setCartSyncing(true);

    try {
      const response = await fetch(`/api/dashboard/billing/checkout/${subscriptionId}/cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedBumpCodes: nextSelectedBumpCodes }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel salvar o carrinho.");
      }
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel salvar o carrinho.",
      });
    } finally {
      setCartSyncing(false);
    }
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
        providerPaymentId?: string | null;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel gerar o Pix.");
      }

      setPix({
        qrCode: data?.pixQrCode ?? null,
        qrCodeBase64: data?.pixQrCodeBase64 ?? null,
        ticketUrl: data?.pixTicketUrl ?? null,
      });
      if (data?.status) {
        setPaymentStatusOverride(data.status);
      }
      if (data?.providerPaymentId) {
        setProviderPaymentId(data.providerPaymentId);
      }
      setNotice({
        tone: data?.status === "approved" ? "success" : "warning",
        message: data?.status === "approved"
          ? "Pagamento aprovado. O plano esta sendo ativado."
          : "Pix gerado. Assim que o pagamento cair, os creditos serao liberados.",
      });
      if (data?.status === "approved") {
        openApprovedFeedback();
        queueCheckoutRefresh();
      }
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel gerar o Pix.",
      });
    } finally {
      setPixLoading(false);
    }
  }

  async function openAsaasCardCheckout() {
    if (!canPay || cardCheckoutLoading) return;

    setCardCheckoutLoading(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/dashboard/billing/checkout/${subscriptionId}/card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedBumpCodes }),
      });
      const data = await response.json().catch(() => null) as {
        error?: string;
        checkoutUrl?: string | null;
        providerPaymentId?: string | null;
        providerStatus?: string | null;
        status?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel abrir o checkout Asaas.");
      }

      if (data?.providerPaymentId) {
        setProviderPaymentId(data.providerPaymentId);
      }
      if (data?.status) {
        setPaymentStatusOverride(data.status);
      }
      setCardStatusPolling(true);
      setNotice({
        tone: "warning",
        message: "Checkout recorrente aberto. Assim que o Asaas confirmar, seu plano sera ativado automaticamente.",
      });

      if (data?.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }

      throw new Error("Asaas nao retornou o link do checkout recorrente.");
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel abrir o checkout Asaas.",
      });
    } finally {
      setCardCheckoutLoading(false);
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

  function switchToPixAndGenerate() {
    setMethod("pix");
    setNotice({
      tone: "warning",
      message: pix.qrCode
        ? "Pix ja esta pronto. Use o QR Code ou copia e cola para concluir."
        : "Vamos gerar o Pix para concluir sem nova tentativa de cartao.",
    });

    if (!pix.qrCode && !pixLoading) {
      void generatePix();
    }
  }

  return (
    <>
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
                Plano {planCode} com {formatCredits(includedCredits)} creditos inclusos. Saldos anteriores continuam na carteira e somam ao plano ativo.
              </p>
              {storageLimitBytes > 0 ? (
                <CheckoutStorageSummary
                  storageLimitBytes={storageLimitBytes}
                  storageFileLimit={storageFileLimit}
                  storageImageMaxBytes={storageImageMaxBytes}
                  storageVideoMaxBytes={storageVideoMaxBytes}
                  storageFileMaxBytes={storageFileMaxBytes}
                />
              ) : null}
            </div>
            <span className={cn(
              "rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wide",
              checkoutConfirmed
                ? "border-emerald-300/35 bg-emerald-400/10 text-emerald-100"
                : paymentRejected
                ? "border-rose-300/35 bg-rose-400/10 text-rose-100"
                : canPay
                ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                : "border-cyan-300/30 bg-cyan-400/10 text-cyan-100",
            )}>
              {checkoutConfirmed ? "Pagamento aprovado" : paymentRejected ? "Pagamento recusado" : canPay ? "Aguardando pagamento" : "Checkout fechado"}
            </span>
          </div>
        </div>

        {availableBumps.length > 0 ? (
        <div className="relative overflow-hidden rounded-[8px] border border-emerald-400/35 bg-slate-950/72 p-5 shadow-[0_0_34px_rgba(16,185,129,0.11)]">
          <div className="pointer-events-none absolute inset-2 rounded-[8px] border border-dashed border-emerald-300/20" />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">
                  Aumento de carrinho
                </div>
                <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-emerald-100">
                  Oferta extra no checkout
                </span>
              </div>
              <h3 className="mt-2 text-lg font-bold text-white">Aumente seu saldo de creditos</h3>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
                Compre mais creditos agora e mantenha seu agente online por mais tempo, sem pausar atendimentos quando o volume crescer.
              </p>
            </div>
            <Sparkles className="h-5 w-5 text-emerald-300" />
          </div>

          <div className="relative mt-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-gradient-to-r from-emerald-300/50 via-cyan-300/20 to-transparent" />
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-100/80">1 clique para adicionar</span>
            {cartSyncing ? (
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-100/80">salvando</span>
            ) : null}
          </div>

          <div className="relative mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {availableBumps.map((bump) => {
              const selected = selectedBumpCodes.includes(bump.code);

              return (
                <button
                  key={bump.code}
                  type="button"
                  disabled={!canPay}
                  onClick={() => toggleBump(bump.code)}
                  className={cn(
                    "flex min-h-[168px] flex-col rounded-[8px] border p-3 text-left transition",
                    selected
                      ? "border-emerald-300/80 bg-emerald-400/12 shadow-lg shadow-emerald-950/30"
                      : "border-slate-700 bg-slate-900/70 hover:border-emerald-300/45 hover:bg-slate-900",
                    !canPay ? "cursor-not-allowed opacity-60" : "",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-slate-300">
                        {bump.badge}
                      </span>
                      {bump.highlightLabel ? (
                        <span className="rounded-full border border-amber-300/35 bg-amber-300/15 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-wide text-amber-100">
                          {bump.highlightLabel}
                        </span>
                      ) : null}
                    </span>
                    <span className={cn(
                      "h-4 w-4 shrink-0 rounded border",
                      selected ? "border-emerald-200 bg-emerald-300" : "border-slate-500 bg-slate-950",
                    )} />
                  </div>
                  {bump.media ? (
                    <OrderBumpMediaPreview bump={bump} />
                  ) : null}
                  <p className="mt-3 line-clamp-2 min-h-10 text-sm font-bold leading-5 text-white">{bump.title}</p>
                  <p className="mt-1.5 line-clamp-2 min-h-10 text-xs leading-5 text-slate-400">{bump.description}</p>
                  <p className="mt-auto pt-3 font-mono text-sm font-black text-cyan-100">
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
                disabled={!cardEnabled}
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

            {method === "card" && billingProvider === "mercado_pago" && cardEnabled && cardPublicKey ? (
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
                rejectedMessage="Pagamento recusado. Nenhuma cobranca foi concluida. Confira os dados do cartao, tente outro cartao ou use Pix."
                showRejectionModal={false}
                onPaymentStatusChange={handleCardPaymentStatusChange}
                onAlternativePaymentRequest={switchToPixAndGenerate}
                onThreeDSComplete={handleCardThreeDSComplete}
              />
            ) : method === "card" && billingProvider === "pagbank" && cardEnabled ? (
              <PagBankCardForm
                key={`${subscriptionId}-pagbank-${totalAmount}-${selectedBumpCodes.join(".")}`}
                sessionId={subscriptionId}
                amount={totalAmount}
                payerEmail={payerEmail}
                payerPhone={payerPhone}
                submitPath={`/api/dashboard/billing/checkout/${subscriptionId}/card`}
                extraPayload={cardExtraPayload}
                successMessage="Pagamento aprovado. Seu plano sera ativado agora."
                pendingMessage="Pagamento enviado ao PagBank. Assim que confirmar, os creditos serao liberados."
                rejectedMessage="Pagamento recusado pelo PagBank. Nenhuma cobranca foi concluida. Confira os dados do cartao ou use Pix."
                onPaymentStatusChange={handleCardPaymentStatusChange}
                onAlternativePaymentRequest={switchToPixAndGenerate}
              />
            ) : method === "card" && billingProvider === "asaas" && cardEnabled ? (
              <AsaasRecurringCheckoutPanel
                amount={totalAmount}
                loading={cardCheckoutLoading}
                providerLabel={providerLabel}
                onOpen={openAsaasCardCheckout}
              />
            ) : (
              <PixPanel
                pix={pix}
                copied={copied}
                checking={statusChecking}
                loading={pixLoading}
                onCopy={copyPixCode}
                onGenerate={generatePix}
                onRefresh={() => void checkPaymentStatus({ manual: true })}
              />
            )}
          </>
        ) : (
          <div className="mt-5 rounded-[8px] border border-emerald-300/30 bg-emerald-400/10 p-4">
            <p className="font-semibold text-white">
              {checkoutConfirmed ? "Pagamento confirmado" : "Plano em processamento"}
            </p>
            <p className="mt-2 text-sm leading-6 text-emerald-50/80">
              {checkoutConfirmed
                ? "Seu plano esta ativo e os creditos ja foram liberados no painel."
                : "Se o pagamento ja foi aprovado, os creditos entram automaticamente no painel."}
            </p>
          </div>
        )}

        {activeNotice ? (
          <div className={cn(
            "mt-4 rounded-[8px] border px-3 py-2 text-sm leading-5",
            activeNotice.tone === "success"
              ? "border-emerald-300/40 bg-emerald-400/12 text-emerald-100"
              : activeNotice.tone === "warning"
                ? "border-amber-300/40 bg-amber-400/12 text-amber-100"
                : "border-rose-300/40 bg-rose-400/12 text-rose-100",
          )}>
            {activeNotice.message}
          </div>
        ) : null}
      </aside>
    </div>
    {feedbackModal ? (
      <CheckoutPaymentFeedbackModal
        feedback={feedbackModal}
        onClose={() => setFeedbackModal(null)}
        onRetryCard={() => {
          setMethod("card");
          setFeedbackModal(null);
        }}
        onUsePix={switchToPixAndGenerate}
        onGoDashboard={() => router.push("/dashboard")}
      />
    ) : null}
    </>
  );
}

function CheckoutStorageSummary({
  storageLimitBytes,
  storageFileLimit,
  storageImageMaxBytes,
  storageVideoMaxBytes,
  storageFileMaxBytes,
}: {
  storageLimitBytes: number;
  storageFileLimit: number;
  storageImageMaxBytes: number;
  storageVideoMaxBytes: number;
  storageFileMaxBytes: number;
}) {
  const details = [
    storageFileLimit > 0 ? { icon: Files, label: `${formatCredits(storageFileLimit)} arquivos armazenados` } : null,
    storageImageMaxBytes > 0 ? { icon: FileImage, label: `Imagem ate ${formatStorageBytes(storageImageMaxBytes)}` } : null,
    storageVideoMaxBytes > 0 ? { icon: FileVideo, label: `Video ate ${formatStorageBytes(storageVideoMaxBytes)}` } : null,
    storageFileMaxBytes > 0 ? { icon: HardDrive, label: `Arquivo ate ${formatStorageBytes(storageFileMaxBytes)}` } : null,
  ].filter((item): item is { icon: LucideIcon; label: string } => Boolean(item));

  return (
    <div className="mt-4 rounded-[8px] border border-cyan-300/20 bg-cyan-300/[0.055] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100">
          <HardDrive className="h-4 w-4 text-cyan-200" />
          Armazenamento incluso
        </span>
        <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 font-mono text-[11px] font-black uppercase tracking-wide text-emerald-100">
          {formatStorageBytes(storageLimitBytes)}
        </span>
      </div>
      {details.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {details.map((detail) => {
            const Icon = detail.icon;

            return (
              <span
                key={detail.label}
                className="inline-flex min-h-8 items-center gap-2 rounded-[6px] border border-white/10 bg-slate-950/45 px-2.5 font-mono text-[10px] font-semibold leading-4 text-slate-300"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-cyan-200/80" />
                <span className="min-w-0 truncate">{detail.label}</span>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function CheckoutPaymentFeedbackModal({
  feedback,
  onClose,
  onGoDashboard,
  onRetryCard,
  onUsePix,
}: {
  feedback: PaymentFeedbackModalState;
  onClose: () => void;
  onGoDashboard: () => void;
  onRetryCard: () => void;
  onUsePix: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (feedback.kind === "success") {
    return (
      <div
        className="fixed inset-0 z-[10000] grid place-items-center overflow-hidden bg-black/75 px-4 py-6 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="billing-success-title"
      >
        <SuccessCelebration />
        <div className="relative w-full max-w-[680px] overflow-hidden rounded-[8px] border border-emerald-200/30 bg-slate-950 shadow-2xl shadow-black/50">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-300 via-cyan-300 to-amber-200" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-[8px] border border-slate-600 text-slate-300 transition hover:border-slate-400 hover:text-white"
            aria-label="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="px-5 pb-5 pt-8 text-center sm:px-8">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-[8px] border border-emerald-300/40 bg-emerald-400/15 text-emerald-100 shadow-lg shadow-emerald-950/30">
              <Trophy className="h-8 w-8" />
            </div>
            <p className="mt-5 font-mono text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200">
              Pagamento aprovado
            </p>
            <h2 id="billing-success-title" className="mx-auto mt-2 max-w-xl text-[28px] font-black leading-tight text-white sm:text-[34px]">
              {feedback.title}
            </h2>
            <p className="mx-auto mt-3 max-w-[560px] text-sm leading-6 text-slate-300">
              {feedback.description}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <SuccessMetric label="Plano ativo" value={feedback.planName} />
              <SuccessMetric label="Creditos liberados" value={formatCredits(feedback.credits)} />
              <SuccessMetric label="Total pago" value={formatMoney(feedback.amountBrl)} />
            </div>

            <div className="mt-6 rounded-[8px] border border-cyan-300/25 bg-cyan-400/10 p-4 text-left">
              <div className="flex items-start gap-3">
                <Rocket className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" />
                <div>
                  <p className="text-sm font-bold text-white">Boas vendas a partir de agora</p>
                  <p className="mt-1 text-sm leading-6 text-cyan-50/80">
                    Sua estrutura esta ativa. Use os creditos para atender melhor, responder com velocidade e transformar cada conversa em uma oportunidade real de crescimento.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2 border-t border-slate-700/80 p-5 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-slate-600 px-4 text-sm font-bold text-slate-100 transition hover:border-cyan-300/60 hover:bg-cyan-300/10"
            >
              Continuar no checkout
            </button>
            <button
              type="button"
              onClick={onGoDashboard}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-emerald-300 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-200"
            >
              <CheckCircle2 className="h-4 w-4" />
              Ir para o painel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (feedback.kind === "rejected") {
    const rejection = feedback.rejection;

    return (
      <div
        className="fixed inset-0 z-[10000] grid place-items-center bg-black/75 px-4 py-6 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="billing-rejection-title"
      >
        <div className="w-full max-w-[640px] overflow-hidden rounded-[8px] border border-rose-200/25 bg-slate-950 shadow-2xl shadow-black/50">
          <div className="flex items-start justify-between gap-4 border-b border-slate-700/80 p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] border border-rose-300/35 bg-rose-400/12 text-rose-100">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-rose-200">
                  Pagamento recusado
                </p>
                <h2 id="billing-rejection-title" className="mt-1 text-[22px] font-black leading-tight text-white">
                  {rejection.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {rejection.description}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-slate-600 text-slate-300 transition hover:border-slate-400 hover:text-white"
              aria-label="Fechar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <FeedbackFact
                label="Cobranca"
                tone="success"
                value="Nenhuma cobranca foi concluida"
              />
              <FeedbackFact
                label="Motivo provavel"
                tone="error"
                value={rejection.reason}
              />
            </div>

            <div className="rounded-[8px] border border-amber-300/35 bg-amber-300/10 p-4">
              <p className="text-sm font-bold text-amber-100">O que fazer agora</p>
              <p className="mt-2 text-sm leading-6 text-amber-50/85">
                {rejection.recommendation}
              </p>
            </div>

            <div className="rounded-[8px] border border-slate-700 bg-slate-900/70 p-4">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">
                Proximos passos
              </p>
              <div className="mt-3 space-y-2">
                {rejection.nextSteps.map((step) => (
                  <div key={step} className="flex gap-2 text-sm leading-5 text-slate-300">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                    <span>{step}</span>
                  </div>
                ))}
              </div>
              {rejection.statusDetail ? (
                <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Codigo do provedor: {rejection.statusDetail}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 border-t border-slate-700/80 p-5 sm:grid-cols-2">
            <button
              type="button"
              onClick={onRetryCard}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] border border-slate-600 px-4 text-sm font-bold text-slate-100 transition hover:border-cyan-300/60 hover:bg-cyan-300/10"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar outro cartao
            </button>
            <button
              type="button"
              onClick={() => {
                onUsePix();
                onClose();
              }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
            >
              <QrCode className="h-4 w-4" />
              Usar Pix agora
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[10000] grid place-items-center bg-black/75 px-4 py-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="billing-processing-title"
    >
      <div className="w-full max-w-[520px] rounded-[8px] border border-amber-200/25 bg-slate-950 p-5 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3">
          <InfinityMark size="sm" className="mt-1 text-amber-200" />
          <div>
            <h2 id="billing-processing-title" className="text-lg font-black text-white">{feedback.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">{feedback.description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuccessCelebration() {
  const pieces = [
    "left-[12%] top-[12%] h-3 w-1.5 bg-emerald-300",
    "left-[20%] top-[28%] h-2 w-6 bg-cyan-300",
    "left-[32%] top-[10%] h-4 w-1.5 bg-amber-200",
    "left-[68%] top-[14%] h-2 w-6 bg-emerald-200",
    "left-[82%] top-[26%] h-4 w-1.5 bg-cyan-200",
    "left-[90%] top-[11%] h-3 w-3 bg-amber-300",
    "left-[15%] bottom-[18%] h-4 w-1.5 bg-cyan-300",
    "left-[74%] bottom-[14%] h-3 w-3 bg-emerald-300",
  ];

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-1/2 top-20 h-28 w-28 -translate-x-1/2 animate-ping rounded-full border border-emerald-300/35" />
      <div className="absolute left-[22%] top-[18%] h-20 w-20 animate-ping rounded-full border border-cyan-300/25" />
      <div className="absolute right-[18%] top-[20%] h-24 w-24 animate-ping rounded-full border border-amber-200/25" />
      {pieces.map((className) => (
        <span
          key={className}
          className={cn("absolute animate-bounce rounded-sm shadow-lg shadow-black/25", className)}
        />
      ))}
    </div>
  );
}

function SuccessMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-emerald-300/25 bg-emerald-400/10 p-3 text-left">
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-200">{label}</p>
      <p className="mt-2 truncate text-sm font-black text-white">{value}</p>
    </div>
  );
}

function FeedbackFact({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "success" | "error";
  value: string;
}) {
  return (
    <div className={cn(
      "rounded-[8px] border p-3",
      tone === "success"
        ? "border-emerald-300/30 bg-emerald-400/10"
        : "border-rose-300/30 bg-rose-400/10",
    )}>
      <p className={cn(
        "font-mono text-[10px] font-bold uppercase tracking-[0.18em]",
        tone === "success" ? "text-emerald-200" : "text-rose-200",
      )}>
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold leading-5 text-white">{value}</p>
    </div>
  );
}

function OrderBumpMediaPreview({ bump }: { bump: BillingCheckoutBump }) {
  const media = bump.media;
  if (!media) return null;

  return (
    <div className="relative mt-3 aspect-square w-full overflow-hidden rounded-[8px] border border-white/10 bg-slate-950/90">
      {media.kind === "video" ? (
        <video
          aria-label={bump.title}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          src={media.storageUrl}
        />
      ) : (
        <Image
          alt={bump.title}
          className="object-cover"
          fill
          sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, (max-width: 1535px) 33vw, 260px"
          src={media.storageUrl}
          unoptimized
        />
      )}
    </div>
  );
}

function AsaasRecurringCheckoutPanel({
  amount,
  loading,
  onOpen,
  providerLabel,
}: {
  amount: number;
  loading: boolean;
  onOpen: () => void;
  providerLabel: string;
}) {
  return (
    <div className="mt-5 rounded-[8px] border border-emerald-300/30 bg-emerald-400/10 p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-emerald-200/35 bg-slate-950/60 text-emerald-100">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-black text-white">Cartao recorrente via {providerLabel}</p>
          <p className="mt-1 text-xs leading-5 text-emerald-50/80">
            Primeira cobranca de {formatMoney(amount)} e renovacao mensal automatica enquanto o plano estiver ativo.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        disabled={loading}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-emerald-300 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-70"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
        {loading ? "Abrindo checkout" : "Abrir checkout recorrente"}
      </button>
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

function buildPaymentStatusNotice(paymentStatus: string, providerLabel: string): NoticeState {
  if (paymentStatus === "approved") {
    return {
      tone: "success",
      message: "Pagamento confirmado. Plano ativo e creditos liberados.",
    };
  }

  if (paymentStatus === "rejected") {
    return {
      tone: "error",
      message: "Pagamento recusado. Nenhuma cobranca foi concluida. Tente outro cartao ou use Pix.",
    };
  }

  if (paymentStatus === "in_process") {
    return {
      tone: "warning",
      message: `Pagamento em analise. Assim que o ${providerLabel} confirmar, os creditos serao liberados.`,
    };
  }

  return null;
}

function PixPanel({
  checking,
  copied,
  loading,
  onCopy,
  onGenerate,
  onRefresh,
  pix,
}: {
  checking: boolean;
  copied: boolean;
  loading: boolean;
  onCopy: () => void;
  onGenerate: () => void;
  onRefresh: () => void;
  pix: PixState;
}) {
  const busy = loading || checking;

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={pix.qrCode ? onRefresh : onGenerate}
        disabled={busy}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
        {loading ? "Gerando Pix" : checking ? "Consultando Pix" : pix.qrCode ? "Atualizar Pix" : "Gerar Pix"}
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

function formatStorageBytes(value: number) {
  const bytes = Math.max(0, Number.isFinite(value) ? value : 0);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let nextValue = bytes;
  let unitIndex = 0;

  while (nextValue >= 1024 && unitIndex < units.length - 1) {
    nextValue /= 1024;
    unitIndex += 1;
  }

  const maximumFractionDigits = nextValue >= 10 || unitIndex === 0 ? 0 : 1;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(nextValue)} ${units[unitIndex]}`;
}
