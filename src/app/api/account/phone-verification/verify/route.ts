import { NextResponse, type NextRequest } from "next/server";
import { ensureTrialForCompletedSignup, verifyPhoneCompletionCode } from "@/lib/account/signup-completion";
import { ensureStarterOrganization, getCurrentWorkspace } from "@/lib/supabase/profile";
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
  const code = readString(body.code);

  if (!code) {
    return NextResponse.json({ error: "Informe o codigo recebido no WhatsApp." }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const accountCompletion = await verifyPhoneCompletionCode({
      userId: workspace.user.id,
      code,
      client,
    });

    if (accountCompletion.isComplete) {
      await ensureStarterOrganization();
      await ensureTrialForCompletedSignup({ userId: workspace.user.id, client }).catch(() => null);
    }

    const avatarUrl = await loadAuthAvatarUrl(client, workspace.user.id);

    return NextResponse.json({ accountCompletion, avatarUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel validar o codigo." },
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

async function loadAuthAvatarUrl(client: ReturnType<typeof createServiceClient>, userId: string) {
  const { data, error } = await client.auth.admin.getUserById(userId);

  if (error || !data.user) {
    return null;
  }

  const metadata = readRecord(data.user.user_metadata);
  const value = readString(metadata.avatar_url) ?? readString(metadata.picture);

  return value && /^https?:\/\//i.test(value) ? value : null;
}
