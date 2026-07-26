import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = readRecord(await request.json().catch(() => null));
  const action = readString(body.action);

  try {
    if (action === "change_password") {
      return await changePassword(supabase, {
        userId: user.id,
        password: readString(body.password),
      });
    }

    if (action === "change_email") {
      return await changeEmail(supabase, {
        currentEmail: user.email ?? null,
        userId: user.id,
        email: readString(body.email),
      });
    }

    return NextResponse.json({ error: "Acao invalida." }, { status: 422 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel atualizar a seguranca da conta." },
      { status: 422 },
    );
  }
}

async function changePassword(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    userId: string;
    password: string | null;
  },
) {
  const password = input.password ?? "";

  if (password.length < 6) {
    return NextResponse.json({ error: "A senha precisa ter no minimo 6 caracteres." }, { status: 422 });
  }

  if (password.length > 128) {
    return NextResponse.json({ error: "Senha muito longa." }, { status: 422 });
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    throw new Error(error.message);
  }

  await auditSecurityEvent(input.userId, "profile.password_updated", {});

  return NextResponse.json({
    message: "Senha atualizada.",
  });
}

async function changeEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    currentEmail: string | null;
    userId: string;
    email: string | null;
  },
) {
  const email = normalizeEmail(input.email);

  if (!email) {
    return NextResponse.json({ error: "Informe um email valido." }, { status: 422 });
  }

  if (input.currentEmail?.toLowerCase() === email.toLowerCase()) {
    return NextResponse.json({ error: "Este email ja esta na sua conta." }, { status: 422 });
  }

  const { data, error } = await supabase.auth.updateUser({ email });

  if (error) {
    throw new Error(error.message);
  }

  const emailChangedImmediately = data.user?.email?.toLowerCase() === email.toLowerCase();

  if (emailChangedImmediately) {
    const service = createServiceClient();

    await service
      .from("profiles")
      .update({
        email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.userId);
  }

  await auditSecurityEvent(input.userId, "profile.email_change_requested", {
    changedImmediately: emailChangedImmediately,
    nextEmailPreview: maskEmail(email),
  });

  return NextResponse.json({
    email,
    emailChangedImmediately,
    message: emailChangedImmediately
      ? "Email atualizado."
      : "Enviamos uma confirmacao para o novo email.",
  });
}

async function auditSecurityEvent(userId: string, eventType: string, metadata: JsonRecord) {
  const service = createServiceClient();

  await service.from("maintenance_audit_logs").insert({
    actor_id: userId,
    event_type: eventType,
    target_table: "profiles",
    target_id: userId,
    metadata,
  }).then(undefined, () => null);
}

function normalizeEmail(value: string | null) {
  const email = value?.trim().toLowerCase();

  if (!email || email.length > 254) {
    return null;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function maskEmail(value: string) {
  const [name, domain] = value.split("@");
  const prefix = name.slice(0, 2);

  return `${prefix}${name.length > 2 ? "***" : "*"}@${domain}`;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
