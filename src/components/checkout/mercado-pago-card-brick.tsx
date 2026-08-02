"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CreditCard, Loader2, QrCode, RefreshCw, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type JsonRecord = Record<string, unknown>;

type MercadoPagoBrickController = {
  unmount: () => void;
};

type MercadoPagoBrickSettings = {
  initialization: {
    amount: number;
    payer?: {
      email?: string | null;
    };
  };
  customization?: JsonRecord;
  callbacks: {
    onReady: () => void;
    onSubmit: (formData: JsonRecord, additionalData: JsonRecord) => Promise<void>;
    onError: (error: unknown) => void;
  };
};

type MercadoPagoBricksBuilder = {
  create: (
    type: "cardPayment",
    containerId: string,
    settings: MercadoPagoBrickSettings,
  ) => Promise<MercadoPagoBrickController>;
};

type MercadoPagoBrickTheme = "dark" | "default" | "bootstrap" | "flat";

type MercadoPagoInstance = {
  bricks: (options?: { theme?: MercadoPagoBrickTheme }) => MercadoPagoBricksBuilder;
};

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options: { locale: string }) => MercadoPagoInstance;
    MP_DEVICE_SESSION_ID?: string;
  }
}

type CardBrickProps = {
  publicKey: string;
  sessionId: string;
  amount: number;
  payerEmail: string | null;
  submitPath?: string;
  extraPayload?: JsonRecord;
  successMessage?: string;
  pendingMessage?: string;
  rejectedMessage?: string;
  onPaymentStatusChange?: (result: CardPaymentStatusChange) => void;
  onAlternativePaymentRequest?: () => void;
  onThreeDSComplete?: () => void;
};

type ThreeDSChallenge = {
  externalResourceUrl: string;
  creq: string;
  checkoutUrl: string | null;
};

type RejectedPaymentCopy = {
  inlineMessage: string;
  title: string;
  description: string;
  reason: string;
  recommendation: string;
  nextSteps: string[];
  statusDetail: string | null;
};

export type CardPaymentStatusChange = {
  status: string | null;
  providerStatus: string | null;
  providerStatusDetail: string | null;
  providerPaymentId: string | null;
  checkoutUrl: string | null;
  approved: boolean;
  rejected: boolean;
  pending: boolean;
  hasThreeDSChallenge: boolean;
};

let mercadoPagoSdkPromise: Promise<void> | null = null;

const cardBrickSecureFieldBackgroundColor = "#111827";

const cardBrickCustomVariables: JsonRecord = {
  baseColor: "#67e8f9",
  baseColorFirstVariant: "#22d3ee",
  baseColorSecondVariant: "#0891b2",
  textPrimaryColor: "#f8fafc",
  textSecondaryColor: "#cbd5e1",
  inputBackgroundColor: cardBrickSecureFieldBackgroundColor,
  formBackgroundColor: "#1e293b",
  outlinePrimaryColor: "#64748b",
  outlineSecondaryColor: "#94a3b8",
  errorColor: "#fb7185",
  successColor: "#34d399",
  buttonTextColor: "#020617",
  inputFocusedBoxShadow: "0 0 0 1px rgba(103, 232, 249, 0.72)",
  inputErrorFocusedBoxShadow: "0 0 0 1px rgba(251, 113, 133, 0.72)",
  inputBorderWidth: "1px",
  inputFocusedBorderWidth: "1px",
  borderRadiusSmall: "6px",
  borderRadiusMedium: "8px",
  borderRadiusLarge: "10px",
};

export function MercadoPagoCardBrick({
  publicKey,
  sessionId,
  amount,
  payerEmail,
  submitPath,
  extraPayload,
  successMessage = "Pagamento aprovado. Vamos atualizar seu pedido.",
  pendingMessage = "Pagamento enviado. A confirmacao pode levar alguns instantes.",
  rejectedMessage = "Pagamento recusado. Nenhuma cobranca foi concluida. Confira os dados do cartao ou tente outro meio de pagamento.",
  onPaymentStatusChange,
  onAlternativePaymentRequest,
  onThreeDSComplete,
}: CardBrickProps) {
  const containerId = useMemo(() => `mp-card-${sessionId.replace(/[^a-zA-Z0-9_-]/g, "")}`, [sessionId]);
  const controllerRef = useRef<MercadoPagoBrickController | null>(null);
  const secureFieldObserverRef = useRef<MutationObserver | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);
  const [threeDSChallenge, setThreeDSChallenge] = useState<ThreeDSChallenge | null>(null);
  const [rejectionModal, setRejectionModal] = useState<RejectedPaymentCopy | null>(null);

  useEffect(() => {
    if (!threeDSChallenge) return;

    const activeChallenge = threeDSChallenge;

    function handleThreeDSMessage(event: MessageEvent) {
      if (readThreeDSMessageStatus(event.data) !== "COMPLETE") {
        return;
      }

      setThreeDSChallenge(null);
      setResult({
        tone: "warning",
        message: "Autenticacao concluida. Estamos verificando o status do pagamento.",
      });
      onThreeDSComplete?.();

      window.setTimeout(() => {
        if (activeChallenge.checkoutUrl) {
          window.location.href = activeChallenge.checkoutUrl;
        } else {
          window.location.reload();
        }
      }, 1500);
    }

    window.addEventListener("message", handleThreeDSMessage);

    return () => window.removeEventListener("message", handleThreeDSMessage);
  }, [onThreeDSComplete, threeDSChallenge]);

  useEffect(() => {
    let mounted = true;

    async function mountBrick() {
      setReady(false);
      setResult(null);
      setRejectionModal(null);
      await loadMercadoPagoSdk();

      if (!mounted || !window.MercadoPago) return;

      secureFieldObserverRef.current?.disconnect();
      const container = document.getElementById(containerId);
      if (container && typeof MutationObserver !== "undefined") {
        secureFieldObserverRef.current = new MutationObserver(() => styleMercadoPagoSecureFields(containerId));
        secureFieldObserverRef.current.observe(container, { childList: true, subtree: true });
      }

      const mercadoPago = new window.MercadoPago(publicKey, { locale: "pt-BR" });
      const bricksBuilder = mercadoPago.bricks({ theme: "dark" });
      controllerRef.current = await bricksBuilder.create("cardPayment", containerId, {
        initialization: {
          amount,
          payer: {
            email: payerEmail,
          },
        },
        customization: {
          visual: {
            style: {
              theme: "dark",
              customVariables: cardBrickCustomVariables,
            },
          },
          paymentMethods: {
            creditCard: "all",
            debitCard: "all",
          },
        },
        callbacks: {
          onReady: () => {
            styleMercadoPagoSecureFields(containerId);
            window.setTimeout(() => styleMercadoPagoSecureFields(containerId), 250);
            if (mounted) setReady(true);
          },
          onSubmit: async (formData, additionalData) => {
            setSubmitting(true);
            setResult(null);
            setRejectionModal(null);
            setThreeDSChallenge(null);

            try {
              const deviceSessionId = readMercadoPagoDeviceSessionId();
              const response = await fetch(submitPath ?? `/api/checkout/${sessionId}/card`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(deviceSessionId ? { "X-Meli-Session-Id": deviceSessionId } : {}),
                },
                body: JSON.stringify({ formData, additionalData, deviceSessionId, ...(extraPayload ?? {}) }),
              });
              const data = await response.json().catch(() => null) as {
                error?: string;
                checkoutUrl?: string;
                status?: string;
                providerStatus?: string;
                providerStatusDetail?: string | null;
                providerPaymentId?: string | null;
                threeDSChallenge?: {
                  externalResourceUrl?: string;
                  creq?: string;
                } | null;
              } | null;

              if (!response.ok) {
                throw new Error(data?.error ?? "Nao foi possivel processar o cartao.");
              }

              const paymentStatus = normalizePaymentStatus(data?.status);
              const providerStatus = normalizePaymentStatus(data?.providerStatus);
              const approved = paymentStatus === "approved" || providerStatus === "approved";
              const rejected = isRejectedPaymentStatus(paymentStatus) || isRejectedPaymentStatus(providerStatus);
              const challenge = readThreeDSChallenge(data?.threeDSChallenge, data?.checkoutUrl ?? null);

              onPaymentStatusChange?.({
                status: data?.status ?? null,
                providerStatus: data?.providerStatus ?? null,
                providerStatusDetail: data?.providerStatusDetail ?? null,
                providerPaymentId: data?.providerPaymentId ?? null,
                checkoutUrl: data?.checkoutUrl ?? null,
                approved,
                rejected,
                pending: !approved && !rejected,
                hasThreeDSChallenge: Boolean(challenge),
              });

              if (challenge) {
                setThreeDSChallenge(challenge);
                setResult({
                  tone: "warning",
                  message: "Confirme sua identidade no banco para continuar o pagamento.",
                });
                return;
              }

              const rejectionCopy = rejected ? buildRejectedPaymentCopy(data?.providerStatusDetail, rejectedMessage) : null;

              setResult({
                tone: approved ? "success" : rejected ? "error" : "warning",
                message: approved
                  ? successMessage
                  : rejected
                    ? rejectionCopy?.inlineMessage ?? rejectedMessage
                  : pendingMessage,
              });

              if (rejectionCopy) {
                setRejectionModal(rejectionCopy);
              }

              if (data?.checkoutUrl && !rejected) {
                window.setTimeout(() => {
                  window.location.href = data.checkoutUrl!;
                }, 1200);
              }
            } catch (error) {
              setResult({
                tone: "error",
                message: error instanceof Error ? error.message : "Nao foi possivel processar o cartao.",
              });
              throw error;
            } finally {
              setSubmitting(false);
            }
          },
          onError: (error) => {
            setResult({
              tone: "error",
              message: error instanceof Error ? error.message : "Erro no formulario de pagamento.",
            });
          },
        },
      });
    }

    void mountBrick();

    return () => {
      mounted = false;
      secureFieldObserverRef.current?.disconnect();
      secureFieldObserverRef.current = null;
      controllerRef.current?.unmount();
      controllerRef.current = null;
    };
  }, [amount, containerId, extraPayload, onPaymentStatusChange, payerEmail, pendingMessage, publicKey, rejectedMessage, sessionId, submitPath, successMessage]);

  return (
    <div className="mt-6 rounded-[8px] border border-slate-700 bg-slate-900/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Cartao de credito ou debito</p>
          <p className="mt-1 text-xs text-slate-400">Pagamento transparente com Mercado Pago.</p>
        </div>
        {!ready || submitting ? <Loader2 className="h-4 w-4 animate-spin text-cyan-200" /> : null}
      </div>

      <div id={containerId} className="mercado-pago-card-brick mt-4 min-h-[260px]" />
      <input id="deviceId" name="deviceId" type="hidden" />

      {threeDSChallenge ? (
        <MercadoPagoThreeDSChallenge
          challenge={threeDSChallenge}
          frameName={`${containerId}-3ds`}
        />
      ) : null}

      {result ? (
        <div className={cn(
          "mt-4 rounded-[8px] border px-3 py-2 text-sm leading-5",
          result.tone === "success"
            ? "border-emerald-300/40 bg-emerald-400/12 text-emerald-100"
            : result.tone === "warning"
              ? "border-amber-300/40 bg-amber-400/12 text-amber-100"
              : "border-rose-300/40 bg-rose-400/12 text-rose-100",
        )} role="status" aria-live="polite">
          {result.message}
        </div>
      ) : null}

      {rejectionModal ? (
        <CardPaymentRejectionModal
          rejection={rejectionModal}
          onClose={() => setRejectionModal(null)}
          onUsePix={onAlternativePaymentRequest}
        />
      ) : null}
    </div>
  );
}

function readMercadoPagoDeviceSessionId() {
  const hiddenInput = document.getElementById("deviceId");
  const hiddenValue = hiddenInput instanceof HTMLInputElement ? hiddenInput.value.trim() : "";
  const globalValue = window.MP_DEVICE_SESSION_ID?.trim() ?? "";

  return globalValue || hiddenValue || null;
}

function MercadoPagoThreeDSChallenge({
  challenge,
  frameName,
}: {
  challenge: ThreeDSChallenge;
  frameName: string;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    formRef.current?.submit();
  }, [challenge]);

  return (
    <div className="mt-4 overflow-hidden rounded-[8px] border border-amber-300/35 bg-slate-950/80">
      <iframe
        className="h-[520px] w-full border-0 bg-white"
        name={frameName}
        title="Autenticacao 3DS do cartao"
      />
      <form
        ref={formRef}
        action={challenge.externalResourceUrl}
        className="hidden"
        method="post"
        target={frameName}
      >
        <input name="creq" type="hidden" value={challenge.creq} />
      </form>
    </div>
  );
}

function styleMercadoPagoSecureFields(containerId: string) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.querySelectorAll<HTMLIFrameElement>("iframe").forEach((iframe) => {
    iframe.style.setProperty("background", cardBrickSecureFieldBackgroundColor, "important");
    iframe.style.setProperty("background-color", cardBrickSecureFieldBackgroundColor, "important");
    iframe.style.setProperty("border-radius", "6px", "important");
    iframe.style.setProperty("color-scheme", "dark", "important");
  });
}

function normalizePaymentStatus(status: string | null | undefined) {
  return typeof status === "string" ? status.trim().toLowerCase() : null;
}

function isRejectedPaymentStatus(status: string | null) {
  return status === "rejected" || status === "cancelled" || status === "canceled" || status === "expired" || status === "error";
}

function buildRejectedPaymentCopy(statusDetail: string | null | undefined, fallback: string): RejectedPaymentCopy {
  const detail = normalizePaymentStatus(statusDetail);
  const commonSteps = [
    "Confira numero, validade, codigo de seguranca, CPF e nome do titular.",
    "Tente outro cartao ou use Pix para liberar o plano imediatamente.",
  ];

  if (detail === "cc_rejected_insufficient_amount") {
    return {
      inlineMessage: "Pagamento recusado por limite insuficiente. Nenhuma cobranca foi concluida.",
      title: "O cartao nao autorizou este valor",
      description: "O banco emissor informou que o cartao nao tem saldo ou limite suficiente para concluir a compra.",
      reason: "Limite ou saldo insuficiente.",
      recommendation: "Use outro cartao com limite disponivel ou pague por Pix.",
      nextSteps: commonSteps,
      statusDetail: detail,
    };
  }

  if (detail === "cc_rejected_bad_filled_card_number") {
    return {
      inlineMessage: "Pagamento recusado. Revise o numero do cartao e tente novamente.",
      title: "Revise o numero do cartao",
      description: "O Mercado Pago recebeu a tentativa, mas o numero do cartao parece estar incorreto ou incompleto.",
      reason: "Numero do cartao invalido.",
      recommendation: "Digite novamente os dados do cartao com calma ou tente outro meio de pagamento.",
      nextSteps: commonSteps,
      statusDetail: detail,
    };
  }

  if (detail === "cc_rejected_bad_filled_date") {
    return {
      inlineMessage: "Pagamento recusado. Revise a validade do cartao e tente novamente.",
      title: "Revise a data de vencimento",
      description: "A validade informada nao foi aceita pelo Mercado Pago ou pelo banco emissor.",
      reason: "Data de vencimento invalida.",
      recommendation: "Confira mes e ano do cartao antes de tentar de novo.",
      nextSteps: commonSteps,
      statusDetail: detail,
    };
  }

  if (detail === "cc_rejected_bad_filled_security_code") {
    return {
      inlineMessage: "Pagamento recusado. Revise o codigo de seguranca e tente novamente.",
      title: "Revise o codigo de seguranca",
      description: "O codigo de seguranca informado nao foi aceito pelo banco emissor.",
      reason: "Codigo de seguranca invalido.",
      recommendation: "Confira o CVV no cartao e tente novamente.",
      nextSteps: commonSteps,
      statusDetail: detail,
    };
  }

  if (detail === "cc_rejected_bad_filled_other") {
    return {
      inlineMessage: "Pagamento recusado. Revise os dados do cartao e tente novamente.",
      title: "Revise os dados do cartao",
      description: "Alguma informacao do cartao nao foi aceita pelo Mercado Pago ou pelo banco emissor.",
      reason: "Dados do cartao nao validados.",
      recommendation: "Confira todos os campos antes de reenviar a tentativa.",
      nextSteps: commonSteps,
      statusDetail: detail,
    };
  }

  if (detail === "cc_rejected_card_disabled") {
    return {
      inlineMessage: "Pagamento recusado. O cartao pode estar bloqueado para compras online.",
      title: "Cartao nao habilitado para esta compra",
      description: "O banco emissor recusou a compra porque o cartao pode estar bloqueado, desabilitado ou sem permissao para compra online.",
      reason: "Cartao bloqueado ou desabilitado.",
      recommendation: "Libere compras online no aplicativo do banco ou use outro cartao.",
      nextSteps: commonSteps,
      statusDetail: detail,
    };
  }

  if (detail === "cc_rejected_call_for_authorize") {
    return {
      inlineMessage: "Pagamento recusado. O banco pediu autorizacao para esta compra.",
      title: "O banco precisa autorizar a compra",
      description: "O banco emissor bloqueou a tentativa e pode pedir confirmacao pelo aplicativo, SMS ou atendimento.",
      reason: "Autorizacao exigida pelo banco.",
      recommendation: "Autorize a compra no banco e tente novamente, ou use Pix.",
      nextSteps: [
        "Confira se o aplicativo do banco pediu confirmacao da compra.",
        "Depois da autorizacao, tente pagar novamente ou use Pix.",
      ],
      statusDetail: detail,
    };
  }

  if (detail === "cc_rejected_duplicated_payment") {
    return {
      inlineMessage: "Pagamento recusado por tentativa duplicada. Aguarde alguns instantes.",
      title: "Tentativa duplicada detectada",
      description: "O Mercado Pago identificou uma tentativa muito parecida feita em pouco tempo e bloqueou para evitar cobranca repetida.",
      reason: "Tentativa duplicada.",
      recommendation: "Aguarde alguns minutos antes de tentar novamente ou use Pix.",
      nextSteps: [
        "Espere alguns minutos para evitar novo bloqueio automatico.",
        "Se precisa liberar agora, escolha Pix.",
      ],
      statusDetail: detail,
    };
  }

  if (detail === "cc_rejected_invalid_installments") {
    return {
      inlineMessage: "Pagamento recusado. A quantidade de parcelas nao foi aceita.",
      title: "Parcelamento nao autorizado",
      description: "O banco emissor ou o Mercado Pago nao aceitou a condicao de parcelamento escolhida.",
      reason: "Parcela nao autorizada.",
      recommendation: "Tente pagar em uma parcela, use outro cartao ou escolha Pix.",
      nextSteps: commonSteps,
      statusDetail: detail,
    };
  }

  if (detail === "cc_rejected_max_attempts") {
    return {
      inlineMessage: "Pagamento recusado por muitas tentativas. Use outro cartao ou Pix.",
      title: "Muitas tentativas com este cartao",
      description: "Por seguranca, o Mercado Pago bloqueou novas tentativas parecidas com este cartao por enquanto.",
      reason: "Limite de tentativas atingido.",
      recommendation: "Tente outro cartao ou use Pix para liberar o plano agora.",
      nextSteps: [
        "Evite insistir varias vezes com os mesmos dados.",
        "Use outro cartao ou Pix para concluir sem esperar.",
      ],
      statusDetail: detail,
    };
  }

  if (detail === "cc_rejected_blacklist" || detail === "cc_rejected_high_risk" || detail === "cc_rejected_other_reason") {
    return {
      inlineMessage: "Pagamento recusado por seguranca. Nenhuma cobranca foi concluida.",
      title: "A compra nao passou na validacao de seguranca",
      description: "O Mercado Pago ou o banco emissor recusou esta tentativa automaticamente. Isso pode acontecer por regra antifraude, muitas tentativas recentes, cartao vinculado a outra conta ou divergencia nos dados.",
      reason: "Validacao de seguranca do Mercado Pago ou do banco emissor.",
      recommendation: "Para liberar o plano agora, use Pix ou tente outro cartao com dados do titular corretos.",
      nextSteps: [
        "Use um cartao diferente, com CPF e nome do titular corretos.",
        "Evite varias tentativas seguidas com o mesmo cartao.",
        "Escolha Pix se quiser liberar o plano imediatamente.",
      ],
      statusDetail: detail,
    };
  }

  return {
    inlineMessage: fallback,
    title: "Nao conseguimos aprovar este pagamento",
    description: "A tentativa foi enviada ao Mercado Pago, mas nao foi autorizada pelo provedor de pagamento ou pelo banco emissor.",
    reason: "Pagamento nao autorizado.",
    recommendation: "Confira os dados, tente outro cartao ou escolha Pix.",
    nextSteps: commonSteps,
    statusDetail: detail,
  };
}

function CardPaymentRejectionModal({
  rejection,
  onClose,
  onUsePix,
}: {
  rejection: RejectedPaymentCopy;
  onClose: () => void;
  onUsePix?: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[10000] grid place-items-center bg-black/75 px-4 py-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-rejection-title"
    >
      <div className="w-full max-w-[620px] overflow-hidden rounded-[8px] border border-rose-200/25 bg-slate-950 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4 border-b border-slate-700/80 p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] border border-rose-300/35 bg-rose-400/12 text-rose-100">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-rose-200">
                Cartao recusado
              </p>
              <h2 id="card-rejection-title" className="mt-1 text-[22px] font-black leading-tight text-white">
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
            <PaymentRejectionFact
              icon={<CreditCard className="h-4 w-4" />}
              label="Cobranca"
              value="Nenhuma cobranca foi concluida"
              tone="emerald"
            />
            <PaymentRejectionFact
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Motivo provavel"
              value={rejection.reason}
              tone="rose"
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
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] border border-slate-600 px-4 text-sm font-bold text-slate-100 transition hover:border-cyan-300/60 hover:bg-cyan-300/10"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar outro cartao
          </button>
          <button
            type="button"
            onClick={() => {
              onUsePix?.();
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

function PaymentRejectionFact({
  icon,
  label,
  tone,
  value,
}: {
  icon: ReactNode;
  label: string;
  tone: "emerald" | "rose";
  value: string;
}) {
  return (
    <div className={cn(
      "rounded-[8px] border p-3",
      tone === "emerald"
        ? "border-emerald-300/30 bg-emerald-400/10"
        : "border-rose-300/30 bg-rose-400/10",
    )}>
      <div className={cn(
        "flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em]",
        tone === "emerald" ? "text-emerald-200" : "text-rose-200",
      )}>
        {icon}
        {label}
      </div>
      <p className="mt-2 text-sm font-semibold leading-5 text-white">{value}</p>
    </div>
  );
}

function readThreeDSChallenge(value: unknown, checkoutUrl: string | null): ThreeDSChallenge | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as JsonRecord;
  const externalResourceUrl = typeof record.externalResourceUrl === "string" ? record.externalResourceUrl.trim() : "";
  const creq = typeof record.creq === "string" ? record.creq.trim() : "";

  if (!externalResourceUrl || !creq) {
    return null;
  }

  return { externalResourceUrl, creq, checkoutUrl };
}

function readThreeDSMessageStatus(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const status = (value as JsonRecord).status;

  return typeof status === "string" ? status : null;
}

function loadMercadoPagoSdk() {
  if (window.MercadoPago) {
    return Promise.resolve();
  }

  if (mercadoPagoSdkPromise) {
    return mercadoPagoSdkPromise;
  }

  mercadoPagoSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-mercado-pago-sdk]");

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Nao foi possivel carregar Mercado Pago.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.dataset.mercadoPagoSdk = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Nao foi possivel carregar Mercado Pago.")), { once: true });
    document.head.appendChild(script);
  });

  return mercadoPagoSdkPromise;
}
