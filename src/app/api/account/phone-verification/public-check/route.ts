import { NextResponse, type NextRequest } from "next/server";
import { checkPhoneWhatsappAvailability } from "@/lib/account/signup-completion";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const guard = validatePublicWriteRequest({
    headers: request.headers,
    requestUrl: request.url,
    routeKey: "account_phone_public_check",
    maxPayloadBytes: 1024,
    rateLimit: {
      limit: 12,
      windowMs: 60_000,
    },
  });

  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.message },
      {
        status: guard.status,
        headers: guard.retryAfterSeconds ? { "Retry-After": String(guard.retryAfterSeconds) } : undefined,
      },
    );
  }

  const body = readRecord(await request.json().catch(() => null));
  const phone = readString(body.phone);

  if (!phone) {
    return NextResponse.json({ error: "Informe seu WhatsApp para validar." }, { status: 422 });
  }

  try {
    const result = await checkPhoneWhatsappAvailability({
      phone,
      client: createServiceClient(),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: formatWhatsappCheckError(error) },
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

function formatWhatsappCheckError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();

  if (normalized.includes("missing numbers")) {
    return "Nao foi possivel validar o WhatsApp. Revise o numero e tente novamente.";
  }

  if (normalized.includes("not connected") || normalized.includes("no active session")) {
    return "WhatsApp do agente de validacao nao esta conectado no momento.";
  }

  if (message.trim()) {
    return message;
  }

  return "Nao foi possivel validar o WhatsApp.";
}
