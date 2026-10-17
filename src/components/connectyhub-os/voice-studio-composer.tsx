'use client';

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ChevronRight, Download, FileText, Pause, Play, RotateCcw, Search, X } from "lucide-react";
import { mergeStudioHistory, studioHistoryJobs, type StudioJob as Job } from "../../lib/voice-api/studio-history";
import { VoiceGenerationHistory } from "./voice-generation-history";
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
type Settings = { stability: number; similarity_boost: number; style: number; speed: number; use_speaker_boost: boolean };

import {VoiceOutputOptions} from './voice-output-options';
import {validateEffectsFormat,validateLongFormat,type SpeechEffects} from '../../lib/voice-api/speech-options';
import { VoiceDirectionEditor } from './voice-direction-editor';
import { useVoiceDraft } from './use-voice-draft';
import { defaultPerformance, interpretations, normalizeSpeech, prepareSpeech, previewExcerpt, speechCapabilities, type Performance, type SpeechScript } from '../../lib/voice-api/performance';
const SHORT_LIMIT = 4800;
const LONG_LIMIT = 240000;
// Spoken Portuguese averages about 15 characters per second.
const CHARS_PER_MINUTE = 900;
const defaults: Settings = { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1, use_speaker_boost: true };
const field = "min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:outline-2 focus:outline-blue-500";
const ghost = "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const genderLabels: Record<string, string> = { female: "feminina", male: "masculina", neutral: "neutra", "non-binary": "neutra" };
const genderLabel = (value: string | null | undefined) => (value ? genderLabels[value.toLowerCase()] ?? value : null);
const number = (value: number, digits = 0) => value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const normalize = normalizeSpeech;

async function read(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error?.message ?? "Não foi possível concluir."), { code: data.error?.code });
  return data;
}

export function VoiceStudioComposer({ project, voices, models, dictionaryId, resourceRevision = 0, availableCredits, onDone, selectedVoice, onVoiceChange, sidePanel, onSidePanelChange }: {
  project: string; voices: StudioVoice[]; models: StudioModel[]; dictionaryId: string; resourceRevision?:number; availableCredits: number | null; onDone: () => void;
  // Optional controlled voice, so the voice library page can send a voice to the composer.
  selectedVoice?: string; onVoiceChange?: (voiceId: string) => void;
  sidePanel: "settings" | "history"; onSidePanelChange: (panel: "settings" | "history") => void;
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
  const [effects,setEffects]=useState<SpeechEffects|undefined>(undefined);
  const [outputFormat,setOutputFormat]=useState('');
  const [performance,setPerformance]=useState<Performance>(defaultPerformance);
  const [restoredDictionaries,setRestoredDictionaries]=useState<{base:string;ids:string[]}|null>(null);
  const dictionaries=useMemo(()=>restoredDictionaries?.base===dictionaryId?restoredDictionaries.ids:(dictionaryId?[dictionaryId]:[]),[restoredDictionaries,dictionaryId]);
  const [dictionaryOptions,setDictionaryOptions]=useState<{id:string;name:string}[]>([]);
  const [dictionaryError,setDictionaryError]=useState('');
  useEffect(()=>{let active=true;fetch(`/api/dashboard/voice/resources?project=${encodeURIComponent(project)}`,{cache:'no-store'}).then(read).then(data=>{if(active)setDictionaryOptions((data.resources??[]).filter((r:{kind:string})=>r.kind==='dictionary'));}).catch(()=>{if(active)setDictionaryError('Não foi possível carregar os dicionários.');});return()=>{active=false;};},[project,resourceRevision]);
  const [preview,setPreview]=useState<{script:SpeechScript;credits:number|null;error:string}|null>(null);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [historyFilter,setHistoryFilter]=useState("");
  const [historyJobs,setHistoryJobs]=useState<Job[]>([]);
  const [loadingMore,setLoadingMore]=useState(false);
  const historyRequest=useRef(0);
  const [quoted, setQuoted] = useState<{ key: string; credits: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [library, setLibrary] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const activeJob = jobs.find(job => job.id === activeJobId);
  const panelId = useId();
  const resultRef = useRef<HTMLElement>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const inFlight = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const idempotency = useRef<{ body: string; key: string } | null>(null);

  // Never silently replace a restored clone that is no longer available.
  const voiceId = ready.some(voice => voice.voice_id === chosenVoice) ? chosenVoice : chosenVoice ? "" : ready[0]?.voice_id ?? "";

  const model = models.find(item => item.model_id === modelId);
  const clean = normalize(text);
  const preparation=useMemo(()=>{
    try{validateEffectsFormat(effects,outputFormat||'mp3_44100_128');if(normalize(text).length>SHORT_LIMIT)validateLongFormat(outputFormat||undefined,normalize(text).length);return {...prepareSpeech(text,modelId,{...settings,...(modelId==='eleven_v3'?{stability:[0,0.5,1].reduce((best,v)=>Math.abs(v-settings.stability)<Math.abs(best-settings.stability)?v:best,0.5)}:{})},performance),error:''};}
    catch(e){return {text:normalize(text),voiceSettings:settings,performance,error:(e as Error).message};}
  },[text,modelId,settings,performance,effects,outputFormat]);
  const chars = preparation.text.length;
  const long = chars > SHORT_LIMIT || clean.length > SHORT_LIMIT;
  const isV3 = modelId === "eleven_v3";
  const pricePerChar = model?.credits_per_character ?? 0;
  const localQuote = model?.available && chars ? Math.max(model.minimum_credits ?? 0, chars * pricePerChar) : null;
  const minutes = chars ? chars / CHARS_PER_MINUTE : 0;
  const balanceMinutes = availableCredits !== null && pricePerChar > 0 ? availableCredits / (pricePerChar * CHARS_PER_MINUTE) : null;
  const script:SpeechScript={...(effects?{audio_effects:effects}:{}),...(outputFormat?{output_format:outputFormat}:{}),text,voice_id:voiceId,model_id:modelId,voice_settings:{...settings,...(isV3?{stability:[0,0.5,1].reduce((best,v)=>Math.abs(v-settings.stability)<Math.abs(best-settings.stability)?v:best,0.5)}:{})},performance:{...performance,preview:false},dictionary_ids:dictionaries,...(language?{language_code:language}:{})};
  function restoreScript(saved:SpeechScript){
    setEffects(saved.audio_effects);setOutputFormat(saved.output_format??'');
    setText(saved.text);setVoiceId(saved.voice_id);setModelId(saved.model_id);
    setSettings({...defaults,...saved.voice_settings});setLanguage(saved.language_code??'');
    setPerformance({...saved.performance,preview:false});setRestoredDictionaries({base:dictionaryId,ids:saved.dictionary_ids??[]});
    idempotency.current=null;
  }
  const draft=useVoiceDraft(project,script,restoreScript);
  const payload = useMemo(() => ({
    ...(effects?{audio_effects:effects}:{}),...(outputFormat?{output_format:outputFormat}:{}),text: clean, voice_id: voiceId, model_id: modelId, voice_settings: {...settings,...(isV3?{stability:[0,0.5,1].reduce((best,v)=>Math.abs(v-settings.stability)<Math.abs(best-settings.stability)?v:best,0.5)}:{})},performance,
    ...(language&&speechCapabilities[modelId as keyof typeof speechCapabilities]?.language ? { language_code: language } : {}), ...(dictionaries.length ? { dictionary_ids: dictionaries } : {}),
  }), [clean, voiceId, modelId, settings, isV3, performance, language, dictionaries, effects, outputFormat]);

  // Long texts are quoted by the server with the same rules used to reserve them.
  const quoteKey = `${project}:${JSON.stringify(payload)}`;
  const quote = quoted?.key === quoteKey ? quoted.credits : null;
  const shownQuote = long ? quote : localQuote;
  const insufficient = shownQuote !== null && availableCredits !== null && shownQuote > availableCredits;
  useEffect(() => {
    if (!long || !voiceId || chars > LONG_LIMIT || preparation.error) return;
    let active = true;
    const timer = window.setTimeout(() => {
      fetch(`/api/dashboard/voice/operations/quote?project=${encodeURIComponent(project)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "long_tts", ...payload }) })
        .then(read).then(data => { if (active) setQuoted({ key: quoteKey, credits: Number(data.credits) }); }).catch(error => { if (active) setMessage(error.message); });
    }, 700);
    return () => { active = false; window.clearTimeout(timer); };
  }, [long, voiceId, chars, payload, project, quoteKey, preparation.error]);

  // A single project-scoped cursor feeds history; pending receipts are polled separately.
  useEffect(() => {
    let active=true;
    const revision=++historyRequest.current;
    const timer=window.setTimeout(()=>{
      setHistoryLoading(true);
      fetch(`/api/dashboard/voice/history?project=${encodeURIComponent(project)}&${historyFilter}`,{cache:'no-store'}).then(read).then(data=>{
        if(!active||revision!==historyRequest.current)return;
        const saved=studioHistoryJobs(project,data.generations??[]);
        setHistoryJobs(saved);setJobs(current=>mergeStudioHistory(current,saved));setNextCursor(data.next_cursor??null);setHistoryError('');
      }).catch(e=>{if(active)setHistoryError(e.message);}).finally(()=>{if(active)setHistoryLoading(false);});
    },200);
    return()=>{active=false;window.clearTimeout(timer);};
  },[project,historyRevision,historyFilter]);
  const pendingKey=jobs.filter(j=>['reserved','processing'].includes(j.status)).map(j=>`${j.kind}:${j.id}`).join(',');
  useEffect(()=>{
    if(!pendingKey)return;
    let active=true;
    const timer=window.setInterval(()=>{
      void Promise.all(pendingKey.split(',').map(async pair=>{const [kind,id]=pair.split(':');return fetch(`/api/dashboard/voice/${kind==='long'?'operations':'generations'}/${id}?project=${encodeURIComponent(project)}`,{cache:'no-store'}).then(read);})).then(receipts=>{
        if(!active)return;
        setJobs(current=>mergeStudioHistory(current,studioHistoryJobs(project,receipts)));
        if(receipts.some(r=>['completed','failed'].includes(r.status))){onDoneRef.current();setHistoryRevision(v=>v+1);}
      }).catch(()=>{if(active)setHistoryError('Falha ao atualizar gerações em andamento.');});
    },5000);
    return()=>{active=false;window.clearInterval(timer);};
  },[pendingKey,project]);
  async function loadMore(){
    if(!nextCursor||loadingMore)return;
    const revision=historyRequest.current;
    setLoadingMore(true);
    try{
      const data=await fetch(`/api/dashboard/voice/history?project=${encodeURIComponent(project)}&${historyFilter}&cursor=${encodeURIComponent(nextCursor)}`,{cache:'no-store'}).then(read);
      if(revision!==historyRequest.current)return;
      const saved=studioHistoryJobs(project,data.generations??[]);
      setHistoryJobs(current=>mergeStudioHistory(current,saved));setJobs(current=>mergeStudioHistory(current,saved));setNextCursor(data.next_cursor??null);
    }catch(e){if(revision===historyRequest.current)setHistoryError((e as Error).message);}finally{setLoadingMore(false);}
  }

  useEffect(() => {
    if (!library) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setLibrary(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [library]);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > LONG_LIMIT * 4) { setMessage("Arquivo grande demais. Divida o livro em volumes de até 240 mil caracteres."); return; }
    const imported=await file.text();if(imported.length>LONG_LIMIT){setMessage("Arquivo excede 240 mil caracteres.");return;}setText(imported);
    event.target.value = "";
  }

  function key(body: string) {
    const identity = project + body;
    if (idempotency.current?.body !== identity) idempotency.current = { body: identity, key: crypto.randomUUID() };
    return idempotency.current.key;
  }

  async function openPreview(){
    try{
      const excerpt=previewExcerpt(text,textArea.current?.selectionStart??0,textArea.current?.selectionEnd??0);
      if(!excerpt)throw new Error('Selecione um trecho com fala para ouvir.');
      const snapshot={...script,output_format:script.output_format??(long?'mp3_44100_64':'mp3_44100_128'),text:excerpt,performance:{...performance,preview:true}};
      setPreview({script:snapshot,credits:null,error:''});
      const quote=await fetch(endpoint('generations/quote'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)}).then(read);
      setPreview(current=>current?.script===snapshot?{...current,credits:quote.credits}:current);
    }catch(e){setMessage((e as Error).message);setPreview(current=>current?{...current,error:(e as Error).message}:null);}
  }

  async function generate(previewRequest?:{script:SpeechScript;credits:number}) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setMessage("");
    try {
      if(preparation.error&&!previewRequest)throw new Error(preparation.error);
      const requestPayload=previewRequest?.script??payload;
      const savedScript=previewRequest?.script??script;
      if (!long||previewRequest) {
        const body = JSON.stringify(requestPayload);
        const receipt = await fetch(endpoint("generations"), { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key(body), "X-Max-Credits":String(previewRequest?.credits??shownQuote??0) }, body }).then(read);
        const job: Job = { id: receipt.id, kind: "short", status: receipt.status, credits: Number(receipt.usage?.credits || receipt.usage?.reserved_credits || 0), script:savedScript,text:savedScript.text, voice: savedScript.voice_id, model: savedScript.model_id, createdAt: receipt.created_at ?? new Date().toISOString(),
          ...(receipt.status === "completed" && receipt.audio ? { audioUrl: endpoint(`generations/${receipt.id}/audio`) } : {}) };
        setJobs(current => mergeStudioHistory(current, [job]));
        setActiveJobId(job.id);
      } else {
        const body = JSON.stringify({ operation: "long_tts", ...payload });
        const receipt = await fetch(endpoint("operations"), {
          method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key(body), ...(quote !== null ? { "X-Max-Credits": String(quote) } : {}) }, body,
        }).then(read);
        const job: Job = { id: receipt.id, kind: "long", status: receipt.status, credits: Number(receipt.usage?.reserved_credits ?? 0), script:savedScript,text:savedScript.text, voice: voiceId, model: modelId, createdAt: new Date().toISOString() };
        setJobs(current => [job, ...current.filter(item => item.id !== job.id)]);
        setActiveJobId(job.id);
      }
      idempotency.current = null;
      if(previewRequest)setPreview(null);
      onDone();
    } catch (error) {
      if(previewRequest)setPreview(current=>current?{...current,error:(error as Error).message}:null);
      const code = (error as { code?: string }).code;
      setMessage(code === "voice_insufficient_credits" || code === "insufficient_credits"
        ? `Saldo insuficiente para este texto${shownQuote !== null ? `: precisa de ${number(shownQuote, 2)} créditos` : ""}${availableCredits !== null ? ` e há ${number(availableCredits, 2)} disponíveis` : ""}.`
        : (error as Error).message);
    } finally { inFlight.current = false; setBusy(false); setHistoryRevision(value => value + 1); }
  }

  function reuse(job: Job) {
    if (!job.text) return;
    if(job.script)restoreScript(job.script);else {setText(job.text);setVoiceId(job.voice);setModelId(job.model);setPerformance(defaultPerformance);}
    idempotency.current = null;
    textArea.current?.focus();
  }

  const voice = ready.find(item => item.voice_id === voiceId);
  const available = models.filter(item => item.available);
  return (
    <div className="min-w-0 space-y-5">
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="contents xl:block xl:min-w-0 xl:space-y-5">
          <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <VoiceDirectionEditor text={text} onChange={setText} model={modelId} area={textArea} disabled={busy||!draft.ready} onPreview={()=>void openPreview()} />
            <p role="status" className="px-5 pb-2 text-xs text-slate-500">{draft.dirty?'Alterações aguardando salvamento. ':''}{draft.status}</p>
            {preparation.error&&!!text.trim()&&<p role="alert" className="bg-amber-50 px-5 py-2 text-sm text-amber-900">{preparation.error}</p>}
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
              <span className="text-xs text-slate-500">{number(chars)} / {number(LONG_LIMIT)}{chars ? ` · ≈ ${number(minutes, 1)} min` : ""}{long ? " · audiolivro" : ""}</span>
              <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"><FileText size={13} />Importar .txt<input type="file" disabled={busy||!draft.ready} accept=".txt,text/plain" className="hidden" onChange={importFile} /></label>
              <span className={`ml-auto text-sm ${insufficient ? "font-medium text-rose-700" : "text-slate-600"}`}>
                {chars > LONG_LIMIT ? "Divida o texto em volumes de até 240 mil caracteres."
                  : shownQuote !== null ? `${insufficient ? "Saldo insuficiente · " : ""}${number(shownQuote, 2)} créditos`
                  : chars && long ? "Calculando…" : ""}
              </span>
              <button className="ch-action inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-blue-700 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-60" type="button" onClick={() => void generate()}
                disabled={busy || !draft.ready || !!preparation.error || !project || !voiceId || !chars || chars > LONG_LIMIT || !model?.available || insufficient || (long && quote === null)}>
                <Play size={16} aria-hidden="true" />{busy ? "Gerando…" : long ? "Gerar audiolivro" : "Gerar fala"}
              </button>
            </div>
            {message && <p role="status" className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">{message}</p>}
          </section>
          {activeJob && <section ref={resultRef} aria-label="Áudio selecionado" className="order-1 min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:order-none">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Áudio selecionado</h3>
              <button type="button" aria-label="Fechar áudio selecionado" className="grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100" onClick={() => setActiveJobId(null)}><X size={15} /></button>
            </div>
            <ul><JobRow job={activeJob} voiceName={voices.find(item => item.voice_id === activeJob.voice)?.name} onReuse={() => reuse(activeJob)} /></ul>
          </section>}
        </div>

        <aside className="order-2 min-w-0 space-y-5 xl:order-none rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div role="tablist" aria-label="Painel de voz" className="flex gap-5 border-b border-slate-200">
            {([["settings", "Configurações"], ["history", "Histórico"]] as const).map(([value, label]) => <button
              key={value} id={`${panelId}-${value}-tab`} type="button" role="tab" aria-selected={sidePanel === value} aria-controls={`${panelId}-${value}`} tabIndex={sidePanel === value ? 0 : -1}
              className={`min-h-10 border-b-2 pb-2 text-sm ${sidePanel === value ? "border-blue-700 font-semibold text-blue-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}
              onClick={() => onSidePanelChange(value)} onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "settings" : event.key === "End" ? "history" : value === "settings" ? "history" : "settings";
                onSidePanelChange(next); document.getElementById(`${panelId}-${next}-tab`)?.focus();
              }}>{label}</button>)}
          </div>
          <div id={`${panelId}-history`} role="tabpanel" aria-labelledby={`${panelId}-history-tab`} hidden={sidePanel !== "history"}>
            <VoiceGenerationHistory jobs={historyJobs} onFiltersChange={setHistoryFilter} hasMore={!!nextCursor} loadingMore={loadingMore} onLoadMore={()=>void loadMore()} voices={voices} loading={historyLoading} error={historyError} selectedId={activeJobId}
              onRefresh={() => setHistoryRevision(value => value + 1)} onSelect={job => {
                setActiveJobId(job.id);
                window.requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
              }} />
          </div>
          <div id={`${panelId}-settings`} role="tabpanel" aria-labelledby={`${panelId}-settings-tab`} hidden={sidePanel !== "settings"} className="space-y-5">
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
            <select aria-label="Modelo de voz" className={`${field} mt-2`} value={modelId} disabled={busy||!draft.ready} onChange={e=>setModelId(e.target.value)}>
              {!available.some(m=>m.model_id===modelId)&&<option value={modelId}>Modelo indisponível</option>}
              {available.map(item=><option key={item.model_id} value={item.model_id}>{voiceModelName(item.model_id)}</option>)}
            </select>
            <p className="mt-2 text-xs text-slate-500">{modelHints[modelId]} · {number(pricePerChar*1000)} créditos / mil caracteres</p>
          </div>
          <label className="block text-sm font-medium">Estilo de interpretação
            <select aria-label="Estilo de interpretação" className={`${field} mt-2`} value={performance.style} disabled={busy||!draft.ready} onChange={e=>setPerformance(p=>({...p,style:e.target.value as Performance['style']}))}>
              {interpretations.map(style=><option key={style.id} value={style.id}>{style.label}{style.id!=='natural'&&!isV3?' · requer v3':''}</option>)}
            </select>
          </label>
          {performance.style!=='natural'&&<label className="block text-sm">Intensidade pretendida
            <select aria-label="Intensidade pretendida" className={`${field} mt-1`} value={performance.intensity} onChange={e=>setPerformance(p=>({...p,intensity:e.target.value as Performance['intensity']}))}>
              <option value="gentle">Suave</option><option value="balanced">Equilibrada</option><option value="strong">Marcante</option>
            </select><span className="mt-2 block text-xs text-slate-500">Orienta a interpretação, inclusive de clones. Ouça uma prévia para conferir semelhança e emoção.</span>
          </label>}
          <details className="space-y-4"><summary className="cursor-pointer text-sm font-semibold">Ajustes da voz</summary>
            <button className="text-xs text-slate-500" type="button" onClick={()=>setSettings(defaults)}>Restaurar ajustes</button>
            <Slider label="Velocidade" left="Mais lenta" right="Mais rápida" value={settings.speed} min={0.7} max={1.2} step={0.05} onChange={value=>setSettings(s=>({...s,speed:value}))} />
            {performance.style==='natural'&&<Slider label="Estabilidade" left="Mais expressiva" right="Mais estável" value={settings.stability} min={0} max={1} step={isV3?0.5:0.05} onChange={value=>setSettings(s=>({...s,stability:value}))} />}
            <Slider label="Semelhança" left="Baixa" right="Alta" value={settings.similarity_boost} min={0} max={1} step={0.05} onChange={value=>setSettings(s=>({...s,similarity_boost:value}))} />
            <Slider label="Exagero de estilo" left="Nenhum" right="Exagerado" value={settings.style} min={0} max={1} step={0.05} onChange={value=>setSettings(s=>({...s,style:value}))} />
            {!isV3&&<label className="flex items-center justify-between text-sm">Reforço da voz<input type="checkbox" checked={settings.use_speaker_boost} onChange={e=>setSettings(s=>({...s,use_speaker_boost:e.target.checked}))} /></label>}
            {speechCapabilities[modelId as keyof typeof speechCapabilities]?.language&&<label className="block text-sm">Idioma<select className={`${field} mt-1`} value={language} onChange={e=>setLanguage(e.target.value)}><option value="">Detectar automaticamente</option><option value="pt">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option></select></label>}
          </details>
          <details className="text-sm"><summary className="cursor-pointer font-semibold">Pronúncia</summary>
            {dictionaryError&&<p role="alert" className="text-xs text-amber-800">{dictionaryError}</p>}
            {dictionaryOptions.map(d=><label key={d.id} className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={dictionaries.includes(d.id)} disabled={busy||!draft.ready||(!dictionaries.includes(d.id)&&dictionaries.length>=3)} onChange={e=>setRestoredDictionaries({base:dictionaryId,ids:e.target.checked?[...dictionaries,d.id]:dictionaries.filter(id=>id!==d.id)})} />{d.name}</label>)}
            {dictionaries.some(id=>!dictionaryOptions.some(d=>d.id===id))&&<button className="mt-2 text-xs text-amber-800" onClick={()=>setRestoredDictionaries({base:dictionaryId,ids:[]})}>Limpar vínculos de pronúncia indisponíveis</button>}
            <p className="mt-2 text-xs text-slate-500">{dictionaries.length?`${dictionaries.length} dicionário(s) vinculado(s) ao roteiro.`:'Sem dicionário vinculado. Configure a pronúncia de nomes e marcas em Mais ferramentas → Dicionário de pronúncia.'}</p></details>

          <VoiceOutputOptions project={project} effects={effects} onEffects={setEffects} format={outputFormat} onFormat={setOutputFormat} long={long} />
          {balanceMinutes !== null && <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Seu saldo rende cerca de <strong>{number(Math.floor(balanceMinutes))} min</strong> de áudio com este modelo.</p>}
          </div>
        </aside>
      </div>

      {preview&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Prévia do trecho">
        <section className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
          <h3 className="text-lg font-semibold">Ouvir trecho</h3><p className="mt-2 text-sm text-slate-600">Esta prévia gera um áudio pago e fica no histórico. O roteiro completo permanece no editor.</p>
          <p className="my-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm">{preview.script.text}</p>
          <p role="status" className="text-sm">{preview.error|| (preview.credits===null?'Conferindo créditos…':`${number(preview.credits,2)} créditos · ${voiceModelName(preview.script.model_id)}`)}</p>
          <div className="mt-4 flex justify-end gap-3"><button type="button" disabled={busy} onClick={()=>setPreview(null)} className={ghost}>Cancelar</button><button type="button" className="ch-action rounded-full bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy||!!preview.error||preview.credits===null||(availableCredits!==null&&preview.credits>availableCredits)} onClick={()=>preview.credits!==null&&void generate({script:preview.script,credits:preview.credits})}>{busy?'Gerando…':'Gerar prévia'}</button></div>
        </section>
      </div>}
      {library && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Escolher voz" onClick={() => setLibrary(false)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Escolher voz</h3><button type="button" className="grid size-9 place-items-center rounded-full hover:bg-slate-100" aria-label="Fechar" onClick={() => setLibrary(false)}><X size={18} /></button></div>
            <VoiceLibrary voices={ready} selected={voiceId} onSelect={id => { setVoiceId(id); setLibrary(false); }} />
          </div>
        </div>
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
          <p className="truncate font-medium">{job.text?.slice(0, 120) || `${job.kind === "long" ? "Audiolivro" : "Áudio"} · ${new Date(job.createdAt).toLocaleString("pt-BR")}`}</p>
          <p className="text-xs text-slate-500">{job.script?.performance.preview?"Prévia · ":""}{voiceName ?? "Voz"} · {voiceModelName(job.model)} · {labels[job.status] ?? job.status} · {number(job.credits, 2)} créditos</p>
        </div>
        <div className="flex gap-2">
          {job.audioUrl && <a className={ghost} href={job.audioUrl} download={job.kind === "long" ? "audiolivro.mp3" : "connectyhub-voz.mp3"}><Download size={13} />Baixar</a>}
          {job.text && <button type="button" className={ghost} onClick={onReuse}><RotateCcw size={13} />Reusar</button>}
        </div>
      </div>
      {job.audioUrl && <audio aria-label="Ouvir áudio gerado" className="mt-2 h-9 w-full" controls preload="none" src={job.audioUrl} />}
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
