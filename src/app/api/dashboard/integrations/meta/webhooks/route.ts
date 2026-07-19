import { NextResponse, type NextRequest } from "next/server";
import {
  activateClientMetaWebhookSubscription,
  simulateClientMetaWebhook,
} from "@/lib/meta/webhook-activation";
import {
  loadClientMetaWebhookMonitor,
  replayClientMetaWebhookEvent,
} from "@/lib/meta/webhook-monitor";
import { isMetaWebhookSimulationScenario } from "@/lib/meta/webhook-fixtures";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

export async function GET(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const companyId = request.nextUrl.searchParams.get("companyId")?.trim();

  if (!companyId) {
    return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    const monitor = await loadClientMetaWebhookMonitor({
      client,
      organizationId: companyId,
      userId: workspace.user.id,
    });

    return NextResponse.json({ monitor });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel carregar o monitor de webhooks Meta.",
    }, { status: readErrorStatus(error) });
  }
}

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson(request);
  const companyId = readString(body?.companyId);
  const action = readString(body?.action);

  if (!companyId) {
    return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    if (action === "subscribe_page") {
      const activation = await activateClientMetaWebhookSubscription({
        client,
        fields: body?.fields,
        organizationId: companyId,
        userId: workspace.user.id,
      });

      return NextResponse.json({ activation });
    }

    if (action === "simulate" || action === "simulate_webhook") {
      const scenario = body?.scenario;

      if (!isMetaWebhookSimulationScenario(scenario)) {
        return NextResponse.json({ error: "Informe um cenario de simulacao Meta valido." }, { status: 400 });
      }

      const simulation = await simulateClientMetaWebhook({
        client,
        organizationId: companyId,
        scenario,
        userId: workspace.user.id,
      });

      return NextResponse.json({ simulation });
    }

    if (action === "replay_event") {
      const eventId = readString(body?.eventId);

      if (!eventId) {
        return NextResponse.json({ error: "Informe o evento Meta para replay." }, { status: 400 });
      }

      const replay = await replayClientMetaWebhookEvent({
        client,
        eventId,
        organizationId: companyId,
        userId: workspace.user.id,
      });
      const monitor = await loadClientMetaWebhookMonitor({
        client,
        organizationId: companyId,
        userId: workspace.user.id,
      });

      return NextResponse.json({ replay, monitor });
    }

    return NextResponse.json({ error: "Acao de webhook Meta invalida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel executar a acao de webhook Meta.",
    }, { status: readErrorStatus(error) });
  }
}

async function readJson(request: NextRequest): Promise<JsonRecord | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
  } catch {
    return null;
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.startsWith("Somente dono ou admin")) {
    return 403;
  }

  return 400;
}
