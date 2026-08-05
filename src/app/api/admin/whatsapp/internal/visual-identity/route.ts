import { NextResponse, type NextRequest } from "next/server";
import { getPlatformWhatsappConsoleState } from "@/lib/admin/platform-whatsapp-console";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  archiveAgentVisualIdentityReference,
  createAgentVisualIdentityReference,
  normalizeVisualIdentityContentType,
} from "@/lib/whatsapp/visual-identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const formData = await request.formData().catch(() => null);
  const sectorId = asString(formData?.get("sectorId"));
  const file = formData?.get("file");

  if (!sectorId) {
    return NextResponse.json({ error: "Escolha um setor antes de treinar identidade visual." }, { status: 422 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie uma imagem valida." }, { status: 400 });
  }

  try {
    const client = createServiceClient();
    const state = await getPlatformWhatsappConsoleState({
      sectorId,
      userId: auth.userId,
      client,
    });

    if (!state.agent) {
      return NextResponse.json({ error: "Crie o agente do setor antes de treinar identidade visual." }, { status: 422 });
    }

    const reference = await createAgentVisualIdentityReference({
      scope: "platform",
      organizationId: null,
      agentId: state.agent.id,
      whatsappInstanceId: state.instance?.id ?? null,
      userId: auth.userId,
      source: "admin_upload",
      fileName: file.name,
      contentType: normalizeVisualIdentityContentType(file.name, file.type),
      bytes: new Uint8Array(await file.arrayBuffer()),
      client,
    });
    const nextState = await getPlatformWhatsappConsoleState({
      sectorId,
      userId: auth.userId,
      client,
    });

    return NextResponse.json({
      reference,
      state: nextState,
      notice: { tone: "success", message: "Referencia visual interna enviada. O Inngest vai processar o treinamento." },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const sectorId = request.nextUrl.searchParams.get("sectorId");
  const referenceId = request.nextUrl.searchParams.get("referenceId");

  if (!sectorId) {
    return NextResponse.json({ error: "Escolha um setor antes de arquivar a referencia visual." }, { status: 422 });
  }

  if (!referenceId) {
    return NextResponse.json({ error: "Informe a referencia visual." }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const state = await getPlatformWhatsappConsoleState({
      sectorId,
      userId: auth.userId,
      client,
    });

    if (!state.agent) {
      return NextResponse.json({ error: "Agente nao encontrado." }, { status: 422 });
    }

    const reference = await archiveAgentVisualIdentityReference({
      scope: "platform",
      organizationId: null,
      agentId: state.agent.id,
      referenceId,
      client,
    });
    const nextState = await getPlatformWhatsappConsoleState({
      sectorId,
      userId: auth.userId,
      client,
    });

    return NextResponse.json({
      reference,
      state: nextState,
      notice: { tone: "success", message: "Referencia visual interna arquivada." },
    });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Erro inesperado na identidade visual.",
  };
}
