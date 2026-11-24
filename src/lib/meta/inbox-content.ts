import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAdsLeadsContext, metaRecord, selectedMetaAsset } from "./ads-leads-context";
import { fetchMetaPageAccessToken } from "@/lib/client-os/guided-oauth";
import { safeSocialUrl, type InboxNetwork, type InboxPost, type InboxComment, type InboxMedia } from "./inbox-model";

export async function loadInboxContext(client: SupabaseClient, organizationId: string) {
  const base = await loadAdsLeadsContext(client, organizationId);
  const result = await client.from("organization_integrations").select("metadata")
    .eq("organization_id", organizationId).eq("id", base.integrationId).single();
  if (result.error) throw new Error("Não foi possível conferir os perfis selecionados.");
  const metadata = metaRecord(result.data?.metadata);
  const pageToken = base.pageToken || (base.token && base.pageId ? await fetchMetaPageAccessToken({ accessToken: base.token, config: base.config, pageId: base.pageId }) : "");
  return { ...base, pageToken, metadata, instagramId: selectedMetaAsset(metadata, "instagram_business_id") };
}
export type InboxContext = Awaited<ReturnType<typeof loadInboxContext>>;
export const graphId = (value: unknown): value is string => typeof value === "string" && /^\d+(?:_\d+)?$/.test(value);
const str = (v: unknown) => typeof v === "string" ? v : "";
const rows = (v: unknown) => Array.isArray(metaRecord(v).data) ? (metaRecord(v).data as unknown[]).map(metaRecord) : [];
const next = (v: unknown) => {
  const p = metaRecord(metaRecord(v).paging);
  return p.next ? str(metaRecord(p.cursors).after) || null : null;
};
export function inboxAsset(ctx: InboxContext, network: InboxNetwork) {
  const id = network === "instagram" ? ctx.instagramId : ctx.pageId;
  if (!graphId(id)) throw new Error(`Selecione ${network === "instagram" ? "o Instagram" : "a Página Facebook"} nas conexões.`);
  return id;
}
export async function inboxGraph(ctx: InboxContext, network: InboxNetwork, path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET") {
  if (!/^\d+(?:_\d+)?(?:\/[a-z_]+)?$/.test(path)) throw new Error("Identificador Meta inválido.");
  const token = network === "instagram" && method === "GET" ? ctx.token || ctx.pageToken : ctx.pageToken;
  if (!token) throw new Error("Reconecte o perfil para renovar a autorização.");
  const url = new URL(`https://graph.facebook.com/${ctx.config.graphVersion}/${path}`);
  url.searchParams.set("appsecret_proof", createHmac("sha256", ctx.config.appSecret).update(token).digest("hex"));
  if (method === "GET") for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(18000),
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    ...(method === "POST" ? { body: new URLSearchParams(params) } : {}) });
  const data = metaRecord(await response.json().catch(() => null));
  if (!response.ok || data.error) throw new Error("A Meta não disponibilizou este conteúdo. Confira a conexão e as permissões do perfil.");
  return data;
}
const igFields = "id,owner,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,children{id,media_type,media_url,thumbnail_url}";
const fbFields = "id,from,message,created_time,permalink_url,full_picture,attachments{media_type,media,subattachments},comments.limit(0).summary(true)";
function mapMedia(value: Record<string, unknown>): InboxMedia {
  return { type: str(value.media_type).toUpperCase() === "VIDEO" ? "video" : "image", url: safeSocialUrl(value.media_url, true), thumbnail: safeSocialUrl(value.thumbnail_url, true) };
}
export function mapInboxPost(value: Record<string, unknown>, network: InboxNetwork): InboxPost {
  let media: InboxMedia[];
  if (network === "instagram") media = rows(value.children).length ? rows(value.children).map(mapMedia) : [mapMedia(value)];
  else {
    const attachments = rows(value.attachments).flatMap(a => rows(a.subattachments).length ? rows(a.subattachments) : [a]);
    media = attachments.map(a => ({ type: str(a.media_type).toLowerCase() === "video" && safeSocialUrl(metaRecord(a.media).source, true) ? "video" : "image", url: safeSocialUrl(metaRecord(a.media).source, true) || safeSocialUrl(metaRecord(metaRecord(a.media).image).src, true), thumbnail: safeSocialUrl(metaRecord(metaRecord(a.media).image).src, true) }));
    if (!media.length && value.full_picture) media = [{ type: "image", url: safeSocialUrl(value.full_picture, true), thumbnail: null }];
  }
  const count = network === "instagram" ? value.comments_count : metaRecord(metaRecord(value.comments).summary).total_count;
  return { id: str(value.id), network, caption: str(value.caption || value.message), timestamp: str(value.timestamp || value.created_time), permalink: safeSocialUrl(value.permalink || value.permalink_url), media: media.filter(m => m.url || m.thumbnail), commentsCount: typeof count === "number" ? count : null };
}
export async function readInboxPosts(ctx: InboxContext, network: InboxNetwork, after = "") {
  const asset = inboxAsset(ctx, network);
  const data = await inboxGraph(ctx, network, `${asset}/${network === "instagram" ? "media" : "published_posts"}`, { fields: network === "instagram" ? igFields : fbFields, limit: "24", ...(after ? { after } : {}) });
  return { posts: rows(data).map(r => mapInboxPost(r, network)), after: next(data) };
}
export async function readInboxPost(ctx: InboxContext, network: InboxNetwork, postId: string) {
  const asset = inboxAsset(ctx, network);
  if (!graphId(postId) || (network === "facebook" && !postId.startsWith(`${asset}_`))) throw new Error("Publicação fora do perfil selecionado.");
  const data = await inboxGraph(ctx, network, postId, { fields: network === "instagram" ? igFields : fbFields });
  const owner = network === "instagram" ? metaRecord(data.owner).id : metaRecord(data.from).id;
  if (owner !== asset || data.id !== postId) throw new Error("Publicação fora do perfil selecionado.");
  return mapInboxPost(data, network);
}
type CommentTarget = { org: string; network: InboxNetwork; asset: string; post: string; comment: string; authorId: string; author: string; timestamp: string; expires: number };
function signTarget(ctx: InboxContext, target: Omit<CommentTarget, "expires">) {
  const body = Buffer.from(JSON.stringify({ ...target, expires: Date.now() + 2 * 60 * 60 * 1000 })).toString("base64url");
  return `${body}.${createHmac("sha256", ctx.config.appSecret).update(`inbox-comment:${body}`).digest("base64url")}`;
}
export function verifyCommentTarget(ctx: InboxContext, token: string): CommentTarget {
  if (token.length > 6000) throw new Error("Atualize os comentários antes de responder.");
  const [body, signature, extra] = token.split(".");
  const expected = createHmac("sha256", ctx.config.appSecret).update(`inbox-comment:${body}`).digest("base64url");
  if (extra || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Atualize os comentários antes de responder.");
  const target = JSON.parse(Buffer.from(body, "base64url").toString()) as CommentTarget;
  if (!["instagram", "facebook"].includes(target.network) || target.org !== ctx.organizationId || target.asset !== inboxAsset(ctx, target.network) || target.expires < Date.now() || !graphId(target.comment) || !graphId(target.post)) throw new Error("O comentário não pertence à conexão atual. Atualize a publicação.");
  return target;
}
const commentFields = (network: InboxNetwork) => network === "instagram" ? "id,text,timestamp,from" : "id,message,created_time,from";
function mapComment(ctx: InboxContext, network: InboxNetwork, post: string, value: Record<string, unknown>): InboxComment {
  const from = metaRecord(value.from);
  const target = { org: ctx.organizationId, network, asset: inboxAsset(ctx, network), post, comment: str(value.id), authorId: str(from.id), author: str(from.username || from.name) || "Contato", timestamp: str(value.timestamp || value.created_time) };
  const edge = network === "instagram" ? value.replies : value.comments;
  return { id: target.comment, text: str(value.text || value.message), author: target.author, timestamp: target.timestamp, replyToken: signTarget(ctx, target), replies: rows(edge).map(r => mapComment(ctx, network, post, r)), repliesAfter: next(edge) };
}
export async function readInboxComments(ctx: InboxContext, network: InboxNetwork, postId: string, after = "", parentToken = "") {
  // Verify ownership independently of possession of a Graph ID or a cross-tenant URL.
  const post = await readInboxPost(ctx, network, postId);
  const parent = parentToken ? verifyCommentTarget(ctx, parentToken) : null;
  if (parent && (parent.post !== postId || parent.network !== network)) throw new Error("Comentário de outra publicação.");
  const edge = network === "instagram" ? "replies" : "comments";
  const fields = parent ? commentFields(network) : `${commentFields(network)},${edge}.limit(10){${commentFields(network)}}`;
  const data = await inboxGraph(ctx, network, `${parent?.comment || postId}/${parent ? edge : "comments"}`, { fields, limit: "25", ...(after ? { after } : {}) });
  return { post, comments: rows(data).map(r => mapComment(ctx, network, postId, r)), after: next(data) };
}
