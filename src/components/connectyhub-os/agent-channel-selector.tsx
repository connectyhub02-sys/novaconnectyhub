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
  return (
    <section
      aria-label="Canais de atendimento"
      className="rounded-xl border bg-slate-50/70 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Onde este agente vai atender?
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Um só agente, com as mesmas instruções, nos canais que você
            selecionar.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || internal}
          className="text-xs text-blue-600 disabled:opacity-40"
          onClick={() => setRevision((value) => value + 1)}
        >
          Atualizar conexões
        </button>
      </div>
      <fieldset disabled={disabled} className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-3">
          <p className="text-sm font-semibold">WhatsApp</p>
          <p
            className={`mt-2 text-xs ${whatsappConnected ? "text-emerald-700" : "text-slate-500"}`}
          >
            {whatsappConnected
              ? "✓ Número conectado"
              : "Aguardando conexão por QR Code"}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Conecte o número deste agente abaixo para habilitar o canal. O
            controle de atendimento fica em Comportamento.
          </p>
        </div>
        {(["instagram", "facebook"] as const).map((surface) => (
          <div key={surface} className="rounded-lg border bg-white p-3">
            <p className="text-sm font-semibold">
              {surface === "instagram" ? "Instagram" : "Facebook"}
            </p>
            {agentChannelDefinitions
              .filter((item) => item.surface === surface)
              .map((item) => {
                const selected = current.channels[item.id];
                const status =
                  availability?.[item.id as keyof AgentChannelAvailability];
                const reason = internal
                  ? "Configure o atendimento social no agente do painel da empresa."
                  : status?.reason ||
                    (result?.companyId === companyId ? result.error : null) ||
                    "Verificando conexão…";
                return (
                  <div key={item.id} className="mt-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.enabled}
                        disabled={!status?.available && !selected.enabled}
                        onChange={(event) =>
                          update(item.id, { enabled: event.target.checked })
                        }
                      />
                      {item.mode === "public"
                        ? "Comentários"
                        : surface === "instagram"
                          ? "Direct"
                          : "Messenger"}
                    </label>
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">
                      {reason}
                    </p>
                    {selected.enabled && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-blue-600">
                          Opções de resposta
                        </summary>
                        <fieldset
                          disabled={!status?.available}
                          className="mt-2 space-y-2"
                        >
                          <label className="flex gap-2">
                            <input
                              type="checkbox"
                              checked={selected.autoReply}
                              onChange={(event) =>
                                update(item.id, {
                                  autoReply: event.target.checked,
                                })
                              }
                            />
                            Resposta automática
                          </label>
                          <label className="flex gap-2">
                            <input
                              type="checkbox"
                              checked={selected.requiresHumanApproval}
                              onChange={(event) =>
                                update(item.id, {
                                  requiresHumanApproval: event.target.checked,
                                })
                              }
                            />
                            Revisar antes de enviar
                          </label>
                          {item.mode === "public" && (
                            <p className="text-slate-500">
                              Regras por palavra-chave e mensagens no Direct
                              ficam em Automações de comentários.
                            </p>
                          )}
                        </fieldset>
                      </details>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </fieldset>
      {!internal && (
        <p className="mt-3 text-xs text-slate-500">
          Instagram e Facebook exigem conexão e permissões de atendimento.{" "}
          <Link href="/dashboard/integracoes" className="text-blue-600">
            Abrir Integrações →
          </Link>
        </p>
      )}
    </section>
  );
}
