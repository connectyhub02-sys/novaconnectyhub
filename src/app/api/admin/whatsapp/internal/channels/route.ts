import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformWhatsappSector } from "@/lib/admin/platform-whatsapp-console";
import { inngest } from "@/lib/inngest/client";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
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
  resolvePlatformWhatsappOperationalContext,
  type WhatsappOutboundItem,
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

function formatError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Erro inesperado nos recursos do WhatsApp interno.",
  };
}
