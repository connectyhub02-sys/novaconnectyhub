import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

type JsonRecord = Record<string, unknown>;

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
    .select("id, organization_id, metadata")
    .eq("id", conversationId)
    .eq("organization_id", workspace.organization.id)
    .maybeSingle<{ id: string; organization_id: string; metadata: JsonRecord | null }>();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversa nao encontrada nesta empresa." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const metadata = readRecord(conversation.metadata) ?? {};
  const currentHuman = readRecord(metadata.human_intervention) ?? {};
  const minutes = clampMinutes(body?.minutes);
  const pausedUntil = action === "pause"
    ? new Date(Date.now() + minutes * 60 * 1000).toISOString()
    : null;
  const humanIntervention = action === "pause"
    ? {
        ...currentHuman,
        active: true,
        reason: "manual_dashboard_handoff",
        source: "connectyhub_dashboard",
        paused_until: pausedUntil,
        updated_at: now,
      }
    : {
        ...currentHuman,
        active: false,
        reason: "manual_dashboard_resume",
        source: "connectyhub_dashboard",
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

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function clampMinutes(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return 60;
  }

  return Math.max(5, Math.min(1440, Math.round(numeric)));
}
