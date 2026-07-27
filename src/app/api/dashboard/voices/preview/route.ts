import { NextResponse, type NextRequest } from "next/server";
import { assertBillableAccess, BillingAccessError } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { getOrCreateGeminiVoicePreviewUrl } from "@/lib/gemini/voice-previews";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const companyId = asString(request.nextUrl.searchParams.get("companyId"));
  const voiceId = asString(request.nextUrl.searchParams.get("voiceId"));

  if (!companyId || !voiceId) {
    return NextResponse.json({ error: "Informe a empresa e a voz para ouvir a previa." }, { status: 422 });
  }

  try {
    const organization = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
    });
    await assertBillableAccess({ organizationId: organization.id });
    const previewUrl = await getOrCreateGeminiVoicePreviewUrl({
      organizationId: organization.id,
      userId: workspace.user.id,
      voiceId,
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
    ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
  };
}

function resolveErrorStatus(error: unknown) {
  if (error instanceof BillingAccessError) {
    return 402;
  }

  const message = error instanceof Error ? error.message : "";
  return message.includes("invalida") || message.startsWith("Informe ") ? 422 : 500;
}
