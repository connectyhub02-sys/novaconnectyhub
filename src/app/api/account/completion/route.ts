import { NextResponse, type NextRequest } from "next/server";
import {
  getAccountCompletionStatusForUser,
  saveAccountCompletionProfile,
} from "@/lib/account/signup-completion";
import { ensureStarterOrganization, getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function GET() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  try {
    const client = createServiceClient();
    const accountCompletion = await getAccountCompletionStatusForUser({
      userId: workspace.user.id,
      client,
    });

    return NextResponse.json({ accountCompletion });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel carregar o cadastro." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = readRecord(await request.json().catch(() => null));

  try {
    const client = createServiceClient();
    const accountCompletion = await saveAccountCompletionProfile({
      userId: workspace.user.id,
      fullName: readString(body.fullName),
      companyName: readString(body.companyName),
      accountType: readString(body.accountType),
      document: readString(body.document) ?? readString(body.cpf),
      documentType: readString(body.documentType),
      cpf: readString(body.cpf),
      passwordSet: body.passwordSet === true,
      source: "account_completion_modal",
      client,
    });

    if (accountCompletion.isComplete) {
      await ensureStarterOrganization();
    }

    return NextResponse.json({ accountCompletion });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel salvar o cadastro." },
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
