'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, PhoneOff, RefreshCw, Trash2 } from "lucide-react";

// Real-time voice agents built from the company's WhatsApp agents. The browser call
// uses a signed session issued only when the balance covers the maximum duration;
// each finished conversation is charged once, after it ends.

type Agent = { id: string; name: string; persona_name: string | null; status: string };
type VoiceAgent = { id: string; agent_registry_id: string; name: string; voice_id: string; first_message: string; language: string; max_duration_seconds: number; status: string; last_synced_at: string | null };
type Conversation = { id: string; voice_agent_id: string; status: string; duration_seconds: number; charged_credits: number | null; started_at: string | null; created_at: string };
type Voice = { voice_id: string; name: string; status: string; kind: string };
type Line = { who: "Você" | "Agente"; text: string };

const field = "min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:outline-2 focus:outline-blue-500";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50";
const small = "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50";

async function read(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? "Não foi possível concluir.");
  return data;
}

export function VoiceAgentsPanel({ voices }: { voices: Voice[] }) {
  const [data, setData] = useState<{ agents: Agent[]; voice_agents: VoiceAgent[]; conversations: Conversation[] } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setData(await fetch("/api/dashboard/voice-agents").then(read)); } catch (error) { setMessage((error as Error).message); }
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/dashboard/voice-agents").then(read).then(next => { if (active) setData(next); }).catch(error => { if (active) setMessage((error as Error).message); });
    return () => { active = false; };
  }, []);
  const ready = voices.filter(voice => voice.status === "ready");

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true); setMessage("");
    try { await fetch("/api/dashboard/voice-agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(read); setMessage(done); await load(); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  if (!data) return <p className="py-8 text-center text-sm text-slate-500">{message || "Carregando agentes de voz…"}</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Agentes de voz</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Seus agentes do WhatsApp também atendem por voz, em tempo real, com a mesma identidade. Cada conversa é cobrada ao terminar, pelo tempo e pelo processamento usados; a chamada só começa se o saldo cobrir a duração máxima.</p>
        </div>
        <button className={small} onClick={() => void load()} type="button"><RefreshCw size={13} />Atualizar</button>
      </div>
      {message && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
      {!data.agents.length && <p className="text-sm text-slate-500">Crie um agente do WhatsApp para transformá-lo em agente de voz.</p>}
      {data.agents.map(agent => {
        const voiceAgent = data.voice_agents.find(item => item.agent_registry_id === agent.id);
        return <AgentCard key={agent.id} agent={agent} voiceAgent={voiceAgent} voices={ready} busy={busy}
          conversations={voiceAgent ? data.conversations.filter(item => item.voice_agent_id === voiceAgent.id) : []}
          onSave={values => void act({ action: "sync", agent_id: agent.id, ...values }, voiceAgent ? "Agente de voz atualizado." : "Agente de voz criado.")}
          onDelete={() => voiceAgent && window.confirm("Excluir este agente de voz?") && void act({ action: "delete", voice_agent_id: voiceAgent.id }, "Agente de voz excluído.")}
          onCallEnded={() => void load()} />;
      })}
    </div>
  );
}

function AgentCard({ agent, voiceAgent, voices, busy, conversations, onSave, onDelete, onCallEnded }: {
  agent: Agent; voiceAgent?: VoiceAgent; voices: Voice[]; busy: boolean; conversations: Conversation[];
  onSave: (values: { voice_id: string; first_message: string; max_duration_seconds: number; language: string }) => void; onDelete: () => void; onCallEnded: () => void;
}) {
  const [voiceId, setVoiceId] = useState(voiceAgent?.voice_id ?? voices[0]?.voice_id ?? "");
  const [firstMessage, setFirstMessage] = useState(voiceAgent?.first_message ?? "");
  const [minutes, setMinutes] = useState(Math.round((voiceAgent?.max_duration_seconds ?? 300) / 60));
  const [language, setLanguage] = useState(voiceAgent?.language ?? "pt");
  const persona = agent.persona_name || agent.name;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{persona}</h3>
        <span className="text-xs text-slate-500">{voiceAgent ? `Agente de voz ativo · até ${Math.round(voiceAgent.max_duration_seconds / 60)} min por chamada` : "Ainda sem voz"}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Voz
          <select className={`${field} mt-1`} value={voiceId} onChange={event => setVoiceId(event.target.value)}>
            {voices.map(voice => <option key={voice.voice_id} value={voice.voice_id}>{voice.name}{voice.kind === "private" ? " · privada" : ""}</option>)}
          </select>
        </label>
        <label className="text-sm">Duração máxima da chamada
          <select className={`${field} mt-1`} value={minutes} onChange={event => setMinutes(Number(event.target.value))}>
            {[2, 5, 10, 15, 30].map(value => <option key={value} value={value}>{value} minutos</option>)}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">Primeira fala
          <input className={`${field} mt-1`} maxLength={400} value={firstMessage} placeholder={`Olá! Aqui é ${persona}. Como posso ajudar?`} onChange={event => setFirstMessage(event.target.value)} />
        </label>
        <label className="text-sm">Idioma
          <select className={`${field} mt-1`} value={language} onChange={event => setLanguage(event.target.value)}>
            <option value="pt">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={button} type="button" disabled={busy || !voiceId} onClick={() => onSave({ voice_id: voiceId, first_message: firstMessage, max_duration_seconds: minutes * 60, language })}>
          {voiceAgent ? "Salvar alterações" : "Criar agente de voz"}
        </button>
        {voiceAgent && <button className={small} type="button" disabled={busy} onClick={onDelete}><Trash2 size={13} />Excluir</button>}
      </div>
      {voiceAgent && <TestCall voiceAgentId={voiceAgent.id} onEnded={onCallEnded} />}
      {conversations.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium">Conversas recentes</p>
          <ul className="mt-1 space-y-1 text-xs text-slate-600">
            {conversations.slice(0, 8).map(item => (
              <li key={item.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5">
                <span>{new Date(item.started_at ?? item.created_at).toLocaleString("pt-BR")} · {Math.floor(item.duration_seconds / 60)}min {item.duration_seconds % 60}s</span>
                <span>{item.charged_credits === null ? "em apuração" : `${Number(item.charged_credits).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} créditos`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function TestCall({ voiceAgentId, onEnded }: { voiceAgentId: string; onEnded: () => void }) {
  const [state, setState] = useState<"idle" | "connecting" | "live">("idle");
  const [mode, setMode] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [message, setMessage] = useState("");
  const session = useRef<{ endSession: () => Promise<void> } | null>(null);
  useEffect(() => () => { void session.current?.endSession(); }, []);

  async function start() {
    setState("connecting"); setMessage(""); setLines([]);
    try {
      const { signed_url: signedUrl } = await fetch("/api/dashboard/voice-agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start_call", voice_agent_id: voiceAgentId }) }).then(read);
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { Conversation } = await import("@elevenlabs/client");
      session.current = await Conversation.startSession({
        signedUrl,
        onConnect: () => setState("live"),
        onDisconnect: () => { setState("idle"); setMode(""); session.current = null; window.setTimeout(onEnded, 4000); },
        onMessage: payload => setLines(current => [...current, { who: (payload.source === "user" ? "Você" : "Agente") as Line["who"], text: payload.message }].slice(-30)),
        onModeChange: ({ mode: next }) => setMode(next === "speaking" ? "falando" : "ouvindo"),
        onError: error => setMessage(String(error)),
      });
    } catch (error) {
      setState("idle");
      setMessage((error as Error).name === "NotAllowedError" ? "Permita o uso do microfone para testar por voz." : (error as Error).message);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {state === "idle"
          ? <button type="button" className={small} onClick={() => void start()}><Mic size={13} />Testar por voz</button>
          : <button type="button" className={small} onClick={() => void session.current?.endSession()}><PhoneOff size={13} />Encerrar chamada</button>}
        <span className="text-xs text-slate-500">{state === "connecting" ? "Conectando…" : state === "live" ? `Em chamada · agente ${mode || "ouvindo"}` : "Usa o microfone do navegador; a conversa é cobrada ao terminar."}</span>
      </div>
      {message && <p className="mt-2 text-xs text-rose-700">{message}</p>}
      {lines.length > 0 && (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
          {lines.map((line, index) => <li key={index}><strong>{line.who}:</strong> {line.text}</li>)}
        </ul>
      )}
    </div>
  );
}
