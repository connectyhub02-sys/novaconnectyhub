"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
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
  onThreeDSComplete?: () => void;
};

type ThreeDSChallenge = {
  externalResourceUrl: string;
  creq: string;
  checkoutUrl: string | null;
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
  onThreeDSComplete,
}: CardBrickProps) {
  const containerId = useMemo(() => `mp-card-${sessionId.replace(/[^a-zA-Z0-9_-]/g, "")}`, [sessionId]);
  const controllerRef = useRef<MercadoPagoBrickController | null>(null);
  const secureFieldObserverRef = useRef<MutationObserver | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);
  const [threeDSChallenge, setThreeDSChallenge] = useState<ThreeDSChallenge | null>(null);

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

              setResult({
                tone: approved ? "success" : rejected ? "error" : "warning",
                message: approved
                  ? successMessage
                  : rejected
                    ? formatRejectedPaymentMessage(data?.providerStatusDetail, rejectedMessage)
                  : pendingMessage,
              });

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

function formatRejectedPaymentMessage(statusDetail: string | null | undefined, fallback: string) {
  const detail = normalizePaymentStatus(statusDetail);

  if (detail === "cc_rejected_insufficient_amount") {
    return "Pagamento recusado: o cartao nao tem saldo ou limite suficiente. Nenhuma cobranca foi concluida. Tente outro cartao ou Pix.";
  }

  if (detail === "cc_rejected_bad_filled_card_number") {
    return "Pagamento recusado: revise o numero do cartao e tente novamente. Nenhuma cobranca foi concluida.";
  }

  if (detail === "cc_rejected_bad_filled_date") {
    return "Pagamento recusado: revise a data de vencimento e tente novamente. Nenhuma cobranca foi concluida.";
  }

  if (detail === "cc_rejected_bad_filled_security_code") {
    return "Pagamento recusado: revise o codigo de seguranca e tente novamente. Nenhuma cobranca foi concluida.";
  }

  if (detail === "cc_rejected_bad_filled_other") {
    return "Pagamento recusado: revise os dados do cartao e tente novamente. Nenhuma cobranca foi concluida.";
  }

  if (detail === "cc_rejected_card_disabled") {
    return "Pagamento recusado: o cartao esta bloqueado ou desabilitado para compras online. Nenhuma cobranca foi concluida.";
  }

  if (detail === "cc_rejected_call_for_authorize") {
    return "Pagamento recusado: o banco pediu autorizacao para esta compra. Fale com o banco ou tente outro cartao.";
  }

  if (detail === "cc_rejected_duplicated_payment") {
    return "Pagamento recusado por tentativa duplicada. Aguarde alguns instantes antes de tentar novamente.";
  }

  if (detail === "cc_rejected_invalid_installments") {
    return "Pagamento recusado: o numero de parcelas nao foi aceito. Tente outra opcao de pagamento.";
  }

  if (detail === "cc_rejected_max_attempts") {
    return "Pagamento recusado: muitas tentativas foram feitas com este cartao. Tente outro cartao ou Pix.";
  }

  if (detail === "cc_rejected_blacklist" || detail === "cc_rejected_high_risk" || detail === "cc_rejected_other_reason") {
    return "Pagamento recusado por seguranca do Mercado Pago ou do banco emissor. Nenhuma cobranca foi concluida. Tente outro cartao ou Pix.";
  }

  return fallback;
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
