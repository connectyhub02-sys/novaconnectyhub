import { NextResponse, type NextRequest } from "next/server";
import { sendPhoneVerificationCode } from "@/lib/account/signup-completion";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = readRecord(await request.json().catch(() => null));
  const phone = readString(body.phone);

  if (!phone) {
    return NextResponse.json({ error: "Informe seu WhatsApp para receber o codigo." }, { status: 422 });
  }

  try {
    const result = await sendPhoneVerificationCode({
      userId: workspace.user.id,
      phone,
      client: createServiceClient(),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel enviar o codigo." },
      { status: 422 },
    );
  }
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
