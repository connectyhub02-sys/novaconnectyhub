import { NextResponse, type NextRequest } from "next/server";
import { getClientAgentsWorkspace, type ClientAgent } from "@/lib/client-os/agents";
import { meterGeminiGenerationUsage } from "@/lib/billing/gemini-metering";
import { assertBillableAccess, BillingAccessError } from "@/lib/billing/trial";
import { requireClientCompanyAccess, type ClientCompany } from "@/lib/client-os/companies";
import { inngest } from "@/lib/inngest/client";
import { getCurrentWorkspace, type CurrentOrganization } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import {
  fetchWhatsappCampaignFolders,
  fetchWhatsappGroups,
  fetchWhatsappMessageLimits,
  fetchWhatsappNewsletters,
  generateWhatsappTargetCampaignDraft,
  getWhatsappOperationsDashboard,
  queueWhatsappNewsletterText,
  queueWhatsappSimpleCampaign,
  queueWhatsappStatusBroadcast,
  queueWhatsappTargetTextCampaign,
  resolveClientWhatsappOperationalContext,
  type WhatsappOutboundItem,
  updateWhatsappChannelTargetSettings,
} from "@/lib/whatsapp/channel-operations";

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
  targetIds?: unknown;
  mentionAll?: unknown;
  recurrenceFrequency?: unknown;
  recurrenceOccurrences?: unknown;
  brief?: unknown;
  currentTitle?: unknown;
  currentText?: unknown;
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

    return NextResponse.json({
      operations: await getWhatsappOperationsDashboard(client, whatsapp),
    });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
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
    } else if (action === "send_status") {
      const item = await queueWhatsappStatusBroadcast(client, whatsapp, {
        text: asString(body?.text) ?? "",
        recipients: readStringList(body?.recipients),
        maxRecipients: asNumber(body?.maxRecipients),
        backgroundColor: asNumber(body?.backgroundColor),
        scheduledFor: asString(body?.scheduledFor),
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
      });
      await meterGeminiGenerationUsage({
        client,
        organizationId: context.organization.id,
        userId: context.userId,
        featureCode: "whatsapp_campaign_ai_draft",
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
    } else if (action === "send_target_campaign") {
      const item = await queueWhatsappTargetTextCampaign(client, whatsapp, {
        title: asString(body?.title) ?? "",
        text: asString(body?.text) ?? "",
        targetIds: readStringList(body?.targetIds),
        scheduledFor: asString(body?.scheduledFor),
        mentionAll: asBoolean(body?.mentionAll),
        recurrenceFrequency: asString(body?.recurrenceFrequency),
        recurrenceOccurrences: asNumber(body?.recurrenceOccurrences) ?? null,
      });
      await dispatchOutboundIfDue(item);
      result = { item };
      notice = "Campanha para grupos/canais agendada pelo Inngest.";
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

async function requireWorkspaceContext(
  requestedCompanyId: string | null,
  requestedAgentId: string | null,
  allowMissingCompany: boolean,
): Promise<WorkspaceContext | NextResponse | null> {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const { companies, agents } = await getClientAgentsWorkspace(workspace.user.id);

  if (companies.length === 0) {
    return allowMissingCompany ? null : NextResponse.json({ error: "Cadastre uma empresa antes de usar canais do WhatsApp." }, { status: 422 });
  }

  const selectedAgent = resolveSelectedAgent(agents, requestedAgentId, requestedCompanyId);

  if (requestedAgentId && !selectedAgent) {
    return NextResponse.json({ error: "Escolha um agente vinculado a sua conta." }, { status: 422 });
  }

  const companyId = selectedAgent?.companyId || requestedCompanyId || companies[0]?.id;

  if (!companyId) {
    return allowMissingCompany ? null : NextResponse.json({ error: "Escolha uma empresa." }, { status: 422 });
  }

  try {
    const organization = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
    });

    return {
      organization,
      userId: workspace.user.id,
      companies,
      agents,
      selectedAgentId: selectedAgent?.id ?? null,
    };
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 422 });
  }
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
