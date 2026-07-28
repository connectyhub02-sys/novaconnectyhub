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
}: CardBrickProps) {
  const containerId = useMemo(() => `mp-card-${sessionId.replace(/[^a-zA-Z0-9_-]/g, "")}`, [sessionId]);
  const controllerRef = useRef<MercadoPagoBrickController | null>(null);
  const secureFieldObserverRef = useRef<MutationObserver | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);

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
              } | null;

              if (!response.ok) {
                throw new Error(data?.error ?? "Nao foi possivel processar o cartao.");
              }

              const approved = data?.status === "approved";
              setResult({
                tone: approved ? "success" : "warning",
                message: approved
                  ? successMessage
                  : pendingMessage,
              });

              if (data?.checkoutUrl) {
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
  }, [amount, containerId, extraPayload, payerEmail, pendingMessage, publicKey, sessionId, submitPath, successMessage]);

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

      {result ? (
        <div className={cn(
          "mt-4 rounded-[8px] border px-3 py-2 text-sm",
          result.tone === "success"
            ? "border-emerald-300/40 bg-emerald-400/12 text-emerald-100"
            : result.tone === "warning"
              ? "border-amber-300/40 bg-amber-400/12 text-amber-100"
              : "border-rose-300/40 bg-rose-400/12 text-rose-100",
        )}>
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
