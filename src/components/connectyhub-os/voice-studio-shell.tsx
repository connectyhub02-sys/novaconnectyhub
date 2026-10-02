'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AudioLines, BookOpen, Bot, Code2, History, KeyRound, Library, Music, Plus, Sparkles, Upload, Wand2 } from "lucide-react";
import { CreditExplainer } from "./credit-explainer";
import { VoiceUsageCharts } from "./voice-usage-charts";
import { StudioTools } from "./studio-tools";
import { VoiceDictionarySelect } from "./voice-dictionary-select";
import { VoiceAvatar, VoiceLibrary, VoiceStudioComposer, voiceMeta, type StudioModel, type StudioVoice } from "./voice-studio-composer";
import { VoiceDeveloperTools } from "./voice-developer-tools";
import { VoiceAgentsPanel } from "./voice-agents-panel";
import { voiceModelName } from "../../lib/voice-api/model-presentation";

// Client Voice Studio laid out like the ElevenLabs app: a side menu of creative tools,
// a ready-to-type text-to-speech page, a voice library, voice agents, history and,
// last, the developer area. Projects and keys only matter to developers, so the
// Studio uses the company's first project (created automatically by the server).

type Project = { id: string; name: string; status: string; monthly_credit_limit: number | null; webhook_url?: string | null; voice_api_keys: { id: string; name: string; key_prefix: string; status: string }[] };
type Summary = { requests: number; completed: number; failed: number; pending: number; credits: number; daily: { day: string; requests: number; credits: number }[]; models: { model_id: string; requests: number; credits: number }[]; operations: { operation: string; requests: number; credits: number }[] };
type HistoryRow = { id: string; project_id: string; operation: string; status: string; charged_credits: number; reserved_credits: number; created_at: string; error_code: string | null; model_id?: string; characters?: number };
type Data = { projects: Project[]; wallet?: { balance_credits: number; reserved_credits: number } | null; summary: Summary; history: HistoryRow[] };
type Section = "tts" | "sfx" | "music" | "tools" | "voices" | "agents" | "history" | "api";

const menu: Array<{ group: string; items: Array<[Section, string, typeof AudioLines]> }> = [
  { group: "Criar", items: [["tts", "Texto para fala", AudioLines], ["sfx", "Efeitos sonoros", Sparkles], ["music", "Música", Music], ["tools", "Mais ferramentas", Wand2]] },
  { group: "Vozes", items: [["voices", "Vozes", Library], ["agents", "Agentes de voz", Bot]] },
  { group: "Conta", items: [["history", "Histórico e uso", History], ["api", "API e desenvolvedores", Code2]] },
];
const titles: Record<Section, [string, string]> = {
  tts: ["Texto para fala", "Transforme qualquer texto em fala realista, de uma frase a um livro inteiro."],
  sfx: ["Efeitos sonoros", "Descreva o som e receba o efeito pronto para usar."],
  music: ["Música", "Crie trilhas originais a partir de uma descrição."],
  tools: ["Mais ferramentas", "Transcrição, dublagem, limpeza de áudio, troca de voz, legendas, diálogos e criação de vozes."],
  voices: ["Vozes", "Ouça, escolha e clone vozes. Suas vozes clonadas são só da sua empresa."],
  agents: ["Agentes de voz", "Seus atendentes do WhatsApp também falam, em tempo real."],
  history: ["Histórico e uso", "Tudo o que foi gerado e quanto custou."],
  api: ["API e desenvolvedores", "Chaves, webhooks e exemplos para integrar o Estúdio ao seu aplicativo."],
};
const statusLabels: Record<string, string> = { completed: "Concluído", failed: "Não concluído", reserved: "Em andamento", processing: "Em andamento", uncertain: "Em conferência", ready: "Pronta", active: "Ativo", paused: "Pausado" };
const operationLabels: Record<string, string> = { text_to_speech: "Texto para fala", voice_clone: "Clonagem de voz", voice_clone_preview: "Prévia de voz", studio: "Ferramenta do Estúdio" };
const number = (value: unknown, digits = 2) => Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });
const field = "min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:outline-2 focus:outline-slate-900";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40";
const secondary = "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40";
const card = "min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

async function read(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? "Não foi possível concluir.");
  return data;
}

export function VoiceStudioShell() {
  const [section, setSection] = useState<Section>("tts");
  const [days, setDays] = useState("30");
  const [data, setData] = useState<Data | null>(null);
  const [chosenProject, setChosenProject] = useState("");
  const [catalog, setCatalog] = useState<{ project: string; voices: StudioVoice[]; models: StudioModel[]; cloning: { available: boolean; credits?: number } } | null>(null);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [voiceId, setVoiceId] = useState<string | undefined>(undefined);
  const [dictionary, setDictionary] = useState("");
  const [message, setMessage] = useState("");

  const url = `/api/dashboard/voice?days=${days}`;
  const refresh = useCallback(async () => { setData(await fetch(url).then(read)); }, [url]);
  useEffect(() => {
    let active = true;
    fetch(url).then(read).then(next => { if (active) setData(next); }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [url]);

  const project = data?.projects.some(item => item.id === chosenProject) ? chosenProject : data?.projects[0]?.id ?? "";
  useEffect(() => {
    if (!project) return;
    let active = true;
    const base = "/api/dashboard/voice";
    Promise.all([fetch(`${base}/voices?project=${project}`).then(read), fetch(`${base}/models?project=${project}`).then(read)])
      .then(([v, m]) => { if (active) setCatalog({ project, voices: v.voices, models: m.models, cloning: m.cloning ?? { available: false } }); })
      .catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [project, catalogRevision]);

  const ready = catalog?.project === project ? catalog : null;
  const available = data?.wallet ? Number(data.wallet.balance_credits) - Number(data.wallet.reserved_credits ?? 0) : null;
  const reloadCatalog = async () => { setCatalogRevision(value => value + 1); await refresh(); };
  const go = (next: Section) => { setSection(next); setMessage(""); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="mx-auto min-w-0 max-w-7xl text-slate-900">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{titles[section][0]}</h1>
          <p className="mt-1 text-sm text-slate-500">{titles[section][1]}</p>
        </div>
        {data && data.projects.length > 1 && (
          <select aria-label="Projeto" className="min-h-10 rounded-full border border-slate-300 bg-white px-3 text-sm" value={project} onChange={event => setChosenProject(event.target.value)}>
            {data.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        )}
        <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-slate-100 px-4 text-sm"><span className="size-2 rounded-full bg-emerald-500" />{available === null ? "…" : `${number(available, 0)} créditos`}</span>
        <Link href="/docs/api#voz" className={secondary}><BookOpen size={13} />Documentação</Link>
      </header>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav aria-label="Menu do Estúdio de Voz" className="flex min-w-0 gap-1 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:flex-col lg:self-start lg:overflow-visible">
          {menu.map(group => (
            <div key={group.group} className="flex shrink-0 gap-1 lg:mb-4 lg:flex-col">
              <p className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 lg:block">{group.group}</p>
              {group.items.map(([value, label, Icon]) => (
                <button key={value} type="button" onClick={() => go(value)} aria-current={section === value ? "page" : undefined}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-2.5 rounded-xl px-3 text-sm ${section === value ? "bg-slate-900 font-semibold text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                  <Icon size={16} />{label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <main className="min-w-0 space-y-5">
          {message && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
          {!data || !ready ? <p role="status" className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">{message ? "Não foi possível abrir o Estúdio. Atualize a página." : "Preparando seu Estúdio…"}</p> : <>
            {/* Kept mounted so the text survives a visit to another page of the Studio. */}
            <div className={section === "tts" ? "space-y-3" : "hidden"}>
              <VoiceDictionarySelect project={project} revision={catalogRevision} value={dictionary} onChange={setDictionary} />
              <VoiceStudioComposer key={project} project={project} voices={ready.voices} models={ready.models} dictionaryId={dictionary} availableCredits={available}
                selectedVoice={voiceId} onVoiceChange={setVoiceId} onDone={() => { void refresh(); }} />
            </div>
            {section === "sfx" && <StudioTools key={`${project}-sfx`} project={project} voices={ready.voices} only="sound_effects" onChanged={reloadCatalog} />}
            {section === "music" && <StudioTools key={`${project}-music`} project={project} voices={ready.voices} only="music" onChanged={reloadCatalog} />}
            {section === "tools" && <StudioTools key={`${project}-tools`} project={project} voices={ready.voices} exclude={["sound_effects", "music"]} onChanged={reloadCatalog} />}
            {section === "voices" && <VoicesPage project={project} voices={ready.voices} cloning={ready.cloning} onUse={id => { setVoiceId(id); go("tts"); }} onChanged={reloadCatalog} />}
            {section === "agents" && <VoiceAgentsPanel voices={ready.voices} />}
            {section === "history" && <HistoryPage data={data} days={days} onDays={value => { setData(null); setDays(value); }} />}
            {section === "api" && <ApiPage projects={data.projects} onChanged={refresh} />}
          </>}
          {(section === "history" || section === "tts") && <CreditExplainer />}
        </main>
      </div>
    </div>
  );
}

function VoicesPage({ project, voices, cloning, onUse, onChanged }: {
  project: string; voices: StudioVoice[]; cloning: { available: boolean; credits?: number }; onUse: (voiceId: string) => void; onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const idempotency = useRef<string | null>(null);
  const endpoint = (path: string) => `/api/dashboard/voice/${path}?project=${encodeURIComponent(project)}`;
  const mine = voices.filter(voice => voice.kind === "private" || voice.kind === "designed");
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function act(action: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  const clone = () => act(async () => {
    idempotency.current ??= crypto.randomUUID();
    const form = new FormData();
    form.set("name", name); form.set("consent_accepted", "true");
    files.forEach(file => form.append("files", file));
    const result = await fetch(endpoint("voices"), { method: "POST", headers: { "Idempotency-Key": idempotency.current }, body: form }).then(read);
    setMessage(`Voz ${result.clone?.status === "ready" ? "pronta" : "em preparo"}.${result.generation ? ` Débito: ${number(result.generation.usage.credits)} créditos.` : ""}`);
    setName(""); setFiles([]); setConsent(false); idempotency.current = null;
    await onChanged();
  });
  const listen = (voice: StudioVoice) => act(async () => {
    const receipt = await fetch(endpoint(`voices/${voice.voice_id}/preview`), { method: "POST" }).then(read);
    if (receipt.status !== "completed") { setMessage("Prévia em preparo. Tente novamente em instantes."); return; }
    const audio = await fetch(endpoint(`generations/${receipt.id}/audio`));
    if (!audio.ok) throw new Error("Prévia indisponível no momento.");
    setPreview({ id: voice.voice_id, url: URL.createObjectURL(await audio.blob()) });
  });

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className={card}>
          <h2 className="text-base font-bold">Biblioteca</h2>
          <p className="mt-1 text-sm text-slate-500">Toque no círculo para ouvir e no nome para usar a voz no Texto para fala.</p>
          <VoiceLibrary voices={voices.filter(voice => voice.status === "ready")} selected="" onSelect={onUse} />
        </section>
        <section className={card}>
          <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-full bg-violet-100 text-violet-700"><Plus size={18} /></span><h2 className="text-base font-bold">Clonar uma voz</h2></div>
          <p className="mt-2 text-sm text-slate-500">Envie de 1 a 5 gravações limpas (até 3 MB no total). {cloning.available ? `Custo: ${number(cloning.credits)} créditos, com uma prévia incluída.` : "Clonagem indisponível no momento."}</p>
          <label className="mt-4 block text-sm">Nome da voz<input className={`${field} mt-1`} value={name} maxLength={80} onChange={event => { setName(event.target.value); idempotency.current = null; }} placeholder="Ex.: Minha voz" /></label>
          <label className="mt-3 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600 hover:bg-slate-50">
            <Upload size={18} />{files.length ? `${files.length} arquivo(s) selecionado(s)` : "Escolher gravações"}
            <input type="file" accept="audio/*,video/mp4" multiple className="hidden" onChange={event => { setFiles(Array.from(event.target.files ?? [])); idempotency.current = null; }} />
          </label>
          <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />Tenho direito e consentimento para clonar esta voz.</label>
          <button type="button" className={`${primary} mt-4 w-full`} disabled={busy || !cloning.available || !consent || !files.length || name.trim().length < 2} onClick={() => void clone()}>{busy ? "Enviando…" : "Clonar voz"}</button>
        </section>
      </div>
      {message && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
      <section className={card}>
        <h2 className="text-base font-bold">Minhas vozes</h2>
        {!mine.length && <p className="mt-2 text-sm text-slate-500">Nenhuma voz clonada ou criada ainda.</p>}
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {mine.map(voice => (
            <li key={voice.voice_id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-3">
                <VoiceAvatar id={voice.voice_id} />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{voice.name}</p><p className="text-xs text-slate-500">{voiceMeta(voice)} · {statusLabels[voice.status] ?? "Em preparo"}</p></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={secondary} disabled={busy || voice.status !== "ready"} onClick={() => onUse(voice.voice_id)}>Usar</button>
                {voice.kind === "private" && <button type="button" className={secondary} disabled={busy || voice.status !== "ready"} onClick={() => void listen(voice)}>Ouvir prévia incluída</button>}
                <button type="button" className={secondary} disabled={busy} onClick={() => void act(async () => { const next = window.prompt("Novo nome da voz", voice.name); if (!next) return; await fetch(endpoint(`voices/${voice.voice_id}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next }) }).then(read); await onChanged(); })}>Renomear</button>
                <button type="button" className={`${secondary} text-rose-700`} disabled={busy} onClick={() => void act(async () => { if (!window.confirm(`Excluir a voz ${voice.name}?`)) return; await fetch(endpoint(`voices/${voice.voice_id}`), { method: "DELETE" }).then(read); await onChanged(); })}>Excluir</button>
              </div>
              {preview?.id === voice.voice_id && <audio className="mt-2 h-9 w-full" controls autoPlay src={preview.url} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function HistoryPage({ data, days, onDays }: { data: Data; days: string; onDays: (value: string) => void }) {
  const summary = data.summary;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {[["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"]].map(([value, label]) => (
          <button key={value} type="button" onClick={() => onDays(value)} className={`rounded-full px-4 py-1.5 text-sm ${days === value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{label}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {([["Gerações", number(summary.requests, 0)], ["Créditos usados", number(summary.credits)], ["Não concluídas", number(summary.failed, 0)]] as const).map(([label, value]) => (
          <div key={label} className={card}><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>
        ))}
      </div>
      <VoiceUsageCharts daily={summary.daily} />
      <section className={card}>
        <h2 className="text-base font-bold">Recentes</h2>
        {!data.history.length && <p className="mt-2 text-sm text-slate-500">Nada gerado neste período.</p>}
        <ul className="mt-2 divide-y divide-slate-100">
          {data.history.map(row => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
              <span className="min-w-40 flex-1 font-medium">{operationLabels[row.operation] ?? row.operation}{row.model_id ? <span className="font-normal text-slate-500"> · {voiceModelName(row.model_id)}</span> : null}</span>
              <span className="text-slate-500">{new Date(row.created_at).toLocaleString("pt-BR")}</span>
              <span className={row.status === "failed" ? "text-rose-700" : "text-slate-600"}>{statusLabels[row.status] ?? "Em conferência"}</span>
              <span className="w-28 text-right font-medium">{number(row.charged_credits)} créditos</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ApiPage({ projects, onChanged }: { projects: Project[]; onChanged: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function manage(body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const result = await fetch("/api/dashboard/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(read);
      if (result.secret) setSecret(result.secret);
      await onChanged();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-5">
      <section className={card}>
        <h2 className="text-base font-bold">Comece em um minuto</h2>
        <ol className="mt-3 space-y-1 text-sm text-slate-600"><li>1. Crie uma chave no projeto abaixo (ela aparece uma única vez).</li><li>2. Liste as vozes e gere o áudio com a chave.</li><li>3. O consumo sai dos mesmos créditos da sua conta.</li></ol>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-6 text-slate-100">{'curl https://www.connectyhub.com.br/api/v1/voice/voices \\\n  -H "Authorization: Bearer $CONNECTYHUB_VOICE_KEY"'}</pre>
        <Link href="/docs/api#voz" className="mt-3 inline-block text-sm font-medium text-slate-900 underline">Documentação completa, com exemplos →</Link>
      </section>
      {secret && <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4"><p className="text-sm font-medium">Guarde esta chave. Ela não será exibida novamente.</p><code className="mt-2 block break-all text-sm">{secret}</code><div className="mt-3 flex gap-2"><button type="button" className={secondary} onClick={() => void navigator.clipboard.writeText(secret)}>Copiar</button><button type="button" className={secondary} onClick={() => setSecret("")}>Ocultar</button></div></div>}
      {message && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
      {projects.map(project => (
        <article key={project.id} className={card}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-auto min-w-0 break-words text-base font-bold">{project.name}</h3>
            <span className="text-xs text-slate-500">{statusLabels[project.status] ?? project.status} · {project.monthly_credit_limit ? `limite ${number(project.monthly_credit_limit, 0)} créditos/mês` : "sem limite próprio"}</span>
            <button type="button" className={secondary} disabled={busy} onClick={() => void manage({ action: "create_key", project_id: project.id, name: "Chave de Voz" })}><KeyRound size={13} />Nova chave</button>
            <button type="button" className={secondary} disabled={busy} onClick={() => { const raw = window.prompt("Limite mensal em créditos (vazio = sem limite)", project.monthly_credit_limit?.toString() ?? ""); if (raw !== null) void manage({ action: "update_project", project_id: project.id, status: project.status, monthly_credit_limit: raw.trim() ? Number(raw) : null }); }}>Definir limite</button>
            <button type="button" className={secondary} disabled={busy} onClick={() => void manage({ action: "update_project", project_id: project.id, status: project.status === "active" ? "paused" : "active", monthly_credit_limit: project.monthly_credit_limit })}>{project.status === "active" ? "Pausar" : "Ativar"}</button>
          </div>
          <code className="mt-1 block break-all text-xs text-slate-400">{project.id}</code>
          {project.voice_api_keys.map(key => (
            <div key={key.id} className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm">
              <span>{key.name}</span><code>{key.key_prefix}…</code><span className="text-slate-500">{key.status === "active" ? "Ativa" : "Revogada"}</span>
              {key.status === "active" && <button type="button" className="ml-auto text-sm font-semibold text-rose-700" disabled={busy} onClick={() => { if (window.confirm("Revogar esta chave?")) void manage({ action: "revoke_key", project_id: project.id, key_id: key.id }); }}>Revogar</button>}
            </div>
          ))}
          <VoiceDeveloperTools project={project} onChanged={() => { void onChanged(); }} />
        </article>
      ))}
      <section className={card}>
        <h2 className="text-base font-bold">Novo projeto</h2>
        <p className="mt-1 text-sm text-slate-500">Use projetos para separar aplicativos: cada um tem suas chaves, vozes clonadas e recibos.</p>
        <div className="mt-3 flex flex-wrap gap-2"><input aria-label="Nome do novo projeto" maxLength={100} className={`${field} flex-1`} placeholder="Nome do projeto" value={name} onChange={event => setName(event.target.value)} /><button type="button" className={primary} disabled={busy || !name.trim()} onClick={() => { void manage({ action: "create_project", name }); setName(""); }}><Plus size={16} />Criar projeto</button></div>
      </section>
    </div>
  );
}

