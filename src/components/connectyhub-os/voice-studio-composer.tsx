'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, FileText, Pause, Play, RotateCcw, Search, Sparkles } from "lucide-react";
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
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50";
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

export function VoiceStudioComposer({ project, voices, models, dictionaryId, availableCredits, onDone }: {
  project: string; voices: StudioVoice[]; models: StudioModel[]; dictionaryId: string; availableCredits: number | null; onDone: () => void;
}) {
  const base = "/api/dashboard/voice";
  const endpoint = (path: string) => `${base}/${path}?project=${encodeURIComponent(project)}`;
  const ready = useMemo(() => voices.filter(voice => voice.status === "ready"), [voices]);
  const [chosenVoice, setVoiceId] = useState("");
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
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Estúdio de Voz</h2>
          <p className="mt-1 text-sm text-slate-500">
            {balanceMinutes !== null ? `Seu saldo rende cerca de ${number(Math.floor(balanceMinutes))} minutos de áudio neste modelo.` : "Escolha uma voz e um modelo."}
          </p>
        </div>
        <button className={ghost} onClick={() => setLibrary(open => !open)} type="button"><Search size={14} />{library ? "Fechar biblioteca" : "Biblioteca de vozes"}</button>
      </div>

      {library && <VoiceLibrary voices={ready} selected={voiceId} onSelect={id => { setVoiceId(id); setLibrary(false); }} />}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Voz
          <select className={`${field} mt-1`} value={voiceId} onChange={event => setVoiceId(event.target.value)} disabled={busy}>
            {ready.map(item => <option key={item.voice_id} value={item.voice_id}>{item.name}{item.kind === "private" ? " · privada" : item.kind === "designed" ? " · desenhada" : ""}</option>)}
          </select>
        </label>
        <label className="text-sm">Modelo
          <select className={`${field} mt-1`} value={modelId} onChange={event => setModelId(event.target.value)} disabled={busy}>
            {models.map(item => (
              <option key={item.model_id} value={item.model_id} disabled={!item.available}>
                {voiceModelName(item.model_id)}{item.available && item.credits_per_character ? ` · ${number(item.credits_per_character, 4)} cr/caractere` : " · indisponível"}
              </option>
            ))}
          </select>
        </label>
      </div>
      {voice?.preview_url && <audio className="mt-2 w-full" controls preload="none" src={voice.preview_url} aria-label={`Prévia da voz ${voice.name}`} />}

      <details className="mt-4 rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-medium">Ajustes da voz</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Slider label={isV3 ? "Estabilidade (criativa · natural · robusta)" : "Estabilidade"} value={settings.stability} min={0} max={1} step={isV3 ? 0.5 : 0.05} onChange={value => setSettings(s => ({ ...s, stability: value }))} />
          <Slider label="Similaridade com a voz" value={settings.similarity_boost} min={0} max={1} step={0.05} onChange={value => setSettings(s => ({ ...s, similarity_boost: value }))} />
          <Slider label="Exagero de estilo" value={settings.style} min={0} max={1} step={0.05} onChange={value => setSettings(s => ({ ...s, style: value }))} />
          <Slider label="Velocidade" value={settings.speed} min={0.7} max={1.2} step={0.05} onChange={value => setSettings(s => ({ ...s, speed: value }))} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.use_speaker_boost} onChange={event => setSettings(s => ({ ...s, use_speaker_boost: event.target.checked }))} />Reforço de semelhança (speaker boost)</label>
          <label className="text-sm">Idioma
            <select className={`${field} mt-1`} value={language} onChange={event => setLanguage(event.target.value)}>
              <option value="">Automático</option><option value="pt">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option>
            </select>
          </label>
          <button className={ghost} type="button" onClick={() => setSettings(defaults)}><RotateCcw size={13} />Restaurar padrão</button>
        </div>
      </details>

      {isV3 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500"><Sparkles size={12} className="inline" /> Emoções (v3):</span>
          {v3Tags.map(item => <button key={item.tag} type="button" className={ghost} onClick={() => insertTag(item.tag)} title={item.tag}>{item.label}</button>)}
        </div>
      )}

      <label className="mt-4 block text-sm">Seu texto
        <textarea ref={textArea} className={`${field} mt-1 min-h-56`} value={text} onChange={event => setText(event.target.value)}
          placeholder="Escreva ou cole o texto. Textos longos, como livros inteiros, viram um único arquivo de áudio." />
      </label>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <span>{number(chars)} caracteres{chars ? ` · ≈ ${number(minutes, 1)} min de áudio` : ""}{long ? " · texto longo (e-book)" : ""}</span>
        <label className={`${ghost} cursor-pointer`}><FileText size={13} />Importar .txt<input type="file" accept=".txt,text/plain" className="hidden" onChange={importFile} /></label>
      </div>
      <p className={`mt-2 text-sm ${insufficient ? "text-rose-700" : "text-slate-700"}`}>
        {chars > LONG_LIMIT ? `Limite de ${number(LONG_LIMIT)} caracteres por arquivo. Divida o livro em volumes.`
          : shownQuote !== null ? `${insufficient ? "Saldo insuficiente: " : "Custo: "}${number(shownQuote, 2)} créditos${availableCredits !== null ? ` · disponível ${number(availableCredits, 2)}` : ""}`
          : chars ? (long ? "Calculando o custo do texto inteiro…" : "") : ""}
      </p>
      {message && <p role="status" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
      <button className={`${button} mt-4`} type="button" onClick={() => void generate()}
        disabled={busy || !project || !voiceId || !chars || chars > LONG_LIMIT || !model?.available || insufficient || (long && quote === null)}>
        {busy ? "Processando…" : long ? "Gerar audiolivro" : "Gerar áudio"}
      </button>

      {books.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold">Audiolivros deste projeto</h3>
          <ul className="mt-2 space-y-2">
            {books.map(book => (
              <li key={book.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                <span>{voiceModelName(book.model_id)} · {number(book.usage.units?.characters ?? 0)} caracteres · {book.status === "completed" ? `${number(book.usage.credits, 2)} créditos` : book.status === "failed" ? "falhou" : "em andamento"}</span>
                {book.status === "completed" && <a className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium" href={`/api/dashboard/voice/operations/${book.id}/result?project=${encodeURIComponent(project)}`}><Download size={13} />Baixar audiolivro</a>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold">Gerados nesta sessão</h3>
          <ul className="mt-2 space-y-2">
            {jobs.map(job => <JobRow key={job.id} job={job} onReuse={() => reuse(job)} />)}
          </ul>
        </div>
      )}
    </section>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="text-sm">
      <span className="flex justify-between"><span>{label}</span><span className="font-mono text-xs text-slate-500">{value.toFixed(2)}</span></span>
      <input type="range" className="mt-1 w-full" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
    </label>
  );
}

function JobRow({ job, onReuse }: { job: Job; onReuse: () => void }) {
  const labels: Record<string, string> = { reserved: "Na fila", processing: "Gerando", completed: "Pronto", failed: "Falhou", uncertain: "Em conferência" };
  return (
    <li className="rounded-xl bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{job.kind === "long" ? "Audiolivro" : "Áudio"} · {voiceModelName(job.model)} · {labels[job.status] ?? job.status}</span>
        <span className="text-xs text-slate-500">{number(job.credits, 2)} créditos</span>
      </div>
      <p className="mt-1 truncate text-xs text-slate-500">{job.text.slice(0, 140)}</p>
      {job.audioUrl && <audio className="mt-2 w-full" controls preload="none" src={job.audioUrl} />}
      <div className="mt-2 flex flex-wrap gap-2">
        {job.audioUrl && <a className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium" href={job.audioUrl} download={job.kind === "long" ? "audiolivro.mp3" : "connectyhub-voz.mp3"}><Download size={13} />Baixar MP3</a>}
        <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium" onClick={onReuse}><RotateCcw size={13} />Gerar de novo</button>
      </div>
    </li>
  );
}

function VoiceLibrary({ voices, selected, onSelect }: { voices: StudioVoice[]; selected: string; onSelect: (id: string) => void }) {
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
    <div className="mt-4 rounded-xl border border-slate-200 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input className={field} placeholder="Buscar por nome, sotaque ou uso" value={query} onChange={event => setQuery(event.target.value)} aria-label="Buscar voz" />
        <select className={field} value={kind} onChange={event => setKind(event.target.value)} aria-label="Tipo de voz">
          <option value="all">Todas</option><option value="common">Biblioteca</option><option value="private">Minhas clonadas</option><option value="designed">Desenhadas</option>
        </select>
        <select className={field} value={gender} onChange={event => setGender(event.target.value)} aria-label="Gênero">
          <option value="all">Qualquer gênero</option>{genders.map(item => <option key={item} value={item}>{genderLabel(item)}</option>)}
        </select>
      </div>
      <ul className="mt-3 grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
        {shown.map(voice => (
          <li key={voice.voice_id} className={`flex items-center gap-2 rounded-lg border p-2 ${voice.voice_id === selected ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
            <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full border border-slate-300 disabled:opacity-40" disabled={!voice.preview_url}
              onClick={() => preview(voice)} aria-label={playing === voice.voice_id ? `Pausar prévia de ${voice.name}` : `Ouvir prévia de ${voice.name}`}>
              {playing === voice.voice_id ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(voice.voice_id)}>
              <span className="block truncate text-sm font-medium">{voice.name}</span>
              <span className="block truncate text-xs text-slate-500">{[voice.kind === "private" ? "clonada" : voice.kind === "designed" ? "desenhada" : null, genderLabel(voice.gender), voice.accent, voice.use_case].filter(Boolean).join(" · ") || "voz"}</span>
            </button>
          </li>
        ))}
        {!shown.length && <li className="text-sm text-slate-500">Nenhuma voz com esse filtro.</li>}
      </ul>
    </div>
  );
}
