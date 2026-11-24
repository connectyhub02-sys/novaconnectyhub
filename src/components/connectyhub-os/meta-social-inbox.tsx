"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ImageIcon, MessageCircle, MessagesSquare, RefreshCw, Search } from "lucide-react";
import { SocialApprovalQueue, SocialDispatchMonitorPanel } from "./leads-crm-console";
import type { ClientSocialApproval, ClientSocialDispatchMonitor } from "@/lib/client-os/social-approvals";
import { inboxChannelLabels, inboxNetwork, type InboxConversation, type InboxMessage } from "@/lib/meta/inbox-model";
import { inboxButton, inboxDate, MetaPostDiscussion, MetaPublishedPosts, MetaReplyComposer } from "./meta-inbox-content";
type Tab = "messages" | "comments" | "posts";

export function MetaSocialInbox({ admin = false, agentHref }: { admin?: boolean; agentHref?: string } = {}) {
  const [tab, setTab] = useState<Tab>("messages"), [filter, setFilter] = useState("all"), [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<InboxConversation[]>([]), [messages, setMessages] = useState<InboxMessage[]>([]);
  const [selected, setSelected] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(true), [canReply, setCanReply] = useState(false);
  const [approvals, setApprovals] = useState<ClientSocialApproval[]>([]), [monitor, setMonitor] = useState<ClientSocialDispatchMonitor | null>(null), [opsError, setOpsError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let running = false;
    async function load() {
      if (running) return; running = true;
      try {
        const r = await fetch(`/api/dashboard/meta-social${selected ? `?conversation=${encodeURIComponent(selected)}` : ""}`, { cache: "no-store", signal: controller.signal });
        const data = await r.json(); if (!r.ok) throw new Error(data.error);
        if (!controller.signal.aborted) { setConversations(data.conversations); setMessages(data.messages); setCanReply(data.canReply); setError(""); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Falha ao consultar atendimento."); }
      finally { if (!controller.signal.aborted) setLoading(false); running = false; }
    }
    void load(); const timer = setInterval(() => void load(), 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [selected, refresh]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/dashboard/social-approvals", { cache: "no-store", signal: controller.signal }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; }).then(data => { if (!controller.signal.aborted) { setApprovals(data.approvals); setMonitor(data.dispatchMonitor); setOpsError(""); } }).catch(() => { if (!controller.signal.aborted) setOpsError("Não foi possível carregar revisões e recibos. Atualize para tentar novamente."); });
    return () => controller.abort();
  }, [refresh]);
  const current = conversations.find(c => c.id === selected);
  const filtered = conversations.filter(c => (tab === "comments" ? c.channel.endsWith("comments") : !c.channel.endsWith("comments")) && (filter === "all" || c.channel.startsWith(filter)) && `${c.name} ${c.last_message_preview}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  function select(id: string) { setMessages([]); setLoading(true); setSelected(id); }
  const reload = () => { setRefresh(v => v + 1); };
  function selectLead(leadId: string) { const c = conversations.find(c => c.lead_id === leadId); if (c) { setTab(c.channel.endsWith("comments") ? "comments" : "messages"); setFilter("all"); setSearch(""); select(c.id); } }
  return <section className="space-y-4 text-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Atenda as mensagens e acompanhe os comentários nas publicações dos perfis conectados.</p><div className="flex flex-wrap gap-3 text-sm"><Link className="text-blue-700" href={admin ? "/admin/meta/social" : "/dashboard/integracoes#meta-ads-guiado"}>Gerenciar Instagram e Facebook</Link><Link className="text-blue-700" href={agentHref ?? (admin ? "#automacoes-meta" : "/dashboard/whatsapp")}>Agente e automações</Link></div></div>
    <nav aria-label="Atendimento social" className="flex flex-wrap gap-1 border-b border-slate-200">{([{ id: "messages", label: "Mensagens", Icon: MessagesSquare }, { id: "comments", label: "Comentários", Icon: MessageCircle }, { id: "posts", label: "Publicações", Icon: ImageIcon }] as const).map(({ id, label, Icon }) => <button key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setSelected(""); setMessages([]); setFilter("all"); }} className={`inline-flex min-h-12 items-center gap-2 border-b-2 px-4 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}><Icon size={17}/>{label}</button>)}</nav>
    {tab === "posts" ? <MetaPublishedPosts/> : <>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className={`${selected ? "hidden lg:block" : ""} min-w-0 border-r border-slate-100`}>
          <div className="space-y-3 border-b border-slate-100 p-4"><div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3"><Search size={16} className="shrink-0 text-slate-400"/><input value={search} onChange={e => setSearch(e.target.value)} aria-label="Buscar atendimento" placeholder="Buscar nome ou mensagem" className="min-w-0 flex-1 py-2 text-sm outline-none"/></div><div className="flex gap-2"><select aria-label="Filtrar rede" value={filter} onChange={e => { setFilter(e.target.value); setSelected(""); setMessages([]); }} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-2 text-sm"><option value="all">Todas as redes</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option></select><button className={inboxButton} aria-label="Atualizar atendimento" onClick={reload}><RefreshCw size={15}/></button></div></div>
          <div className="max-h-[620px] overflow-auto p-2">{filtered.map(c => <button key={c.id} onClick={() => select(c.id)} aria-pressed={selected === c.id} className={`mb-1 w-full rounded-xl border p-3 text-left ${selected === c.id ? "border-blue-200 bg-blue-50" : "border-transparent hover:bg-slate-50"}`}><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 font-semibold text-slate-600">{c.name.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{c.name}</p><p className="text-xs text-blue-700">{inboxChannelLabels[c.channel]}</p></div></div><p className="mt-2 line-clamp-2 break-words text-sm text-slate-600">{c.last_message_preview}</p><p className="mt-2 text-xs text-slate-400">{inboxDate(c.last_message_at)}</p></button>)}{!filtered.length && <p className="p-6 text-sm leading-6 text-slate-500">{loading ? "Carregando atendimento…" : search ? "Nenhum resultado para esta busca." : tab === "comments" ? "Nenhum comentário recebido neste filtro. Em Publicações, consulte os comentários disponíveis na rede." : "As mensagens recebidas pelos canais conectados aparecerão aqui."}</p>}</div>
        </aside>
        <div className={`${selected ? "" : "hidden lg:block"} min-w-0 bg-slate-50`}>
          {current ? <><header className="flex items-center gap-3 border-b border-slate-200 bg-white p-4"><button className="lg:hidden" aria-label="Voltar à lista" onClick={() => setSelected("")}><ArrowLeft size={20}/></button><div><h2 className="font-semibold">{current.name}</h2><p className="text-xs text-slate-500">{inboxChannelLabels[current.channel]}</p></div></header>
            {tab === "comments" ? <div className="p-4">{current.sourcePostId ? <MetaPostDiscussion key={`${current.channel}:${current.sourcePostId}`} network={inboxNetwork(current.channel)} postId={current.sourcePostId}/> : <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Este registro antigo não informa a publicação de origem. Abra Publicações para localizar o comentário na rede.</p>}<details className="mt-5 rounded-xl border p-3 text-sm"><summary className="cursor-pointer">Histórico registrado neste atendimento</summary><MessageHistory messages={messages} loading={loading}/></details></div> : <><MessageHistory messages={messages} loading={loading}/>{canReply && <MetaReplyComposer key={selected} conversationId={selected} recipient={current.name} onSent={reload}/>}</>}
          </> : <div className="grid min-h-[470px] place-items-center p-8 text-center"><div><MessagesSquare className="mx-auto mb-4 text-slate-300" size={42}/><h2 className="font-semibold">{tab === "comments" ? "Comentários com contexto" : "Sua caixa de entrada social"}</h2><p className="mt-2 max-w-sm text-slate-500">{tab === "comments" ? "Selecione um atendimento para ver a publicação original e suas respostas." : "Selecione uma conversa do Instagram ou Messenger para ler e responder."}</p></div></div>}
        </div>
      </div>
      <p className="text-xs text-slate-500">Até 100 atendimentos recentes registrados na ConnectyHub. O histórico anterior à conexão pode não estar disponível.</p>
    </>}
    <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Respostas para revisão e recibos de envio {approvals.length > 0 ? `(${approvals.length})` : ""}</summary><div className="mt-4 space-y-4">{opsError && <p role="status" className="text-sm text-amber-800">{opsError}</p>}<SocialApprovalQueue approvals={selected ? approvals.filter(a => a.conversationId === selected) : approvals} onReviewed={reload} onSelectLead={selectLead}/>{monitor && <SocialDispatchMonitorPanel monitor={monitor} refreshing={false} onRefresh={async () => reload()} onSelectLead={selectLead}/>}</div></details>
  </section>;
}
function MessageHistory({ messages, loading }: { messages: InboxMessage[]; loading: boolean }) {
  return <div className="max-h-[510px] min-h-[260px] space-y-3 overflow-auto p-4">{messages.map(m => <article key={m.id} className={`w-fit max-w-[90%] rounded-xl p-3 text-sm ${m.direction === "outbound" ? "ml-auto bg-blue-100" : "border border-slate-200 bg-white"}`}><p className="whitespace-pre-wrap break-words">{m.text_content || `[${m.message_type}]`}</p><p className="mt-2 text-right text-xs text-slate-500">{inboxDate(m.occurred_at)}{m.deliveryStatus ? ` · ${({ sent: "Enviado", failed: "Não enviado", sending: "Aguardando confirmação", uncertain: "Sem confirmação" } as Record<string, string>)[m.deliveryStatus] || "Sem confirmação"}` : ""}</p></article>)}{!messages.length && <p className="p-4 text-sm text-slate-500">{loading ? "Carregando mensagens…" : "Nenhuma mensagem registrada."}</p>}</div>;
}
