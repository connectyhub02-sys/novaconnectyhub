"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, ImageIcon, MessageCircle, RefreshCw, Send } from "lucide-react";
import type { InboxComment, InboxNetwork, InboxPost } from "@/lib/meta/inbox-model";

export const inboxButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
export function inboxDate(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""; }
export function MetaReplyComposer({ conversationId, commentToken, recipient, onSent }: { conversationId?: string; commentToken?: string; recipient: string; onSent: () => void }) {
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef<{ text: string; id: string } | null>(null);
  async function submit() {
    if (busy || !text.trim() || uncertain) return;
    if (attempt.current?.text !== text) attempt.current = { text, id: crypto.randomUUID() };
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/dashboard/meta-social/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, commentToken, text, requestId: attempt.current.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível preparar a resposta.");
      if (data.status === "sent") { setText(""); attempt.current = null; setNotice("Resposta enviada e confirmada pela Meta."); onSent(); }
      else if (data.status === "failed") { setNotice("A Meta recusou o envio. Confira a conexão antes de preparar uma nova resposta."); }
      else { setUncertain(true); setNotice("O envio ainda não tem confirmação. Confira na rede antes de tentar novamente, para evitar duplicação."); }
    } catch (e) { setNotice(e instanceof Error ? e.message : "Falha ao consultar o envio."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3 border-t border-slate-200 bg-white p-4">
    <p className="text-sm font-medium text-slate-800">{commentToken ? `Resposta pública para ${recipient}` : `Mensagem privada para ${recipient}`}</p>
    <textarea aria-label={commentToken ? "Resposta pública" : "Mensagem privada"} value={text} disabled={busy || uncertain} onChange={e => setText(e.target.value)} maxLength={1500} rows={3} placeholder="Escreva sua resposta…" className="w-full resize-y rounded-xl border border-slate-300 p-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none" />
    <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">{commentToken ? "Visível na publicação original." : "Enviada somente para esta conversa."} · {text.length}/1500</span><button type="button" disabled={busy || uncertain || !text.trim()} onClick={() => void submit()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Send size={15}/>{busy ? "Enviando…" : commentToken ? "Enviar resposta pública" : "Enviar mensagem"}</button></div>
    {notice && <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{notice}</p>}
  </div>;
}
export function MetaPostPreview({ post, compact = false }: { post: InboxPost; compact?: boolean }) {
  return <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4"><p className="text-sm font-semibold">{post.network === "instagram" ? "Instagram" : "Facebook"}</p><p className="mt-1 text-xs text-slate-500">{inboxDate(post.timestamp)}</p></div>
    {post.media.length ? <div className={post.media.length > 1 ? "flex snap-x overflow-x-auto" : ""}>{post.media.map((media, index) => <div key={index} className={`grid min-w-full snap-start place-items-center bg-slate-100 ${compact ? "h-40" : "min-h-36"}`}>
      {media.type === "video" && media.url && (!compact || !media.thumbnail) ? <video controls={!compact} preload="none" poster={media.thumbnail || undefined} src={media.url} className={`${compact ? "h-40" : "max-h-[380px]"} w-full`} /> : media.thumbnail || media.url ?
        /* Meta CDN media are ephemeral. Keep direct URLs and never proxy arbitrary hosts. */
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" referrerPolicy="no-referrer" src={media.thumbnail || media.url!} alt={`Mídia ${index + 1} da publicação`} className={`w-full object-contain ${compact ? "h-40" : "max-h-[380px]"}`} onError={e => { e.currentTarget.hidden = true; }} /> : <ImageIcon className="m-10 text-slate-400"/>}
    </div>)}</div> : <div className="grid h-24 place-items-center bg-slate-50 text-sm text-slate-500">Publicação sem prévia de mídia</div>}
    <div className="space-y-3 p-4"><p className={`whitespace-pre-wrap break-words text-sm leading-6 ${compact ? "line-clamp-3" : ""}`}>{post.caption || "Sem legenda"}</p>{post.commentsCount !== null && <p className="text-xs text-slate-500">{post.commentsCount} comentários informados pela rede</p>}{post.permalink && <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-700">Ver na rede <ExternalLink size={13}/></a>}</div>
  </article>;
}
function CommentThread({ comment, onReply, onMore, busy, canReply }: { comment: InboxComment; onReply: (c: InboxComment) => void; onMore: (c: InboxComment) => void; busy: boolean; canReply: boolean }) {
  return <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="break-words text-sm">{comment.author}</strong><span className="text-xs text-slate-500">{inboxDate(comment.timestamp)}</span></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{comment.text || "Comentário sem texto"}</p><button disabled={!canReply} className="mt-2 min-h-9 text-sm font-medium text-blue-700 disabled:opacity-50" onClick={() => onReply(comment)}>Responder</button>
    {comment.replies.length > 0 && <div className="mt-3 space-y-3 border-l-2 border-blue-100 pl-3">{comment.replies.map(reply => <div key={reply.id}><p className="text-sm font-medium">{reply.author} <span className="font-normal text-slate-500">· {inboxDate(reply.timestamp)}</span></p><p className="whitespace-pre-wrap break-words text-sm">{reply.text}</p></div>)}</div>}
    {comment.repliesAfter && <button className="mt-3 text-sm text-blue-700 disabled:opacity-50" disabled={busy} onClick={() => onMore(comment)}>Carregar mais respostas</button>}
  </article>;
}
export function MetaPostDiscussion({ network, postId, onBack }: { network: InboxNetwork; postId: string; onBack?: () => void }) {
  const [post, setPost] = useState<InboxPost | null>(null), [comments, setComments] = useState<InboxComment[]>([]), [after, setAfter] = useState<string | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const [reply, setReply] = useState<InboxComment | null>(null), [canReply, setCanReply] = useState(false);
  const endpoint = `/api/dashboard/meta-social/content?network=${network}&post=${encodeURIComponent(postId)}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; }).then(data => { if (!controller.signal.aborted) { setPost(data.post); setComments(data.comments); setAfter(data.after); setCanReply(data.canReply); setError(""); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, refresh]);
  async function more(parent?: InboxComment) {
    setBusy(true); setError("");
    try {
      const r = await fetch(`${endpoint}&after=${encodeURIComponent(parent?.repliesAfter || after || "")}${parent ? `&parent=${encodeURIComponent(parent.replyToken)}` : ""}`, { cache: "no-store" });
      const data = await r.json(); if (!r.ok) throw new Error(data.error);
      const merge = (a: InboxComment[], b: InboxComment[]) => [...new Map([...a, ...b].map(c => [c.id, c])).values()];
      if (parent) setComments(old => old.map(c => c.id === parent.id ? { ...c, replies: merge(c.replies, data.comments), repliesAfter: data.after } : c));
      else { setComments(old => merge(old, data.comments)); setAfter(data.after); }
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2">{onBack && <button className={inboxButton} onClick={onBack}><ArrowLeft size={16}/>Publicações</button>}<button className={inboxButton} disabled={loading} onClick={() => { setReply(null); setRefresh(v => v + 1); }}><RefreshCw size={15}/>Atualizar publicação</button></div>
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{error}</p>}
    {loading && <p role="status" className="p-8 text-sm text-slate-500">Carregando publicação e comentários…</p>}
    {post && <div className="grid items-start gap-4 xl:grid-cols-[minmax(240px,0.9fr)_minmax(0,1.1fr)]"><MetaPostPreview post={post}/><div className="min-w-0 space-y-3"><h3 className="flex items-center gap-2 font-semibold"><MessageCircle size={18}/>Comentários e respostas</h3><p className="text-xs text-slate-500">Comentários disponibilizados pela Meta. Carregue as próximas páginas para ver mais.</p>
      {!comments.length && !error && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Nenhum comentário retornado para esta publicação.</p>}
      {comments.map(comment => <CommentThread key={comment.id} comment={comment} onReply={c => { if (canReply) setReply(c); }} onMore={c => void more(c)} busy={busy} canReply={canReply}/>)}
      {after && <button className={`${inboxButton} w-full`} disabled={busy} onClick={() => void more()}>Carregar mais comentários</button>}
      {reply && canReply && <div className="overflow-hidden rounded-xl border border-blue-200"><div className="flex justify-between gap-3 bg-blue-50 px-4 py-3 text-sm"><p className="line-clamp-2">Respondendo a {reply.author}: {reply.text}</p><button onClick={() => setReply(null)} aria-label="Cancelar resposta">×</button></div><MetaReplyComposer key={reply.id} commentToken={reply.replyToken} recipient={reply.author} onSent={() => { setReply(null); setRefresh(v => v + 1); }}/></div>}
      {!canReply && <p className="text-sm text-slate-500">Somente gestores podem enviar respostas.</p>}
    </div></div>}
  </div>;
}
export function MetaPublishedPosts() {
  const [network, setNetwork] = useState<InboxNetwork>("instagram"), [posts, setPosts] = useState<InboxPost[]>([]), [selected, setSelected] = useState("");
  const [after, setAfter] = useState<string | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(true), [refresh, setRefresh] = useState(0);
  const request = useRef(0);
  useEffect(() => {
    const current = ++request.current, controller = new AbortController();
    fetch(`/api/dashboard/meta-social/content?network=${network}`, { cache: "no-store", signal: controller.signal }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; }).then(data => { if (current === request.current) { setPosts(data.posts); setAfter(data.after); setError(""); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => { controller.abort(); request.current = current + 1; };
  }, [network, refresh]);
  async function more() {
    const current = request.current; setBusy(true);
    try { const r = await fetch(`/api/dashboard/meta-social/content?network=${network}&after=${encodeURIComponent(after || "")}`, { cache: "no-store" }); const data = await r.json(); if (!r.ok) throw new Error(data.error); if (current === request.current) { setPosts(old => [...new Map([...old, ...data.posts].map(p => [p.id, p])).values()]); setAfter(data.after); } }
    catch (e) { if (current === request.current) setError(e instanceof Error ? e.message : "Falha ao carregar."); }
    finally { if (current === request.current) setBusy(false); }
  }
  if (selected) return <MetaPostDiscussion key={`${network}:${selected}`} network={network} postId={selected} onBack={() => setSelected("")}/>;
  return <div className="space-y-4"><div className="flex flex-wrap justify-between gap-3"><div className="flex gap-2">{(["instagram", "facebook"] as const).map(n => <button key={n} className={`${inboxButton} ${network === n ? "border-blue-300 bg-blue-50 text-blue-700" : ""}`} aria-pressed={network === n} onClick={() => { if (n !== network) { setPosts([]); setAfter(null); setBusy(true); setError(""); setNetwork(n); } }}>{n === "instagram" ? "Instagram" : "Facebook"}</button>)}</div><button className={inboxButton} disabled={busy} onClick={() => setRefresh(v => v + 1)}><RefreshCw size={15}/>Atualizar</button></div>
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{error}</p>}
    {!posts.length && !error && <p role="status" className="p-10 text-center text-sm text-slate-500">{busy ? "Consultando publicações na Meta…" : "Nenhuma publicação retornada para o perfil selecionado."}</p>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{posts.map(post => <div key={post.id} className="flex min-w-0 flex-col gap-2"><MetaPostPreview post={post} compact/><button className={inboxButton} onClick={() => setSelected(post.id)}><MessageCircle size={16}/>Ver comentários e responder</button></div>)}</div>
    {after && <button className={`${inboxButton} w-full`} disabled={busy} onClick={() => void more()}>Carregar mais publicações</button>}
  </div>;
}
