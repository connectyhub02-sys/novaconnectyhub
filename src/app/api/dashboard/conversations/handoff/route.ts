import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import {
  HUMAN_INTERVENTION_DEFAULT_MINUTES,
  cancelQueuedWhatsappRunsForConversation,
  resolveHumanInterventionMinutesForInstance,
} from "@/lib/whatsapp/human-intervention";

type JsonRecord = Record<string, unknown>;

type ConversationRow = {
  id: string;
  organization_id: string;
  whatsapp_instance_id: string | null;
  metadata: JsonRecord | null;
};

type WhatsappInstanceRow = {
  metadata: JsonRecord | null;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  if (!workspace.organization?.id) {
    return NextResponse.json({ error: "Empresa obrigatoria." }, { status: 400 });
  }

  const body = await readJson<{
    action?: unknown;
    conversationId?: unknown;
    minutes?: unknown;
  }>(request);
  const action = body?.action === "pause" || body?.action === "resume" ? body.action : null;
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";

  if (!action || !conversationId) {
    return NextResponse.json({ error: "Acao ou conversa invalida." }, { status: 400 });
  }

  const client = createServiceClient();
  const { data: conversation, error: loadError } = await client
    .from("conversations")
    .select("id, organization_id, whatsapp_instance_id, metadata")
    .eq("id", conversationId)
    .eq("organization_id", workspace.organization.id)
    .maybeSingle<ConversationRow>();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversa nao encontrada nesta empresa." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const metadata = readRecord(conversation.metadata) ?? {};
  const currentHuman = readRecord(metadata.human_intervention) ?? {};
  const minutes = action === "pause"
    ? await resolveConversationHumanInterventionMinutes({
        client,
        organizationId: workspace.organization.id,
        whatsappInstanceId: conversation.whatsapp_instance_id,
      })
    : HUMAN_INTERVENTION_DEFAULT_MINUTES;
  const pausedUntil = action === "pause"
    ? new Date(Date.now() + minutes * 60 * 1000).toISOString()
    : null;
  const humanIntervention = action === "pause"
    ? {
        ...currentHuman,
        active: true,
        reason: "manual_dashboard_handoff",
        source: "connectyhub_dashboard",
        configured_minutes: minutes,
        lead_waiting_since: null,
        last_unanswered_lead_message_at: null,
        last_unanswered_lead_provider_message_id: null,
        auto_resume_reason: null,
        auto_resume_after: null,
        paused_until: pausedUntil,
        updated_at: now,
      }
    : {
        ...currentHuman,
        active: false,
        reason: "manual_dashboard_resume",
        source: "connectyhub_dashboard",
        lead_waiting_since: null,
        last_unanswered_lead_message_at: null,
        last_unanswered_lead_provider_message_id: null,
        auto_resume_reason: null,
        auto_resume_after: null,
        paused_until: null,
        updated_at: now,
      };

  const { error: updateError } = await client
    .from("conversations")
    .update({
      metadata: {
        ...metadata,
        human_intervention: humanIntervention,
      },
    })
    .eq("id", conversationId)
    .eq("organization_id", workspace.organization.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (action === "pause") {
    await cancelQueuedWhatsappRunsForConversation(
      client,
      conversationId,
      "Cancelado: conversa assumida pelo painel.",
    );
  }

  return NextResponse.json({
    ok: true,
    humanIntervention: {
      active: action === "pause",
      pausedUntil,
      reason: humanIntervention.reason,
      source: humanIntervention.source,
      updatedAt: now,
    },
  });
}

async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

async function resolveConversationHumanInterventionMinutes(input: {
  client: ReturnType<typeof createServiceClient>;
  organizationId: string;
  whatsappInstanceId: string | null;
}) {
  if (!input.whatsappInstanceId) {
    return HUMAN_INTERVENTION_DEFAULT_MINUTES;
  }

  const { data } = await input.client
    .from("whatsapp_instances")
    .select("metadata")
    .eq("id", input.whatsappInstanceId)
    .eq("organization_id", input.organizationId)
    .maybeSingle<WhatsappInstanceRow>();

  return await resolveHumanInterventionMinutesForInstance({
    client: input.client,
    organizationId: input.organizationId,
    instanceMetadata: readRecord(data?.metadata),
  });
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}
