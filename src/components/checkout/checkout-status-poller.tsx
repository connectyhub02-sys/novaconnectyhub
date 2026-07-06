"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type CheckoutStatusPollerProps = {
  sessionId: string;
  initialStatus: string;
  initialOrderStatus: string | null;
};

type StatusResponse = {
  session?: {
    status?: string | null;
    providerStatus?: string | null;
    providerStatusDetail?: string | null;
    failureReason?: string | null;
    updatedAt?: string | null;
  };
  order?: {
    status?: string | null;
    paymentStatus?: string | null;
    fulfillmentStatus?: string | null;
  } | null;
};

const terminalStatuses = new Set(["approved", "rejected", "cancelled", "expired", "refunded", "error"]);

export function CheckoutStatusPoller({
  sessionId,
  initialStatus,
  initialOrderStatus,
}: CheckoutStatusPollerProps) {
  const router = useRouter();
  const refreshedRef = useRef(false);
  const [status, setStatus] = useState(initialStatus);
  const [orderStatus, setOrderStatus] = useState(initialOrderStatus);
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [pollingStopped, setPollingStopped] = useState(false);
  const checking = !terminalStatuses.has(status) && !pollingStopped;

  useEffect(() => {
    if (terminalStatuses.has(status)) {
      return;
    }

    let active = true;
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/checkout/${sessionId}/status`, { cache: "no-store" });
        const data = await response.json().catch(() => null) as StatusResponse | null;
        const nextStatus = data?.session?.status ?? status;
        const nextOrderStatus = data?.order?.status ?? orderStatus;

        if (!active) return;

        setStatus(nextStatus);
        setOrderStatus(nextOrderStatus);
        setProviderStatus(data?.session?.providerStatus ?? null);

        if (terminalStatuses.has(nextStatus)) {
          window.clearInterval(interval);

          if (!refreshedRef.current) {
            refreshedRef.current = true;
            window.setTimeout(() => router.refresh(), 800);
          }
        }
      } catch {
        if (active) setPollingStopped(true);
      }
    }, 4500);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [orderStatus, router, sessionId, status]);

  const tone = useMemo(() => {
    if (status === "approved") return "success";
    if (status === "rejected" || status === "cancelled" || status === "expired" || status === "error") return "error";
    if (status === "refunded") return "warning";
    return "pending";
  }, [status]);

  return (
    <div className={cn(
      "mt-5 flex items-center justify-between gap-3 rounded-[8px] border px-3 py-2 text-sm",
      tone === "success"
        ? "border-emerald-300/40 bg-emerald-400/12 text-emerald-100"
        : tone === "error"
          ? "border-rose-300/40 bg-rose-400/12 text-rose-100"
          : tone === "warning"
            ? "border-amber-300/40 bg-amber-400/12 text-amber-100"
            : "border-cyan-300/40 bg-cyan-400/12 text-cyan-100",
    )}>
      <div>
        <p className="font-semibold">{formatStatus(status)}</p>
        <p className="mt-1 text-xs opacity-80">
          {providerStatus ? `Mercado Pago: ${providerStatus}` : orderStatus ? `Pedido: ${formatOrderStatus(orderStatus)}` : "Aguardando retorno do pagamento"}
        </p>
      </div>
      {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
    </div>
  );
}

function formatStatus(status: string) {
  if (status === "approved") return "Pagamento aprovado";
  if (status === "pending") return "Pagamento em analise";
  if (status === "created") return "Aguardando pagamento";
  if (status === "rejected") return "Pagamento recusado";
  if (status === "cancelled") return "Pagamento cancelado";
  if (status === "expired") return "Pagamento expirado";
  if (status === "refunded") return "Pagamento reembolsado";
  if (status === "error") return "Pagamento com erro";
  return "Status do pagamento";
}

function formatOrderStatus(status: string) {
  if (status === "paid") return "pago";
  if (status === "pending_payment") return "aguardando pagamento";
  if (status === "in_preparation") return "em preparacao";
  if (status === "shipped") return "enviado";
  if (status === "delivered") return "entregue";
  if (status === "cancelled") return "cancelado";
  return status;
}
