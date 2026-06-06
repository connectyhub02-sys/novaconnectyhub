import "server-only";

import { NextResponse } from "next/server";
import { isSupabaseAuthConfigured } from "./env";
import { createClient } from "./server";

export async function requirePlatformAdmin() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Supabase Auth nao configurado." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle<{ is_platform_admin: boolean | null }>();

  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: "Apenas administradores da plataforma podem executar esta acao." }, { status: 403 });
  }

  return { supabase, userId: user.id };
}
