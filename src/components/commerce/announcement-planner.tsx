"use client";
import { useState } from "react";
type Choice = { id: string; name: string };
export function AnnouncementPlanner({
  endpoint,
  campaignId,
  revision,
  buyers,
  channels,
}: {
  endpoint: string;
  campaignId: string;
  revision: number;
  buyers: Choice[];
  channels: Choice[];
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [channel, setChannel] = useState(channels[0]?.id ?? ""),
    [date, setDate] = useState(""),
    [preview, setPreview] = useState<{
      recipients: Choice[];
      message: string;
      limit: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const change = () => {
    setPreview(null);
    setNotice("");
  };
  async function submit(schedule: boolean) {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: schedule ? "schedule_announcement" : "preview_announcement",
          id: campaignId,
          revision,
          instanceId: channel,
          buyerIds: selected,
          scheduledFor: new Date(date + ":00-03:00").toISOString(),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (schedule) {
        setPreview(null);
        setNotice(d.message);
      } else setPreview(d);
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Não foi possível preparar a divulgação.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <h3 className="font-bold text-slate-900">Divulgação no WhatsApp</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Usa a versão salva da campanha. Confira os destinatários e o texto
          antes de agendar. Quem pediu para não receber mensagens é excluído.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          WhatsApp da empresa
          <select
            className="min-h-11 rounded-lg border bg-white px-3 text-sm text-slate-900"
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value);
              change();
            }}
          >
            <option value="">Selecione</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Data e hora (Brasília)
          <input
            type="datetime-local"
            className="min-h-11 rounded-lg border bg-white px-3 text-sm text-slate-900"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              change();
            }}
          />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        Destinatários para conferir
        <select
          multiple
          className="h-32 rounded-lg border bg-white p-2 text-sm text-slate-900"
          value={selected}
          onChange={(e) => {
            setSelected(Array.from(e.target.selectedOptions, (o) => o.value));
            change();
          }}
        >
          {buyers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="text-xs font-semibold text-emerald-700"
        onClick={() => {
          setSelected(buyers.map((b) => b.id));
          change();
        }}
      >
        Selecionar os {buyers.length} clientes desta lista
      </button>
      <button
        disabled={busy || !selected.length || !date || !channel}
        type="button"
        onClick={() => submit(false)}
        className="block min-h-11 rounded-lg border border-emerald-700 px-4 text-sm font-bold text-emerald-800 disabled:opacity-40"
      >
        Conferir público e mensagem
      </button>
      {preview ? (
        <div className="space-y-3 rounded-xl bg-white p-4 text-sm text-slate-900">
          <b>
            {preview.recipients.length} elegível(is) · limite de {preview.limit}{" "}
            por envio
          </b>
          <p className="max-h-24 overflow-y-auto text-xs text-slate-500">
            {preview.recipients.map((r) => r.name).join(", ") ||
              "Nenhum destinatário elegível."}
          </p>
          <p className="whitespace-pre-wrap text-xs leading-5">
            {preview.message}
          </p>
          <button
            disabled={
              busy ||
              !preview.recipients.length ||
              preview.recipients.length > preview.limit
            }
            onClick={() => submit(true)}
            className="min-h-11 rounded-lg bg-emerald-700 px-4 font-bold text-white disabled:opacity-40"
          >
            Agendar envio para este público
          </button>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm leading-5 text-slate-700">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
