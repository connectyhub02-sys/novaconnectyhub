import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { meterGeminiGenerationUsage } from "@/lib/billing/gemini-metering";
import { assertBillableAccess } from "@/lib/billing/trial";
import {
  enableWhatsappAutomationCapability,
  findOtherGroupResponder,
  generateWhatsappGrowthCampaignPlan,
  groupResponderConflictMessage,
  queueWhatsappGroupWindow,
  queueWhatsappGrowthCampaignPlan,
  queueWhatsappStatusBroadcast,
  queueWhatsappTargetTextCampaign,
  resolveClientWhatsappOperationalContext,
  updateWhatsappChannelTargetSettings,
} from "@/lib/whatsapp/channel-operations";

export type TrafficIntensity = "light" | "normal" | "intense";
export type TrafficPostFormat = "auto" | "product_audio" | "product_button" | "text" | "poll";
export type TrafficScheduleMode = "once" | "week" | "month" | "continuous";

/** Per-number settings: the question room and the interaction with the leads' status. */
export type TrafficRoutine = {
  id: string; organization_id: string; agent_id: string;
  lead_status_view: boolean; lead_status_react: boolean; lead_status_comment: boolean;
  room_enabled: boolean; room_target_ids: string[]; room_open_hour: number; room_close_hour: number; room_days: number[]; room_replies: boolean;
  room_planned_until: string | null; last_run_at: string | null; last_error: string | null;
};
export type TrafficRoutineInput = Partial<Pick<TrafficRoutine, "lead_status_view" | "lead_status_react" | "lead_status_comment"
  | "room_enabled" | "room_target_ids" | "room_open_hour" | "room_close_hour" | "room_days" | "room_replies">>;

export type TrafficCampaign = {
  id: string; organization_id: string; agent_id: string; name: string; status: "active" | "paused" | "ended";
  post_status: boolean; target_ids: string[]; product_mode: "featured" | "selected" | "single"; catalog_item_ids: string[];
  idea: string | null; manual_text: string | null; post_format: TrafficPostFormat; intensity: TrafficIntensity; start_hour: number;
  schedule_mode: TrafficScheduleMode; starts_at: string; ends_at: string | null; planned_until: string | null;
  last_run_at: string | null; last_error: string | null; created_at: string;
};
export type TrafficCampaignInput = Partial<Pick<TrafficCampaign, "name" | "post_status" | "target_ids" | "product_mode" | "catalog_item_ids"
  | "idea" | "manual_text" | "post_format" | "intensity" | "start_hour" | "schedule_mode">>;

const brtOffsetMs = 3 * 3600_000;
const dayMs = 24 * 3600_000;
const hourMs = 3600_000;
const postingWindowHours = 10;
const planningHorizonMs = 12 * hourMs;
export const trafficPostsPerDay: Record<TrafficIntensity, number> = { light: 1, normal: 2, intense: 3 };
const scheduleDays: Record<TrafficScheduleMode, number | null> = { once: null, week: 7, month: 30, continuous: null };
const targetFormats: Record<TrafficPostFormat, string[]> = {
  auto: ["text", "carousel", "poll", "text_audio"],
  product_audio: ["text_audio"],
  product_button: ["text"],
  text: ["text"],
  poll: ["poll"],
};
const formatBriefs: Record<TrafficPostFormat, string> = {
  auto: "",
  product_audio: "Cada post apresenta UM produto. O text é só uma legenda curta (1 ou 2 frases) com o nome, o valor e o convite para tocar no botão. O audioText é a fala completa do agente, de até 1 minuto: para que serve, para quem é e por que vale a pena, em linguagem natural, sem repetir a legenda.",
  product_button: "Cada post apresenta UM produto com uma legenda curta (1 ou 2 frases): nome, valor e o convite para tocar no botão e ver o produto.",
  text: "Posts só de texto, curtos e conversados, que puxam resposta no privado.",
  poll: "Cada post é uma enquete que gera conversa sobre os produtos.",
};
const buttonFormats = new Set<TrafficPostFormat>(["auto", "product_audio", "product_button"]);

const localMidnight = (time: number) => Math.floor((time - brtOffsetMs) / dayMs) * dayMs + brtOffsetMs;

/** Start of the next day to plan, at the owner's hour in Brasília time (no daylight saving since 2019). */
export function nextRoutineDayStart(now: Date, startHour: number, plannedUntil: string | null) {
  const after = plannedUntil ? Math.max(now.getTime(), new Date(plannedUntil).getTime()) : now.getTime();
  let start = localMidnight(after) + startHour * hourMs;
  if (plannedUntil && start < new Date(plannedUntil).getTime()) start += dayMs;
  // First day: when the owner turns the campaign on late, today still counts while most of the window is ahead.
  if (!plannedUntil && start < now.getTime()) {
    start = now.getTime() + 20 * 60_000 <= start + (postingWindowHours - 4) * hourMs ? now.getTime() + 20 * 60_000 : start + dayMs;
  }
  return new Date(start);
}

/** Next opening of the question room: a chosen weekday, after what is planned and at least 10 minutes ahead. */
export function nextRoomWindow(now: Date, routine: Pick<TrafficRoutine, "room_open_hour" | "room_close_hour" | "room_days" | "room_planned_until">) {
  const days = routine.room_days.length ? routine.room_days : [0, 1, 2, 3, 4, 5, 6];
  const planned = routine.room_planned_until ? new Date(routine.room_planned_until).getTime() : 0;
  const soon = now.getTime() + 2 * 60_000;
  for (let offset = 0; offset < 8; offset += 1) {
    const midnight = localMidnight(now.getTime()) + offset * dayMs;
    const open = midnight + routine.room_open_hour * hourMs;
    const close = midnight + routine.room_close_hour * hourMs;
    const weekday = new Date(midnight - brtOffsetMs).getUTCDay();
    if (!days.includes(weekday) || open < planned) continue;
    if (open >= soon) return { open: new Date(open), close: new Date(close) };
    // Turned on during today's room hours: open right away while at least 20 minutes are left.
    if (close - soon >= 20 * 60_000) return { open: new Date(soon), close: new Date(close) };
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

export const campaignTag = (campaignId: string) => `traffic_campaign:${campaignId}`;
export const roomTag = (routineId: string) => `group_room:${routineId}`;

// ─── Number settings (room and status interaction) ───────────────────────────

export async function loadTrafficRoutine(client: SupabaseClient, organizationId: string, agentId: string) {
  const { data, error } = await client.from("whatsapp_traffic_routines").select("*").eq("organization_id", organizationId).eq("agent_id", agentId).maybeSingle();
  if (error) throw new Error("Não foi possível carregar o tráfego deste número.");
  return (data as TrafficRoutine | null) ?? null;
}

/** Saves the room and the status interaction. Turning the room on or changing it replans; off stops it. */
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
  const roomWillRun = changes.room_enabled ?? before?.room_enabled ?? false;
  const roomTargets = changes.room_target_ids ?? before?.room_target_ids ?? [];
  if (roomWillRun && roomTargets.length) await assertGroupsFreeForRoom(client, input.organizationId, input.agentId, roomTargets, {
    open: changes.room_open_hour ?? before?.room_open_hour ?? 19, close: changes.room_close_hour ?? before?.room_close_hour ?? 20, days: changes.room_days ?? before?.room_days ?? [],
  });
  const row = {
    organization_id: input.organizationId, agent_id: input.agentId, updated_by: input.userId, updated_at: new Date().toISOString(),
    ...changes,
    ...(changes.room_enabled === false || roomChanged ? { room_planned_until: null } : {}),
  };
  const { data, error } = await client.from("whatsapp_traffic_routines").upsert(row, { onConflict: "organization_id,agent_id" }).select("*").single();
  if (error) throw new Error("Não foi possível salvar.");
  const routine = data as TrafficRoutine;
  if (routine.room_enabled && routine.room_target_ids.length) await enableCapabilities(client, routine.organization_id, routine.agent_id, { groups: true }, input.userId);
  if (!routine.room_enabled || roomChanged) await closeRoom(client, routine, before?.room_target_ids ?? []);
  return routine;
}

/** The question room answers in the group, so no other agent of the company may already answer there. */
async function assertGroupsFreeForRoom(client: SupabaseClient, organizationId: string, agentId: string, targetIds: string[], schedule: { open: number; close: number; days: number[] }) {
  const context = await resolveClientWhatsappOperationalContext(client, organizationId, agentId);
  const { data } = await client.from("whatsapp_channel_targets").select("provider_jid").in("id", targetIds).eq("whatsapp_instance_id", context.instance.id);
  const conflict = await findOtherGroupResponder(client, { organizationId, instanceId: context.instance.id, groupJids: ((data ?? []) as Array<{ provider_jid: string }>).map(row => row.provider_jid), schedule });
  if (conflict) throw new Error(groupResponderConflictMessage(conflict));
}

async function archiveUpcoming(client: SupabaseClient, organizationId: string, tag: string) {
  await client.from("content_pipeline_items").update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId).eq("status", "scheduled").contains("tags", [tag]);
}

/** Room off (or changed): cancel its scheduled openings and stop answering in those groups. */
async function closeRoom(client: SupabaseClient, routine: TrafficRoutine, previousTargets: string[]) {
  await archiveUpcoming(client, routine.organization_id, roomTag(routine.id));
  const ids = Array.from(new Set([...previousTargets, ...(routine.room_enabled ? [] : routine.room_target_ids)]));
  if (ids.length) await client.from("whatsapp_channel_targets").update({ reply_mode: "off", updated_at: new Date().toISOString() }).in("id", ids).eq("organization_id", routine.organization_id);
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

export async function listTrafficCampaigns(client: SupabaseClient, organizationId: string, agentId: string) {
  const { data, error } = await client.from("whatsapp_traffic_campaigns").select("*").eq("organization_id", organizationId).eq("agent_id", agentId)
    .order("created_at", { ascending: false }).limit(40);
  if (error) throw new Error("Não foi possível carregar as campanhas.");
  return (data ?? []) as TrafficCampaign[];
}

/** Creates or edits a campaign. A new period starts now; turning it into "once" plans a single post. */
export async function saveTrafficCampaign(client: SupabaseClient, input: { organizationId: string; agentId: string; userId: string; campaignId?: string | null; changes: TrafficCampaignInput }) {
  const changes = input.changes;
  const current = input.campaignId
    ? ((await client.from("whatsapp_traffic_campaigns").select("*").eq("id", input.campaignId).eq("organization_id", input.organizationId).eq("agent_id", input.agentId).maybeSingle()).data as TrafficCampaign | null)
    : null;
  if (input.campaignId && !current) throw new Error("Campanha não encontrada.");
  const merged = { ...(current ?? {}), ...changes } as Partial<TrafficCampaign>;
  if (!merged.post_status && !(merged.target_ids ?? []).length) throw new Error("Escolha onde divulgar: status, grupos ou canais.");
  if (merged.product_mode === "single" && !(merged.catalog_item_ids ?? []).length) throw new Error("Escolha o produto da campanha.");
  const now = new Date();
  const periodChanged = !current || (changes.schedule_mode !== undefined && changes.schedule_mode !== current.schedule_mode);
  const mode = merged.schedule_mode ?? "continuous";
  const days = scheduleDays[mode];
  const row = {
    organization_id: input.organizationId, agent_id: input.agentId, updated_by: input.userId, updated_at: now.toISOString(),
    ...(current ? {} : { post_status: false, target_ids: [], product_mode: "featured", catalog_item_ids: [], post_format: "auto", intensity: "normal", start_hour: 9, schedule_mode: "continuous" }),
    ...changes,
    name: (merged.name ?? "").trim().slice(0, 80) || "Campanha de tráfego",
    ...(changes.idea !== undefined ? { idea: changes.idea?.trim().slice(0, 600) || null } : {}),
    ...(changes.manual_text !== undefined ? { manual_text: changes.manual_text?.trim().slice(0, 1500) || null } : {}),
    ...(periodChanged ? { status: "active", starts_at: now.toISOString(), planned_until: null, last_error: null,
      ends_at: days ? new Date(localMidnight(now.getTime()) + (days + 1) * dayMs).toISOString() : null } : {}),
  };
  const query = current
    ? client.from("whatsapp_traffic_campaigns").update(row).eq("id", current.id).select("*").single()
    : client.from("whatsapp_traffic_campaigns").insert(row).select("*").single();
  const { data, error } = await query;
  if (error) throw new Error("Não foi possível salvar a campanha.");
  const campaign = data as TrafficCampaign;
  if (campaign.status === "active") await prepareCampaignCapabilities(client, campaign, input.userId);
  return campaign;
}

/** Pause, resume, end or delete. Pausing, ending and deleting cancel what it had already scheduled. */
export async function setTrafficCampaignStatus(client: SupabaseClient, input: { organizationId: string; agentId: string; campaignId: string; action: "pause" | "resume" | "end" | "delete"; userId: string }) {
  const { data } = await client.from("whatsapp_traffic_campaigns").select("*").eq("id", input.campaignId).eq("organization_id", input.organizationId).eq("agent_id", input.agentId).maybeSingle();
  const campaign = data as TrafficCampaign | null;
  if (!campaign) throw new Error("Campanha não encontrada.");
  if (input.action === "resume" && campaign.ends_at && new Date(campaign.ends_at).getTime() < Date.now()) throw new Error("O período desta campanha já terminou: edite o período para reativar.");
  if (input.action !== "resume") await archiveUpcoming(client, campaign.organization_id, campaignTag(campaign.id));
  if (input.action === "delete") {
    await client.from("whatsapp_traffic_campaigns").delete().eq("id", campaign.id);
    return null;
  }
  const status = input.action === "resume" ? "active" : input.action === "pause" ? "paused" : "ended";
  const { data: updated } = await client.from("whatsapp_traffic_campaigns").update({ status, planned_until: null, updated_by: input.userId, updated_at: new Date().toISOString() })
    .eq("id", campaign.id).select("*").single();
  if (status === "active") await prepareCampaignCapabilities(client, updated as TrafficCampaign, input.userId);
  return updated as TrafficCampaign;
}

async function enableCapabilities(client: SupabaseClient, organizationId: string, agentId: string, needs: { status?: boolean; groups?: boolean; campaigns?: boolean; newsletters?: boolean; interactive?: boolean }, userId: string | null) {
  const context = await resolveClientWhatsappOperationalContext(client, organizationId, agentId);
  if (context.instance.status !== "connected") return context;
  const list = [
    needs.status && !context.behavior.statusBroadcasts ? "status" : null,
    needs.campaigns && !context.behavior.campaignBroadcasts ? "campaigns" : null,
    needs.newsletters && !context.behavior.newsletterBroadcasts ? "newsletters" : null,
    needs.interactive && !context.behavior.interactiveMessages ? "interactive" : null,
    needs.groups && !context.behavior.allowGroupChats ? "groups" : null,
  ].filter((value): value is string => Boolean(value));
  for (const capability of list) await enableWhatsappAutomationCapability(client, context, { capability, enabled: true, updatedBy: userId });
  return context;
}

/** Turning a campaign on also turns on what it needs and frees the chosen groups and channels for posts. */
async function prepareCampaignCapabilities(client: SupabaseClient, campaign: TrafficCampaign, userId: string | null) {
  const { data: targets } = campaign.target_ids.length
    ? await client.from("whatsapp_channel_targets").select("id, target_type, campaign_enabled").in("id", campaign.target_ids).eq("organization_id", campaign.organization_id)
    : { data: [] };
  const rows = (targets ?? []) as Array<{ id: string; target_type: string; campaign_enabled: boolean }>;
  const context = await enableCapabilities(client, campaign.organization_id, campaign.agent_id, {
    status: campaign.post_status, campaigns: rows.some(row => row.target_type === "group"), newsletters: rows.some(row => row.target_type === "newsletter"),
    interactive: rows.length > 0 && (buttonFormats.has(campaign.post_format) || campaign.post_format === "poll"),
  }, userId);
  if (context.instance.status !== "connected") return;
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

type Context = Awaited<ReturnType<typeof resolveClientWhatsappOperationalContext>>;

const campaignDue = (campaign: TrafficCampaign, now: Date) => campaign.status === "active"
  && (!campaign.planned_until || new Date(campaign.planned_until).getTime() < now.getTime() + planningHorizonMs);
const roomDue = (routine: TrafficRoutine, now: Date) => routine.room_enabled && routine.room_target_ids.length > 0
  && (!routine.room_planned_until || new Date(routine.room_planned_until).getTime() < now.getTime() + planningHorizonMs);

async function claim(client: SupabaseClient, table: string, id: string, now: Date) {
  const { data } = await client.from(table).update({ last_run_at: now.toISOString() })
    .eq("id", id).or(`last_run_at.is.null,last_run_at.lt.${new Date(now.getTime() - 10 * 60_000).toISOString()}`).select("id");
  return Boolean(data?.length);
}

async function productsFor(client: SupabaseClient, campaign: TrafficCampaign) {
  if (campaign.product_mode === "single") return campaign.catalog_item_ids.slice(0, 1);
  if (campaign.product_mode === "selected" && campaign.catalog_item_ids.length) return campaign.catalog_item_ids;
  return loadFeaturedProductIds(client, campaign.organization_id);
}

/** Plans what is due for one campaign: a single post ("uma vez agora") or the next day of posts. */
export async function runTrafficCampaign(client: SupabaseClient, campaign: TrafficCampaign, now = new Date()) {
  if (!await claim(client, "whatsapp_traffic_campaigns", campaign.id, now)) return { skipped: "busy" as const };
  try {
    await assertBillableAccess({ organizationId: campaign.organization_id, client });
    await prepareCampaignCapabilities(client, campaign, null);
    const context = await resolveClientWhatsappOperationalContext(client, campaign.organization_id, campaign.agent_id);
    if (context.instance.status !== "connected") throw new Error("WhatsApp desconectado: reconecte para a campanha voltar a postar.");
    if (campaign.schedule_mode === "once") {
      const scheduled = await planOnce(client, context, campaign, now);
      await client.from("whatsapp_traffic_campaigns").update({ status: "ended", planned_until: now.toISOString(), last_error: null }).eq("id", campaign.id);
      return { scheduled };
    }
    const dayStart = nextRoutineDayStart(now, campaign.start_hour, campaign.planned_until);
    if (campaign.ends_at && dayStart.getTime() >= new Date(campaign.ends_at).getTime()) {
      await client.from("whatsapp_traffic_campaigns").update({ status: "ended", last_error: null }).eq("id", campaign.id);
      return { ended: true };
    }
    const scheduled = await planDay(client, context, campaign, dayStart);
    const plannedUntil = new Date(dayStart.getTime() + postingWindowHours * hourMs).toISOString();
    await client.from("whatsapp_traffic_campaigns").update({ planned_until: plannedUntil, last_error: null }).eq("id", campaign.id);
    return { scheduled, plannedUntil };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Falha ao planejar a campanha.";
    await client.from("whatsapp_traffic_campaigns").update({ last_error: message }).eq("id", campaign.id);
    return { error: message };
  }
}

function destinationsFor(campaign: TrafficCampaign, groupTargets: number) {
  const format: TrafficPostFormat = campaign.post_format === "poll" && groupTargets === 0 ? "text" : campaign.post_format;
  return {
    format,
    list: [
      ...(campaign.post_status ? [{ targetIds: [] as string[], formats: ["status"] }] : []),
      ...(campaign.target_ids.length ? [{ targetIds: campaign.target_ids, formats: targetFormats[format] }] : []),
    ],
  };
}

async function countGroupTargets(client: SupabaseClient, campaign: TrafficCampaign) {
  if (!campaign.target_ids.length) return 0;
  const { data } = await client.from("whatsapp_channel_targets").select("id, target_type").in("id", campaign.target_ids);
  return ((data ?? []) as Array<{ target_type: string }>).filter(row => row.target_type === "group").length;
}

async function planDay(client: SupabaseClient, context: Context, campaign: TrafficCampaign, dayStart: Date, postsOverride?: number) {
  const pool = await productsFor(client, campaign);
  const { format, list } = destinationsFor(campaign, await countGroupTargets(client, campaign));
  const postsPerDay = postsOverride ?? trafficPostsPerDay[campaign.intensity] ?? 2;
  const oneProductPerPost = format === "product_audio" || format === "product_button";
  const catalogItemIds = pickRoutineProducts(pool, dayStart, oneProductPerPost ? Math.max(postsPerDay, 1) : 4);
  const brief = [campaign.idea, formatBriefs[format],
    campaign.product_mode === "single" ? "A campanha inteira é sobre este único produto: varie o ângulo a cada post (benefício, uso, prova, oferta)." : "",
    "Campanha de tráfego: cada post puxa conversa no privado ou compra. Varie o ângulo em relação aos dias anteriores."].filter(Boolean).join("\n");
  let scheduled = 0;
  for (const destination of list) {
    const available = destination.formats.filter(item => context.behavior.interactiveMessages || (item !== "carousel" && item !== "poll"));
    const plan = await generateWhatsappGrowthCampaignPlan(client, context, {
      targetIds: destination.targetIds, catalogItemIds, brief, durationDays: 1, postsPerDay, startFrom: dayStart.toISOString(), preferredFormats: available.length ? available : ["text"],
    });
    await meterGeminiGenerationUsage({
      client, organizationId: campaign.organization_id, featureCode: "content_generation", modelId: plan.modelId, agentScope: "customer",
      promptText: [plan.systemInstruction, plan.prompt], outputText: plan.items.map(item => item.text).join("\n\n"), responseData: plan.responseData,
      debitDescription: "Campanha de tráfego no WhatsApp", metadata: { source: "whatsapp_traffic_campaign", campaignId: campaign.id, agentId: campaign.agent_id, itemCount: plan.items.length },
    });
    // With one product per post, each post carries its own product (photo and button to its page).
    const planItems = !oneProductPerPost ? plan.items : plan.items.map((item, index) => ({ ...item,
      productIds: item.productIds?.length ? item.productIds.slice(0, 1) : catalogItemIds.length ? [catalogItemIds[index % catalogItemIds.length]] : [] }));
    const queued = await queueWhatsappGrowthCampaignPlan(client, context, {
      planItems, targetIds: destination.targetIds, catalogItemIds, buttonEnabled: buttonFormats.has(format), buttonLabel: oneProductPerPost ? "Ver produto" : null,
    });
    scheduled += queued.count;
    await tagItems(client, queued.items.map(item => item.id), ["traffic_campaign", campaignTag(campaign.id)]);
  }
  return scheduled;
}

/** "Uma vez agora": the owner's own text goes as written; without text the AI writes one post. */
async function planOnce(client: SupabaseClient, context: Context, campaign: TrafficCampaign, now: Date) {
  const when = new Date(now.getTime() + 60_000).toISOString();
  const text = campaign.manual_text?.trim();
  if (!text) return planDay(client, context, campaign, new Date(now.getTime() + 2 * 60_000), 1);
  const products = campaign.product_mode === "featured" ? [] : (await productsFor(client, campaign)).slice(0, 1);
  const ids: string[] = [];
  if (campaign.post_status) ids.push((await queueWhatsappStatusBroadcast(client, context, { text, scheduledFor: when, catalogItemIds: products })).id);
  if (campaign.target_ids.length) {
    ids.push((await queueWhatsappTargetTextCampaign(client, context, {
      title: campaign.name, text, targetIds: campaign.target_ids, scheduledFor: when, catalogItemIds: products,
      deliveryMode: campaign.post_format === "product_audio" ? "text_audio" : "text",
      interactiveMode: products.length && buttonFormats.has(campaign.post_format) ? "button" : "none", buttonLabel: products.length ? "Ver produto" : null,
    })).id);
  }
  await tagItems(client, ids, ["traffic_campaign", campaignTag(campaign.id)]);
  return ids.length;
}

/**
 * "Sala de dúvidas": opens each chosen group at the owner's hour, warns 10 minutes before closing and
 * closes it saying when it opens again. With answers on, the agent replies (quoting who asked) only while
 * the group is open: the opening turns replies on and the closing turns them off.
 */
export async function runTrafficRoom(client: SupabaseClient, routine: TrafficRoutine, now = new Date()) {
  if (!await claim(client, "whatsapp_traffic_routines", routine.id, now)) return { skipped: "busy" as const };
  try {
    await assertBillableAccess({ organizationId: routine.organization_id, client });
    const context = await enableCapabilities(client, routine.organization_id, routine.agent_id, { groups: true }, null);
    if (context.instance.status !== "connected") throw new Error("WhatsApp desconectado: reconecte para a sala voltar a funcionar.");
    const window = nextRoomWindow(now, routine);
    if (!window) throw new Error("Escolha pelo menos um dia para a sala de dúvidas.");
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
    const warning = notAdmin.length ? `Este número não é admin de ${notAdmin.map(group => group.display_name ?? "um grupo").join(", ")}: sem admin não dá para abrir e fechar o grupo.` : null;
    await client.from("whatsapp_traffic_routines").update({ room_planned_until: window.close.toISOString(), last_error: warning }).eq("id", routine.id);
    return { roomOpensAt: window.open.toISOString(), ...(warning ? { roomWarning: warning } : {}) };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Falha ao planejar a sala.";
    await client.from("whatsapp_traffic_routines").update({ last_error: message }).eq("id", routine.id);
    return { error: message };
  }
}

/** Hourly: every active campaign keeps its next day planned and every room its next opening. */
export async function runDueTrafficRoutines(client: SupabaseClient, now = new Date()) {
  const horizon = new Date(now.getTime() + planningHorizonMs).toISOString();
  const [campaigns, rooms] = await Promise.all([
    client.from("whatsapp_traffic_campaigns").select("*").eq("status", "active").or(`planned_until.is.null,planned_until.lt.${horizon}`).limit(50),
    client.from("whatsapp_traffic_routines").select("*").eq("room_enabled", true).or(`room_planned_until.is.null,room_planned_until.lt.${horizon}`).limit(50),
  ]);
  if (campaigns.error || rooms.error) throw new Error("Não foi possível listar o tráfego a planejar.");
  const results = [];
  for (const campaign of (campaigns.data ?? []) as TrafficCampaign[]) {
    if (campaignDue(campaign, now)) results.push({ campaignId: campaign.id, ...(await runTrafficCampaign(client, campaign, now)) });
  }
  for (const routine of (rooms.data ?? []) as TrafficRoutine[]) {
    if (roomDue(routine, now)) results.push({ roomId: routine.id, ...(await runTrafficRoom(client, routine, now)) });
  }
  return results;
}

// ─── Panel data ───────────────────────────────────────────────────────────────

/** The next posts and room openings of the number, for the preview with "pular". */
export async function listUpcomingTraffic(client: SupabaseClient, organizationId: string, campaigns: TrafficCampaign[], routine: TrafficRoutine | null, limit = 12) {
  const tags = [...campaigns.map(campaign => campaignTag(campaign.id)), ...(routine ? [roomTag(routine.id)] : [])];
  if (!tags.length) return [];
  const { data } = await client.from("content_pipeline_items").select("id, content_type, title, body, scheduled_for, tags")
    .eq("organization_id", organizationId).eq("status", "scheduled").overlaps("tags", tags).order("scheduled_for", { ascending: true }).limit(limit);
  const names = new Map(campaigns.map(campaign => [campaignTag(campaign.id), campaign.name]));
  return ((data ?? []) as Array<{ id: string; content_type: string; title: string; body: string | null; scheduled_for: string | null; tags: string[] | null }>)
    .map(row => ({
      id: row.id, title: row.title, text: (row.body ?? "").slice(0, 400), scheduledFor: row.scheduled_for,
      kind: row.content_type === "whatsapp_status" ? "status" as const : row.content_type === "whatsapp_group_window" ? "sala de dúvidas" as const : "grupos e canais" as const,
      campaign: (row.tags ?? []).map(tag => names.get(tag)).find(Boolean) ?? null,
    }));
}

/** Sent and scheduled counts per campaign. */
export async function campaignCounts(client: SupabaseClient, organizationId: string, campaigns: TrafficCampaign[]) {
  const counts = new Map(campaigns.map(campaign => [campaign.id, { sent: 0, scheduled: 0 }]));
  if (!campaigns.length) return counts;
  const { data } = await client.from("content_pipeline_items").select("status, tags").eq("organization_id", organizationId)
    .overlaps("tags", campaigns.map(campaign => campaignTag(campaign.id))).in("status", ["published", "scheduled"]).limit(2000);
  for (const row of (data ?? []) as Array<{ status: string; tags: string[] | null }>) {
    const campaign = campaigns.find(item => (row.tags ?? []).includes(campaignTag(item.id)));
    const count = campaign ? counts.get(campaign.id) : null;
    if (count) count[row.status === "published" ? "sent" : "scheduled"] += 1;
  }
  return counts;
}

export async function skipTrafficItem(client: SupabaseClient, organizationId: string, campaigns: TrafficCampaign[], routine: TrafficRoutine | null, itemId: string) {
  const tags = [...campaigns.map(campaign => campaignTag(campaign.id)), ...(routine ? [roomTag(routine.id)] : [])];
  const { data } = tags.length ? await client.from("content_pipeline_items").update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", itemId).eq("organization_id", organizationId).eq("status", "scheduled").overlaps("tags", tags).select("id") : { data: [] };
  if (!data?.length) throw new Error("Esse item já foi enviado ou não é deste número.");
}

export async function listTrafficRoutineNumbers(client: SupabaseClient, organizationId: string) {
  const [campaigns, routines] = await Promise.all([
    client.from("whatsapp_traffic_campaigns").select("agent_id").eq("organization_id", organizationId).eq("status", "active"),
    client.from("whatsapp_traffic_routines").select("agent_id, room_enabled").eq("organization_id", organizationId),
  ]);
  const active = new Set(((campaigns.data ?? []) as Array<{ agent_id: string }>).map(row => row.agent_id));
  for (const row of (routines.data ?? []) as Array<{ agent_id: string; room_enabled: boolean }>) if (row.room_enabled) active.add(row.agent_id);
  const agents = new Set([...active, ...((routines.data ?? []) as Array<{ agent_id: string }>).map(row => row.agent_id)]);
  return Array.from(agents).map(agentId => ({ agentId, enabled: active.has(agentId) }));
}

/**
 * "Usar a mesma configuração": copies the other number's campaigns (paused) and room. Groups and channels
 * are matched by WhatsApp id, so the ones both numbers share come already marked.
 */
export async function copyTrafficRoutine(client: SupabaseClient, input: { organizationId: string; fromAgentId: string; toAgentId: string; userId: string }) {
  const [source, sourceCampaigns] = await Promise.all([
    loadTrafficRoutine(client, input.organizationId, input.fromAgentId),
    listTrafficCampaigns(client, input.organizationId, input.fromAgentId),
  ]);
  if (!source && !sourceCampaigns.length) throw new Error("O outro número ainda não tem tráfego para copiar.");
  const context = await resolveClientWhatsappOperationalContext(client, input.organizationId, input.toAgentId);
  const mapTargets = async (ids: string[]) => {
    const { data: sourceTargets } = ids.length ? await client.from("whatsapp_channel_targets").select("provider_jid").in("id", ids) : { data: [] };
    const jids = ((sourceTargets ?? []) as Array<{ provider_jid: string }>).map(row => row.provider_jid);
    const { data: matches } = jids.length
      ? await client.from("whatsapp_channel_targets").select("id").eq("whatsapp_instance_id", context.instance.id).in("provider_jid", jids) : { data: [] };
    return ((matches ?? []) as Array<{ id: string }>).map(row => row.id);
  };
  if (source) {
    await saveTrafficRoutine(client, { organizationId: input.organizationId, agentId: input.toAgentId, userId: input.userId, changes: {
      lead_status_view: source.lead_status_view, lead_status_react: source.lead_status_react, lead_status_comment: source.lead_status_comment,
      room_target_ids: await mapTargets(source.room_target_ids ?? []), room_open_hour: source.room_open_hour, room_close_hour: source.room_close_hour,
      room_days: source.room_days, room_replies: source.room_replies,
    } });
  }
  for (const campaign of sourceCampaigns.filter(item => item.status !== "ended" && item.schedule_mode !== "once")) {
    const targetIds = await mapTargets(campaign.target_ids);
    if (!campaign.post_status && !targetIds.length) continue;
    await client.from("whatsapp_traffic_campaigns").insert({
      organization_id: input.organizationId, agent_id: input.toAgentId, name: campaign.name, status: "paused", post_status: campaign.post_status,
      target_ids: targetIds, product_mode: campaign.product_mode, catalog_item_ids: campaign.catalog_item_ids, idea: campaign.idea,
      post_format: campaign.post_format, intensity: campaign.intensity, start_hour: campaign.start_hour, schedule_mode: campaign.schedule_mode,
      ends_at: campaign.ends_at, updated_by: input.userId,
    });
  }
}
