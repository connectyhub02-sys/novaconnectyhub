import "server-only";
import { createHash, createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertBillableAccess } from "@/lib/billing/trial";
import { assertContractAccess } from "@/lib/billing/contract-access";
import { resolveMetaSocialChannelsEntitlement } from "@/lib/billing/plan-entitlements";
import type { ClientCompany } from "@/lib/client-os/companies";
import { normalizeMetaSocialApprovalText } from "./social-approval-policy";
import { isMetaSocialChannel } from "./social-agent-policy";
import { evaluateMetaSocialDispatchReadiness, normalizeMetaSocialDispatchLiveActivation, readMetaSocialGrantedPermissions, resolveMetaSocialDispatchMode, resolveMetaSocialDispatchTarget } from "./social-dispatch-policy";
import { loadInboxContext, inboxAsset, verifyCommentTarget, graphId } from "./inbox-content";
import { inboxNetwork } from "./inbox-model";
import { metaRecord } from "./ads-leads-context";

/** An explicit human reply. No AI, automation activation or automatic retry. */
export async function sendInboxReply(input: { client: SupabaseClient; company: ClientCompany; userId: string; requestId: string; text: unknown; conversationId?: string; commentToken?: string }) {
  const { client, company } = input;
  if (!["owner", "admin"].includes(company.role)) throw new Error("Somente gestores podem enviar respostas.");
  const entitlement = resolveMetaSocialChannelsEntitlement({ organizationStatus: company.status, planCode: company.planCode, featureOverrides: company.featureOverrides });
  if (!entitlement.allowed) throw new Error("O plano atual não permite atendimento social.");
  await assertBillableAccess({ client, organizationId: company.id });
  await assertContractAccess(company.id, client);
  if (!/^[a-f0-9-]{36}$/i.test(input.requestId) || Boolean(input.conversationId) === Boolean(input.commentToken)) throw new Error("Resposta inválida.");
  const text = normalizeMetaSocialApprovalText(input.text);
  const ctx = await loadInboxContext(client, company.id);
  let conversationId = input.conversationId || "", leadId: string | null = null, providerChatId = "";
  let channel = "", externalUserId = "", sourceCommentId = "", occurredAt = "", sourcePostId = "";
  if (input.commentToken) {
    const t = verifyCommentTarget(ctx, input.commentToken);
    channel = `${t.network}_comments`; sourceCommentId = t.comment; occurredAt = t.timestamp; sourcePostId = t.post;
    externalUserId = t.authorId || `comment:${t.comment}`;
    providerChatId = `${channel}:${t.asset}:${t.post}:${externalUserId}`;
    const existing = await client.from("conversations").select("id,lead_id").eq("organization_id", company.id).eq("provider", "meta").eq("provider_chat_id", providerChatId).maybeSingle();
    if (existing.error) throw new Error("Não foi possível localizar o atendimento.");
    if (existing.data) { conversationId = existing.data.id; leadId = existing.data.lead_id; }
    else {
      // Social conversations have no WhatsApp instance; their partial index does not enforce uniqueness.
      const hash = createHash("sha256").update(`meta-inbox:${company.id}:${providerChatId}`).digest("hex");
      const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      const created = await client.from("conversations").insert({ id, organization_id: company.id, provider: "meta", channel, provider_chat_id: providerChatId, status: "open", metadata: { external_account_id: t.asset, external_user_id: externalUserId, external_username: t.author, source_post_id: t.post, source_comment_id: t.comment, created_from: "manual_meta_inbox" } });
      if (created.error && created.error.code !== "23505") throw new Error("Não foi possível preparar o atendimento.");
      const found = await client.from("conversations").select("id,lead_id").eq("organization_id", company.id).eq("id", id).single();
      if (found.error) throw new Error("Não foi possível preparar o atendimento.");
      conversationId = found.data.id; leadId = found.data.lead_id;
    }
  } else {
    const result = await client.from("conversations").select("id,lead_id,channel,provider_chat_id,metadata").eq("organization_id", company.id).eq("id", conversationId).eq("provider", "meta").single();
    if (result.error || !result.data) throw new Error("Conversa não encontrada.");
    const c = result.data, m = metaRecord(c.metadata);
    channel = c.channel;
    if (channel !== "instagram_direct" && channel !== "facebook_messenger") throw new Error("Selecione um comentário na publicação para responder publicamente.");
    if (m.external_account_id !== inboxAsset(ctx, inboxNetwork(channel))) throw new Error("Esta conversa pertence a outro perfil. Confira a conexão atual.");
    externalUserId = String(m.external_user_id || "");
    if (!graphId(externalUserId)) throw new Error("Contato sem identidade válida na Meta.");
    leadId = c.lead_id; providerChatId = c.provider_chat_id;
    const latest = await client.from("conversation_messages").select("occurred_at").eq("organization_id", company.id).eq("conversation_id", conversationId).eq("direction", "inbound").order("occurred_at", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) throw new Error("Não foi possível conferir a janela de resposta.");
    occurredAt = latest.data?.occurred_at || "";
  }
  if (!isMetaSocialChannel(channel)) throw new Error("Canal inválido.");
  if (leadId) {
    const lead = await client.from("leads").select("metadata").eq("organization_id", company.id).eq("id", leadId).single();
    if (lead.error) throw new Error("Não foi possível conferir as preferências do contato.");
    const m = metaRecord(lead.data?.metadata);
    if (m.whatsapp_opt_out === true || metaRecord(m.opt_out).requested_at) throw new Error("O contato solicitou não receber mensagens.");
  }
  const target = resolveMetaSocialDispatchTarget({ channel, pageId: ctx.pageId, instagramBusinessId: ctx.instagramId, externalUserId, sourceCommentId, text, allowPrivateReplies: false, allowPublicReplies: true });
  const readiness = evaluateMetaSocialDispatchReadiness({ channel, target, occurredAt, mode: resolveMetaSocialDispatchMode(undefined, company.id), grantedPermissions: readMetaSocialGrantedPermissions({ metadata: ctx.metadata, scopes: ctx.scopes }), liveActivation: normalizeMetaSocialDispatchLiveActivation(ctx.metadata.meta_social_dispatch_activation) });
  if (!readiness.ok) throw new Error(readiness.detail);
  if (!ctx.pageToken) throw new Error("Reconecte o Facebook e Instagram para renovar a autorização.");
  const reservationId = `manual-inbox:${company.id}:${input.requestId}`;
  const fingerprint = createHash("sha256").update(JSON.stringify([conversationId, sourceCommentId, text])).digest("hex");
  const payload = { manual_inbox_reply: true, actor_id: input.userId, delivery_status: "sending", fingerprint, source_post_id: sourcePostId || null, source_comment_id: sourceCommentId || null };
  const claim = await client.from("conversation_messages").insert({ organization_id: company.id, conversation_id: conversationId, lead_id: leadId, provider: "meta", provider_chat_id: providerChatId, provider_message_id: reservationId, direction: "outbound", message_type: target.kind, text_content: text, occurred_at: new Date().toISOString(), payload }).select("id").single();
  if (claim.error) {
    if (claim.error.code !== "23505") throw new Error("Não foi possível registrar a resposta antes do envio.");
    const previous = await client.from("conversation_messages").select("payload").eq("organization_id", company.id).eq("provider", "meta").eq("provider_message_id", reservationId).single();
    const p = metaRecord(previous.data?.payload);
    if (previous.error || p.fingerprint !== fingerprint) throw new Error("Identificador de envio já utilizado. Atualize o atendimento.");
    return { status: String(p.delivery_status || "unknown"), conversationId, repeated: true };
  }
  let status = "uncertain", providerId = "";
  try {
    const url = new URL(`https://graph.facebook.com/${ctx.config.graphVersion}${target.endpointPath}`);
    url.searchParams.set("appsecret_proof", createHmac("sha256", ctx.config.appSecret).update(ctx.pageToken).digest("hex"));
    const json = target.contentType === "json";
    const response = await fetch(url, { method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${ctx.pageToken}`, "Content-Type": json ? "application/json" : "application/x-www-form-urlencoded" }, body: json ? JSON.stringify(target.body) : new URLSearchParams(target.body as Record<string, string>) });
    const body = metaRecord(await response.json().catch(() => null));
    providerId = String(body.message_id || body.id || "");
    status = response.ok && providerId && !body.error ? "sent" : response.status >= 400 && response.status < 500 ? "failed" : "uncertain";
  } catch { status = "uncertain"; }
  const saved = await client.from("conversation_messages").update({ payload: { ...payload, delivery_status: status, provider_message_id: providerId || null } }).eq("organization_id", company.id).eq("id", claim.data.id);
  if (saved.error) return { status: "uncertain", conversationId, repeated: false };
  if (status === "sent") await client.from("conversations").update({ last_message_preview: text, last_message_at: new Date().toISOString() }).eq("organization_id", company.id).eq("id", conversationId);
  return { status, conversationId, repeated: false };
}
