"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, QrCode, RefreshCw, Rocket, ShieldAlert, Trophy, X } from "lucide-react";
import { buildRejectedPaymentCopy, type RejectedPaymentCopy } from "./mercado-pago-card-brick";
import { cn } from "@/lib/utils";

export type CheckoutPaymentFeedbackStatus = "approved" | "rejected" | "cancelled" | "expired" | "refunded" | "error";

export type CheckoutPaymentFeedbackItem = {
  title: string;
  quantity: number;
  total: string | null;
};

export type CheckoutPaymentFeedbackPayload = {
  status: CheckoutPaymentFeedbackStatus;
  organizationName: string;
  orderCode: string;
  amountLabel: string | null;
  items: CheckoutPaymentFeedbackItem[];
  providerStatusDetail?: string | null;
  rejection?: RejectedPaymentCopy | null;
};

type CheckoutPaymentFeedbackModalProps = {
  feedback: CheckoutPaymentFeedbackPayload | null;
  onClose?: () => void;
  onRetryCard?: () => void;
  onUsePix?: () => void;
  whatsappHref?: string | null;
};

export function CheckoutPaymentFeedbackModal({
  feedback,
  onClose,
  onRetryCard,
  onUsePix,
  whatsappHref,
}: CheckoutPaymentFeedbackModalProps) {
  const feedbackKey = feedback
    ? `${feedback.status}:${feedback.orderCode}:${feedback.amountLabel ?? ""}:${feedback.providerStatusDetail ?? ""}`
    : null;
  const [dismissedFeedbackKey, setDismissedFeedbackKey] = useState<string | null>(null);
  const open = Boolean(feedback && feedbackKey !== dismissedFeedbackKey);

  const close = useCallback(() => {
    setDismissedFeedbackKey(feedbackKey);
    onClose?.();
  }, [feedbackKey, onClose]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    if (!open) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, open]);

  const rejection = useMemo(() => {
    if (!feedback || feedback.status === "approved" || feedback.status === "refunded") return null;

    return feedback.rejection ?? buildRejectedPaymentCopy(
      feedback.providerStatusDetail,
      "Pagamento nao concluido. Nenhuma cobranca foi finalizada. Tente outro cartao ou use Pix.",
    );
  }, [feedback]);

  if (!feedback || !open) return null;

  if (feedback.status === "approved") {
    return (
      <div
        className="fixed inset-0 z-[10000] grid place-items-center overflow-hidden bg-slate-950/50 px-4 py-6 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-approved-title"
      >
        <SuccessCelebration />
        <div className="relative w-full max-w-[700px] overflow-hidden rounded-[8px] border border-emerald-200 bg-white shadow-2xl shadow-blue-950/20">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#25D366] via-blue-500 to-amber-300" />
          <CloseButton onClick={close} />

          <div className="px-5 pb-5 pt-8 text-center sm:px-8">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-[8px] border border-emerald-200 bg-emerald-50 text-[#128C4A] shadow-lg shadow-emerald-950/10">
              <Trophy className="h-8 w-8" />
            </div>
            <p className="mt-5 text-xs font-black uppercase text-[#128C4A]">
              Pagamento aprovado
            </p>
            <h2 id="checkout-approved-title" className="mx-auto mt-2 max-w-xl text-[28px] font-black leading-tight text-slate-950 sm:text-[34px]">
              Pedido confirmado. Boas vendas para {feedback.organizationName}.
            </h2>
            <p className="mx-auto mt-3 max-w-[560px] text-sm leading-6 text-slate-600">
              O pagamento foi aprovado e o pedido ja entrou na operacao. Agora e seguir o atendimento com velocidade, cuidado e foco em transformar esse cliente em uma nova recompra.
            </p>

            <CheckoutFeedbackSummary feedback={feedback} tone="success" />

            <div className="mt-6 rounded-[8px] border border-blue-100 bg-blue-50 p-4 text-left">
              <div className="flex items-start gap-3">
                <Rocket className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                <div>
                  <p className="text-sm font-bold text-slate-950">Proximo passo</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Continue pelo WhatsApp oficial da loja para acompanhar preparo, entrega ou acesso ao produto.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2 border-t border-blue-100 p-5 sm:grid-cols-2">
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-blue-100 px-4 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
            >
              Continuar no checkout
            </button>
            {whatsappHref ? (
              <a
                href={whatsappHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-[#25D366] px-4 text-sm font-black text-white transition hover:bg-[#20bf5a]"
              >
                <CheckCircle2 className="h-4 w-4" />
                Voltar ao WhatsApp
              </a>
            ) : (
              <button
                type="button"
                onClick={close}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-[#25D366] px-4 text-sm font-black text-white transition hover:bg-[#20bf5a]"
              >
                <CheckCircle2 className="h-4 w-4" />
                Entendi
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (feedback.status === "refunded") {
    return (
      <div
        className="fixed inset-0 z-[10000] grid place-items-center bg-slate-950/50 px-4 py-6 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-refunded-title"
      >
        <div className="w-full max-w-[620px] overflow-hidden rounded-[8px] border border-amber-200 bg-white shadow-2xl shadow-blue-950/20">
          <CloseButton onClick={close} />
          <div className="p-6">
            <p className="text-xs font-black uppercase text-amber-700">
              Pagamento estornado
            </p>
            <h2 id="checkout-refunded-title" className="mt-2 text-[26px] font-black leading-tight text-slate-950">
              O pagamento deste pedido foi estornado.
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              A loja ja recebeu a atualizacao do pedido. Se precisar continuar o atendimento, volte para o WhatsApp oficial.
            </p>
            <CheckoutFeedbackSummary feedback={feedback} tone="warning" />
          </div>
        </div>
      </div>
    );
  }

  if (!rejection) return null;

  const temporaryGatewayIssue = feedback.status === "error"
    && isTemporaryGatewayIssue(feedback.providerStatusDetail ?? rejection.statusDetail);
  const rejectionTone = temporaryGatewayIssue ? "warning" : "error";

  return (
    <div
      className="fixed inset-0 z-[10000] grid place-items-center bg-slate-950/50 px-4 py-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-rejected-title"
    >
      <div className={cn(
        "w-full max-w-[660px] overflow-hidden rounded-[8px] border bg-white shadow-2xl shadow-blue-950/20",
        temporaryGatewayIssue ? "border-amber-200" : "border-rose-200",
      )}>
        <div className={cn(
          "flex items-start justify-between gap-4 border-b p-5",
          temporaryGatewayIssue ? "border-amber-100" : "border-rose-100",
        )}>
          <div className="flex items-start gap-3">
            <div className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-[8px] border",
              temporaryGatewayIssue ? "border-amber-200 bg-amber-50 text-amber-700" : "border-rose-200 bg-rose-50 text-rose-700",
            )}>
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <p className={cn(
                "text-xs font-bold uppercase",
                temporaryGatewayIssue ? "text-amber-700" : "text-rose-700",
              )}>
                {temporaryGatewayIssue ? "Pagamento em ajuste" : "Pagamento nao concluido"}
              </p>
              <h2 id="checkout-rejected-title" className="mt-1 text-[22px] font-black leading-tight text-slate-950">
                {rejection.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{rejection.description}</p>
            </div>
          </div>
          <CloseButton onClick={close} />
        </div>

        <div className="space-y-4 p-5">
          <CheckoutFeedbackSummary feedback={feedback} tone={rejectionTone} />
          <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-700">O que fazer agora</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{rejection.recommendation}</p>
          </div>
          <div className="rounded-[8px] border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-bold uppercase text-blue-700">
              Proximos passos
            </p>
            <div className="mt-3 space-y-2">
              {rejection.nextSteps.map((step) => (
                <div key={step} className="flex gap-2 text-sm leading-5 text-slate-700">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                  <span>{step}</span>
                </div>
              ))}
            </div>
            {rejection.statusDetail ? (
              <p className="mt-3 text-xs font-semibold uppercase text-slate-500">
                Codigo do provedor: {rejection.statusDetail}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2 border-t border-blue-100 p-5 sm:grid-cols-2">
          {onRetryCard ? (
            <button
              type="button"
              onClick={() => {
                onRetryCard();
                close();
              }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] border border-blue-100 px-4 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar outro cartao
            </button>
          ) : (
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-blue-100 px-4 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
            >
              Fechar
            </button>
          )}
          {onUsePix ? (
            <button
              type="button"
              onClick={() => {
                onUsePix();
                close();
              }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-[#25D366] px-4 text-sm font-black text-white transition hover:bg-[#20bf5a]"
            >
              <QrCode className="h-4 w-4" />
              Usar Pix
            </button>
          ) : whatsappHref ? (
            <a
              href={whatsappHref}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-[#25D366] px-4 text-sm font-black text-white transition hover:bg-[#20bf5a]"
            >
              Voltar ao WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CheckoutFeedbackSummary({
  feedback,
  tone,
}: {
  feedback: CheckoutPaymentFeedbackPayload;
  tone: "success" | "warning" | "error";
}) {
  return (
    <div className="mt-6 rounded-[8px] border border-blue-100 bg-slate-50 p-4 text-left">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryMetric label="Pedido" value={`#${feedback.orderCode}`} tone={tone} />
        <SummaryMetric label="Total" value={feedback.amountLabel ?? "A combinar"} tone={tone} />
        <SummaryMetric label="Loja" value={feedback.organizationName} tone={tone} />
      </div>
      {feedback.items.length > 0 ? (
        <div className="mt-4 divide-y divide-blue-100 overflow-hidden rounded-[8px] border border-blue-100 bg-white">
          {feedback.items.slice(0, 5).map((item, index) => (
            <div key={`${item.title}-${index}`} className="flex items-center justify-between gap-3 px-3 py-3">
              <span
                className="min-w-0 text-sm font-bold leading-5 text-slate-950"
                title={`${item.quantity}x ${item.title}`}
                style={{
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  overflow: "hidden",
                }}
              >
                {item.quantity}x {item.title}
              </span>
              <span className="shrink-0 text-xs font-black text-blue-700">{item.total ?? "A combinar"}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SummaryMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "success" | "warning" | "error";
  value: string;
}) {
  return (
    <div className={cn(
      "rounded-[8px] border p-3",
      tone === "success"
        ? "border-emerald-200 bg-emerald-50"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50"
          : "border-rose-200 bg-rose-50",
    )}>
      <p className={cn(
        "text-[10px] font-bold uppercase",
        tone === "success" ? "text-[#128C4A]" : tone === "warning" ? "text-amber-700" : "text-rose-700",
      )}>{label}</p>
      <p className="mt-2 truncate text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function isTemporaryGatewayIssue(value: string | null | undefined) {
  const detail = value?.trim().toLowerCase();

  return detail === "gateway_unavailable" || detail === "gateway_error";
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
      <div className="absolute left-1/2 top-20 h-28 w-28 -translate-x-1/2 animate-ping rounded-full border border-emerald-300/30" />
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

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-blue-100 text-slate-500 transition hover:border-blue-300 hover:text-blue-700"
      aria-label="Fechar aviso"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
