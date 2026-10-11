"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "./panel-primitives";
import type { ClientAutomationAgent } from "./client-whatsapp-automation-studio";
import {
  commentAutomationChannel,
  matchCommentAutomation,
  type CommentAutomation,
  type SocialAutomationsConfig,
} from "@/lib/meta/comment-automations";
import type { AgentChannelAvailability } from "@/lib/agents/channel-availability";
import type { AgentChannelConfig } from "@/lib/agents/multichannel";

export function MetaCommentAutomations({
  companyId,
  agents,
}: {
  companyId: string;
  agents: ClientAutomationAgent[];
}) {
  const ownAgents = agents.filter(
    (agent) => agent.companyId === companyId && agent.status !== "archived",
  );
  const [agentId, setAgentId] = useState(ownAgents[0]?.id || "");
  const [config, setConfig] = useState<SocialAutomationsConfig>({
    version: 1,
    rules: [],
  });
  const [availability, setAvailability] =
    useState<AgentChannelAvailability | null>(null);
  const [channels, setChannels] = useState<AgentChannelConfig | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [sample, setSample] = useState("Eu quero!");
  const endpoint = `/api/dashboard/social-automations?companyId=${encodeURIComponent(companyId)}&agentId=${encodeURIComponent(agentId)}`;
  useEffect(() => {
    if (!agentId) return;
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
      })
      .then((data) => {
        setConfig(data.config);
        setAvailability(data.availability);
        setChannels(data.channelConfig);
        setSelected(data.config.rules[0]?.id || "");
        setLoaded(true);
        setDirty(false);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setNotice(error.message);
      });
    return () => controller.abort();
  }, [agentId, endpoint]);
  const rule = config.rules.find((item) => item.id === selected);
  function update(patch: Partial<CommentAutomation>) {
    setConfig((current) => ({
      ...current,
      rules: current.rules.map((item) =>
        item.id === selected ? { ...item, ...patch } : item,
      ),
    }));
    setDirty(true);
  }
  function add(action: CommentAutomation["action"]) {
    const id = crypto.randomUUID();
    const next: CommentAutomation = {
      id,
      name:
        action === "private_message"
          ? "Comentou, recebeu no Direct"
          : "IA responde comentários",
      enabled: false,
      platform: "instagram",
      trigger: action === "private_message" ? "keyword" : "any_comment",
      keywords: ["eu quero"],
      postIds: [],
      action,
      text:
        action === "private_message"
          ? "Olá! Aqui está o material que você pediu. Posso ajudar com mais alguma informação?"
          : "Responda de forma breve e simpática, conforme o comentário e as instruções do agente. Não repita respostas genéricas.",
      buttonTitle: "",
      buttonUrl: "",
      continueWithAgent: action === "private_message",
      requireApproval: true,
    };
    setConfig((current) => ({ ...current, rules: [...current.rules, next] }));
    setSelected(id);
    setDirty(true);
  }
  async function save() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setConfig(data.config);
      setDirty(false);
      setNotice(
        "Automações salvas. Envios dependem das permissões e da ativação operacional Meta.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  const commentChannel = rule ? commentAutomationChannel(rule) : null;
  const directChannel =
    rule?.platform === "facebook" ? "facebook_messenger" : "instagram_direct";
  const ready = Boolean(
    commentChannel &&
      availability?.[commentChannel].available &&
      channels?.channels[commentChannel].enabled &&
      (rule?.action !== "private_message" ||
        (availability?.[directChannel].available &&
          (!rule.continueWithAgent ||
            channels?.channels[directChannel].enabled))),
  );
  const inputClass = "mt-1 w-full rounded-lg border bg-white p-2 text-sm";
  let previewMatch = false;
  try {
    previewMatch = Boolean(
      rule &&
        matchCommentAutomation(
          { version: 1, rules: [{ ...rule, enabled: true }] },
          {
            channel: commentChannel!,
            text: sample,
            postId: rule.postIds[0] || null,
          },
        ),
    );
  } catch {}
  return (
    <Panel
      title="Instagram e Facebook · automações de comentários"
      collapsible
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Transforme comentários em conversas ou deixe o agente responder na
          publicação. Prepare e simule as regras antes de ativar.
        </p>
        <label className="block max-w-md text-sm">
          Agente responsável
          <select
            aria-label="Agente das automações Meta"
            className={inputClass}
            disabled={busy}
            value={agentId}
            onChange={(event) => {
              if (
                !dirty ||
                window.confirm(
                  "Descartar alterações não salvas desta automação?",
                )
              ) {
                setLoaded(false);
                setNotice("");
                setAgentId(event.target.value);
              }
            }}
          >
            <option value="">Escolha um agente</option>
            {ownAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.personaName || agent.name}
              </option>
            ))}
          </select>
        </label>
        {!ownAgents.length && (
          <Link href="/dashboard/whatsapp" className="text-sm text-blue-600">
            Crie seu agente para configurar automações →
          </Link>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-lg border bg-slate-50 p-3 text-sm"
          >
            {notice}
          </p>
        )}
        {loaded && (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy || config.rules.length >= 20}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                onClick={() => add("private_message")}
              >
                + Comentário → Direct
              </button>
              <button
                disabled={busy || config.rules.length >= 20}
                className="rounded-lg border px-4 py-2 text-sm"
                onClick={() => add("public_ai")}
              >
                + Responder comentários com IA
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-2">
                {config.rules.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item.id)}
                    className={`block w-full rounded-lg border p-3 text-left text-sm ${selected === item.id ? "border-blue-400 bg-blue-50" : "bg-white"}`}
                  >
                    <strong className="block">
                      {item.name || "Nova automação"}
                    </strong>
                    <span className="mt-1 block text-xs text-slate-500">
                      {item.platform} ·{" "}
                      {item.enabled ? "Ativa" : "Rascunho / pausada"}
                    </span>
                  </button>
                ))}
                {!config.rules.length && (
                  <p className="text-sm text-slate-500">
                    Escolha um modelo acima para começar.
                  </p>
                )}
              </div>
              {rule && (
                <fieldset
                  disabled={busy}
                  className="min-w-0 space-y-3 rounded-xl border p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      Nome
                      <input
                        className={inputClass}
                        value={rule.name}
                        maxLength={80}
                        onChange={(event) =>
                          update({ name: event.target.value })
                        }
                      />
                    </label>
                    <label className="text-sm">
                      Rede
                      <select
                        className={inputClass}
                        value={rule.platform}
                        onChange={(event) =>
                          update({
                            platform: event.target
                              .value as CommentAutomation["platform"],
                            enabled: false,
                          })
                        }
                      >
                        <option value="instagram">Instagram</option>
                        <option value="facebook">Facebook</option>
                      </select>
                    </label>
                  </div>
                  <label className="block text-sm">
                    Quando acontecer
                    <select
                      className={inputClass}
                      value={rule.trigger}
                      onChange={(event) =>
                        update({
                          trigger: event.target
                            .value as CommentAutomation["trigger"],
                        })
                      }
                    >
                      <option value="keyword">
                        Comentário com palavra ou expressão
                      </option>
                      <option value="any_comment">
                        Qualquer comentário, inclusive emoji
                      </option>
                    </select>
                  </label>
                  {rule.trigger === "keyword" && (
                    <label className="block text-sm">
                      Palavras ou expressões, separadas por vírgula
                      <input
                        className={inputClass}
                        value={rule.keywords.join(",")}
                        onChange={(event) =>
                          update({ keywords: event.target.value.split(",") })
                        }
                        placeholder="eu quero, quero receber"
                      />
                    </label>
                  )}
                  <label className="block text-sm">
                    Publicações específicas (IDs, separados por vírgula)
                    <input
                      className={inputClass}
                      value={rule.postIds.join(",")}
                      onChange={(event) =>
                        update({ postIds: event.target.value.split(",") })
                      }
                      placeholder="Deixe vazio para todas as publicações conectadas"
                    />
                  </label>
                  <label className="block text-sm">
                    {rule.action === "private_message"
                      ? "Mensagem enviada no Direct / Messenger"
                      : "Orientação adicional para a IA"}
                    <textarea
                      className={inputClass}
                      rows={3}
                      maxLength={1000}
                      value={rule.text}
                      onChange={(event) => update({ text: event.target.value })}
                    />
                  </label>
                  {rule.action === "private_message" && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm">
                          Texto do botão (opcional)
                          <input
                            className={inputClass}
                            maxLength={20}
                            value={rule.buttonTitle}
                            onChange={(event) =>
                              update({ buttonTitle: event.target.value })
                            }
                            placeholder="Receber material"
                          />
                        </label>
                        <label className="text-sm">
                          Destino do botão
                          <input
                            className={inputClass}
                            type="url"
                            value={rule.buttonUrl}
                            onChange={(event) =>
                              update({ buttonUrl: event.target.value })
                            }
                            placeholder="https://…"
                          />
                        </label>
                      </div>
                      <label className="flex gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={rule.continueWithAgent}
                          onChange={(event) =>
                            update({ continueWithAgent: event.target.checked })
                          }
                        />
                        Continuar com o agente quando a pessoa responder
                      </label>
                      <p className="text-xs text-slate-500">
                        Uma resposta privada por comentário elegível. A conversa
                        só continua depois que a pessoa responde; clicar em um
                        link não abre a janela de atendimento.
                      </p>
                    </>
                  )}
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={rule.requireApproval}
                      onChange={(event) =>
                        update({ requireApproval: event.target.checked })
                      }
                    />
                    Revisar a resposta antes de enviar
                  </label>
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      disabled={!ready && !rule.enabled}
                      onChange={(event) =>
                        update({ enabled: event.target.checked })
                      }
                    />
                    Ativar esta automação
                  </label>
                  {!ready && (
                    <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                      Você já pode salvar e simular. Para ativar, conclua a
                      conexão, as permissões Meta e selecione os canais em{" "}
                      <Link href="/dashboard/whatsapp" className="underline">
                        Agentes
                      </Link>
                      .
                    </p>
                  )}
                  <details className="rounded-lg bg-slate-50 p-3 text-sm">
                    <summary className="cursor-pointer font-medium">
                      Simular comentário · sem enviar
                    </summary>
                    <input
                      aria-label="Comentário de simulação"
                      className={inputClass}
                      value={sample}
                      onChange={(event) => setSample(event.target.value)}
                    />
                    <p className="mt-2 text-xs">
                      {previewMatch
                        ? rule.action === "private_message"
                          ? `Acionaria mensagem privada: ${rule.text}`
                          : "Acionaria uma resposta pública gerada pelo agente. Esta prévia não consome IA."
                        : "Este comentário não acionaria a regra."}
                    </p>
                    {previewMatch && rule.buttonTitle && (
                      <span className="mt-2 inline-block rounded-lg border bg-white px-3 py-2 text-blue-600">
                        {rule.buttonTitle}
                      </span>
                    )}
                  </details>
                  <button
                    className="text-xs text-red-600"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Excluir esta automação? A exclusão será aplicada ao salvar.",
                        )
                      ) {
                        setConfig((current) => ({
                          ...current,
                          rules: current.rules.filter(
                            (item) => item.id !== selected,
                          ),
                        }));
                        setSelected("");
                        setDirty(true);
                      }
                    }}
                  >
                    Excluir regra
                  </button>
                </fieldset>
              )}
            </div>
            {config.followUp && (
              <fieldset
                disabled={busy}
                className="rounded-xl border p-4 text-sm"
              >
                <h4 className="font-semibold">
                  Follow-up inteligente · Direct e Messenger
                </h4>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Uma única retomada se a pessoa não responder ao atendimento.
                  Só após uma conversa privada iniciada pelo contato, dentro de
                  23 horas da última mensagem dele; cancela se houver nova
                  mensagem ou intervenção humana.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label>
                    Canal
                    <select
                      className={inputClass}
                      value={config.followUp.platform}
                      onChange={(event) => {
                        setConfig((current) => ({
                          ...current,
                          followUp: {
                            ...current.followUp!,
                            platform: event.target.value as
                              | "both"
                              | "instagram"
                              | "facebook",
                            enabled: false,
                          },
                        }));
                        setDirty(true);
                      }}
                    >
                      <option value="both">Instagram e Messenger</option>
                      <option value="instagram">Instagram</option>
                      <option value="facebook">Messenger</option>
                    </select>
                  </label>
                  <label>
                    Esperar quantos minutos?
                    <input
                      type="number"
                      min={15}
                      max={1200}
                      className={inputClass}
                      value={config.followUp.delayMinutes}
                      onChange={(event) => {
                        setConfig((current) => ({
                          ...current,
                          followUp: {
                            ...current.followUp!,
                            delayMinutes: Number(event.target.value),
                          },
                        }));
                        setDirty(true);
                      }}
                    />
                  </label>
                </div>
                <label className="mt-3 block">
                  Orientação para a retomada
                  <textarea
                    className={inputClass}
                    rows={2}
                    maxLength={800}
                    value={config.followUp.instruction}
                    onChange={(event) => {
                      setConfig((current) => ({
                        ...current,
                        followUp: {
                          ...current.followUp!,
                          instruction: event.target.value,
                        },
                      }));
                      setDirty(true);
                    }}
                  />
                </label>
                <label className="mt-3 flex gap-2">
                  <input
                    type="checkbox"
                    checked={config.followUp.requireApproval}
                    onChange={(event) => {
                      setConfig((current) => ({
                        ...current,
                        followUp: {
                          ...current.followUp!,
                          requireApproval: event.target.checked,
                        },
                      }));
                      setDirty(true);
                    }}
                  />
                  Revisar antes de enviar
                </label>
                <label className="mt-3 flex gap-2">
                  <input
                    type="checkbox"
                    checked={config.followUp.enabled}
                    disabled={
                      !config.followUp.enabled &&
                      (
                        ["instagram_direct", "facebook_messenger"] as const
                      ).some(
                        (channel) =>
                          (config.followUp!.platform === "both" ||
                            channel.startsWith(config.followUp!.platform)) &&
                          (!availability?.[channel].available ||
                            !channels?.channels[channel].enabled),
                      )
                    }
                    onChange={(event) => {
                      setConfig((current) => ({
                        ...current,
                        followUp: {
                          ...current.followUp!,
                          enabled: event.target.checked,
                        },
                      }));
                      setDirty(true);
                    }}
                  />
                  Ativar follow-up social
                </label>
                <p className="mt-2 text-xs text-slate-500">
                  Exige integração e canais privados habilitados. Comentários e
                  cliques em links, sozinhos, não autorizam essa retomada.
                </p>
              </fieldset>
            )}
            <button
              disabled={busy || !dirty}
              onClick={save}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              {busy ? "Salvando…" : "Salvar automações Meta"}
            </button>
          </>
        )}
        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
          <div>
            <h4 className="text-sm font-semibold">
              Direct, Messenger e respostas aos Stories
            </h4>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              O agente atende mensagens recebidas nos canais selecionados. O
              follow-up acima respeita a janela da Meta; não será enviado apenas
              porque alguém comentou ou visitou o perfil.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold">
              Publicações e canais do Instagram
            </h4>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              <Link href="/dashboard/meta/calendario" className="text-blue-600">
                Calendário de posts →
              </Link>{" "}
              Canais de transmissão do Instagram não estão habilitados:
              precisamos confirmar suporte da API oficial. Essa função não usa a
              conexão de grupos do WhatsApp.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
