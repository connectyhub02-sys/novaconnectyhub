import { resolveOrganizationId } from "@/lib/voice/internal-organization";
import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformWhatsappSector } from "@/lib/admin/platform-whatsapp-console";
import { getOrCreateGeminiVoicePreviewUrl } from "@/lib/gemini/voice-previews";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const sectorId = asString(request.nextUrl.searchParams.get("sectorId"));
  const voiceId = asString(request.nextUrl.searchParams.get("voiceId"));

  if (!sectorId || !voiceId) {
    return NextResponse.json({ error: "Informe o setor e a voz para ouvir a previa." }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const sector = await requirePlatformWhatsappSector(client, sectorId);
    const organizationId = await resolveOrganizationId(client, sector.id);
    const previewUrl = await getOrCreateGeminiVoicePreviewUrl({
      organizationId,
      userId: auth.userId,
      voiceId,
      client,
    });
    const response = NextResponse.redirect(previewUrl, 302);
    response.headers.set("Cache-Control", "private, max-age=3600");
    return response;
  } catch (error) {
    return NextResponse.json(formatError(error), { status: resolveErrorStatus(error) });
  }
}


function asString(value: string | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Nao foi possivel gerar a previa da voz.",
  };
}

function resolveErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("invalida") || message.startsWith("Informe ") ? 422 : 500;
}
