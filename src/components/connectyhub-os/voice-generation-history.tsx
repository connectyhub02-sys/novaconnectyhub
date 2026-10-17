'use client';

import { useState } from "react";
import { AudioLines, RotateCcw, Search } from "lucide-react";
import { voiceModelName } from "../../lib/voice-api/model-presentation";
import type { StudioJob } from "../../lib/voice-api/studio-history";

const statusLabels: Record<string, string> = { reserved: "Na fila", processing: "Gerando…", completed: "Pronto", failed: "Não concluído", uncertain: "Em conferência" };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const dateKey = (value: string | Date) => new Date(value).toLocaleDateString("pt-BR");

export function VoiceGenerationHistory({ jobs, voices, loading, error, selectedId, onSelect, onRefresh }: {
  jobs: StudioJob[]; voices: { voice_id: string; name: string }[]; loading: boolean; error: string;
  selectedId: string | null; onSelect: (job: StudioJob) => void; onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [voice, setVoice] = useState("");
  const [model, setModel] = useState("");
  const [period, setPeriod] = useState("");
  const voiceName = (id: string) => voices.find(item => item.voice_id === id)?.name ?? "Voz";
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const since = new Date(today); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - Math.max(0, Number(period) - 1));
  const shown = jobs.filter(job => (!voice || job.voice === voice) && (!model || job.model === model)
    && (!period || Date.parse(job.createdAt) >= since.getTime())
    && normalize([job.text, voiceName(job.voice), voiceModelName(job.model), dateKey(job.createdAt), job.kind === "long" ? "Audiolivro" : "Áudio"].join(" ")).includes(normalize(query.trim())));
  const groups = new Map<string, StudioJob[]>();
  for (const job of shown) { const key = dateKey(job.createdAt); groups.set(key, [...(groups.get(key) ?? []), job]); }
  const selectClass = "min-h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700";

  return <div className="space-y-3">
    <div className="flex items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-blue-500">
        <Search size={14} className="shrink-0 text-slate-400" />
        <input aria-label="Buscar no histórico" placeholder="Buscar no histórico…" value={query} onChange={event => setQuery(event.target.value)} className="min-h-10 w-full min-w-0 bg-transparent text-sm outline-none" />
      </label>
      <button type="button" aria-label="Atualizar histórico" title="Atualizar histórico" onClick={onRefresh} className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><RotateCcw size={16} /></button>
    </div>
    <div className="flex flex-wrap gap-2">
      <select aria-label="Filtrar histórico por voz" className={selectClass} value={voice} onChange={event => setVoice(event.target.value)}>
        <option value="">Voz</option>
        {[...new Set(jobs.map(job => job.voice).filter(Boolean))].map(id => <option key={id} value={id}>{voiceName(id)}</option>)}
      </select>
      <select aria-label="Filtrar histórico por modelo" className={selectClass} value={model} onChange={event => setModel(event.target.value)}>
        <option value="">Modelo</option>
        {[...new Set(jobs.map(job => job.model))].map(id => <option key={id} value={id}>{voiceModelName(id)}</option>)}
      </select>
      <select aria-label="Filtrar histórico por data" className={selectClass} value={period} onChange={event => setPeriod(event.target.value)}>
        <option value="">Data</option><option value="1">Hoje</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option>
      </select>
    </div>
    <p className="text-xs text-slate-500">Até 50 áudios recentes deste projeto. Selecione para ouvir ou baixar.</p>
    {loading && <p role="status" className="text-sm text-slate-500">Carregando histórico…</p>}
    {error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
    {!loading && !error && !jobs.length && <p className="py-6 text-center text-sm text-slate-500">Nenhum áudio gerado neste projeto.</p>}
    {!!jobs.length && !shown.length && <p role="status" className="py-6 text-center text-sm text-slate-500">Nenhum áudio encontrado com esses filtros.</p>}
    <div aria-label="Lista de gerações" className="max-h-[min(32rem,60dvh)] space-y-4 overflow-y-auto overscroll-contain pr-1">
      {[...groups].map(([day, items]) => <section key={day} aria-label={day}>
        <h3 className="mb-2 text-center text-xs font-medium text-slate-500">{day === dateKey(today) ? "Hoje" : day === dateKey(yesterday) ? "Ontem" : day}</h3>
        <ul className="space-y-1">{items.map(job => <li key={job.id}>
          <button type="button" aria-pressed={selectedId === job.id} onClick={() => onSelect(job)} className={`w-full min-w-0 rounded-xl border p-3 text-left ${selectedId === job.id ? "border-blue-300 bg-blue-50" : "border-transparent hover:bg-slate-50"}`}>
            <span className="block truncate text-sm font-medium">{job.text || `${job.kind === "long" ? "Audiolivro" : "Áudio"} · ${new Date(job.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}</span>
            <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><AudioLines size={12} className="shrink-0" /><span className="truncate">{voiceName(job.voice)} · {voiceModelName(job.model)}</span></span>
            <span className="mt-1 block text-xs text-slate-500">{statusLabels[job.status] ?? "Em conferência"} · {job.credits.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} créditos</span>
          </button>
        </li>)}</ul>
      </section>)}
    </div>
  </div>;
}
