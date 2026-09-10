"use client";
import { useEffect, useState } from "react";
type Visit = {
  id: string;
  description: string;
  kind: string;
  occurred_at: string;
  return_at: string | null;
  return_status: string;
};
export function LeadReturnsPanel({
  companyId,
  leadId,
}: {
  companyId: string;
  leadId: string;
}) {
  const [visits, setVisits] = useState<Visit[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [editing, setEditing] = useState(false),
    [revision, setRevision] = useState(0);
  const [description, setDescription] = useState(""),
    [kind, setKind] = useState("service"),
    [occurred, setOccurred] = useState(""),
    [returnAt, setReturnAt] = useState(""),
    [requestKey, setRequestKey] = useState("");
  const [paused, setPaused] = useState(false),
    [windowStart, setWindowStart] = useState(""),
    [windowEnd, setWindowEnd] = useState("");
  const localDate = (date: Date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  async function update(payload: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard/lead-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, leadId, ...payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Falha ao atualizar.",
      );
    } finally {
      setSaving(false);
    }
  }
  const [timing, setTiming] = useState<{
    hour: number;
    observedDays: number;
    confidence: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/dashboard/lead-returns?companyId=${encodeURIComponent(companyId)}&leadId=${encodeURIComponent(leadId)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!controller.signal.aborted) {
          setVisits(data.visits);
          setTiming(data.profile?.evidence?.contactWindow ?? null);
          setPaused(data.profile?.preferences?.paused === true);
          setWindowStart(data.profile?.preferences?.windowStart ?? "");
          setWindowEnd(data.profile?.preferences?.windowEnd ?? "");
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [companyId, leadId, revision]);
  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard/lead-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          leadId,
          description,
          kind,
          occurredAt: new Date(occurred).toISOString(),
          returnAt: returnAt ? new Date(returnAt).toISOString() : null,
          requestKey,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEditing(false);
      setRevision((value) => value + 1);
      setDescription("");
      setReturnAt("");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Não foi possível salvar.",
      );
    } finally {
      setSaving(false);
    }
  }
  const input =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800";
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
        Visitas, compras e retornos
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-slate-600">
          Registre o atendimento e, se fizer sentido, quando convidar este
          contato para voltar. O convite depende do Follow-up inteligente estar
          ativo.
        </p>
        {timing && (
          <p className="text-xs text-slate-500">
            Interações observadas por volta de {timing.hour}h em{" "}
            {timing.observedDays} dias. É uma estimativa de horário, não uma
            garantia de disponibilidade.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        <details className="rounded-lg border border-slate-100 p-2 text-sm">
          <summary className="cursor-pointer">
            Preferências de follow-up deste contato
          </summary>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={paused}
                onChange={(e) => setPaused(e.target.checked)}
              />
              Pausar todas as abordagens de follow-up
            </label>
            <p className="text-xs text-slate-500">
              Horário preferido informado pelo cliente, no fuso da empresa
              (opcional).
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label>
                Das
                <input
                  type="time"
                  className={input}
                  value={windowStart}
                  onChange={(e) => setWindowStart(e.target.value)}
                />
              </label>
              <label>
                Até
                <input
                  type="time"
                  className={input}
                  value={windowEnd}
                  onChange={(e) => setWindowEnd(e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={saving}
              className="rounded border px-3 py-2"
              onClick={() =>
                update({
                  action: "preferences",
                  paused,
                  windowStart,
                  windowEnd,
                })
              }
            >
              Salvar preferências
            </button>
          </div>
        </details>
        <button
          type="button"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          onClick={() => {
            setEditing((value) => !value);
            setRequestKey(crypto.randomUUID());
            if (!occurred) setOccurred(localDate(new Date()));
          }}
        >
          Registrar visita ou compra
        </button>
        <div hidden={!editing} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {[7, 15, 30].map((days) => (
              <button
                type="button"
                key={days}
                className="rounded-lg border px-3 py-2 text-xs"
                onClick={() =>
                  setReturnAt(
                    localDate(
                      new Date(
                        (occurred ? Date.parse(occurred) : Date.now()) +
                          days * 86400000,
                      ),
                    ),
                  )
                }
              >
                Convidar em {days} dias
              </button>
            ))}
          </div>
          <label className="block text-sm">
            O que aconteceu?
            <input
              className={input}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Corte de cabelo"
            />
          </label>
          <label className="block text-sm">
            Tipo
            <select
              className={input}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="service">Serviço realizado</option>
              <option value="purchase">Compra</option>
              <option value="visit">Visita</option>
            </select>
          </label>
          <label className="block text-sm">
            Data do atendimento
            <input
              className={input}
              type="datetime-local"
              value={occurred}
              onChange={(e) => setOccurred(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Convidar para voltar em (opcional)
            <input
              className={input}
              type="datetime-local"
              value={returnAt}
              onChange={(e) => setReturnAt(e.target.value)}
            />
          </label>
          <p className="text-xs text-slate-500">
            Datas no horário deste dispositivo. O retorno é um convite; não
            reserva uma vaga.
          </p>
          <button
            type="button"
            disabled={saving || !description.trim() || !occurred}
            onClick={save}
            className="rounded-lg bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Registrar"}
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">Carregando…</p>
        ) : !visits.length ? (
          <p className="text-sm text-slate-500">
            Nenhum atendimento registrado.
          </p>
        ) : (
          visits.map((visit) => (
            <div
              key={visit.id}
              className="rounded-lg border border-slate-100 p-2 text-sm"
            >
              <p className="font-medium">{visit.description}</p>
              {visit.return_at &&
                ["pending", "scheduled"].includes(visit.return_status) && (
                  <button
                    type="button"
                    disabled={saving}
                    className="mt-1 text-xs text-slate-600 underline"
                    onClick={() =>
                      update({ action: "cancel_return", visitId: visit.id })
                    }
                  >
                    Cancelar convite
                  </button>
                )}
              <p className="text-xs text-slate-500">
                {new Date(visit.occurred_at).toLocaleString("pt-BR")}
                {visit.return_at
                  ? ` · Retorno: ${new Date(visit.return_at).toLocaleString("pt-BR")} · ${({ pending: "previsto", scheduled: "programado", cancelled: "cancelado", completed: "convite enviado" } as Record<string, string>)[visit.return_status]}`
                  : ""}
              </p>
            </div>
          ))
        )}
      </div>
    </details>
  );
}
