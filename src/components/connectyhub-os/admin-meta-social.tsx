"use client";
import { useCallback, useEffect, useState } from "react";
import { DialogFrame } from "@/components/ui/dialog-frame";
import { normalizeAgentChannelConfig, type AgentChannelConfig } from "@/lib/agents/multichannel";
import { AgentChannelSelector } from "./agent-channel-selector";
import { MetaCommentAutomations } from "./meta-comment-automations";
import { MetaSocialInbox } from "./meta-social-inbox";

type Agent = { id: string; name: string; prompt: string; status: string; metadata: { multichannel_config?: unknown } };
export function AdminMetaSocial() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [diagnostics, setDiagnostics] = useState<{ label: string; ok: boolean; detail: string }[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [name, setName] = useState("Assistente ConnectyHub"), [prompt, setPrompt] = useState("");
  const [paused, setPaused] = useState(false);
  const [channels, setChannels] = useState<AgentChannelConfig>(normalizeAgentChannelConfig(null));
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/meta/social-agent", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setAgent(data.agent); setCompanyId(data.companyId);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/meta/social-agent", { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then((data) => { setAgent(data.agent); setCompanyId(data.companyId); })
      .catch((error) => { if (!controller.signal.aborted) setNotice(error.message); });
    return () => controller.abort();
  }, []);
  function edit() {
    setName(agent?.name || "Assistente ConnectyHub"); setPrompt(agent?.prompt || "");
    setChannels(normalizeAgentChannelConfig(agent?.metadata.multichannel_config));
    setPaused(agent?.status === "paused"); setEditing(true);
  }
  async function action(url: string, body: unknown) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível concluir.");
      if (Array.isArray(data.results)) setDiagnostics(data.results.map((item: { label: string; ok: boolean; detail: string }) => ({ label: item.label, ok: item.ok, detail: item.detail })));
      await load();
      setNotice(data.activation?.detail || "Configuração salva. Confira os diagnósticos antes de enviar.");
      return true;
    } catch (error) { setNotice(error instanceof Error ? error.message : "Falha na operação."); return false; }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">Direct e comentários da ConnectyHub</h1><p className="mt-1 text-sm text-slate-500">Atendimento dos perfis próprios, com revisão antes do envio.</p></div>
      <button className="rounded-lg border px-3 py-2 text-sm" disabled={busy || !companyId} onClick={edit}>{agent ? "Editar agente" : "Criar agente"}</button>
    </div>
    {notice && <p role="status" className="rounded-xl border p-3 text-sm">{notice}</p>}
    <details className="rounded-xl border p-3 text-sm"><summary className="cursor-pointer">Conexão e diagnóstico</summary>
      <div className="mt-3 flex flex-wrap gap-3">
        <button disabled={busy} onClick={() => void action("/api/admin/meta/social-agent", { action: "webhooks" })}>Conferir e ativar eventos de mensagens</button>
        <button disabled={busy} onClick={() => void action("/api/dashboard/integrations/meta/review-test", {})}>Verificar permissões e ativos</button>
        <button disabled={busy} onClick={() => void action("/api/dashboard/integrations/meta/live-dispatch", { companyId, appLiveModeConfirmed: true, channels: { instagram_comments: true, instagram_direct: true, facebook_comments: false, facebook_messenger: false } })}>Preparar envio pelo Instagram</button>
      </div>
      <p className="mt-3 text-xs text-slate-500">Diagnóstico técnico não equivale à aprovação da Meta para contas de clientes. O envio também depende da liberação operacional no servidor.</p>
      {diagnostics.length > 0 && <ul className="mt-3 space-y-2">{diagnostics.map((item) => <li key={item.label}><strong>{item.ok ? "✓" : "Pendente"} · {item.label}</strong><p className="text-xs text-slate-500">{item.detail}</p></li>)}</ul>}
    </details>
    {agent && <MetaCommentAutomations key={agent.id} companyId={companyId} agents={[{ id: agent.id, companyId, name: agent.name, personaName: agent.name, roleTitle: "Atendimento Meta", status: agent.status }]} />}
    <MetaSocialInbox admin />
    {editing && <DialogFrame aria-label="Configurar agente Meta interno" onClose={() => { if (!busy) setEditing(false); }} className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/30 p-4">
      <div className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-5">
        <h2 className="font-semibold">Agente da ConnectyHub</h2>
        <label className="block text-sm">Nome<input className="mt-1 w-full rounded-lg border p-2" value={name} maxLength={96} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
        <label className="block text-sm">Instruções do agente<textarea rows={5} maxLength={8000} className="mt-1 w-full rounded-lg border p-2" value={prompt} disabled={busy} onChange={(event) => setPrompt(event.target.value)} /></label>
        <AgentChannelSelector companyId={companyId} config={channels} onChange={setChannels} disabled={busy} />
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={paused} disabled={busy} onChange={(event) => setPaused(event.target.checked)} />Pausar agente</label>
        <p className="text-xs text-slate-500">As conversas privadas deste agente interno passam por revisão. Para comentários, vale a revisão escolhida em cada automação.</p>
        <div className="flex justify-end gap-3"><button disabled={busy} onClick={() => setEditing(false)}>Fechar</button><button disabled={busy || !name.trim() || !prompt.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50" onClick={async () => { if (await action("/api/admin/meta/social-agent", { name, prompt, paused, channelConfig: channels })) setEditing(false); }}>Salvar agente</button></div>
      </div>
    </DialogFrame>}
  </div>;
}
