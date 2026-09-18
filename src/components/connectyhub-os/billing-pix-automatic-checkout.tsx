"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

export type PixAutomaticSnapshot = {
  enabled: boolean; reason: string | null; amount: number; recurringAmount: number; recurrenceLabel: string; revision: number; consentVersion: string;
  authorization: { id: string; state: string; active: boolean; qrCode: string | null; qrImage: string | null; expiresAt: string | null; error: string | null; canRetry: boolean } | null;
};
export function BillingPixAutomaticCheckout({ subscriptionId, initial, onChange, cartSyncing }: { subscriptionId: string; initial: PixAutomaticSnapshot; onChange: (snapshot: PixAutomaticSnapshot) => void; cartSyncing: boolean }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const requestId = useRef<string | null>(null);
  const locked = useRef(false);
  const endpoint = `/api/dashboard/billing/checkout/${subscriptionId}/pix-automatic`;
  const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const update = useCallback((next: PixAutomaticSnapshot) => { setSnapshot(next); onChange(next); }, [onChange]);
  const refresh = useCallback(async () => {
    const response = await fetch(`${endpoint}?reconcile=1`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Não foi possível conferir a autorização.");
    update(data);
  }, [endpoint, update]);
  useEffect(() => {
    if (!snapshot.authorization || snapshot.authorization.active || snapshot.authorization.canRetry) return;
    const timer = window.setInterval(() => { void refresh().catch(error => setMessage(error.message)); }, 8000);
    return () => window.clearInterval(timer);
  }, [refresh, snapshot.authorization]);
  async function create() {
    if (locked.current || busy || cartSyncing || !accepted || !snapshot.enabled) return;
    locked.current = true; setBusy(true); setMessage("");
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: requestId.current, amount: snapshot.amount, recurringAmount: snapshot.recurringAmount, revision: snapshot.revision, acceptRecurring: true, consentVersion: snapshot.consentVersion }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível gerar a autorização.");
      update({ ...snapshot, authorization: data.authorization });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Resultado em conferência.");
      // Read the durable operation; never retry a financial POST automatically.
      await refresh().catch(() => null);
    } finally { locked.current = false; setBusy(false); }
  }
  const authorization = snapshot.authorization;
  return <section className="mt-4 space-y-3 rounded-xl border border-slate-300 bg-white p-4 text-slate-900">
    <h3 className="font-semibold">Pix Automático</h3>
    <p className="text-sm">Pague {money(snapshot.amount)} agora e autorize no seu banco as próximas renovações: {money(snapshot.recurringAmount)} · {snapshot.recurrenceLabel.toLowerCase()}.</p>
    <p className="text-xs text-slate-600">O plano só será liberado após confirmação do primeiro pagamento e da autorização. Recargas de créditos não fazem parte deste consentimento.</p>
    {authorization?.active ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Pagamento confirmado e Pix Automático ativo. Seu plano está sendo atualizado.</p> : authorization && !authorization.canRetry ? <>
      <p role="status" className="text-sm">{authorization.state === "CREATED" ? "Escaneie o QR Code e confirme o pagamento e a recorrência no app do banco." : ["CANCELLED", "EXPIRED"].includes(authorization.state) ? "A autorização foi encerrada. Confira com a equipe antes de iniciar outro pagamento." : "Aguardando confirmação do banco. Não faça outro pagamento enquanto conferimos."}</p>
      {authorization.qrImage && /^[A-Za-z0-9+/=\r\n]+$/.test(authorization.qrImage) ? <Image unoptimized width={220} height={220} src={`data:image/png;base64,${authorization.qrImage}`} alt="QR Code de Pix Automático: primeiro pagamento e autorização recorrente" className="mx-auto" /> : null}
      {authorization.qrCode ? <><textarea readOnly aria-label="Pix Automático copia e cola" value={authorization.qrCode} className="w-full rounded border p-2 text-xs" /><button type="button" onClick={() => void navigator.clipboard.writeText(authorization.qrCode!).then(() => setMessage("Código copiado.")).catch(() => setMessage("Selecione e copie o código acima."))} className="min-h-11 rounded-lg border px-3 text-sm">Copiar código</button></> : null}
      <button type="button" disabled={busy} onClick={() => void refresh().catch(error => setMessage(error.message))} className="ml-2 min-h-11 text-sm text-blue-700 underline">Conferir confirmação</button>
    </> : snapshot.enabled ? <>
      {authorization?.canRetry ? <p role="status" className="text-sm text-amber-800">A autorização anterior não foi concluída. Você pode iniciar uma nova solicitação.</p> : null}
      <p className="text-xs text-slate-600">A disponibilidade será validada pelo Asaas ao gerar a autorização desta nova contratação.</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} className="mt-1" />Autorizo o primeiro pagamento e as renovações recorrentes nos valores acima. Confirmarei essa autorização no meu banco. Tentativas no dia seguem as regras do banco; não autorizo retentativas em dias posteriores.</label>
      <button type="button" disabled={!accepted || busy || cartSyncing} onClick={() => { if (authorization?.canRetry) requestId.current = null; void create(); }} className="min-h-11 w-full rounded-lg bg-blue-700 px-3 font-semibold text-white disabled:opacity-50">{busy ? "Preparando autorização…" : "Gerar Pix Automático"}</button>
    </> : <p role="status" className="text-sm">{snapshot.reason}</p>}
    {message ? <p role="status" className="text-sm text-slate-700">{message}</p> : null}
  </section>;
}
