import { createClient as createAuthClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { isSameOriginRequest, issueAdminAssistedAccess, revokeAdminAssistedAccess, verifiedAuthSession } from "@/lib/admin-assisted-access";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;
  const originator = await verifiedAuthSession(auth.supabase);
  if (!originator || originator.userId !== auth.userId) return NextResponse.json({ error: "Sessão administrativa obrigatória." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.userId !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.userId) || body.userId === auth.userId) {
    return NextResponse.json({ error: "Selecione um cliente." }, { status: 400 });
  }
  const service = createServiceClient();
  const { data: profile, error: profileError } = await service.from("profiles").select("is_platform_admin").eq("id", body.userId).single();
  // Match getCurrentWorkspace's actual primary membership, not a caller-supplied tenant.
  const { data: memberships, error: membershipError } = await service.from("organization_members")
    .select("organizations(id,plan_code,slug)").eq("user_id", body.userId).order("created_at", { ascending: true }).limit(50);
  const organizations = (memberships ?? []).flatMap((row) => row.organizations ? [Array.isArray(row.organizations) ? row.organizations[0] : row.organizations] : []);
  const organization = organizations[0];
  if (profileError || membershipError || !profile || profile.is_platform_admin || !organization || organization.plan_code === "internal" || organization.slug === "connectyhub-platform-whatsapp") {
    return NextResponse.json({ error: "Acesso assistido exige um usuário de organização cliente." }, { status: 403 });
  }
  const { data: target, error: targetError } = await service.auth.admin.getUserById(body.userId);
  if (targetError || !target.user?.email) return NextResponse.json({ error: "Cliente indisponível." }, { status: 403 });
  // A separate Auth client establishes a fresh target session without replacing
  // the operator's cookies until the durable assisted record is ready.
  const env = getSupabasePublicEnv();
  const targetAuth = createAuthClient(env.url, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  try {
    const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email: target.user.email });
    if (linkError || !link.properties?.hashed_token) throw new Error("ASSISTED_LINK_UNAVAILABLE");
    const { data: login, error: loginError } = await targetAuth.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (loginError || !login.session || login.user?.id !== body.userId) throw new Error("ASSISTED_LOGIN_UNAVAILABLE");
    const targetSession = await verifiedAuthSession(targetAuth);
    if (!targetSession || targetSession.userId !== body.userId) throw new Error("ASSISTED_TARGET_UNAVAILABLE");
    await issueAdminAssistedAccess(service, {
      adminUserId: originator.userId, adminSessionId: originator.sessionId, targetUserId: targetSession.userId,
      targetSessionId: targetSession.sessionId, organizationId: organization.id,
    });
    const { error: switchError } = await auth.supabase.auth.setSession({ access_token: login.session.access_token, refresh_token: login.session.refresh_token });
    if (switchError) throw new Error("ASSISTED_SWITCH_UNAVAILABLE");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    await targetAuth.auth.signOut({ scope: "local" }).catch(() => null);
    await revokeAdminAssistedAccess().catch(() => null);
    return NextResponse.json({ error: "Não foi possível iniciar o acesso assistido. Tente novamente pelo painel administrativo." }, { status: 503 });
  }
}
