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
        className="fixed inset-0 z-[10000] grid place-items-center overflow-hidden bg-black/75 px-4 py-6 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-approved-title"
      >
        <SuccessCelebration />
        <div className="relative w-full max-w-[700px] overflow-hidden rounded-[8px] border border-emerald-200/30 bg-slate-950 shadow-2xl shadow-black/50">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-300 via-cyan-300 to-amber-200" />
          <CloseButton onClick={close} />

          <div className="px-5 pb-5 pt-8 text-center sm:px-8">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-[8px] border border-emerald-300/40 bg-emerald-400/15 text-emerald-100 shadow-lg shadow-emerald-950/30">
              <Trophy className="h-8 w-8" />
            </div>
            <p className="mt-5 font-mono text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200">
              Pagamento aprovado
            </p>
            <h2 id="checkout-approved-title" className="mx-auto mt-2 max-w-xl text-[28px] font-black leading-tight text-white sm:text-[34px]">
              Pedido confirmado. Boas vendas para {feedback.organizationName}.
            </h2>
            <p className="mx-auto mt-3 max-w-[560px] text-sm leading-6 text-slate-300">
              O pagamento foi aprovado e o pedido ja entrou na operacao. Agora e seguir o atendimento com velocidade, cuidado e foco em transformar esse cliente em uma nova recompra.
            </p>

            <CheckoutFeedbackSummary feedback={feedback} tone="success" />

            <div className="mt-6 rounded-[8px] border border-cyan-300/25 bg-cyan-400/10 p-4 text-left">
              <div className="flex items-start gap-3">
                <Rocket className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" />
                <div>
                  <p className="text-sm font-bold text-white">Proximo passo</p>
                  <p className="mt-1 text-sm leading-6 text-cyan-50/80">
                    Continue pelo WhatsApp oficial da loja para acompanhar preparo, entrega ou acesso ao produto.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2 border-t border-slate-700/80 p-5 sm:grid-cols-2">
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-slate-600 px-4 text-sm font-bold text-slate-100 transition hover:border-cyan-300/60 hover:bg-cyan-300/10"
            >
              Continuar no checkout
            </button>
            {whatsappHref ? (
              <a
                href={whatsappHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-emerald-300 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-200"
              >
                <CheckCircle2 className="h-4 w-4" />
                Voltar ao WhatsApp
              </a>
            ) : (
              <button
                type="button"
                onClick={close}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-emerald-300 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-200"
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
        className="fixed inset-0 z-[10000] grid place-items-center bg-black/75 px-4 py-6 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-refunded-title"
      >
        <div className="w-full max-w-[620px] overflow-hidden rounded-[8px] border border-violet-200/25 bg-slate-950 shadow-2xl shadow-black/50">
          <CloseButton onClick={close} />
          <div className="p-6">
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.24em] text-violet-200">
              Pagamento estornado
            </p>
            <h2 id="checkout-refunded-title" className="mt-2 text-[26px] font-black leading-tight text-white">
              O pagamento deste pedido foi estornado.
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              A loja ja recebeu a atualizacao do pedido. Se precisar continuar o atendimento, volte para o WhatsApp oficial.
            </p>
            <CheckoutFeedbackSummary feedback={feedback} tone="warning" />
          </div>
        </div>
      </div>
    );
  }

  if (!rejection) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] grid place-items-center bg-black/75 px-4 py-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-rejected-title"
    >
      <div className="w-full max-w-[660px] overflow-hidden rounded-[8px] border border-rose-200/25 bg-slate-950 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4 border-b border-slate-700/80 p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] border border-rose-300/35 bg-rose-400/12 text-rose-100">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-rose-200">
                Pagamento nao concluido
              </p>
              <h2 id="checkout-rejected-title" className="mt-1 text-[22px] font-black leading-tight text-white">
                {rejection.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">{rejection.description}</p>
            </div>
          </div>
          <CloseButton onClick={close} />
        </div>

        <div className="space-y-4 p-5">
          <CheckoutFeedbackSummary feedback={feedback} tone="error" />
          <div className="rounded-[8px] border border-amber-300/35 bg-amber-300/10 p-4">
            <p className="text-sm font-bold text-amber-100">O que fazer agora</p>
            <p className="mt-2 text-sm leading-6 text-amber-50/85">{rejection.recommendation}</p>
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
          {onRetryCard ? (
            <button
              type="button"
              onClick={() => {
                onRetryCard();
                close();
              }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] border border-slate-600 px-4 text-sm font-bold text-slate-100 transition hover:border-cyan-300/60 hover:bg-cyan-300/10"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar outro cartao
            </button>
          ) : (
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-slate-600 px-4 text-sm font-bold text-slate-100 transition hover:border-cyan-300/60 hover:bg-cyan-300/10"
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
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
            >
              <QrCode className="h-4 w-4" />
              Usar Pix
            </button>
          ) : whatsappHref ? (
            <a
              href={whatsappHref}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
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
    <div className="mt-6 rounded-[8px] border border-slate-700 bg-slate-900/70 p-4 text-left">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryMetric label="Pedido" value={`#${feedback.orderCode}`} tone={tone} />
        <SummaryMetric label="Total" value={feedback.amountLabel ?? "A combinar"} tone={tone} />
        <SummaryMetric label="Loja" value={feedback.organizationName} tone={tone} />
      </div>
      {feedback.items.length > 0 ? (
        <div className="mt-4 divide-y divide-slate-700 overflow-hidden rounded-[8px] border border-slate-700/80">
          {feedback.items.slice(0, 5).map((item, index) => (
            <div key={`${item.title}-${index}`} className="flex items-center justify-between gap-3 px-3 py-3">
              <span className="min-w-0 truncate text-sm font-semibold text-white">
                {item.quantity}x {item.title}
              </span>
              <span className="shrink-0 font-mono text-xs font-bold text-cyan-100">{item.total ?? "A combinar"}</span>
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
        ? "border-emerald-300/25 bg-emerald-400/10"
        : tone === "warning"
          ? "border-amber-300/25 bg-amber-400/10"
          : "border-rose-300/25 bg-rose-400/10",
    )}>
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 truncate text-sm font-black text-white">{value}</p>
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

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-slate-600 text-slate-300 transition hover:border-slate-400 hover:text-white"
      aria-label="Fechar aviso"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
