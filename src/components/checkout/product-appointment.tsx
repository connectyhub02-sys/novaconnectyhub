"use client";
import { useState } from "react";
import { DialogFrame } from "@/components/ui/dialog-frame";

export function ProductAppointment({ productId, label = "Agendar atendimento", contactHref }: { productId: string; label?: string; contactHref?: string | null }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState<Array<{ starts_at: string; ends_at: string }>>([]);
  const [timezone, setTimezone] = useState("America/Sao_Paulo"), [selected, setSelected] = useState("");
  const [date, setDate] = useState(""), [name, setName] = useState(""), [phone, setPhone] = useState("");
  const [message, setMessage] = useState(""), [booked, setBooked] = useState(false);
  async function load(from = date) {
    setBusy(true); setMessage(""); setSelected("");
    try {
      const response = await fetch(`/api/public/sales-catalog/products/${productId}/appointments${from ? `?day=${encodeURIComponent(from)}` : ""}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSlots(data.slots); setTimezone(data.timezone ?? "America/Sao_Paulo");
      if (!data.slots.length) setMessage(data.contactRequired ? "Solicite atendimento para combinar um horário." : "Nenhum horário disponível neste período. Consulte outra data ou solicite atendimento.");
    } catch (error) { setSlots([]); setMessage(error instanceof Error ? error.message : "Agenda indisponível."); }
    finally { setBusy(false); }
  }
  async function reserve() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/public/sales-catalog/products/${productId}/appointments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone, startsAt: selected }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setBooked(true); setMessage(`Agendamento confirmado para ${new Date(data.startsAt).toLocaleString("pt-BR", { timeZone: timezone, dateStyle: "short", timeStyle: "short" })}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível agendar."); }
    finally { setBusy(false); }
  }
  return <div className="mt-5">
    <button className="min-h-12 w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white" onClick={() => { setOpen(true); if (!booked) void load(); }}>{label}</button>
    {open ? <DialogFrame onClose={() => setOpen(false)} aria-label={label} className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-slate-900"><div className="flex justify-between gap-4"><h2 className="text-lg font-semibold">{label}</h2><button onClick={() => setOpen(false)} aria-label="Fechar agenda">✕</button></div>
      {!booked ? <>
        <p className="mt-2 text-sm">Escolha um horário disponível. Horários de {timezone.split("/").at(-1)?.replaceAll("_", " ")}.</p>
        <div className="my-3 flex gap-2"><input aria-label="Consultar a partir de" type="date" value={date} onChange={event => setDate(event.target.value)} className="min-w-0 flex-1 rounded border p-2" /><button disabled={busy} onClick={() => void load()} className="rounded border px-3">Consultar</button></div>
        <div className="grid max-h-60 grid-cols-2 gap-2 overflow-auto">{slots.map(slot => <button key={slot.starts_at} onClick={() => setSelected(slot.starts_at)} aria-pressed={selected === slot.starts_at} className={`rounded border p-2 text-sm ${selected === slot.starts_at ? "bg-blue-700 text-white" : "bg-white"}`}>{new Date(slot.starts_at).toLocaleString("pt-BR", { timeZone: timezone, dateStyle: "short", timeStyle: "short" })}</button>)}</div>
        {selected ? <form className="mt-4 grid gap-3" onSubmit={event => { event.preventDefault(); void reserve(); }}><label>Nome<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} className="block w-full rounded border p-2" /></label><label>WhatsApp com código do país<input required type="tel" placeholder="55 67 99999-9999" value={phone} onChange={event => setPhone(event.target.value)} className="block w-full rounded border p-2" /></label><button disabled={busy} className="rounded bg-blue-700 p-3 font-semibold text-white">{busy ? "Confirmando…" : "Confirmar agendamento"}</button></form> : null}
      </> : null}
      {busy && !selected ? <p role="status">Consultando horários…</p> : null}
      {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
      {contactHref ? <a href={contactHref} className="mt-4 inline-block text-sm font-semibold text-blue-700">Solicitar atendimento pelo WhatsApp</a> : null}
      </div>
    </DialogFrame> : null}
  </div>;
}
