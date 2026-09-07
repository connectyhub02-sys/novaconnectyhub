"use client";
import { useEffect, useState } from "react";
export function StoreSubscription({ sessionId }: { sessionId: string }) {
  const [subscription, setSubscription] = useState<{
      state: string;
      periodEnd: string | null;
      cancelled: boolean;
    } | null>(null),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/checkout/${sessionId}/subscription`)
      .then((r) => r.json())
      .then((d) => {
        if (live) setSubscription(d.subscription);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sessionId]);
  async function cancel() {
    setBusy(true);
    try {
      const response = await fetch(`/api/checkout/${sessionId}/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const d = await response.json();
      if (!response.ok) throw new Error(d.error);
      setSubscription((s) => (s ? { ...s, cancelled: true } : null));
      setMessage(d.message);
      setConfirm(false);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível cancelar.");
    } finally {
      setBusy(false);
    }
  }
  if (!subscription) return null;
  return (
    <section className="mt-4 rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
      <b className="text-slate-950">Sua assinatura</b>
      <p className="mt-1">
        {subscription.cancelled
          ? "Renovação cancelada."
          : "Renovação conforme as condições contratadas."}{" "}
        {subscription.periodEnd
          ? `Período pago até ${new Date(subscription.periodEnd).toLocaleDateString("pt-BR")}.`
          : "Aguardando confirmação do primeiro pagamento."}
      </p>
      {!subscription.cancelled ? (
        confirm ? (
          <div className="mt-3 space-y-2">
            <p>
              Deseja cancelar as próximas renovações? O período já pago
              permanece registrado.
            </p>
            <div className="flex gap-3">
              <button
                disabled={busy}
                onClick={cancel}
                className="min-h-11 rounded-lg bg-slate-800 px-3 font-bold text-white"
              >
                Confirmar cancelamento
              </button>
              <button onClick={() => setConfirm(false)}>
                Manter assinatura
              </button>
            </div>
          </div>
        ) : (
          <button
            className="mt-2 min-h-11 underline"
            onClick={() => setConfirm(true)}
          >
            Cancelar próximas renovações
          </button>
        )
      ) : null}
      {message ? (
        <p role="status" className="mt-2">
          {message}
        </p>
      ) : null}
    </section>
  );
}
