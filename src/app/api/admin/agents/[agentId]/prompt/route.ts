import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";

export const runtime = "nodejs";

const maxPromptLength = 24000;

type AgentPromptRow = {
  id: string;
  name: string;
  persona_name: string | null;
  prompt: string | null;
  metadata: Record<string, unknown> | null;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ agentId: string }> },
) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const { agentId } = await context.params;
  const body = await readJson(request);
  const parsed = parsePromptInput(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data: agent, error: lookupError } = await auth.supabase
    .from("agent_registry")
    .select("id, name, persona_name, prompt, metadata")
    .eq("id", agentId)
    .maybeSingle<AgentPromptRow>();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  if (!agent) {
    return NextResponse.json({ error: "Agente nao encontrado." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const metadata = normalizeMetadata(agent.metadata);
  const nextMetadata = {
    ...metadata,
    prompt_control: {
      last_updated_at: now,
      last_updated_by: auth.userId,
      previous_length: agent.prompt?.length ?? 0,
      current_length: parsed.prompt.length,
    },
  };

  const { error: updateError } = await auth.supabase
    .from("agent_registry")
    .update({
      prompt: parsed.prompt,
      metadata: nextMetadata,
    })
    .eq("id", agent.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await auth.supabase.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "agent.prompt_updated",
    target_table: "agent_registry",
    target_id: agent.id,
    metadata: {
      agentId: agent.id,
      personaName: agent.persona_name?.trim() || agent.name,
      previousLength: agent.prompt?.length ?? 0,
      currentLength: parsed.prompt.length,
    },
  });

  revalidatePath("/admin/agentes");
  revalidatePath("/admin/conteudo");
  revalidatePath("/admin/inteligencia");
  revalidatePath("/admin/instancias");
  revalidatePath("/admin/clientes/whatsapp");
  revalidatePath("/admin/whatsapp/atendimento");

  return NextResponse.json({
    prompt: parsed.prompt,
    promptPreview: previewPrompt(parsed.prompt),
    updatedAt: now,
  });
}

async function readJson(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

type ParsedPromptInput =
  | { ok: true; prompt: string }
  | { ok: false; error: string };

function parsePromptInput(body: unknown): ParsedPromptInput {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Payload invalido." };
  }

  const prompt = typeof (body as { prompt?: unknown }).prompt === "string"
    ? (body as { prompt: string }).prompt.trim()
    : "";

  if (!prompt) {
    return { ok: false, error: "O prompt do agente nao pode ficar vazio." };
  }

  if (prompt.length > maxPromptLength) {
    return { ok: false, error: `O prompt pode ter no maximo ${maxPromptLength} caracteres.` };
  }

  return { ok: true, prompt };
}

function normalizeMetadata(value: Record<string, unknown> | null) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value;
}

function previewPrompt(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}
