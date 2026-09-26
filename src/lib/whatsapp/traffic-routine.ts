import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { meterGeminiGenerationUsage } from "@/lib/billing/gemini-metering";
import { assertBillableAccess } from "@/lib/billing/trial";
import {
  enableWhatsappAutomationCapability,
  generateWhatsappGrowthCampaignPlan,
  queueWhatsappGrowthCampaignPlan,
  resolveClientWhatsappOperationalContext,
  updateWhatsappChannelTargetSettings,
} from "@/lib/whatsapp/channel-operations";

export type TrafficIntensity = "light" | "normal" | "intense";
export type TrafficRoutine = {
  id: string; organization_id: string; agent_id: string; enabled: boolean; post_status: boolean; target_ids: string[];
  product_mode: "featured" | "selected"; catalog_item_ids: string[]; idea: string | null; intensity: TrafficIntensity; start_hour: number;
  lead_status_view: boolean; lead_status_react: boolean; lead_status_comment: boolean;
  planned_until: string | null; last_run_at: string | null; last_error: string | null;
};
export type TrafficRoutineInput = Partial<Pick<TrafficRoutine, "enabled" | "post_status" | "target_ids" | "product_mode" | "catalog_item_ids"
  | "idea" | "intensity" | "start_hour" | "lead_status_view" | "lead_status_react" | "lead_status_comment">>;

const brtOffsetMs = 3 * 3600_000;
const dayMs = 24 * 3600_000;
const postingWindowHours = 10;
export const trafficPostsPerDay: Record<TrafficIntensity, number> = { light: 1, normal: 2, intense: 3 };

/** Start of the next day to plan, at the owner's hour in Brasília time (no daylight saving since 2019). */
export function nextRoutineDayStart(now: Date, startHour: number, plannedUntil: string | null) {
  const after = plannedUntil ? Math.max(now.getTime(), new Date(plannedUntil).getTime()) : now.getTime();
  const localMidnight = Math.floor((after - brtOffsetMs) / dayMs) * dayMs + brtOffsetMs;
  let start = localMidnight + startHour * 3600_000;
  if (plannedUntil && start < new Date(plannedUntil).getTime()) start += dayMs;
  // First day: when the owner turns the routine on late, today still counts while most of the window is ahead.
  if (!plannedUntil && start < now.getTime()) {
    start = now.getTime() + 20 * 60_000 <= start + (postingWindowHours - 4) * 3600_000 ? now.getTime() + 20 * 60_000 : start + dayMs;
  }
  return new Date(start);
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
 * Saves the owner's choices. Turning the routine on also turns on what it needs (posts in status,
 * groups and channels) and frees the chosen groups and channels for posts, so there is nothing else
 * to configure.
 */
export async function saveTrafficRoutine(client: SupabaseClient, input: { organizationId: string; agentId: string; userId: string; changes: TrafficRoutineInput }) {
  const changes = input.changes;
  const row = {
    organization_id: input.organizationId, agent_id: input.agentId, updated_by: input.userId, updated_at: new Date().toISOString(),
    ...changes,
    ...(changes.idea !== undefined ? { idea: changes.idea?.trim().slice(0, 600) || null } : {}),
    ...(changes.enabled === false ? { planned_until: null } : {}),
  };
  const { data, error } = await client.from("whatsapp_traffic_routines").upsert(row, { onConflict: "organization_id,agent_id" }).select("*").single();
  if (error) throw new Error("Não foi possível salvar a rotina de tráfego.");
  const routine = data as TrafficRoutine;
  if (routine.enabled) await prepareRoutineCapabilities(client, routine, input.userId);
  else await archiveUpcomingRoutinePosts(client, routine);
  return routine;
}

export const routineTag = (routineId: string) => `traffic_routine:${routineId}`;

/** Turning the routine off stops what it had already scheduled. */
async function archiveUpcomingRoutinePosts(client: SupabaseClient, routine: TrafficRoutine) {
  await client.from("content_pipeline_items").update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("organization_id", routine.organization_id).eq("status", "scheduled").contains("tags", [routineTag(routine.id)]);
}

/** The next posts of the routine, for the preview with "pular". */
export async function listUpcomingRoutinePosts(client: SupabaseClient, routine: TrafficRoutine, limit = 12) {
  const { data } = await client.from("content_pipeline_items").select("id, content_type, title, body, scheduled_for, metadata")
    .eq("organization_id", routine.organization_id).eq("status", "scheduled").contains("tags", [routineTag(routine.id)])
    .order("scheduled_for", { ascending: true }).limit(limit);
  return ((data ?? []) as Array<{ id: string; content_type: string; title: string; body: string | null; scheduled_for: string | null; metadata: Record<string, unknown> | null }>)
    .map(row => ({ id: row.id, kind: row.content_type === "whatsapp_status" ? "status" as const : "grupos e canais" as const, title: row.title,
      text: (row.body ?? "").slice(0, 400), scheduledFor: row.scheduled_for }));
}

export async function skipRoutinePost(client: SupabaseClient, routine: TrafficRoutine, itemId: string) {
  const { data } = await client.from("content_pipeline_items").update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", itemId).eq("organization_id", routine.organization_id).eq("status", "scheduled").contains("tags", [routineTag(routine.id)]).select("id");
  if (!data?.length) throw new Error("Esse post já foi enviado ou não é desta rotina.");
}

async function prepareRoutineCapabilities(client: SupabaseClient, routine: TrafficRoutine, userId: string | null) {
  const context = await resolveClientWhatsappOperationalContext(client, routine.organization_id, routine.agent_id);
  if (context.instance.status !== "connected") return;
  const { data: targets } = routine.target_ids.length
    ? await client.from("whatsapp_channel_targets").select("id, target_type, campaign_enabled").in("id", routine.target_ids).eq("whatsapp_instance_id", context.instance.id)
    : { data: [] };
  const rows = (targets ?? []) as Array<{ id: string; target_type: string; campaign_enabled: boolean }>;
  const needs = [
    routine.post_status && !context.behavior.statusBroadcasts ? "status" : null,
    rows.some(row => row.target_type === "group") && !context.behavior.campaignBroadcasts ? "campaigns" : null,
    rows.some(row => row.target_type === "newsletter") && !context.behavior.newsletterBroadcasts ? "newsletters" : null,
  ].filter((value): value is string => Boolean(value));
  for (const capability of needs) await enableWhatsappAutomationCapability(client, context, { capability, enabled: true, updatedBy: userId });
  for (const row of rows.filter(target => !target.campaign_enabled)) {
    await updateWhatsappChannelTargetSettings(client, context, { targetId: row.id, campaignEnabled: true });
  }
}

/** Plans and schedules the next day of posts for one routine. */
export async function runTrafficRoutine(client: SupabaseClient, routine: TrafficRoutine, now = new Date()) {
  const claimedAt = now.toISOString();
  const { data: claimed } = await client.from("whatsapp_traffic_routines").update({ last_run_at: claimedAt })
    .eq("id", routine.id).eq("enabled", true).or(`last_run_at.is.null,last_run_at.lt.${new Date(now.getTime() - 10 * 60_000).toISOString()}`).select("id");
  if (!claimed?.length) return { skipped: "busy" as const };
  try {
    await assertBillableAccess({ organizationId: routine.organization_id, client });
    await prepareRoutineCapabilities(client, routine, null);
    const context = await resolveClientWhatsappOperationalContext(client, routine.organization_id, routine.agent_id);
    if (context.instance.status !== "connected") throw new Error("WhatsApp desconectado: reconecte para a rotina voltar a postar.");
    const dayStart = nextRoutineDayStart(now, routine.start_hour, routine.planned_until);
    const productPool = routine.product_mode === "selected" && routine.catalog_item_ids.length ? routine.catalog_item_ids : await loadFeaturedProductIds(client, routine.organization_id);
    const catalogItemIds = pickRoutineProducts(productPool, dayStart);
    const postsPerDay = trafficPostsPerDay[routine.intensity] ?? 2;
    const brief = [routine.idea, "Rotina diária de tráfego: cada post puxa conversa no privado ou compra. Varie o ângulo em relação aos dias anteriores."].filter(Boolean).join("\n");
    const destinations = [
      ...(routine.post_status ? [{ targetIds: [] as string[], formats: ["status"] }] : []),
      ...(routine.target_ids.length ? [{ targetIds: routine.target_ids, formats: ["text", "carousel", "poll", "text_audio"] }] : []),
    ];
    if (!destinations.length) throw new Error("Escolha pelo menos um lugar para divulgar.");
    let scheduled = 0;
    for (const destination of destinations) {
      const available = await availableFormats(destination.formats, context.behavior);
      const plan = await generateWhatsappGrowthCampaignPlan(client, context, {
        targetIds: destination.targetIds, catalogItemIds, brief, durationDays: 1, postsPerDay, startFrom: dayStart.toISOString(), preferredFormats: available,
      });
      await meterGeminiGenerationUsage({
        client, organizationId: routine.organization_id, featureCode: "whatsapp_traffic_routine_ai", modelId: plan.modelId, agentScope: "customer",
        promptText: [plan.systemInstruction, plan.prompt], outputText: plan.items.map(item => item.text).join("\n\n"), responseData: plan.responseData,
        debitDescription: "Rotina de tráfego no WhatsApp", metadata: { source: "whatsapp_traffic_routine", routineId: routine.id, agentId: routine.agent_id, itemCount: plan.items.length },
      });
      const queued = await queueWhatsappGrowthCampaignPlan(client, context, {
        planItems: plan.items, targetIds: destination.targetIds, catalogItemIds, buttonEnabled: true,
      });
      scheduled += queued.count;
      const ids = queued.items.map(item => item.id);
      const { data: rows } = ids.length ? await client.from("content_pipeline_items").select("id, tags").in("id", ids) : { data: [] };
      for (const row of (rows ?? []) as Array<{ id: string; tags: string[] | null }>) {
        await client.from("content_pipeline_items").update({ tags: [...(row.tags ?? []), "traffic_routine", routineTag(routine.id)] }).eq("id", row.id);
      }
    }
    const plannedUntil = new Date(dayStart.getTime() + postingWindowHours * 3600_000).toISOString();
    await client.from("whatsapp_traffic_routines").update({ planned_until: plannedUntil, last_error: null }).eq("id", routine.id);
    return { scheduled, plannedUntil };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Falha ao planejar a rotina.";
    await client.from("whatsapp_traffic_routines").update({ last_error: message }).eq("id", routine.id);
    return { error: message };
  }
}

async function availableFormats(wanted: string[], behavior: { interactiveMessages?: boolean }) {
  return wanted.filter(format => behavior.interactiveMessages || (format !== "carousel" && format !== "poll"));
}

/** Hourly: every active routine keeps the next day planned. */
export async function runDueTrafficRoutines(client: SupabaseClient, now = new Date()) {
  const horizon = new Date(now.getTime() + 12 * 3600_000).toISOString();
  const { data, error } = await client.from("whatsapp_traffic_routines").select("*").eq("enabled", true)
    .or(`planned_until.is.null,planned_until.lt.${horizon}`).limit(50);
  if (error) throw new Error("Não foi possível listar as rotinas de tráfego.");
  const results = [];
  for (const routine of (data ?? []) as TrafficRoutine[]) results.push({ id: routine.id, ...(await runTrafficRoutine(client, routine, now)) });
  return results;
}
