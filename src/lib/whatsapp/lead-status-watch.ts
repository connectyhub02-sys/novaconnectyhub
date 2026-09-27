import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { meterGeminiGenerationUsage } from "@/lib/billing/gemini-metering";
import {
  callWhatsappProvider,
  fetchRecentStatusMessages,
  generateWhatsappShortText,
  resolveClientWhatsappOperationalContext,
} from "@/lib/whatsapp/channel-operations";

type Row = Record<string, unknown>;
type Routine = { id: string; organization_id: string; agent_id: string; lead_status_view: boolean; lead_status_react: boolean; lead_status_comment: boolean };
type LeadStatus = {
  id: string; organization_id: string; whatsapp_instance_id: string; lead_id: string; sender_phone: string; provider_message_id: string;
  message_type: string | null; caption: string | null; posted_at: string; expires_at: string; viewed_at: string | null; reacted_at: string | null;
  commented_at: string | null; attempts: number; created_at: string;
};
export type StatusRecord = { messageId: string; phone: string; type: string | null; caption: string | null; postedAt: Date };

const hourMs = 3600_000;
const statusLifetimeMs = 24 * hourMs;
/** Daily ceilings per number and per run: enough to be present, far from what looks like a robot. */
export const statusLimits = { viewsPerDay: 200, reactionsPerDay: 40, commentsPerDay: 20, viewsPerRun: 8, reactionsPerRun: 3, commentsPerRun: 2 };
const ignoredTypes = /protocol|reaction|senderkey|revoke|poll_update|keep/i;

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const digits = (jid: string | null) => jid && /@s\.whatsapp\.net$|^\d+$/.test(jid) ? jid.split("@")[0].replace(/\D/g, "") : null;
const hash = (value: string) => Array.from(value).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);

/** A contact's status post as the provider returns it (message search or webhook), or null when it is not one. */
export function readStatusRecord(record: Row, now = new Date()): StatusRecord | null {
  const chat = text(record.chatid) ?? text(record.chatId) ?? "";
  if (chat && !chat.startsWith("status@broadcast")) return null;
  if (record.fromMe === true) return null;
  const messageId = text(record.messageid) ?? text(record.messageId) ?? text(record.id);
  const phone = digits(text(record.sender_pn) ?? text(record.senderPn)) ?? digits(text(record.sender));
  const type = text(record.messageType) ?? text(record.type);
  if (!messageId || !phone || phone.length < 8 || (type && ignoredTypes.test(type))) return null;
  const raw = Number(record.messageTimestamp ?? record.timestamp ?? 0);
  const postedAt = new Date(raw > 1e12 ? raw : raw * 1000);
  if (!raw || now.getTime() - postedAt.getTime() > statusLifetimeMs) return null;
  const content = record.content && typeof record.content === "object" ? record.content as Row : {};
  const caption = (text(record.text) ?? text(content.caption) ?? text(content.text))?.slice(0, 1000) ?? null;
  return { messageId, phone, type, caption, postedAt };
}

async function routinesWithInteraction(client: SupabaseClient) {
  const { data } = await client.from("whatsapp_traffic_routines").select("id, organization_id, agent_id, lead_status_view, lead_status_react, lead_status_comment")
    .or("lead_status_view.eq.true,lead_status_react.eq.true,lead_status_comment.eq.true").limit(100);
  return (data ?? []) as Routine[];
}

/** Keeps the statuses of known leads (other contacts are not stored). Duplicates are ignored. */
export async function recordLeadStatuses(client: SupabaseClient, input: { organizationId: string; instanceId: string; agentId: string | null; records: StatusRecord[]; source: "poll" | "webhook" }) {
  const byPhone = new Map(input.records.map(record => [record.phone, record]));
  if (!byPhone.size) return 0;
  const { data: leads } = await client.from("leads").select("id, phone_number").eq("organization_id", input.organizationId).in("phone_number", Array.from(byPhone.keys()));
  const leadByPhone = new Map(((leads ?? []) as Array<{ id: string; phone_number: string }>).map(lead => [lead.phone_number, lead.id]));
  const rows = input.records.filter(record => leadByPhone.has(record.phone)).map(record => ({
    organization_id: input.organizationId, whatsapp_instance_id: input.instanceId, agent_id: input.agentId, lead_id: leadByPhone.get(record.phone),
    sender_phone: record.phone, provider_message_id: record.messageId, message_type: record.type, caption: record.caption,
    posted_at: record.postedAt.toISOString(), expires_at: new Date(record.postedAt.getTime() + statusLifetimeMs).toISOString(), source: input.source, attempts: 0,
  }));
  if (!rows.length) return 0;
  await client.from("whatsapp_lead_statuses").upsert(rows, { onConflict: "whatsapp_instance_id,provider_message_id", ignoreDuplicates: true });
  return rows.length;
}

/** Webhook path: a status that arrives with the message events is kept like the ones found by the search. */
export async function captureStatusFromWebhook(client: SupabaseClient, instance: { id: string; organization_id: string; metadata: Row | null }, payload: Row) {
  const message = payload.message && typeof payload.message === "object" ? payload.message as Row : payload;
  const record = readStatusRecord(message);
  if (!record) return 0;
  const agentId = typeof instance.metadata?.agent_id === "string" ? instance.metadata.agent_id : null;
  return recordLeadStatuses(client, { organizationId: instance.organization_id, instanceId: instance.id, agentId, records: [record], source: "webhook" });
}

/** Every 5 minutes: fetch the statuses still on the air for each number with the interaction on. */
export async function pollLeadStatuses(client: SupabaseClient, now = new Date()) {
  const results = [];
  for (const routine of await routinesWithInteraction(client)) {
    try {
      const context = await resolveClientWhatsappOperationalContext(client, routine.organization_id, routine.agent_id);
      if (context.instance.status !== "connected") { results.push({ routineId: routine.id, skipped: "disconnected" }); continue; }
      const found = (await fetchRecentStatusMessages(context, 80)).map(record => readStatusRecord(record, now)).filter((record): record is StatusRecord => Boolean(record));
      const stored = await recordLeadStatuses(client, { organizationId: routine.organization_id, instanceId: context.instance.id, agentId: routine.agent_id, records: found, source: "poll" });
      results.push({ routineId: routine.id, found: found.length, leads: stored });
    } catch (error) {
      results.push({ routineId: routine.id, error: error instanceof Error ? error.message.slice(0, 200) : "falha" });
    }
  }
  return results;
}

/** An emoji that fits what was posted; varied so it never looks automatic. */
export function pickStatusReaction(caption: string | null, type: string | null, seed: string) {
  const value = (caption ?? "").toLocaleLowerCase("pt-BR");
  const rules: Array<[RegExp, string]> = [
    [/treino|academia|gym|foco|shape|maromba|corrida|pedal/, "💪"],
    [/deus|f[ée]\b|gratid|am[ée]m|ben[çc]/, "🙏"],
    [/anivers|parab[ée]ns|comemora|festa/, "🎉"],
    [/comida|almo[çc]o|jantar|pizza|churras|lanche|caf[ée]/, "😋"],
    [/praia|viagem|f[ée]rias|passeio|pôr do sol|por do sol/, "😍"],
    [/filh|beb[êe]|fam[ií]lia|amor|m[ãa]e|pai/, "❤️"],
    [/kkk|haha|rsrs|😂/, "😂"],
  ];
  const match = rules.find(([pattern]) => pattern.test(value));
  if (match) return match[1];
  const pool = /video/i.test(type ?? "") ? ["🔥", "👏", "😍"] : ["🔥", "😍", "👏", "❤️"];
  return pool[hash(seed) % pool.length];
}

const startOfDay = (now: Date) => new Date(Math.floor((now.getTime() - 3 * hourMs) / (24 * hourMs)) * 24 * hourMs + 3 * hourMs);

async function countToday(client: SupabaseClient, instanceId: string, column: "viewed_at" | "reacted_at" | "commented_at", now: Date) {
  const { count } = await client.from("whatsapp_lead_statuses").select("id", { count: "exact", head: true })
    .eq("whatsapp_instance_id", instanceId).gte(column, startOfDay(now).toISOString());
  return count ?? 0;
}

/**
 * Every 5 minutes, per number: view, react and comment on the leads' statuses still on the air, one step
 * per status per run, a few minutes after it was found, within the daily ceilings. Leads who asked not to
 * be contacted are skipped; a comment waits when the lead was contacted in the last 6 hours and happens at
 * most once a day per lead.
 */
export async function actOnLeadStatuses(client: SupabaseClient, now = new Date()) {
  const results = [];
  for (const routine of await routinesWithInteraction(client)) {
    try {
      const context = await resolveClientWhatsappOperationalContext(client, routine.organization_id, routine.agent_id);
      if (context.instance.status !== "connected") continue;
      const { data } = await client.from("whatsapp_lead_statuses").select("*").eq("whatsapp_instance_id", context.instance.id)
        .not("lead_id", "is", null).gt("expires_at", new Date(now.getTime() + 15 * 60_000).toISOString()).lt("attempts", 3)
        .order("posted_at", { ascending: false }).limit(60);
      const statuses = ((data ?? []) as LeadStatus[]).filter(status => new Date(status.created_at).getTime() + (2 + hash(status.id) % 9) * 60_000 <= now.getTime());
      if (!statuses.length) continue;
      const { data: leadRows } = await client.from("leads").select("id, display_name, metadata").in("id", Array.from(new Set(statuses.map(status => status.lead_id))));
      const leads = new Map(((leadRows ?? []) as Array<{ id: string; display_name: string | null; metadata: Row | null }>).map(lead => [lead.id, lead]));
      const optedOut = (leadId: string) => { const metadata = leads.get(leadId)?.metadata ?? {}; return metadata.whatsapp_opt_out === true || Boolean((metadata.opt_out as Row | undefined)?.requested_at); };
      const budget = {
        view: routine.lead_status_view ? Math.min(statusLimits.viewsPerRun, statusLimits.viewsPerDay - await countToday(client, context.instance.id, "viewed_at", now)) : 0,
        react: routine.lead_status_react ? Math.min(statusLimits.reactionsPerRun, statusLimits.reactionsPerDay - await countToday(client, context.instance.id, "reacted_at", now)) : 0,
        comment: routine.lead_status_comment ? Math.min(statusLimits.commentsPerRun, statusLimits.commentsPerDay - await countToday(client, context.instance.id, "commented_at", now)) : 0,
      };
      const done = { views: 0, reactions: 0, comments: 0 };
      for (const status of statuses) {
        if (optedOut(status.lead_id)) continue;
        const viewedOrSkipped = status.viewed_at || !routine.lead_status_view;
        try {
          if (!status.viewed_at && budget.view > 0) {
            await callWhatsappProvider(context, "/message/markread", { id: [status.provider_message_id] });
            await client.from("whatsapp_lead_statuses").update({ viewed_at: now.toISOString(), last_error: null }).eq("id", status.id);
            budget.view -= 1; done.views += 1;
          } else if (viewedOrSkipped && !status.reacted_at && budget.react > 0) {
            const reaction = pickStatusReaction(status.caption, status.message_type, status.id);
            await callWhatsappProvider(context, "/message/react", { id: status.provider_message_id, text: reaction });
            await client.from("whatsapp_lead_statuses").update({ reacted_at: now.toISOString(), reaction, last_error: null }).eq("id", status.id);
            budget.react -= 1; done.reactions += 1;
          } else if (viewedOrSkipped && (status.reacted_at || !routine.lead_status_react) && !status.commented_at && budget.comment > 0
            && await mayComment(client, status, now)) {
            await commentOnStatus(client, context, routine, status, leads.get(status.lead_id)?.display_name ?? null, now);
            budget.comment -= 1; done.comments += 1;
          }
        } catch (error) {
          await client.from("whatsapp_lead_statuses").update({ attempts: status.attempts + 1, last_error: error instanceof Error ? error.message.slice(0, 300) : "falha" }).eq("id", status.id);
        }
      }
      results.push({ routineId: routine.id, ...done });
    } catch (error) {
      results.push({ routineId: routine.id, error: error instanceof Error ? error.message.slice(0, 200) : "falha" });
    }
  }
  return results;
}

async function mayComment(client: SupabaseClient, status: LeadStatus, now: Date) {
  const [recentComment, recentContact] = await Promise.all([
    client.from("whatsapp_lead_statuses").select("id").eq("lead_id", status.lead_id).gte("commented_at", new Date(now.getTime() - 20 * hourMs).toISOString()).limit(1),
    client.from("conversation_messages").select("id").eq("lead_id", status.lead_id).eq("direction", "outbound").gte("occurred_at", new Date(now.getTime() - 6 * hourMs).toISOString()).limit(1),
  ]);
  return !recentComment.data?.length && !recentContact.data?.length;
}

type Context = Awaited<ReturnType<typeof resolveClientWhatsappOperationalContext>>;

async function commentOnStatus(client: SupabaseClient, context: Context, routine: Routine, status: LeadStatus, leadName: string | null, now: Date) {
  const [{ data: agent }, { data: company }] = await Promise.all([
    client.from("agent_registry").select("name, persona_name").eq("id", routine.agent_id).maybeSingle(),
    client.from("organizations").select("name").eq("id", routine.organization_id).maybeSingle(),
  ]);
  const agentName = (agent?.persona_name as string | null) ?? (agent?.name as string | null) ?? "Atendimento";
  const firstName = leadName?.trim().split(/\s+/)[0] ?? null;
  const media = /image|foto/i.test(status.message_type ?? "") ? "uma foto" : /video/i.test(status.message_type ?? "") ? "um vídeo" : "um texto";
  const systemInstruction = [
    `Você é ${agentName}, da ${company?.name ?? "empresa"}, respondendo ao status que um cliente postou no WhatsApp.`,
    "Escreva UM comentário curto (até 90 caracteres), natural e simpático, em português do Brasil informal, com no máximo 1 emoji.",
    "Não venda, não cite produtos, preços ou a empresa, e não convide para comprar. Pode fazer uma pergunta leve sobre o que ele postou.",
    "Nunca invente detalhes que não estão no status. Sem texto no status, comente de forma positiva e genérica sobre a foto ou o vídeo.",
    "Responda só com o comentário, sem aspas.",
  ].join("\n");
  const prompt = [firstName ? `Nome do cliente: ${firstName}.` : "", `O status é ${media}.`, status.caption ? `Texto do status: "${status.caption}"` : "O status não tem texto."].filter(Boolean).join("\n");
  const generated = await generateWhatsappShortText(client, systemInstruction, prompt);
  await meterGeminiGenerationUsage({
    client, organizationId: routine.organization_id, featureCode: "content_generation", modelId: generated.modelId, agentScope: "customer",
    promptText: [systemInstruction, prompt], outputText: generated.text, responseData: generated.responseData, leadId: status.lead_id,
    debitDescription: "Comentário no status de um lead", metadata: { source: "whatsapp_lead_status_comment", statusId: status.id, agentId: routine.agent_id },
  });
  const comment = generated.text.replace(/^["'“”]+|["'“”]+$/g, "").slice(0, 160).trim();
  if (!comment) throw new Error("A IA não escreveu o comentário.");
  const response = await callWhatsappProvider(context, "/send/text", {
    number: status.sender_phone, text: comment, replyid: status.provider_message_id, delay: 2500, linkPreview: false,
    track_source: "connectyhub", track_id: `status_comment_${status.id}`,
  });
  await client.from("whatsapp_lead_statuses").update({ commented_at: now.toISOString(), comment_text: comment, last_error: null }).eq("id", status.id);
  const { data: conversation } = await client.from("conversations").select("id, provider_chat_id").eq("organization_id", routine.organization_id)
    .eq("lead_id", status.lead_id).eq("whatsapp_instance_id", context.instance.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (conversation) {
    const providerMessageId = response && typeof response === "object" ? (text((response as Row).messageid) ?? text((response as Row).id)) : null;
    await client.from("conversation_messages").insert({
      organization_id: routine.organization_id, conversation_id: conversation.id, lead_id: status.lead_id, whatsapp_instance_id: context.instance.id,
      provider: "uazapi", provider_message_id: providerMessageId, provider_chat_id: conversation.provider_chat_id, direction: "outbound", message_type: "text",
      text_content: comment, occurred_at: now.toISOString(),
      payload: { delivery_source: "lead_status_comment", author_type: "agent", author_source: "lead_status_comment", replied_status: { caption: status.caption, type: status.message_type } },
    });
  }
}
