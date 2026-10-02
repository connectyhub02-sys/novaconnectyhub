'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ChevronRight, Download, FileText, Pause, Play, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { voiceModelName } from "../../lib/voice-api/model-presentation";

// Text-to-speech composer in the spirit of the ElevenLabs studio: voice library with
// previews and filters, model choice with its price per character, voice settings,
// v3 emotion tags and text of any length. Up to 4,800 characters the audio is
// generated at once; longer texts become an e-book job, quoted and checked against
// the balance before anything is produced.

export type StudioVoice = {
  voice_id: string; name: string; kind: string; status: string; preview_url: string | null;
  language?: string | null; gender?: string | null; accent?: string | null; use_case?: string | null;
};
export type StudioModel = { model_id: string; name: string; available: boolean; credits_per_character?: number; minimum_credits?: number };
type Job = { id: string; kind: "short" | "long"; status: string; credits: number; text: string; voice: string; model: string; createdAt: string; audioUrl?: string };
type Settings = { stability: number; similarity_boost: number; style: number; speed: number; use_speaker_boost: boolean };

const SHORT_LIMIT = 4800;
const LONG_LIMIT = 240000;
// Spoken Portuguese averages about 15 characters per second.
const CHARS_PER_MINUTE = 900;
const defaults: Settings = { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1, use_speaker_boost: true };
const v3Tags = [
  { label: "Sussurrando", tag: "[whispers]" }, { label: "Rindo", tag: "[laughs]" }, { label: "Suspiro", tag: "[sighs]" },
  { label: "Animado", tag: "[excited]" }, { label: "Curioso", tag: "[curious]" }, { label: "Irônico", tag: "[sarcastic]" },
  { label: "Pausa curta", tag: "[short pause]" },
];
const field = "min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:outline-2 focus:outline-blue-500";
const ghost = "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const genderLabels: Record<string, string> = { female: "feminina", male: "masculina", neutral: "neutra", "non-binary": "neutra" };
const genderLabel = (value: string | null | undefined) => (value ? genderLabels[value.toLowerCase()] ?? value : null);
const number = (value: number, digits = 0) => value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const normalize = (text: string) => text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

async function read(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error?.message ?? "Não foi possível concluir."), { code: data.error?.code });
  return data;
}

export function VoiceStudioComposer({ project, voices, models, dictionaryId, availableCredits, onDone, selectedVoice, onVoiceChange }: {
  project: string; voices: StudioVoice[]; models: StudioModel[]; dictionaryId: string; availableCredits: number | null; onDone: () => void;
  // Optional controlled voice, so the voice library page can send a voice to the composer.
  selectedVoice?: string; onVoiceChange?: (voiceId: string) => void;
}) {
  const base = "/api/dashboard/voice";
  const endpoint = (path: string) => `${base}/${path}?project=${encodeURIComponent(project)}`;
  const ready = useMemo(() => voices.filter(voice => voice.status === "ready"), [voices]);
  const [ownVoice, setOwnVoice] = useState("");
  const chosenVoice = selectedVoice ?? ownVoice;
  const setVoiceId = onVoiceChange ?? setOwnVoice;
  const [modelId, setModelId] = useState(models.find(model => model.available)?.model_id ?? "eleven_multilingual_v2");
  const [settings, setSettings] = useState<Settings>(defaults);
  const [language, setLanguage] = useState("");
  const [text, setText] = useState("");
  const [quoted, setQuoted] = useState<{ key: string; credits: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [library, setLibrary] = useState(false);
  const [books, setBooks] = useState<Array<{ id: string; status: string; model_id: string; usage: { credits: number; reserved_credits: number; units?: { characters?: number } | null }; created_at?: string }>>([]);
  const [booksRevision, setBooksRevision] = useState(0);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const idempotency = useRef<{ body: string; key: string } | null>(null);

  // A voice removed from the catalog falls back to the first available one.
  const voiceId = ready.some(voice => voice.voice_id === chosenVoice) ? chosenVoice : ready[0]?.voice_id ?? "";

  const model = models.find(item => item.model_id === modelId);
  const clean = normalize(text);
  const chars = clean.length;
  const long = chars > SHORT_LIMIT;
  const isV3 = modelId === "eleven_v3";
  const pricePerChar = model?.credits_per_character ?? 0;
  const localQuote = model?.available && chars ? Math.max(model.minimum_credits ?? 0, chars * pricePerChar) : null;
  const minutes = chars ? chars / CHARS_PER_MINUTE : 0;
  const balanceMinutes = availableCredits !== null && pricePerChar > 0 ? availableCredits / (pricePerChar * CHARS_PER_MINUTE) : null;
  const voiceSettings = useMemo(() => ({
    stability: isV3 ? [0, 0.5, 1].reduce((best, value) => Math.abs(value - settings.stability) < Math.abs(best - settings.stability) ? value : best, 0.5) : settings.stability,
    similarity_boost: settings.similarity_boost, style: settings.style, speed: settings.speed, use_speaker_boost: settings.use_speaker_boost,
  }), [isV3, settings]);

  const payload = useMemo(() => ({
    text: clean, voice_id: voiceId, model_id: modelId, voice_settings: voiceSettings,
    ...(language ? { language_code: language } : {}), ...(dictionaryId ? { dictionary_ids: [dictionaryId] } : {}),
  }), [clean, voiceId, modelId, voiceSettings, language, dictionaryId]);

  // Long texts are quoted by the server with the same rules used to reserve them.
  const quoteKey = `${project}:${JSON.stringify(payload)}`;
  const quote = quoted?.key === quoteKey ? quoted.credits : null;
  const shownQuote = long ? quote : localQuote;
  const insufficient = shownQuote !== null && availableCredits !== null && shownQuote > availableCredits;
  useEffect(() => {
    if (!long || !voiceId || chars > LONG_LIMIT) return;
    let active = true;
    const timer = window.setTimeout(() => {
      fetch(`/api/dashboard/voice/operations/quote?project=${encodeURIComponent(project)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "long_tts", ...payload }) })
        .then(read).then(data => { if (active) setQuoted({ key: quoteKey, credits: Number(data.credits) }); }).catch(error => { if (active) setMessage(error.message); });
    }, 700);
    return () => { active = false; window.clearTimeout(timer); };
  }, [long, voiceId, chars, payload, project, quoteKey]);

  // E-books of this project survive page reloads: listed from the server receipts.
  useEffect(() => {
    let active = true;
    fetch(`/api/dashboard/voice/operations?project=${encodeURIComponent(project)}`).then(read)
      .then(data => { if (active) setBooks((data.operations ?? []).filter((item: { operation: string }) => item.operation === "long_tts").slice(0, 10)); })
      .catch(() => {});
    return () => { active = false; };
  }, [project, booksRevision]);

  useEffect(() => {
    if (!library) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setLibrary(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [library]);

  function insertTag(tag: string) {
    const area = textArea.current;
    if (!area) { setText(current => `${current}${tag} `); return; }
    const start = area.selectionStart, end = area.selectionEnd;
    setText(current => `${current.slice(0, start)}${tag} ${current.slice(end)}`);
    window.requestAnimationFrame(() => { area.focus(); area.selectionStart = area.selectionEnd = start + tag.length + 1; });
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > LONG_LIMIT * 4) { setMessage("Arquivo grande demais. Divida o livro em volumes de até 240 mil caracteres."); return; }
    setText(await file.text());
    event.target.value = "";
  }

  function key(body: string) {
    const identity = project + body;
    if (idempotency.current?.body !== identity) idempotency.current = { body: identity, key: crypto.randomUUID() };
    return idempotency.current.key;
  }

  async function generate() {
    setBusy(true); setMessage("");
    try {
      if (!long) {
        const body = JSON.stringify(payload);
        const receipt = await fetch(endpoint("generations"), { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key(body) }, body }).then(read);
        const audio = await fetch(endpoint(`generations/${receipt.id}/audio`));
        if (!audio.ok) throw new Error("O áudio ainda está sendo preparado. Consulte o histórico em instantes.");
        const url = URL.createObjectURL(await audio.blob());
        setJobs(current => [{ id: receipt.id, kind: "short" as const, status: receipt.status, credits: Number(receipt.usage?.credits ?? 0), text: clean, voice: voiceId, model: modelId, createdAt: new Date().toISOString(), audioUrl: url }, ...current].slice(0, 20));
      } else {
        const body = JSON.stringify({ operation: "long_tts", ...payload });
        const receipt = await fetch(endpoint("operations"), {
          method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key(body), ...(quote !== null ? { "X-Max-Credits": String(quote) } : {}) }, body,
        }).then(read);
        const job: Job = { id: receipt.id, kind: "long", status: receipt.status, credits: Number(receipt.usage?.reserved_credits ?? 0), text: clean, voice: voiceId, model: modelId, createdAt: new Date().toISOString() };
        setJobs(current => [job, ...current].slice(0, 20));
        void follow(job.id);
      }
      idempotency.current = null;
      onDone();
    } catch (error) {
      const code = (error as { code?: string }).code;
      setMessage(code === "voice_insufficient_credits" || code === "insufficient_credits"
        ? `Saldo insuficiente para este texto${shownQuote !== null ? `: precisa de ${number(shownQuote, 2)} créditos` : ""}${availableCredits !== null ? ` e há ${number(availableCredits, 2)} disponíveis` : ""}.`
        : (error as Error).message);
    } finally { setBusy(false); }
  }

  async function follow(id: string) {
    for (let attempt = 0; attempt < 720; attempt++) {
      await new Promise(resolve => window.setTimeout(resolve, 5000));
      const receipt = await fetch(endpoint(`operations/${id}`)).then(read).catch(() => null);
      if (!receipt) continue;
      setJobs(current => current.map(job => job.id === id ? { ...job, status: receipt.status, credits: Number(receipt.usage?.credits || receipt.usage?.reserved_credits || 0),
        ...(receipt.status === "completed" ? { audioUrl: endpoint(`operations/${id}/result`) } : {}) } : job));
      if (["completed", "failed", "uncertain"].includes(receipt.status)) { onDone(); setBooksRevision(value => value + 1); return; }
    }
  }

  function reuse(job: Job) {
    setText(job.text); setVoiceId(job.voice); setModelId(job.model); idempotency.current = null;
    textArea.current?.focus();
  }

  const voice = ready.find(item => item.voice_id === voiceId);
  const available = models.filter(item => item.available);
  return (
    <div className="min-w-0 space-y-5">
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {isV3 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-5 py-3">
              <span className="mr-1 text-xs font-medium text-slate-500"><Sparkles size={12} className="mr-1 inline" />Emoções</span>
              {v3Tags.map(item => <button key={item.tag} type="button" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-violet-100 hover:text-violet-800" onClick={() => insertTag(item.tag)} title={item.tag}>{item.label}</button>)}
            </div>
          )}
          <textarea ref={textArea} aria-label="Texto para transformar em voz" value={text} onChange={event => setText(event.target.value)}
            className="min-h-[22rem] w-full flex-1 resize-y border-0 bg-transparent px-6 py-5 text-base leading-8 text-slate-900 placeholder:text-slate-400 focus:outline-none lg:min-h-[28rem]"
            placeholder={"Comece a digitar aqui ou cole qualquer texto que você queira transformar em fala realista.\n\nDe uma frase a um livro inteiro: textos longos viram um único arquivo de áudio."} />
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
            <span className="text-xs text-slate-500">{number(chars)} / {number(LONG_LIMIT)}{chars ? ` · ≈ ${number(minutes, 1)} min` : ""}{long ? " · audiolivro" : ""}</span>
            <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"><FileText size={13} />Importar .txt<input type="file" accept=".txt,text/plain" className="hidden" onChange={importFile} /></label>
            <span className={`ml-auto text-sm ${insufficient ? "font-medium text-rose-700" : "text-slate-600"}`}>
              {chars > LONG_LIMIT ? "Divida o texto em volumes de até 240 mil caracteres."
                : shownQuote !== null ? `${insufficient ? "Saldo insuficiente · " : ""}${number(shownQuote, 2)} créditos`
                : chars && long ? "Calculando…" : ""}
            </span>
            <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40" type="button" onClick={() => void generate()}
              disabled={busy || !project || !voiceId || !chars || chars > LONG_LIMIT || !model?.available || insufficient || (long && quote === null)}>
              {busy ? "Gerando…" : long ? "Gerar audiolivro" : "Gerar fala"}
            </button>
          </div>
          {message && <p role="status" className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">{message}</p>}
        </section>

        <aside className="min-w-0 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Voz</p>
            <button type="button" onClick={() => setLibrary(true)} className="mt-2 flex w-full items-center gap-3 rounded-xl border border-slate-200 p-2.5 text-left hover:border-slate-300 hover:bg-slate-50">
              {voice ? <VoiceAvatar id={voice.voice_id} /> : <span className="size-10 rounded-full bg-slate-100" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{voice?.name ?? "Escolher voz"}</span>
                <span className="block truncate text-xs text-slate-500">{voice ? voiceMeta(voice) : `${ready.length} vozes disponíveis`}</span>
              </span>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
            {voice?.preview_url && <audio className="mt-2 h-9 w-full" controls preload="none" src={voice.preview_url} aria-label={`Prévia da voz ${voice.name}`} />}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Modelo</p>
            <div className="mt-2 space-y-2">
              {available.map(item => (
                <button key={item.model_id} type="button" onClick={() => setModelId(item.model_id)} disabled={busy}
                  className={`w-full rounded-xl border p-3 text-left ${item.model_id === modelId ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200 hover:bg-slate-50"}`}>
                  <span className="block text-sm font-semibold">{voiceModelName(item.model_id)}</span>
                  <span className="block text-xs text-slate-500">{modelHints[item.model_id] ?? "Voz natural"} · {number((item.credits_per_character ?? 0) * 1000)} créditos / mil caracteres</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ajustes</p>
              <button className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900" type="button" onClick={() => setSettings(defaults)}><RotateCcw size={12} />Padrão</button>
            </div>
            <Slider label="Velocidade" left="Mais lenta" right="Mais rápida" value={settings.speed} min={0.7} max={1.2} step={0.05} onChange={value => setSettings(s => ({ ...s, speed: value }))} />
            <Slider label="Estabilidade" left="Mais expressiva" right="Mais estável" value={settings.stability} min={0} max={1} step={isV3 ? 0.5 : 0.05} onChange={value => setSettings(s => ({ ...s, stability: value }))} />
            <Slider label="Semelhança" left="Baixa" right="Alta" value={settings.similarity_boost} min={0} max={1} step={0.05} onChange={value => setSettings(s => ({ ...s, similarity_boost: value }))} />
            <Slider label="Exagero de estilo" left="Nenhum" right="Exagerado" value={settings.style} min={0} max={1} step={0.05} onChange={value => setSettings(s => ({ ...s, style: value }))} />
            <label className="flex items-center justify-between gap-2 text-sm">Reforço da voz<input type="checkbox" className="size-4" checked={settings.use_speaker_boost} onChange={event => setSettings(s => ({ ...s, use_speaker_boost: event.target.checked }))} /></label>
            <label className="block text-sm">Idioma
              <select className={`${field} mt-1`} value={language} onChange={event => setLanguage(event.target.value)}>
                <option value="">Detectar automaticamente</option><option value="pt">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option>
              </select>
            </label>
          </div>

          {balanceMinutes !== null && <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Seu saldo rende cerca de <strong>{number(Math.floor(balanceMinutes))} min</strong> de áudio com este modelo.</p>}
        </aside>
      </div>

      {library && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Escolher voz" onClick={() => setLibrary(false)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Escolher voz</h3><button type="button" className="grid size-9 place-items-center rounded-full hover:bg-slate-100" aria-label="Fechar" onClick={() => setLibrary(false)}><X size={18} /></button></div>
            <VoiceLibrary voices={ready} selected={voiceId} onSelect={id => { setVoiceId(id); setLibrary(false); }} />
          </div>
        </div>
      )}

      {(jobs.length > 0 || books.length > 0) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold">Seus áudios</h3>
          <ul className="mt-3 space-y-2">
            {jobs.map(job => <JobRow key={job.id} job={job} voiceName={voices.find(item => item.voice_id === job.voice)?.name} onReuse={() => reuse(job)} />)}
            {books.filter(book => !jobs.some(job => job.id === book.id)).map(book => (
              <li key={book.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 text-sm">
                <span><strong>Audiolivro</strong> · {voiceModelName(book.model_id)} · {number(book.usage.units?.characters ?? 0)} caracteres · {book.status === "completed" ? `${number(book.usage.credits, 2)} créditos` : book.status === "failed" ? "não concluído" : "gerando…"}</span>
                {book.status === "completed" && <a className={ghost} href={`/api/dashboard/voice/operations/${book.id}/result?project=${encodeURIComponent(project)}`}><Download size={13} />Baixar</a>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const modelHints: Record<string, string> = {
  eleven_multilingual_v2: "Mais natural, ideal para narração",
  eleven_v3: "Mais expressivo, aceita emoções",
  eleven_flash_v2_5: "Mais rápido e econômico",
  eleven_turbo_v2_5: "Rápido, boa qualidade",
};

const palettes = ["from-violet-400 to-fuchsia-500", "from-sky-400 to-indigo-500", "from-emerald-400 to-teal-600", "from-amber-300 to-orange-500", "from-rose-400 to-pink-600", "from-cyan-300 to-blue-600"];
export function VoiceAvatar({ id, size = "size-10" }: { id: string; size?: string }) {
  const index = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palettes.length;
  return <span aria-hidden className={`${size} shrink-0 rounded-full bg-gradient-to-br ${palettes[index]}`} />;
}

export function voiceMeta(voice: StudioVoice) {
  return [voice.kind === "private" ? "Clonada" : voice.kind === "designed" ? "Desenhada" : null, genderLabel(voice.gender), voice.accent, voice.use_case].filter(Boolean).join(" · ") || "Voz";
}

function Slider({ label, left, right, value, min, max, step, onChange }: { label: string; left: string; right: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input type="range" className="mt-1 w-full accent-slate-900" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
      <span className="flex justify-between text-[11px] text-slate-400"><span>{left}</span><span>{right}</span></span>
    </label>
  );
}

function JobRow({ job, voiceName, onReuse }: { job: Job; voiceName?: string; onReuse: () => void }) {
  const labels: Record<string, string> = { reserved: "Na fila", processing: "Gerando…", completed: "Pronto", failed: "Não concluído", uncertain: "Em conferência" };
  return (
    <li className="rounded-xl border border-slate-100 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <VoiceAvatar id={job.voice} size="size-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{job.text.slice(0, 120)}</p>
          <p className="text-xs text-slate-500">{voiceName ?? "Voz"} · {voiceModelName(job.model)} · {labels[job.status] ?? job.status} · {number(job.credits, 2)} créditos</p>
        </div>
        <div className="flex gap-2">
          {job.audioUrl && <a className={ghost} href={job.audioUrl} download={job.kind === "long" ? "audiolivro.mp3" : "connectyhub-voz.mp3"}><Download size={13} />Baixar</a>}
          <button type="button" className={ghost} onClick={onReuse}><RotateCcw size={13} />Reusar</button>
        </div>
      </div>
      {job.audioUrl && <audio className="mt-2 h-9 w-full" controls preload="none" src={job.audioUrl} />}
    </li>
  );
}

export function VoiceLibrary({ voices, selected, onSelect }: { voices: StudioVoice[]; selected: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [gender, setGender] = useState("all");
  const [playing, setPlaying] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const genders = [...new Set(voices.map(voice => voice.gender).filter(Boolean))] as string[];
  const shown = voices.filter(voice => (kind === "all" || voice.kind === kind) && (gender === "all" || voice.gender === gender)
    && `${voice.name} ${voice.accent ?? ""} ${voice.use_case ?? ""} ${voice.language ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  function preview(voice: StudioVoice) {
    if (!voice.preview_url) return;
    if (playing === voice.voice_id) { player.current?.pause(); setPlaying(null); return; }
    player.current?.pause();
    player.current = new Audio(voice.preview_url);
    player.current.onended = () => setPlaying(null);
    void player.current.play();
    setPlaying(voice.voice_id);
  }
  useEffect(() => () => player.current?.pause(), []);

  return (
    <div className="mt-4">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className={`${field} pl-9`} placeholder="Buscar por nome, sotaque ou uso" value={query} onChange={event => setQuery(event.target.value)} aria-label="Buscar voz" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[["all", "Todas"], ["common", "Biblioteca"], ["private", "Minhas clonadas"], ["designed", "Desenhadas"]].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setKind(value)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${kind === value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{label}</button>
        ))}
        {genders.length > 0 && <select className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium" value={gender} onChange={event => setGender(event.target.value)} aria-label="Gênero">
          <option value="all">Qualquer gênero</option>{genders.map(item => <option key={item} value={item}>{genderLabel(item)}</option>)}
        </select>}
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {shown.map(voice => (
          <li key={voice.voice_id} className={`flex items-center gap-3 rounded-xl border p-2.5 ${voice.voice_id === selected ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200 hover:bg-slate-50"}`}>
            <button type="button" className="relative grid size-10 shrink-0 place-items-center disabled:opacity-40" disabled={!voice.preview_url}
              onClick={() => preview(voice)} aria-label={playing === voice.voice_id ? `Pausar prévia de ${voice.name}` : `Ouvir prévia de ${voice.name}`}>
              <VoiceAvatar id={voice.voice_id} />
              <span className="absolute inset-0 grid place-items-center text-white">{playing === voice.voice_id ? <Pause size={14} /> : <Play size={14} />}</span>
            </button>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(voice.voice_id)}>
              <span className="block truncate text-sm font-semibold">{voice.name}</span>
              <span className="block truncate text-xs text-slate-500">{voiceMeta(voice)}</span>
            </button>
          </li>
        ))}
        {!shown.length && <li className="text-sm text-slate-500">Nenhuma voz com esse filtro.</li>}
      </ul>
    </div>
  );
}
