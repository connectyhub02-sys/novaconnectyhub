"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  SocialApprovalQueue,
  SocialDispatchMonitorPanel,
} from "./leads-crm-console";
import type {
  ClientSocialApproval,
  ClientSocialDispatchMonitor,
} from "@/lib/client-os/social-approvals";
type Conversation = {
  id: string;
  lead_id: string | null;
  name: string;
  channel: string;
  last_message_preview: string;
  last_message_at: string;
};
type Message = {
  id: string;
  direction: string;
  text_content: string;
  message_type: string;
  occurred_at: string;
};
const labels: Record<string, string> = {
  instagram_direct: "Instagram Direct",
  facebook_messenger: "Messenger",
  instagram_comments: "Comentários Instagram",
  facebook_comments: "Comentários Facebook",
};
export function MetaSocialInbox({ admin = false, agentHref }: { admin?: boolean; agentHref?: string } = {}) {
  const [conversations, setConversations] = useState<Conversation[]>([]),
    [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState(""),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState("");
  const [approvals, setApprovals] = useState<ClientSocialApproval[]>([]),
    [monitor, setMonitor] = useState<ClientSocialDispatchMonitor | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const [inbox, ops] = await Promise.all([
        fetch(
          `/api/dashboard/meta-social${selected ? `?conversation=${encodeURIComponent(selected)}` : ""}`,
          { cache: "no-store", signal },
        ),
        fetch("/api/dashboard/social-approvals", { cache: "no-store", signal }),
      ]);
      const [data, operations] = await Promise.all([inbox.json(), ops.json()]);
      if (signal?.aborted) return;
      if (!inbox.ok || !ops.ok)
        throw new Error(
          data.error || operations.error || "Falha ao atualizar atendimento.",
        );
      setConversations(data.conversations);
      setMessages(data.messages);
      setApprovals(operations.approvals);
      setMonitor(operations.dispatchMonitor);
      setError("");
    },
    [selected],
  );
  useEffect(() => {
    const controller = new AbortController();
    const update = () => {
      void load(controller.signal).catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    };
    update();
    const timer = setInterval(update, 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);
  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar.");
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <section className="space-y-5">
      <p className="text-sm text-slate-500">
        Direct, Messenger e comentários da sua empresa. Configure o agente e
        acompanhe as respostas que precisam de revisão antes do envio.
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="text-blue-600" href={agentHref ?? (admin ? "/admin/meta/atendimento" : "/dashboard/whatsapp")}>
          Configurar agente →
        </Link>
        <Link
          className="text-blue-600"
          href={admin ? "/admin/meta" : "/dashboard/integracoes#meta-ads-guiado"}
        >
          Conexão e permissões →
        </Link>
        <button
          className="text-blue-600"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          Atualizar
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-r border-slate-100 p-3">
          <select
            aria-label="Canal Meta"
            className="mb-3 w-full rounded-lg border p-2 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Todos os canais</option>
            {Object.entries(labels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <div className="max-h-[550px] overflow-auto">
            {conversations
              .filter((c) => filter === "all" || c.channel === filter)
              .map((c) => (
                <button
                  key={c.id}
                  className={`mb-1 w-full rounded-xl p-3 text-left ${selected === c.id ? "bg-blue-50" : "hover:bg-slate-50"}`}
                  onClick={() => {
                    setMessages([]);
                    setSelected(c.id);
                  }}
                >
                  <strong className="block text-sm">{c.name}</strong>
                  <span className="block text-xs text-blue-600">
                    {labels[c.channel]}
                  </span>
                  <span className="mt-1 block truncate text-xs text-slate-500">
                    {c.last_message_preview}
                  </span>
                </button>
              ))}
            {!conversations.length && (
              <p className="p-4 text-sm text-slate-500">
                As conversas aparecerão após conectar os canais e receber
                mensagens.
              </p>
            )}
          </div>
        </aside>
        <div className="min-h-[320px] max-h-[600px] space-y-3 overflow-auto bg-slate-50 p-5">
          {messages.map((m) => (
            <article
              key={m.id}
              className={`max-w-[85%] rounded-xl p-3 text-sm ${m.direction === "outbound" ? "ml-auto bg-blue-100" : "bg-white"}`}
            >
              <p className="whitespace-pre-wrap">
                {m.text_content || `[${m.message_type}]`}
              </p>
              <p className="mt-2 text-right text-[10px] text-slate-500">
                {new Date(m.occurred_at).toLocaleString("pt-BR")}
              </p>
            </article>
          ))}
          {!selected && (
            <p className="pt-12 text-center text-sm text-slate-400">
              Selecione uma conversa.
            </p>
          )}
          {selected && !messages.length && (
            <p className="text-sm text-slate-500">
              Nenhuma mensagem carregada para esta conversa.
            </p>
          )}
        </div>
      </div>
      <SocialApprovalQueue
        approvals={
          selected
            ? approvals.filter((a) => a.conversationId === selected)
            : approvals
        }
        onReviewed={() => void refresh()}
        onSelectLead={(leadId) => {
          const conversation = conversations.find((c) =>
            approvals.some(
              (a) => a.leadId === leadId && a.conversationId === c.id,
            ),
          );
          if (conversation) setSelected(conversation.id);
        }}
      />
      {monitor && (
        <SocialDispatchMonitorPanel
          monitor={monitor}
          refreshing={refreshing}
          onRefresh={refresh}
          onSelectLead={(leadId) => {
            const conversation = conversations.find(
              (c) => c.lead_id === leadId,
            );
            if (conversation) {
              setMessages([]);
              setSelected(conversation.id);
            }
          }}
        />
      )}
    </section>
  );
}
