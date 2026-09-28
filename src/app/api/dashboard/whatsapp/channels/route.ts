import { NextResponse, type NextRequest } from "next/server";
import { getClientAgentsWorkspace, type ClientAgent } from "@/lib/client-os/agents";
import { meterGeminiGenerationUsage } from "@/lib/billing/gemini-metering";
import { assertBillableAccess, BillingAccessError } from "@/lib/billing/trial";
import type { ClientCompany } from "@/lib/client-os/companies";
import { currentOrganizationToClientCompany } from "@/lib/client-os/current-company";
import { inngest } from "@/lib/inngest/client";
import { getCurrentWorkspace, type CurrentOrganization } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import {
  enableWhatsappAutomationCapability,
  enableWhatsappGroupReplies,
  fetchWhatsappCampaignFolders,
  fetchWhatsappGroups,
  fetchWhatsappMessageLimits,
  fetchWhatsappNewsletters,
  generateWhatsappGrowthCampaignPlan,
  generateWhatsappStatusDraft,
  generateWhatsappTargetCampaignDraft,
  getWhatsappOperationsDashboard,
  isOperationalAgentEnabled,
  mapOtherGroupResponders,
  probeWhatsappLeadStatusWatch,
  queueWhatsappGrowthCampaignPlan,
  queueWhatsappNewsletterText,
  queueWhatsappGroupWindow,
  queueWhatsappSimpleCampaign,
  queueWhatsappStatusBroadcast,
  queueWhatsappTargetCarouselCampaign,
  queueWhatsappTargetPollCampaign,
  queueWhatsappTargetTextCampaign,
  resolveClientWhatsappOperationalContext,
  syncWhatsappCampaignTracking,
  syncWhatsappGroupIntelligence,
  syncWhatsappOutboundInsights,
  type WhatsappOutboundItem,
  updateWhatsappChannelTargetSettings,
} from "@/lib/whatsapp/channel-operations";

import {
  campaignCounts, copyTrafficRoutine, listTrafficCampaigns, listTrafficRoutineNumbers, listUpcomingTraffic, loadTrafficRoutine, saveTrafficCampaign,
  saveTrafficRoutine, setTrafficCampaignStatus, skipTrafficItem, type TrafficCampaign, type TrafficCampaignInput, type TrafficRoutine, type TrafficRoutineInput,
} from "@/lib/whatsapp/traffic-routine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WorkspaceContext = {
  organization: CurrentOrganization;
  userId: string;
  companies: ClientCompany[];
  agents: ClientAgent[];
  selectedAgentId: string | null;
};

type ChannelActionBody = {
  action?: unknown;
  companyId?: unknown;
  agentId?: unknown;
  text?: unknown;
  title?: unknown;
  numbers?: unknown;
  recipients?: unknown;
  jid?: unknown;
  scheduledFor?: unknown;
  maxRecipients?: unknown;
  backgroundColor?: unknown;
  statusType?: unknown;
  targetIds?: unknown;
  mentionAll?: unknown;
  recurrenceFrequency?: unknown;
  recurrenceOccurrences?: unknown;
  brief?: unknown;
  currentTitle?: unknown;
  currentText?: unknown;
  deliveryMode?: unknown;
  mediaUrl?: unknown;
  mediaKind?: unknown;
  mediaCaption?: unknown;
  catalogItemIds?: unknown;
  interactiveMode?: unknown;
  buttonEnabled?: unknown;
  buttonLabel?: unknown;
  buttonUrl?: unknown;
  pollTitle?: unknown;
  pollQuestion?: unknown;
  pollChoices?: unknown;
  pollSelectableCount?: unknown;
  durationDays?: unknown;
  postsPerDay?: unknown;
  objective?: unknown;
  startFrom?: unknown;
  preferredFormats?: unknown;
  capability?: unknown;
  planItems?: unknown;
  groupTargetId?: unknown;
  openScheduledFor?: unknown;
  closeScheduledFor?: unknown;
  openingText?: unknown;
  preCloseText?: unknown;
  closingText?: unknown;
  preCloseMinutes?: unknown;
  targetId?: unknown;
  enabled?: unknown;
  campaignEnabled?: unknown;
  replyMode?: unknown;
  mentionMode?: unknown;
  requireApproval?: unknown;
  maxRepliesPerHour?: unknown;
  muteUntil?: unknown;
  routine?: unknown;
  itemId?: unknown;
  fromAgentId?: unknown;
  campaign?: unknown;
  campaignId?: unknown;
  campaignAction?: unknown;
};

export async function GET(request: NextRequest) {
  const context = await requireWorkspaceContext(
    request.nextUrl.searchParams.get("companyId"),
    request.nextUrl.searchParams.get("agentId"),
    true,
  );

  if (context instanceof NextResponse) {
    return context;
  }

  if (!context) {
    return NextResponse.json({
      operations: null,
      error: "Cadastre uma empresa antes de usar recursos avancados do WhatsApp.",
    });
  }

  try {
    const client = createServiceClient();
    const whatsapp = await resolveClientWhatsappOperationalContext(client, context.organization.id, context.selectedAgentId);

    if (whatsapp.instance.status === "connected") {
      const discovery = await client.rpc("claim_automation_destination_discovery", { p_org: context.organization.id, p_instance: whatsapp.instance.id });
      if (discovery.data === true) {
        const results = await Promise.allSettled([fetchWhatsappGroups(whatsapp), fetchWhatsappNewsletters(whatsapp)]);
        for (const result of results) if (result.status === "rejected") console.error("WhatsApp destination discovery failed", result.reason instanceof Error ? result.reason.message : "provider_unavailable");
      }
    }

    return NextResponse.json({
      operations: await getWhatsappOperationsDashboard(client, whatsapp),
      traffic: context.selectedAgentId ? await loadTrafficPayload(client, context.organization.id, context.selectedAgentId) : null,
    });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

async function loadTrafficPayload(client: ReturnType<typeof createServiceClient>, organizationId: string, agentId: string) {
  const [routine, campaigns] = await Promise.all([
    loadTrafficRoutine(client, organizationId, agentId).catch(() => null),
    listTrafficCampaigns(client, organizationId, agentId).catch(() => [] as TrafficCampaign[]),
  ]);
  const counts = await campaignCounts(client, organizationId, campaigns).catch(() => new Map<string, { sent: number; scheduled: number }>());
  return {
    routine: routine ? toClientRoutine(routine) : null,
    campaigns: campaigns.map(campaign => toClientCampaign(campaign, counts.get(campaign.id) ?? { sent: 0, scheduled: 0 })),
    upcoming: await listUpcomingTraffic(client, organizationId, campaigns, routine).catch(() => []),
    numbers: await listTrafficRoutineNumbers(client, organizationId).catch(() => []),
    groupHolders: await loadGroupHolders(client, organizationId, agentId).catch(() => ({})),
    agentEnabled: await resolveClientWhatsappOperationalContext(client, organizationId, agentId).then(isOperationalAgentEnabled).catch(() => true),
  };
}

/** Groups of this number that another agent already answers: the panel shows them locked. */
async function loadGroupHolders(client: ReturnType<typeof createServiceClient>, organizationId: string, agentId: string) {
  const whatsapp = await resolveClientWhatsappOperationalContext(client, organizationId, agentId);
  const { data } = await client.from("whatsapp_channel_targets").select("id, provider_jid").eq("whatsapp_instance_id", whatsapp.instance.id).eq("target_type", "group");
  const targets = (data ?? []) as Array<{ id: string; provider_jid: string }>;
  const holders = await mapOtherGroupResponders(client, { organizationId, instanceId: whatsapp.instance.id, groupJids: targets.map(target => target.provider_jid) });
  return Object.fromEntries(targets.filter(target => holders.has(target.provider_jid)).map(target => [target.id, holders.get(target.provider_jid)!]));
}

function toClientRoutine(routine: TrafficRoutine) {
  return {
    leadStatusView: routine.lead_status_view, leadStatusReact: routine.lead_status_react, leadStatusComment: routine.lead_status_comment,
    roomEnabled: routine.room_enabled ?? false, roomTargetIds: routine.room_target_ids ?? [], roomOpenHour: routine.room_open_hour ?? 19,
    roomCloseHour: routine.room_close_hour ?? 20, roomDays: routine.room_days ?? [0, 1, 2, 3, 4, 5, 6], roomReplies: routine.room_replies ?? true,
    roomPlannedUntil: routine.room_planned_until ?? null, lastError: routine.last_error,
  };
}

function toClientCampaign(campaign: TrafficCampaign, counts: { sent: number; scheduled: number }) {
  return {
    id: campaign.id, name: campaign.name, status: campaign.status, postStatus: campaign.post_status, targetIds: campaign.target_ids,
    productMode: campaign.product_mode, catalogItemIds: campaign.catalog_item_ids, idea: campaign.idea ?? "", manualText: campaign.manual_text ?? "",
    postFormat: campaign.post_format, intensity: campaign.intensity, startHour: campaign.start_hour, scheduleMode: campaign.schedule_mode,
    endsAt: campaign.ends_at, plannedUntil: campaign.planned_until, lastError: campaign.last_error, sent: counts.sent, scheduled: counts.scheduled,
    statusAudience: campaign.status_audience ?? "all", statusStyle: campaign.status_style ?? "single", statusColor: campaign.status_color ?? 13,
  };
}

const uuidList = (list: unknown, max = 50) => Array.isArray(list) ? list.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, max) : [];
const readRecordValue = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function readRoutineChanges(value: unknown): TrafficRoutineInput {
  const record = readRecordValue(value);
  const changes: TrafficRoutineInput = {};
  const bool = (key: string, target: keyof TrafficRoutineInput) => { if (typeof record[key] === "boolean") (changes as Record<string, unknown>)[target] = record[key]; };
  bool("leadStatusView", "lead_status_view"); bool("leadStatusReact", "lead_status_react"); bool("leadStatusComment", "lead_status_comment");
  bool("roomEnabled", "room_enabled"); bool("roomReplies", "room_replies");
  if ("roomTargetIds" in record) changes.room_target_ids = uuidList(record.roomTargetIds);
  const hour = (item: unknown, min: number, max: number) => typeof item === "number" && Number.isInteger(item) && item >= min && item <= max;
  if (hour(record.roomOpenHour, 6, 22)) changes.room_open_hour = record.roomOpenHour as number;
  if (hour(record.roomCloseHour, 7, 23)) changes.room_close_hour = record.roomCloseHour as number;
  if (Array.isArray(record.roomDays)) changes.room_days = Array.from(new Set(record.roomDays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)));
  return changes;
}

function readCampaignChanges(value: unknown): TrafficCampaignInput {
  const record = readRecordValue(value);
  const changes: TrafficCampaignInput = {};
  if (typeof record.name === "string") changes.name = record.name.slice(0, 80);
  if (typeof record.postStatus === "boolean") changes.post_status = record.postStatus;
  if ("targetIds" in record) changes.target_ids = uuidList(record.targetIds);
  if ("catalogItemIds" in record) changes.catalog_item_ids = uuidList(record.catalogItemIds, 12);
  if (record.productMode === "featured" || record.productMode === "selected" || record.productMode === "single") changes.product_mode = record.productMode;
  if (typeof record.idea === "string") changes.idea = record.idea.slice(0, 600);
  if (typeof record.manualText === "string") changes.manual_text = record.manualText.slice(0, 1500);
  if (["auto", "product_audio", "product_button", "text", "poll"].includes(String(record.postFormat))) changes.post_format = record.postFormat as TrafficCampaignInput["post_format"];
  if (record.intensity === "light" || record.intensity === "normal" || record.intensity === "intense") changes.intensity = record.intensity;
  if (typeof record.startHour === "number" && Number.isInteger(record.startHour) && record.startHour >= 6 && record.startHour <= 20) changes.start_hour = record.startHour;
  if (["once", "week", "month", "continuous"].includes(String(record.scheduleMode))) changes.schedule_mode = record.scheduleMode as TrafficCampaignInput["schedule_mode"];
  if (["all", "interested", "customers", "hot"].includes(String(record.statusAudience))) changes.status_audience = record.statusAudience as TrafficCampaignInput["status_audience"];
  if (record.statusStyle === "single" || record.statusStyle === "story") changes.status_style = record.statusStyle;
  if (typeof record.statusColor === "number" && Number.isInteger(record.statusColor) && record.statusColor >= 1 && record.statusColor <= 19) changes.status_color = record.statusColor;
  return changes;
}

export async function POST(request: NextRequest) {
  const body = await readJson<ChannelActionBody>(request);
  const context = await requireWorkspaceContext(asString(body?.companyId), asString(body?.agentId), false);

  if (context instanceof NextResponse) {
    return context;
  }

  if (!context) {
    return NextResponse.json({ error: "Cadastre uma empresa antes de usar canais do WhatsApp." }, { status: 422 });
  }

  const action = asString(body?.action) ?? "";

  try {
    await assertBillableAccess({ organizationId: context.organization.id });

    const client = createServiceClient();
    const whatsapp = await resolveClientWhatsappOperationalContext(client, context.organization.id, context.selectedAgentId);
    let result: unknown;
    let notice = "Operacao concluida.";

    if (["save_traffic_routine", "save_traffic_campaign", "campaign_status", "skip_routine_post", "copy_traffic_routine"].includes(action)) {
      if (!context.selectedAgentId) return NextResponse.json({ error: "Escolha o número do tráfego." }, { status: 422 });
      const scope = { organizationId: context.organization.id, agentId: context.selectedAgentId, userId: context.userId };
      const runCampaign = (campaign: TrafficCampaign | null) => campaign?.status === "active" && !campaign.planned_until
        ? inngest.send({ name: "connectyhub/traffic-campaign.run", data: { campaignId: campaign.id } }).catch(() => null) : null;
      if (action === "save_traffic_routine") {
        const routine = await saveTrafficRoutine(client, { ...scope, changes: readRoutineChanges(body?.routine) });
        if (routine.room_enabled && !routine.room_planned_until) await inngest.send({ name: "connectyhub/traffic-routine.run", data: { routineId: routine.id } }).catch(() => null);
        notice = "Salvo.";
      } else if (action === "save_traffic_campaign") {
        const campaign = await saveTrafficCampaign(client, { ...scope, campaignId: asString(body?.campaignId), changes: readCampaignChanges(body?.campaign) });
        await runCampaign(campaign);
        notice = campaign.schedule_mode === "once" ? "Post agendado: sai em instantes." : "Campanha salva. Os próximos posts aparecem aqui em instantes.";
      } else if (action === "campaign_status") {
        const campaignAction = asString(body?.campaignAction);
        if (campaignAction !== "pause" && campaignAction !== "resume" && campaignAction !== "end" && campaignAction !== "delete") return NextResponse.json({ error: "Ação inválida." }, { status: 422 });
        const campaign = await setTrafficCampaignStatus(client, { ...scope, campaignId: asString(body?.campaignId) ?? "", action: campaignAction });
        await runCampaign(campaign);
        notice = { pause: "Campanha pausada: os posts agendados foram cancelados.", resume: "Campanha retomada.", end: "Campanha encerrada.", delete: "Campanha excluída." }[campaignAction];
      } else if (action === "copy_traffic_routine") {
        const fromAgentId = asString(body?.fromAgentId);
        if (!fromAgentId || !context.agents.some((agent) => agent.id === fromAgentId)) return NextResponse.json({ error: "Número de origem inválido." }, { status: 422 });
        await copyTrafficRoutine(client, { organizationId: context.organization.id, fromAgentId, toAgentId: context.selectedAgentId, userId: context.userId });
        notice = "Configuração copiada: as campanhas chegam pausadas. Confira os grupos e ligue as que quiser.";
      } else {
        const [routine, campaigns] = await Promise.all([loadTrafficRoutine(client, scope.organizationId, scope.agentId), listTrafficCampaigns(client, scope.organizationId, scope.agentId)]);
        await skipTrafficItem(client, scope.organizationId, campaigns, routine, asString(body?.itemId) ?? "");
        notice = "Envio pulado.";
      }
      return NextResponse.json({ traffic: await loadTrafficPayload(client, context.organization.id, context.selectedAgentId), notice: { tone: "success", message: notice } });
    }

    if (action === "refresh_groups") {
      result = await fetchWhatsappGroups(whatsapp);
      notice = "Grupos atualizados.";
    } else if (action === "refresh_newsletters") {
      result = await fetchWhatsappNewsletters(whatsapp);
      notice = "Canais atualizados.";
    } else if (action === "message_limits") {
      result = await fetchWhatsappMessageLimits(whatsapp);
      notice = "Limites de mensagens consultados.";
    } else if (action === "campaign_folders") {
      result = await fetchWhatsappCampaignFolders(whatsapp);
      notice = "Pastas de campanha consultadas.";
    } else if (action === "sync_campaign_tracking") {
      result = await syncWhatsappCampaignTracking(client, whatsapp);
      notice = "Rastreamento de campanhas atualizado.";
    } else if (action === "sync_outbound_insights") {
      result = await syncWhatsappOutboundInsights(client, whatsapp);
      notice = "Metricas de grupos, canais, status e CRM atualizadas.";
    } else if (action === "sync_group_intelligence") {
      result = await syncWhatsappGroupIntelligence(client, whatsapp);
      notice = "Detalhes e riscos dos grupos atualizados.";
    } else if (action === "send_status") {
      const item = await queueWhatsappStatusBroadcast(client, whatsapp, {
        text: asString(body?.text) ?? "",
        recipients: readStringList(body?.recipients),
        maxRecipients: asNumber(body?.maxRecipients),
        backgroundColor: asNumber(body?.backgroundColor),
        scheduledFor: asString(body?.scheduledFor),
        statusType: asString(body?.statusType),
        mediaUrl: asString(body?.mediaUrl),
        mediaCaption: asString(body?.mediaCaption),
        catalogItemIds: readStringList(body?.catalogItemIds),
      });
      await dispatchOutboundIfDue(item);
      result = { item };
      notice = "Status do WhatsApp agendado pelo Inngest.";
    } else if (action === "send_campaign") {
      const item = await queueWhatsappSimpleCampaign(client, whatsapp, {
        title: asString(body?.title) ?? "",
        text: asString(body?.text) ?? "",
        numbers: readStringList(body?.numbers),
        scheduledFor: asString(body?.scheduledFor),
      });
      await dispatchOutboundIfDue(item);
      result = { item };
      notice = "Campanha WhatsApp agendada pelo Inngest.";
    } else if (action === "post_newsletter") {
      const item = await queueWhatsappNewsletterText(client, whatsapp, {
        jid: asString(body?.jid) ?? "",
        text: asString(body?.text) ?? "",
        scheduledFor: asString(body?.scheduledFor),
      });
      await dispatchOutboundIfDue(item);
      result = { item };
      notice = "Post no canal/newsletter agendado pelo Inngest.";
    } else if (action === "generate_target_campaign_draft") {
      const draft = await generateWhatsappTargetCampaignDraft(client, whatsapp, {
        targetIds: readStringList(body?.targetIds),
        brief: asString(body?.brief),
        currentTitle: asString(body?.currentTitle),
        currentText: asString(body?.currentText),
        mentionAll: asBoolean(body?.mentionAll),
        recurrenceFrequency: asString(body?.recurrenceFrequency),
        recurrenceOccurrences: asNumber(body?.recurrenceOccurrences) ?? null,
        catalogItemIds: readStringList(body?.catalogItemIds),
      });
      await meterGeminiGenerationUsage({
        client,
        organizationId: context.organization.id,
        userId: context.userId,
        featureCode: "content_generation", // tarifa de geração de conteúdo (whatsapp_campaign_ai_draft)
        modelId: draft.modelId,
        agentScope: "customer",
        promptText: [draft.systemInstruction, draft.prompt],
        outputText: draft.text,
        responseData: draft.responseData,
        debitDescription: "Rascunho IA de campanha WhatsApp",
        metadata: {
          source: "dashboard_whatsapp_channels",
          companyId: context.organization.id,
          agentId: context.selectedAgentId,
          targetCount: draft.targetCount,
        },
      });
      result = { draft: toSafeCampaignDraft(draft) };
      notice = "Rascunho IA criado. Revise o texto e clique em Agendar post para aprovar.";
    } else if (action === "generate_growth_plan") {
      const plan = await generateWhatsappGrowthCampaignPlan(client, whatsapp, {
        targetIds: readStringList(body?.targetIds),
        catalogItemIds: readStringList(body?.catalogItemIds),
        objective: asString(body?.objective),
        brief: asString(body?.brief),
        durationDays: asNumber(body?.durationDays) ?? null,
        postsPerDay: asNumber(body?.postsPerDay) ?? null,
        startFrom: asString(body?.startFrom),
        mentionAll: asBoolean(body?.mentionAll),
        preferredFormats: readStringList(body?.preferredFormats),
      });
      await meterGeminiGenerationUsage({
        client,
        organizationId: context.organization.id,
        userId: context.userId,
        featureCode: "content_generation", // tarifa de geração de conteúdo (whatsapp_growth_plan_ai)
        modelId: plan.modelId,
        agentScope: "customer",
        promptText: [plan.systemInstruction, plan.prompt],
        outputText: plan.items.map((item) => item.text).join("\n\n"),
        responseData: plan.responseData,
        debitDescription: "Plano IA de rotina WhatsApp",
        metadata: {
          source: "dashboard_whatsapp_automations",
          companyId: context.organization.id,
          agentId: context.selectedAgentId,
          targetCount: plan.targetCount,
          itemCount: plan.items.length,
        },
      });
      result = { growthPlan: toSafeGrowthPlan(plan) };
      notice = "Rotina IA criada. Revise os posts e agende o plano quando estiver pronto.";
    } else if (action === "generate_status_draft") {
      const draft = await generateWhatsappStatusDraft(client, whatsapp, {
        brief: asString(body?.brief),
        currentText: asString(body?.currentText),
        catalogItemIds: readStringList(body?.catalogItemIds),
      });
      await meterGeminiGenerationUsage({
        client,
        organizationId: context.organization.id,
        userId: context.userId,
        featureCode: "content_generation", // tarifa de geração de conteúdo (whatsapp_status_ai_draft)
        modelId: draft.modelId,
        agentScope: "customer",
        promptText: [draft.systemInstruction, draft.prompt],
        outputText: draft.text,
        responseData: draft.responseData,
        debitDescription: "Rascunho IA de status WhatsApp",
        metadata: {
          source: "dashboard_whatsapp_automations",
          companyId: context.organization.id,
          agentId: context.selectedAgentId,
          productNames: draft.productNames,
        },
      });
      result = { draft: toSafeStatusDraft(draft) };
      notice = "Status IA criado. Revise o texto e publique quando estiver pronto.";
    } else if (action === "send_target_campaign") {
      const item = await queueWhatsappTargetTextCampaign(client, whatsapp, {
        title: asString(body?.title) ?? "",
        text: asString(body?.text) ?? "",
        targetIds: readStringList(body?.targetIds),
        scheduledFor: asString(body?.scheduledFor),
        mentionAll: asBoolean(body?.mentionAll),
        recurrenceFrequency: asString(body?.recurrenceFrequency),
        recurrenceOccurrences: asNumber(body?.recurrenceOccurrences) ?? null,
        deliveryMode: asString(body?.deliveryMode),
        mediaUrl: asString(body?.mediaUrl),
        mediaKind: asString(body?.mediaKind),
        mediaCaption: asString(body?.mediaCaption),
        catalogItemIds: readStringList(body?.catalogItemIds),
        interactiveMode: asString(body?.interactiveMode),
        buttonLabel: asString(body?.buttonLabel),
        buttonUrl: asString(body?.buttonUrl),
      });
      await dispatchOutboundIfDue(item);
      result = { item };
      notice = "Campanha para grupos/canais agendada pelo Inngest.";
    } else if (action === "send_target_carousel") {
      const item = await queueWhatsappTargetCarouselCampaign(client, whatsapp, {
        title: asString(body?.title) ?? "",
        text: asString(body?.text),
        targetIds: readStringList(body?.targetIds),
        scheduledFor: asString(body?.scheduledFor),
        mentionAll: asBoolean(body?.mentionAll),
        catalogItemIds: readStringList(body?.catalogItemIds),
        buttonLabel: asString(body?.buttonLabel),
        buttonUrl: asString(body?.buttonUrl),
      });
      await dispatchOutboundIfDue(item);
      result = { item };
      notice = "Carrossel de produtos agendado pelo Inngest.";
    } else if (action === "schedule_growth_plan") {
      const queued = await queueWhatsappGrowthCampaignPlan(client, whatsapp, {
        planItems: body?.planItems,
        targetIds: readStringList(body?.targetIds),
        catalogItemIds: readStringList(body?.catalogItemIds),
        mentionAll: asBoolean(body?.mentionAll),
        buttonEnabled: asBoolean(body?.buttonEnabled),
        buttonLabel: asString(body?.buttonLabel),
      });
      for (const item of queued.items) {
        await dispatchOutboundIfDue(item);
      }
      result = queued;
      notice = `${queued.count} post(s) da rotina IA foram agendados.`;
    } else if (action === "send_target_poll") {
      const item = await queueWhatsappTargetPollCampaign(client, whatsapp, {
        title: asString(body?.pollTitle) ?? "",
        question: asString(body?.pollQuestion) ?? "",
        choices: readStringList(body?.pollChoices),
        targetIds: readStringList(body?.targetIds),
        scheduledFor: asString(body?.scheduledFor),
        mentionAll: asBoolean(body?.mentionAll),
        recurrenceFrequency: asString(body?.recurrenceFrequency),
        recurrenceOccurrences: asNumber(body?.recurrenceOccurrences) ?? null,
        selectableCount: asNumber(body?.pollSelectableCount) ?? null,
      });
      await dispatchOutboundIfDue(item);
      result = { item };
      notice = "Enquete para grupos agendada pelo Inngest.";
    } else if (action === "schedule_group_window") {
      const groupWindow = await queueWhatsappGroupWindow(client, whatsapp, {
        targetId: asString(body?.groupTargetId) ?? "",
        openScheduledFor: asString(body?.openScheduledFor) ?? "",
        closeScheduledFor: asString(body?.closeScheduledFor) ?? "",
        openingText: asString(body?.openingText),
        preCloseText: asString(body?.preCloseText),
        closingText: asString(body?.closingText),
        preCloseMinutes: asNumber(body?.preCloseMinutes) ?? null,
        mentionAll: asBoolean(body?.mentionAll),
      });
      for (const item of groupWindow.items) {
        await dispatchOutboundIfDue(item);
      }
      result = groupWindow;
      notice = "Janela do grupo agendada com abertura, aviso e fechamento.";
    } else if (action === "probe_lead_status_watch") {
      result = { probe: await probeWhatsappLeadStatusWatch(whatsapp) };
      notice = "Teste experimental de status dos leads concluido.";
    } else if (action === "enable_group_replies") {
      result = await enableWhatsappGroupReplies(client, whatsapp, { updatedBy: context.userId });
      notice = "Responder grupos ativado para este agente e WhatsApp.";
    } else if (action === "enable_automation_capability" || action === "set_automation_capability") {
      const enabled = action === "set_automation_capability"
        ? (readOptionalBoolean(body?.enabled) ?? true)
        : true;
      result = await enableWhatsappAutomationCapability(client, whatsapp, {
        capability: asString(body?.capability) ?? "",
        enabled,
        updatedBy: context.userId,
      });
      notice = enabled
        ? "Recurso de automacao WhatsApp ativado para este agente."
        : "Recurso de automacao WhatsApp desativado para este agente.";
    } else if (action === "update_target_settings") {
      result = {
        target: await updateWhatsappChannelTargetSettings(client, whatsapp, {
          targetId: asString(body?.targetId) ?? "",
          enabled: readOptionalBoolean(body?.enabled),
          campaignEnabled: readOptionalBoolean(body?.campaignEnabled),
          replyMode: readOptionalString(body?.replyMode),
          mentionMode: readOptionalString(body?.mentionMode),
          requireApproval: readOptionalBoolean(body?.requireApproval),
          maxRepliesPerHour: asNumber(body?.maxRepliesPerHour) ?? null,
          muteUntil: Object.prototype.hasOwnProperty.call(body ?? {}, "muteUntil") ? asString(body?.muteUntil) : undefined,
        }),
      };
      notice = "Regra do grupo/canal salva.";
    } else {
      return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
    }

    return NextResponse.json({
      operations: await getWhatsappOperationsDashboard(client, whatsapp),
      result,
      notice: { tone: "success", message: notice },
    });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: statusForError(error, 400) });
  }
}

function toSafeStatusDraft(draft: {
  text: string;
  backgroundColor: number;
  approvalChecklist: string[];
  productNames: string[];
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
  modelId: string;
}) {
  return {
    text: draft.text,
    backgroundColor: draft.backgroundColor,
    approvalChecklist: draft.approvalChecklist,
    productNames: draft.productNames,
    mediaUrl: draft.mediaUrl,
    mediaKind: draft.mediaKind,
    modelId: draft.modelId,
  };
}

async function requireWorkspaceContext(
  requestedCompanyId: string | null,
  requestedAgentId: string | null,
  allowMissingCompany: boolean,
): Promise<WorkspaceContext | NextResponse | null> {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  if (!workspace.organization) {
    return allowMissingCompany ? null : NextResponse.json({ error: "Cadastre uma empresa antes de usar canais do WhatsApp." }, { status: 422 });
  }

  if (requestedCompanyId && requestedCompanyId !== workspace.organization.id) {
    return NextResponse.json({ error: "Empresa fora do workspace atual." }, { status: 422 });
  }

  const { companies, agents } = await getClientAgentsWorkspace({
    userId: workspace.user.id,
    organizationId: workspace.organization.id,
    company: currentOrganizationToClientCompany(workspace.organization),
  });

  if (companies.length === 0) {
    return allowMissingCompany ? null : NextResponse.json({ error: "Cadastre uma empresa antes de usar canais do WhatsApp." }, { status: 422 });
  }

  const selectedAgent = resolveSelectedAgent(agents, requestedAgentId, workspace.organization.id);

  if (requestedAgentId && !selectedAgent) {
    return NextResponse.json({ error: "Escolha um agente vinculado a sua conta." }, { status: 422 });
  }

  return {
    organization: workspace.organization,
    userId: workspace.user.id,
    companies,
    agents,
    selectedAgentId: selectedAgent?.id ?? null,
  };
}

function resolveSelectedAgent(agents: ClientAgent[], requestedAgentId: string | null, requestedCompanyId: string | null) {
  if (requestedAgentId) {
    return agents.find((agent) => agent.id === requestedAgentId) ?? null;
  }

  if (requestedCompanyId) {
    return agents.find((agent) => agent.companyId === requestedCompanyId) ?? null;
  }

  return agents[0] ?? null;
}

async function dispatchOutboundIfDue(item: WhatsappOutboundItem) {
  const scheduledFor = item.scheduledFor ? new Date(item.scheduledFor) : new Date();
  if (!Number.isNaN(scheduledFor.getTime()) && scheduledFor.getTime() > Date.now() + 15_000) {
    return;
  }

  await inngest.send({
    name: "connectyhub/whatsapp.outbound.requested",
    data: { itemId: item.id },
  }).catch(() => null);
}

async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function readStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes", "sim"].includes(value.trim().toLowerCase());
  return false;
}

function readOptionalBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes", "sim"].includes(value.trim().toLowerCase());
  return undefined;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : undefined;
}

function formatError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Erro inesperado nos recursos do WhatsApp.",
    ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
  };
}

function statusForError(error: unknown, fallback: number) {
  return error instanceof BillingAccessError ? 402 : fallback;
}

function toSafeCampaignDraft(draft: {
  title: string;
  text: string;
  approvalChecklist: string[];
  targetCount: number;
  targetNames: string[];
  modelId: string;
}) {
  return {
    title: draft.title,
    text: draft.text,
    approvalChecklist: draft.approvalChecklist,
    targetCount: draft.targetCount,
    targetNames: draft.targetNames,
    modelId: draft.modelId,
  };
}

function toSafeGrowthPlan(plan: {
  title: string;
  objective: string;
  strategySummary: string;
  durationDays: number;
  postsPerDay: number;
  timezone: string;
  approvalChecklist: string[];
  targetCount: number;
  targetNames: string[];
  productNames: string[];
  items: Array<{
    id: string;
    day: number;
    slot: number;
    type: string;
    title: string;
    text: string;
    scheduledFor: string;
    targetIds: string[];
    productIds: string[];
    pollChoices: string[];
    buttonLabel: string | null;
  }>;
  modelId: string;
}) {
  return {
    title: plan.title,
    objective: plan.objective,
    strategySummary: plan.strategySummary,
    durationDays: plan.durationDays,
    postsPerDay: plan.postsPerDay,
    timezone: plan.timezone,
    approvalChecklist: plan.approvalChecklist,
    targetCount: plan.targetCount,
    targetNames: plan.targetNames,
    productNames: plan.productNames,
    items: plan.items,
    modelId: plan.modelId,
  };
}
