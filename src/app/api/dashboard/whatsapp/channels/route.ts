import { NextResponse, type NextRequest } from "next/server";
import { listClientCompanies, requireClientCompanyAccess, type ClientCompany } from "@/lib/client-os/companies";
import { inngest } from "@/lib/inngest/client";
import { getCurrentWorkspace, type CurrentOrganization } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import {
  fetchWhatsappCampaignFolders,
  fetchWhatsappGroups,
  fetchWhatsappMessageLimits,
  fetchWhatsappNewsletters,
  getWhatsappOperationsDashboard,
  queueWhatsappNewsletterText,
  queueWhatsappSimpleCampaign,
  queueWhatsappStatusBroadcast,
  resolveClientWhatsappOperationalContext,
  type WhatsappOutboundItem,
} from "@/lib/whatsapp/channel-operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WorkspaceContext = {
  organization: CurrentOrganization;
  userId: string;
  companies: ClientCompany[];
};

type ChannelActionBody = {
  action?: unknown;
  companyId?: unknown;
  text?: unknown;
  title?: unknown;
  numbers?: unknown;
  recipients?: unknown;
  jid?: unknown;
  scheduledFor?: unknown;
  maxRecipients?: unknown;
  backgroundColor?: unknown;
};

export async function GET(request: NextRequest) {
  const context = await requireWorkspaceContext(request.nextUrl.searchParams.get("companyId"), true);

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
    const whatsapp = await resolveClientWhatsappOperationalContext(client, context.organization.id);

    return NextResponse.json({
      operations: await getWhatsappOperationsDashboard(client, whatsapp),
    });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await readJson<ChannelActionBody>(request);
  const context = await requireWorkspaceContext(asString(body?.companyId), false);

  if (context instanceof NextResponse) {
    return context;
  }

  if (!context) {
    return NextResponse.json({ error: "Cadastre uma empresa antes de usar canais do WhatsApp." }, { status: 422 });
  }

  const action = asString(body?.action) ?? "";

  try {
    const client = createServiceClient();
    const whatsapp = await resolveClientWhatsappOperationalContext(client, context.organization.id);
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

async function requireWorkspaceContext(
  requestedCompanyId: string | null,
  allowMissingCompany: boolean,
): Promise<WorkspaceContext | NextResponse | null> {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const companies = await listClientCompanies(workspace.user.id);

  if (companies.length === 0) {
    return allowMissingCompany ? null : NextResponse.json({ error: "Cadastre uma empresa antes de usar canais do WhatsApp." }, { status: 422 });
  }

  const companyId = requestedCompanyId || companies[0]?.id;

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
    };
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 422 });
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

function formatError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Erro inesperado nos recursos do WhatsApp.",
  };
}
