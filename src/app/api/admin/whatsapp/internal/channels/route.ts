import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformWhatsappSector } from "@/lib/admin/platform-whatsapp-console";
import { meterGeminiGenerationUsage } from "@/lib/billing/gemini-metering";
import { inngest } from "@/lib/inngest/client";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  fetchWhatsappCampaignFolders,
  fetchWhatsappGroups,
  fetchWhatsappMessageLimits,
  fetchWhatsappNewsletters,
  generateWhatsappGrowthCampaignPlan,
  generateWhatsappStatusDraft,
  generateWhatsappTargetCampaignDraft,
  getWhatsappOperationsDashboard,
  probeWhatsappLeadStatusWatch,
  queueWhatsappGrowthCampaignPlan,
  queueWhatsappGroupWindow,
  queueWhatsappNewsletterText,
  queueWhatsappSimpleCampaign,
  queueWhatsappStatusBroadcast,
  queueWhatsappTargetCarouselCampaign,
  queueWhatsappTargetPollCampaign,
  queueWhatsappTargetTextCampaign,
  resolvePlatformWhatsappOperationalContext,
  syncWhatsappCampaignTracking,
  syncWhatsappGroupIntelligence,
  type WhatsappOutboundItem,
  updateWhatsappChannelTargetSettings,
} from "@/lib/whatsapp/channel-operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ChannelActionBody = {
  action?: unknown;
  sectorId?: unknown;
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
};

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const sectorId = asString(request.nextUrl.searchParams.get("sectorId"));

  if (!sectorId) {
    return NextResponse.json({ error: "Escolha um setor da ConnectyHub." }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const sector = await requirePlatformWhatsappSector(client, sectorId);
    const whatsapp = await resolvePlatformWhatsappOperationalContext(client, sector.id);

    return NextResponse.json({
      operations: await getWhatsappOperationsDashboard(client, whatsapp),
    });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await readJson<ChannelActionBody>(request);
  const sectorId = asString(body?.sectorId);

  if (!sectorId) {
    return NextResponse.json({ error: "Escolha um setor da ConnectyHub." }, { status: 422 });
  }

  const action = asString(body?.action) ?? "";

  try {
    const client = createServiceClient();
    const sector = await requirePlatformWhatsappSector(client, sectorId);
    const whatsapp = await resolvePlatformWhatsappOperationalContext(client, sector.id);
    let result: unknown;
    let notice = "Operacao concluida.";

    if (action === "refresh_groups") {
      result = await fetchWhatsappGroups(whatsapp);
      notice = "Grupos carregados da Uazapi.";
    } else if (action === "refresh_newsletters") {
      result = await fetchWhatsappNewsletters(whatsapp);
      notice = "Canais/newsletters carregados da Uazapi.";
    } else if (action === "message_limits") {
      result = await fetchWhatsappMessageLimits(whatsapp);
      notice = "Limites de mensagens consultados.";
    } else if (action === "campaign_folders") {
      result = await fetchWhatsappCampaignFolders(whatsapp);
      notice = "Pastas de campanha consultadas.";
    } else if (action === "sync_campaign_tracking") {
      result = await syncWhatsappCampaignTracking(client, whatsapp);
      notice = "Rastreamento interno de campanhas atualizado pela Uazapi.";
    } else if (action === "sync_group_intelligence") {
      result = await syncWhatsappGroupIntelligence(client, whatsapp);
      notice = "Detalhes internos dos grupos atualizados pela Uazapi.";
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
      notice = "Status interno agendado pelo Inngest.";
    } else if (action === "send_campaign") {
      const item = await queueWhatsappSimpleCampaign(client, whatsapp, {
        title: asString(body?.title) ?? "",
        text: asString(body?.text) ?? "",
        numbers: readStringList(body?.numbers),
        scheduledFor: asString(body?.scheduledFor),
      });
      await dispatchOutboundIfDue(item);
      result = { item };
      notice = "Campanha interna agendada pelo Inngest.";
    } else if (action === "post_newsletter") {
      const item = await queueWhatsappNewsletterText(client, whatsapp, {
        jid: asString(body?.jid) ?? "",
        text: asString(body?.text) ?? "",
        scheduledFor: asString(body?.scheduledFor),
      });
      await dispatchOutboundIfDue(item);
      result = { item };
      notice = "Post interno no canal/newsletter agendado pelo Inngest.";
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
        featureCode: "whatsapp_campaign_ai_draft",
        modelId: draft.modelId,
        agentScope: "platform",
        billingMode: "internal_shadow",
        promptText: [draft.systemInstruction, draft.prompt],
        outputText: draft.text,
        responseData: draft.responseData,
        debitDescription: "Rascunho IA de campanha WhatsApp interna",
        metadata: {
          source: "admin_whatsapp_channels",
          sectorId: sector.id,
          sectorCode: sector.sector_code,
          targetCount: draft.targetCount,
        },
      }).catch(() => null);
      result = { draft: toSafeCampaignDraft(draft) };
      notice = "Rascunho IA interno criado. Revise e clique em Agendar post para aprovar.";
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
      });
      await meterGeminiGenerationUsage({
        client,
        featureCode: "whatsapp_growth_plan_ai",
        modelId: plan.modelId,
        agentScope: "platform",
        billingMode: "internal_shadow",
        promptText: [plan.systemInstruction, plan.prompt],
        outputText: plan.items.map((item) => item.text).join("\n\n"),
        responseData: plan.responseData,
        debitDescription: "Plano IA de rotina WhatsApp interna",
        metadata: {
          source: "admin_whatsapp_automations",
          sectorId: sector.id,
          sectorCode: sector.sector_code,
          targetCount: plan.targetCount,
          itemCount: plan.items.length,
        },
      }).catch(() => null);
      result = { growthPlan: toSafeGrowthPlan(plan) };
      notice = "Rotina IA interna criada. Revise os posts e agende o plano quando estiver pronto.";
    } else if (action === "generate_status_draft") {
      const draft = await generateWhatsappStatusDraft(client, whatsapp, {
        brief: asString(body?.brief),
        currentText: asString(body?.currentText),
        catalogItemIds: readStringList(body?.catalogItemIds),
      });
      await meterGeminiGenerationUsage({
        client,
        featureCode: "whatsapp_status_ai_draft",
        modelId: draft.modelId,
        agentScope: "platform",
        billingMode: "internal_shadow",
        promptText: [draft.systemInstruction, draft.prompt],
        outputText: draft.text,
        responseData: draft.responseData,
        debitDescription: "Rascunho IA de status WhatsApp interno",
        metadata: {
          source: "admin_whatsapp_automations",
          sectorId: sector.id,
          sectorCode: sector.sector_code,
          productNames: draft.productNames,
        },
      }).catch(() => null);
      result = { draft: toSafeStatusDraft(draft) };
      notice = "Status IA interno criado. Revise o texto e publique quando estiver pronto.";
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
      notice = "Campanha interna para grupos/canais agendada pelo Inngest.";
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
      notice = "Carrossel interno de produtos agendado pelo Inngest.";
    } else if (action === "schedule_growth_plan") {
      const queued = await queueWhatsappGrowthCampaignPlan(client, whatsapp, {
        planItems: body?.planItems,
        targetIds: readStringList(body?.targetIds),
        catalogItemIds: readStringList(body?.catalogItemIds),
        mentionAll: asBoolean(body?.mentionAll),
        buttonLabel: asString(body?.buttonLabel),
      });
      for (const item of queued.items) {
        await dispatchOutboundIfDue(item);
      }
      result = queued;
      notice = `${queued.count} post(s) da rotina IA interna foram agendados.`;
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
      notice = "Enquete interna para grupos agendada pelo Inngest.";
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
      notice = "Janela interna do grupo agendada com abertura, aviso e fechamento.";
    } else if (action === "probe_lead_status_watch") {
      result = { probe: await probeWhatsappLeadStatusWatch(whatsapp) };
      notice = "Teste experimental de status dos leads concluido.";
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
      notice = "Regra interna do grupo/canal salva.";
    } else {
      return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
    }

    return NextResponse.json({
      operations: await getWhatsappOperationsDashboard(client, whatsapp),
      result,
      notice: { tone: "success", message: notice },
    });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 400 });
  }
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
    error: error instanceof Error ? error.message : "Erro inesperado nos recursos do WhatsApp interno.",
  };
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
