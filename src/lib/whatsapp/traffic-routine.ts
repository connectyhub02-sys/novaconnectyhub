import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { meterGeminiGenerationUsage } from "@/lib/billing/gemini-metering";
import { assertBillableAccess } from "@/lib/billing/trial";
import {
  enableWhatsappAutomationCapability,
  generateWhatsappGrowthCampaignPlan,
  queueWhatsappGroupWindow,
  queueWhatsappGrowthCampaignPlan,
  resolveClientWhatsappOperationalContext,
  updateWhatsappChannelTargetSettings,
} from "@/lib/whatsapp/channel-operations";

export type TrafficIntensity = "light" | "normal" | "intense";
export type TrafficPostFormat = "auto" | "product_audio" | "product_button";
export type TrafficRoutine = {
  id: string; organization_id: string; agent_id: string; enabled: boolean; post_status: boolean; target_ids: string[];
  product_mode: "featured" | "selected"; catalog_item_ids: string[]; idea: string | null; intensity: TrafficIntensity; start_hour: number;
  post_format: TrafficPostFormat;
  lead_status_view: boolean; lead_status_react: boolean; lead_status_comment: boolean;
  room_enabled: boolean; room_target_ids: string[]; room_open_hour: number; room_close_hour: number; room_days: number[]; room_replies: boolean;
  planned_until: string | null; room_planned_until: string | null; last_run_at: string | null; last_error: string | null;
};
export type TrafficRoutineInput = Partial<Pick<TrafficRoutine, "enabled" | "post_status" | "target_ids" | "product_mode" | "catalog_item_ids"
  | "idea" | "intensity" | "start_hour" | "post_format" | "lead_status_view" | "lead_status_react" | "lead_status_comment"
  | "room_enabled" | "room_target_ids" | "room_open_hour" | "room_close_hour" | "room_days" | "room_replies">>;

const brtOffsetMs = 3 * 3600_000;
const dayMs = 24 * 3600_000;
const hourMs = 3600_000;
const postingWindowHours = 10;
const planningHorizonMs = 12 * hourMs;
export const trafficPostsPerDay: Record<TrafficIntensity, number> = { light: 1, normal: 2, intense: 3 };
const targetFormats: Record<TrafficPostFormat, string[]> = {
  auto: ["text", "carousel", "poll", "text_audio"],
  product_audio: ["text_audio"],
  product_button: ["text"],
};
const formatBriefs: Record<TrafficPostFormat, string> = {
  auto: "",
  product_audio: "Cada post apresenta UM produto: para que serve, para quem é e por que vale a pena, com um convite para tocar no botão e ver o produto. O texto também vira um áudio na voz do agente, então escreva como fala natural, sem listas nem emojis em excesso.",
  product_button: "Cada post apresenta UM produto com uma chamada curta para tocar no botão e ver o produto.",
};

const localMidnight = (time: number) => Math.floor((time - brtOffsetMs) / dayMs) * dayMs + brtOffsetMs;

/** Start of the next day to plan, at the owner's hour in Brasília time (no daylight saving since 2019). */
export function nextRoutineDayStart(now: Date, startHour: number, plannedUntil: string | null) {
  const after = plannedUntil ? Math.max(now.getTime(), new Date(plannedUntil).getTime()) : now.getTime();
  let start = localMidnight(after) + startHour * hourMs;
  if (plannedUntil && start < new Date(plannedUntil).getTime()) start += dayMs;
  // First day: when the owner turns the routine on late, today still counts while most of the window is ahead.
  if (!plannedUntil && start < now.getTime()) {
    start = now.getTime() + 20 * 60_000 <= start + (postingWindowHours - 4) * hourMs ? now.getTime() + 20 * 60_000 : start + dayMs;
  }
  return new Date(start);
}

/** Next opening of the question room: a chosen weekday, after what is planned and at least 10 minutes ahead. */
export function nextRoomWindow(now: Date, routine: Pick<TrafficRoutine, "room_open_hour" | "room_close_hour" | "room_days" | "room_planned_until">) {
  const days = routine.room_days.length ? routine.room_days : [0, 1, 2, 3, 4, 5, 6];
  const floor = Math.max(now.getTime() + 10 * 60_000, routine.room_planned_until ? new Date(routine.room_planned_until).getTime() : 0);
  for (let offset = 0; offset < 8; offset += 1) {
    const midnight = localMidnight(now.getTime()) + offset * dayMs;
    const open = midnight + routine.room_open_hour * hourMs;
    const weekday = new Date(midnight - brtOffsetMs).getUTCDay();
    if (open >= floor && days.includes(weekday)) return { open: new Date(open), close: new Date(midnight + routine.room_close_hour * hourMs) };
  }
  return null;
}

/** Featured products first, then the newest; a different window of products each day. */
export function pickRoutineProducts(ids: string[], dayStart: Date, count = 4) {
  if (ids.length <= count) return ids;
  const offset = (Math.floor(dayStart.getTime() / dayMs) * 2) % ids.length;
  return Array.from({ length: count }, (_, index) => ids[(offset + index) % ids.length]);
}

async function loadFeaturedProductIds(client: SupabaseClient, organizationId: string) {
  const { data } = await client.from("intelligence_memory").select("id, metadata, updated_at").eq("scope", "organization")
    .eq("memory_type", "sales_catalog_item").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(60);
  return ((data ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>)
    .filter(row => (row.metadata?.status ?? "active") === "active" && row.metadata?.whatsapp_visible !== false)
    .sort((a, b) => Number(b.metadata?.store_featured === true) - Number(a.metadata?.store_featured === true))
    .map(row => row.id);
}

export async function loadTrafficRoutine(client: SupabaseClient, organizationId: string, agentId: string) {
  const { data, error } = await client.from("whatsapp_traffic_routines").select("*").eq("organization_id", organizationId).eq("agent_id", agentId).maybeSingle();
  if (error) throw new Error("Não foi possível carregar a rotina de tráfego.");
  return (data as TrafficRoutine | null) ?? null;
}

/**
 * Saves the owner's choices. Turning something on also turns on what it needs (posts in status, groups
 * and channels, buttons, group room) and frees the chosen groups and channels, so there is nothing else
 * to configure. Turning something off cancels what it had already scheduled.
 */
export async function saveTrafficRoutine(client: SupabaseClient, input: { organizationId: string; agentId: string; userId: string; changes: TrafficRoutineInput }) {
  const changes = input.changes;
  const before = await loadTrafficRoutine(client, input.organizationId, input.agentId);
  const roomChanged = before?.room_enabled && ["room_target_ids", "room_open_hour", "room_close_hour", "room_days", "room_replies"]
    .some(key => key in changes && JSON.stringify(changes[key as keyof TrafficRoutineInput]) !== JSON.stringify(before[key as keyof TrafficRoutine]));
  if (changes.room_close_hour !== undefined || changes.room_open_hour !== undefined) {
    const open = changes.room_open_hour ?? before?.room_open_hour ?? 19;
    const close = changes.room_close_hour ?? before?.room_close_hour ?? 20;
    if (close <= open) throw new Error("O horário de fechar precisa ser depois do de abrir.");
  }
  const row = {
    organization_id: input.organizationId, agent_id: input.agentId, updated_by: input.userId, updated_at: new Date().toISOString(),
    ...changes,
    ...(changes.idea !== undefined ? { idea: changes.idea?.trim().slice(0, 600) || null } : {}),
    ...(changes.enabled === false ? { planned_until: null } : {}),
    ...(changes.room_enabled === false || roomChanged ? { room_planned_until: null } : {}),
  };
  const { data, error } = await client.from("whatsapp_traffic_routines").upsert(row, { onConflict: "organization_id,agent_id" }).select("*").single();
  if (error) throw new Error("Não foi possível salvar a rotina de tráfego.");
  const routine = data as TrafficRoutine;
  if (routine.enabled || routine.room_enabled) await prepareRoutineCapabilities(client, routine, input.userId);
  if (!routine.enabled) await archiveUpcoming(client, routine, routineTag(routine.id));
  if (!routine.room_enabled || roomChanged) await closeRoom(client, routine, before?.room_target_ids ?? []);
  return routine;
}

export const routineTag = (routineId: string) => `traffic_routine:${routineId}`;
export const roomTag = (routineId: string) => `group_room:${routineId}`;

/**
 * "Usar a mesma configuração": copies the choices of another number's routine. Groups and channels are
 * matched by WhatsApp id, so the ones both numbers share come already marked. The on/off state of the
 * destination is kept: the owner still turns it on.
 */
export async function copyTrafficRoutine(client: SupabaseClient, input: { organizationId: string; fromAgentId: string; toAgentId: string; userId: string }) {
  const source = await loadTrafficRoutine(client, input.organizationId, input.fromAgentId);
  if (!source) throw new Error("O outro número ainda não tem rotina para copiar.");
  const context = await resolveClientWhatsappOperationalContext(client, input.organizationId, input.toAgentId);
  const mapTargets = async (ids: string[]) => {
    const { data: sourceTargets } = ids.length ? await client.from("whatsapp_channel_targets").select("provider_jid").in("id", ids) : { data: [] };
    const jids = ((sourceTargets ?? []) as Array<{ provider_jid: string }>).map(row => row.provider_jid);
    const { data: matches } = jids.length
      ? await client.from("whatsapp_channel_targets").select("id").eq("whatsapp_instance_id", context.instance.id).in("provider_jid", jids) : { data: [] };
    return ((matches ?? []) as Array<{ id: string }>).map(row => row.id);
  };
  return saveTrafficRoutine(client, { organizationId: input.organizationId, agentId: input.toAgentId, userId: input.userId, changes: {
    post_status: source.post_status, target_ids: await mapTargets(source.target_ids), product_mode: source.product_mode,
    catalog_item_ids: source.catalog_item_ids, idea: source.idea, intensity: source.intensity, start_hour: source.start_hour, post_format: source.post_format,
    lead_status_view: source.lead_status_view, lead_status_react: source.lead_status_react, lead_status_comment: source.lead_status_comment,
    room_target_ids: await mapTargets(source.room_target_ids ?? []), room_open_hour: source.room_open_hour, room_close_hour: source.room_close_hour,
    room_days: source.room_days, room_replies: source.room_replies,
  } });
}

export async function listTrafficRoutineNumbers(client: SupabaseClient, organizationId: string) {
  const { data } = await client.from("whatsapp_traffic_routines").select("agent_id, enabled, room_enabled").eq("organization_id", organizationId);
  return ((data ?? []) as Array<{ agent_id: string; enabled: boolean; room_enabled: boolean | null }>)
    .map(row => ({ agentId: row.agent_id, enabled: row.enabled || row.room_enabled === true }));
}

async function archiveUpcoming(client: SupabaseClient, routine: TrafficRoutine, tag: string) {
  await client.from("content_pipeline_items").update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("organization_id", routine.organization_id).eq("status", "scheduled").contains("tags", [tag]);
}

/** Room off (or changed): cancel its scheduled openings and stop answering in those groups. */
async function closeRoom(client: SupabaseClient, routine: TrafficRoutine, previousTargets: string[]) {
  await archiveUpcoming(client, routine, roomTag(routine.id));
  const ids = Array.from(new Set([...previousTargets, ...(routine.room_enabled ? [] : routine.room_target_ids)]));
  if (ids.length) await client.from("whatsapp_channel_targets").update({ reply_mode: "off", updated_at: new Date().toISOString() }).in("id", ids).eq("organization_id", routine.organization_id);
}

/** The next posts and room openings, for the preview with "pular". */
export async function listUpcomingRoutinePosts(client: SupabaseClient, routine: TrafficRoutine, limit = 12) {
  const { data } = await client.from("content_pipeline_items").select("id, content_type, title, body, scheduled_for, metadata, tags")
    .eq("organization_id", routine.organization_id).eq("status", "scheduled").overlaps("tags", [routineTag(routine.id), roomTag(routine.id)])
    .order("scheduled_for", { ascending: true }).limit(limit);
  return ((data ?? []) as Array<{ id: string; content_type: string; title: string; body: string | null; scheduled_for: string | null; tags: string[] | null }>)
    .map(row => ({ id: row.id, kind: row.content_type === "whatsapp_status" ? "status" as const : row.content_type === "whatsapp_group_window" ? "sala de dúvidas" as const : "grupos e canais" as const,
      title: row.title, text: (row.body ?? "").slice(0, 400), scheduledFor: row.scheduled_for }));
}

export async function skipRoutinePost(client: SupabaseClient, routine: TrafficRoutine, itemId: string) {
  const { data } = await client.from("content_pipeline_items").update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", itemId).eq("organization_id", routine.organization_id).eq("status", "scheduled").overlaps("tags", [routineTag(routine.id), roomTag(routine.id)]).select("id");
  if (!data?.length) throw new Error("Esse item já foi enviado ou não é desta rotina.");
}

async function prepareRoutineCapabilities(client: SupabaseClient, routine: TrafficRoutine, userId: string | null) {
  const context = await resolveClientWhatsappOperationalContext(client, routine.organization_id, routine.agent_id);
  if (context.instance.status !== "connected") return;
  const postTargets = routine.enabled ? routine.target_ids : [];
  const { data: targets } = postTargets.length
    ? await client.from("whatsapp_channel_targets").select("id, target_type, campaign_enabled").in("id", postTargets).eq("whatsapp_instance_id", context.instance.id)
    : { data: [] };
  const rows = (targets ?? []) as Array<{ id: string; target_type: string; campaign_enabled: boolean }>;
  const needs = [
    routine.enabled && routine.post_status && !context.behavior.statusBroadcasts ? "status" : null,
    rows.some(row => row.target_type === "group") && !context.behavior.campaignBroadcasts ? "campaigns" : null,
    rows.some(row => row.target_type === "newsletter") && !context.behavior.newsletterBroadcasts ? "newsletters" : null,
    rows.length && !context.behavior.interactiveMessages ? "interactive" : null,
    routine.room_enabled && routine.room_target_ids.length && !context.behavior.allowGroupChats ? "groups" : null,
  ].filter((value): value is string => Boolean(value));
  for (const capability of needs) await enableWhatsappAutomationCapability(client, context, { capability, enabled: true, updatedBy: userId });
  for (const row of rows.filter(target => !target.campaign_enabled)) {
    await updateWhatsappChannelTargetSettings(client, context, { targetId: row.id, campaignEnabled: true });
  }
}

async function tagItems(client: SupabaseClient, ids: string[], tags: string[]) {
  const { data: rows } = ids.length ? await client.from("content_pipeline_items").select("id, tags").in("id", ids) : { data: [] };
  for (const row of (rows ?? []) as Array<{ id: string; tags: string[] | null }>) {
    await client.from("content_pipeline_items").update({ tags: [...(row.tags ?? []), ...tags] }).eq("id", row.id);
  }
}

const postsDue = (routine: TrafficRoutine, now: Date) => routine.enabled && (!routine.planned_until || new Date(routine.planned_until).getTime() < now.getTime() + planningHorizonMs);
const roomDue = (routine: TrafficRoutine, now: Date) => routine.room_enabled && routine.room_target_ids.length > 0
  && (!routine.room_planned_until || new Date(routine.room_planned_until).getTime() < now.getTime() + planningHorizonMs);

/** Plans what is due for one routine: the next day of posts and the next opening of the question room. */
export async function runTrafficRoutine(client: SupabaseClient, routine: TrafficRoutine, now = new Date()) {
  const { data: claimed } = await client.from("whatsapp_traffic_routines").update({ last_run_at: now.toISOString() })
    .eq("id", routine.id).or(`last_run_at.is.null,last_run_at.lt.${new Date(now.getTime() - 10 * 60_000).toISOString()}`).select("id");
  if (!claimed?.length) return { skipped: "busy" as const };
  try {
    await assertBillableAccess({ organizationId: routine.organization_id, client });
    await prepareRoutineCapabilities(client, routine, null);
    const context = await resolveClientWhatsappOperationalContext(client, routine.organization_id, routine.agent_id);
    if (context.instance.status !== "connected") throw new Error("WhatsApp desconectado: reconecte para a rotina voltar a funcionar.");
    const result: { scheduled?: number; plannedUntil?: string; roomOpensAt?: string; roomWarning?: string } = {};
    if (postsDue(routine, now)) Object.assign(result, await planPosts(client, context, routine, now));
    if (roomDue(routine, now)) Object.assign(result, await planRoom(client, context, routine, now));
    await client.from("whatsapp_traffic_routines").update({ last_error: result.roomWarning ?? null }).eq("id", routine.id);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Falha ao planejar a rotina.";
    await client.from("whatsapp_traffic_routines").update({ last_error: message }).eq("id", routine.id);
    return { error: message };
  }
}

type Context = Awaited<ReturnType<typeof resolveClientWhatsappOperationalContext>>;

async function planPosts(client: SupabaseClient, context: Context, routine: TrafficRoutine, now: Date) {
  const dayStart = nextRoutineDayStart(now, routine.start_hour, routine.planned_until);
  const productPool = routine.product_mode === "selected" && routine.catalog_item_ids.length ? routine.catalog_item_ids : await loadFeaturedProductIds(client, routine.organization_id);
  const format = routine.post_format ?? "auto";
  const catalogItemIds = pickRoutineProducts(productPool, dayStart, format === "auto" ? 4 : trafficPostsPerDay[routine.intensity] ?? 2);
  const postsPerDay = trafficPostsPerDay[routine.intensity] ?? 2;
  const brief = [routine.idea, formatBriefs[format], "Rotina diária de tráfego: cada post puxa conversa no privado ou compra. Varie o ângulo em relação aos dias anteriores."].filter(Boolean).join("\n");
  const destinations = [
    ...(routine.post_status ? [{ targetIds: [] as string[], formats: ["status"] }] : []),
    ...(routine.target_ids.length ? [{ targetIds: routine.target_ids, formats: targetFormats[format] }] : []),
  ];
  if (!destinations.length) throw new Error("Escolha pelo menos um lugar para divulgar.");
  let scheduled = 0;
  for (const destination of destinations) {
    const available = destination.formats.filter(item => context.behavior.interactiveMessages || (item !== "carousel" && item !== "poll"));
    const plan = await generateWhatsappGrowthCampaignPlan(client, context, {
      targetIds: destination.targetIds, catalogItemIds, brief, durationDays: 1, postsPerDay, startFrom: dayStart.toISOString(), preferredFormats: available,
    });
    await meterGeminiGenerationUsage({
      client, organizationId: routine.organization_id, featureCode: "whatsapp_traffic_routine_ai", modelId: plan.modelId, agentScope: "customer",
      promptText: [plan.systemInstruction, plan.prompt], outputText: plan.items.map(item => item.text).join("\n\n"), responseData: plan.responseData,
      debitDescription: "Rotina de tráfego no WhatsApp", metadata: { source: "whatsapp_traffic_routine", routineId: routine.id, agentId: routine.agent_id, itemCount: plan.items.length },
    });
    // With one product per post, each post carries its own product (photo and button to its page).
    const planItems = format === "auto" ? plan.items : plan.items.map((item, index) => ({ ...item,
      productIds: item.productIds?.length ? item.productIds.slice(0, 1) : catalogItemIds.length ? [catalogItemIds[index % catalogItemIds.length]] : [] }));
    const queued = await queueWhatsappGrowthCampaignPlan(client, context, {
      planItems, targetIds: destination.targetIds, catalogItemIds, buttonEnabled: true, buttonLabel: format === "auto" ? null : "Ver produto",
    });
    scheduled += queued.count;
    await tagItems(client, queued.items.map(item => item.id), ["traffic_routine", routineTag(routine.id)]);
  }
  const plannedUntil = new Date(dayStart.getTime() + postingWindowHours * hourMs).toISOString();
  await client.from("whatsapp_traffic_routines").update({ planned_until: plannedUntil }).eq("id", routine.id);
  return { scheduled, plannedUntil };
}

/**
 * "Sala de dúvidas": opens each chosen group at the owner's hour, warns 10 minutes before closing and
 * closes it saying when it opens again. With answers on, the agent replies (quoting who asked) only while
 * the group is open: the opening turns replies on and the closing turns them off.
 */
async function planRoom(client: SupabaseClient, context: Context, routine: TrafficRoutine, now: Date) {
  const window = nextRoomWindow(now, routine);
  if (!window) return { roomWarning: "Escolha pelo menos um dia para a sala de dúvidas." };
  const { data } = await client.from("whatsapp_channel_targets").select("id, display_name, is_admin").in("id", routine.room_target_ids).eq("whatsapp_instance_id", context.instance.id);
  const groups = (data ?? []) as Array<{ id: string; display_name: string | null; is_admin: boolean | null }>;
  const notAdmin = groups.filter(group => group.is_admin === false);
  const nextDay = nextRoomWindow(new Date(window.close.getTime() + hourMs), { ...routine, room_planned_until: window.close.toISOString() });
  const closeHour = `${routine.room_close_hour}h`;
  const reopen = nextDay ? `${nextDay.open.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" })} às ${routine.room_open_hour}h` : "no próximo horário";
  for (const group of groups.filter(item => item.is_admin !== false)) {
    const queued = await queueWhatsappGroupWindow(client, context, {
      targetId: group.id, openScheduledFor: window.open.toISOString(), closeScheduledFor: window.close.toISOString(), preCloseMinutes: 10, roomReplies: routine.room_replies,
      openingText: routine.room_replies
        ? `Grupo aberto para dúvidas até as ${closeHour}! Pode mandar sua pergunta que eu respondo cada um por aqui 🙂`
        : `Grupo aberto para conversa até as ${closeHour}! Fiquem à vontade.`,
      preCloseText: `Faltam 10 minutinhos para eu fechar o grupo. Quem ainda tiver dúvida, manda agora!`,
      closingText: `Fechando o grupo por hoje, pessoal. Abro de novo ${reopen}. Quem quiser continuar, me chama no privado.`,
    });
    await tagItems(client, queued.items.map(item => item.id), ["group_room", roomTag(routine.id)]);
  }
  await client.from("whatsapp_traffic_routines").update({ room_planned_until: window.close.toISOString() }).eq("id", routine.id);
  return {
    roomOpensAt: window.open.toISOString(),
    ...(notAdmin.length ? { roomWarning: `Este número não é admin de ${notAdmin.map(group => group.display_name ?? "um grupo").join(", ")}: sem admin não dá para abrir e fechar o grupo.` } : {}),
  };
}

/** Hourly: every active routine keeps the next day of posts and the next room opening planned. */
export async function runDueTrafficRoutines(client: SupabaseClient, now = new Date()) {
  const horizon = new Date(now.getTime() + planningHorizonMs).toISOString();
  const { data, error } = await client.from("whatsapp_traffic_routines").select("*")
    .or(`and(enabled.eq.true,or(planned_until.is.null,planned_until.lt.${horizon})),and(room_enabled.eq.true,or(room_planned_until.is.null,room_planned_until.lt.${horizon}))`).limit(50);
  if (error) throw new Error("Não foi possível listar as rotinas de tráfego.");
  const results = [];
  for (const routine of (data ?? []) as TrafficRoutine[]) {
    if (!postsDue(routine, now) && !roomDue(routine, now)) continue;
    results.push({ id: routine.id, ...(await runTrafficRoutine(client, routine, now)) });
  }
  return results;
}
