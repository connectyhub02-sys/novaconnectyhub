"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  agentChannelDefinitions,
  normalizeAgentChannelConfig,
  type AgentChannelConfig,
  type AgentChannelConfigItem,
  type AgentChannelId,
} from "@/lib/agents/multichannel";
import type { AgentChannelAvailability } from "@/lib/agents/channel-availability";

export function AgentChannelSelector({
  companyId,
  config,
  onChange,
  whatsappConnected = false,
  disabled = false,
  internal = false,
}: {
  companyId: string;
  config: AgentChannelConfig;
  onChange: (config: AgentChannelConfig) => void;
  whatsappConnected?: boolean;
  disabled?: boolean;
  internal?: boolean;
}) {
  const [result, setResult] = useState<{
    companyId: string;
    channels: AgentChannelAvailability | null;
    error?: string;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (internal || !companyId) return;
    const controller = new AbortController();
    fetch(
      `/api/dashboard/agents/channels?companyId=${encodeURIComponent(companyId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
      })
      .then((data) => setResult({ companyId, channels: data.channels }))
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ companyId, channels: null, error: error.message });
      });
    return () => controller.abort();
  }, [companyId, internal, revision]);
  const availability = result?.companyId === companyId ? result.channels : null;
  const current = normalizeAgentChannelConfig(config);
  const update = (
    channel: AgentChannelId,
    patch: Partial<AgentChannelConfigItem>,
  ) =>
    onChange({
      ...current,
      channels: {
        ...current.channels,
        [channel]: { ...current.channels[channel], ...patch },
      },
    });
  const reasonFor = (id: keyof AgentChannelAvailability) =>
    internal ? "Configure os canais no agente da empresa." :
    availability?.[id]?.reason ||
    (result?.companyId === companyId ? result.error : null) || "Verificando conexão…";
  const choice = (id: keyof AgentChannelAvailability, label: string) => (
    <label key={id} title={reasonFor(id)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs has-[:disabled]:text-slate-400 has-[:checked]:border-blue-300 has-[:checked]:bg-blue-50">
      <input type="checkbox" checked={current.channels[id].enabled}
        disabled={disabled || (!availability?.[id]?.available && !current.channels[id].enabled)}
        onChange={(event) => update(id, { enabled: event.target.checked })} />
      {label}
    </label>
  );
  const commentCount = ["instagram_comments", "facebook_comments"].filter(
    (id) => current.channels[id as AgentChannelId].enabled,
  ).length;
  return (
    <section aria-label="Canais de atendimento" className="rounded-xl border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="text-xs font-semibold">Canais de atendimento</h3>
        <fieldset disabled={disabled} className="flex flex-wrap items-center gap-2">
          <span title="Conexão por QR Code. Atendimento configurado em Comportamento."
            className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            WhatsApp · {whatsappConnected ? "conectado" : "conectar por QR"}
          </span>
          {choice("instagram_direct", "Instagram Direct")}
          {choice("facebook_messenger", "Messenger")}
        </fieldset>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-slate-500">
          Comentários e opções{commentCount ? ` · ${commentCount} selecionado(s)` : ""}
        </summary>
        <div className="mt-3 space-y-3 border-t pt-3">
          <p className="text-slate-500">Direct e Messenger usam as instruções deste agente. Comentários só geram respostas quando uma regra ativa em Automações corresponde ao comentário.</p>
          <fieldset disabled={disabled} className="flex flex-wrap gap-2">
            {choice("instagram_comments", "Comentários do Instagram")}
            {choice("facebook_comments", "Comentários do Facebook")}
          </fieldset>
          <p className="text-slate-500">Em Automações, escolha publicações, palavras-chave, mensagem no privado ou orientação para a IA responder em público, e se deseja revisar antes do envio.</p>
          {agentChannelDefinitions.filter((item) => item.mode === "private" && current.channels[item.id].enabled).map((item) => (
            <fieldset key={item.id} disabled={disabled || !availability?.[item.id as keyof AgentChannelAvailability]?.available} className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-medium">{item.label}</span>
              <label className="flex items-center gap-2"><input type="checkbox" checked={current.channels[item.id].autoReply} onChange={(event) => update(item.id, { autoReply: event.target.checked })} />Resposta automática</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={current.channels[item.id].requiresHumanApproval} onChange={(event) => update(item.id, { requiresHumanApproval: event.target.checked })} />Revisar antes de enviar</label>
            </fieldset>
          ))}
          <ul className="space-y-1 text-slate-500">
            {agentChannelDefinitions.filter((item) => item.provider === "meta").map((item) => (
              <li key={item.id}>{item.label}: {reasonFor(item.id as keyof AgentChannelAvailability)}</li>
            ))}
          </ul>
          {!internal && <div className="flex flex-wrap gap-4 text-blue-600">
            <Link href="/dashboard/integracoes">Integrações</Link>
            <Link href="/dashboard/automacoes">Automações de comentários</Link>
            <button type="button" disabled={disabled} className="disabled:opacity-40" onClick={() => setRevision((value) => value + 1)}>Atualizar conexões</button>
          </div>}
        </div>
      </details>
    </section>
  );
}
