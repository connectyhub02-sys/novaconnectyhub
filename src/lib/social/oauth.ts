import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createMetaOAuthState, hashMetaOAuthState, matchesMetaOAuthCookie, META_OAUTH_STATE_TTL_SECONDS } from "@/lib/meta/oauth-state";
import { getAppBaseUrl } from "@/lib/client-os/guided-oauth";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { isSameOriginRequest } from "@/lib/security/same-origin-request";
import { socialAccess, SocialAccessError } from "./access";
import { isSocialProvider, socialPath, type SocialProvider, type SocialShell } from "./policy";
import { loadSocialConfig, socialAuthorizationUrl, exchangeSocialTokens, readSocialAccounts } from "./providers";
import { changeSocialConnection, saveSocialConnection } from "./connections";

function socialCookie(provider: SocialProvider) {
  const secure = new URL(getAppBaseUrl()).protocol === "https:";
  return { name: `${secure ? "__Host-" : ""}social-oauth-${provider}`, httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: META_OAUTH_STATE_TTL_SECONDS };
}
export function socialFailure(error: unknown) {
  const status = error instanceof SocialAccessError ? error.status : 400;
  return NextResponse.json({ error: error instanceof Error ? error.message : "Operação indisponível." }, { status, headers: { "Cache-Control": "no-store" } });
}
export async function socialAction(request: NextRequest, providerName: string) {
  if (!isSocialProvider(providerName)) return NextResponse.json({ error: "Rede inválida." }, { status: 404 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const guard = validatePublicWriteRequest({ headers: request.headers, requestUrl: request.url, routeKey: "social-connections", maxPayloadBytes: 4096, rateLimit: { limit: 15, windowMs: 60000 } });
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });
  try {
    const raw = await request.text();
    if (raw.length > 4096) throw Error("Solicitação muito grande.");
    const body = JSON.parse(raw);
    if (!["client", "admin"].includes(body.shell) || (body.companyId !== undefined && typeof body.companyId !== "string")) throw Error("Painel inválido.");
    const access = await socialAccess(body.shell, body.companyId, true);
    if (body.action === "connect") {
      const config = await loadSocialConfig(providerName, access.client);
      if (!config) throw Error("Esta conexão ainda está em preparação. O administrador precisa configurar o aplicativo.");
      const state = createMetaOAuthState();
      // Only a hash persists. The independent browser cookie binds this authorization to this browser.
      const saved = await access.client.from("social_oauth_attempts").upsert({ organization_id: access.organizationId, provider: providerName,
        user_id: access.workspace.user.id, state_hash: hashMetaOAuthState(state), shell: body.shell, consumed_at: null,
        expires_at: new Date(Date.now() + META_OAUTH_STATE_TTL_SECONDS * 1000).toISOString() }, { onConflict: "organization_id,provider" });
      if (saved.error) throw Error("Não foi possível iniciar a conexão. Confira a preparação do banco.");
      await access.client.from("social_oauth_attempts").delete().lt("expires_at", new Date().toISOString());
      const response = NextResponse.json({ url: socialAuthorizationUrl(config, state) }, { headers: { "Cache-Control": "no-store" } });
      response.cookies.set({ ...socialCookie(providerName), value: state });
      return response;
    }
    if (!["select", "check", "disconnect"].includes(body.action)) throw Error("Ação inválida.");
    if (body.action === "select" && (typeof body.accountId !== "string" || body.accountId.length > 200)) throw Error("Conta inválida.");
    return NextResponse.json(await changeSocialConnection(access.client, access.organizationId, providerName, body.action, body.accountId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return socialFailure(error); }
}
export async function socialCallback(request: NextRequest, providerName: string) {
  if (!isSocialProvider(providerName)) return NextResponse.json({ error: "Rede inválida." }, { status: 404 });
  let shell: SocialShell = "client";
  let outcome = "error";
  const cookie = socialCookie(providerName);
  try {
    const state = request.nextUrl.searchParams.get("state") ?? undefined;
    if (!matchesMetaOAuthCookie(state, request.cookies.get(cookie.name)?.value)) throw Error("Estado inválido.");
    // Authenticate before querying/consuming any authorization attempt.
    const { getCurrentWorkspace } = await import("@/lib/supabase/profile");
    const workspace = await getCurrentWorkspace();
    if (!workspace) throw Error("Sessão expirada.");
    const { createServiceClient } = await import("@/lib/supabase/service");
    const client = createServiceClient();
    const attempt = await client.from("social_oauth_attempts").select("organization_id,shell").eq("provider", providerName)
      .eq("state_hash", hashMetaOAuthState(state!)).eq("user_id", workspace.user.id).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (attempt.error || !attempt.data) throw Error("Autorização expirada.");
    shell = attempt.data.shell;
    const access = await socialAccess(shell, attempt.data.organization_id, true);
    const consumed = await client.from("social_oauth_attempts").update({ consumed_at: new Date().toISOString() }).eq("provider", providerName).eq("organization_id", access.organizationId)
      .eq("state_hash", hashMetaOAuthState(state!)).eq("user_id", workspace.user.id).is("consumed_at", null).gt("expires_at", new Date().toISOString()).select("organization_id").maybeSingle();
    if (consumed.error || !consumed.data) throw Error("Autorização já utilizada.");
    const code = request.nextUrl.searchParams.get("code");
    if (request.nextUrl.searchParams.has("error")) { outcome = "cancelled"; }
    else {
      if (!code || code.length > 4096) throw Error("Código inválido.");
      const config = await loadSocialConfig(providerName, client);
      if (!config) throw Error("Configuração indisponível.");
      const tokens = await exchangeSocialTokens(config, code);
      const accounts = await readSocialAccounts(providerName, tokens);
      await saveSocialConnection(client, access.organizationId, workspace.user.id, providerName, hashMetaOAuthState(state!), tokens, accounts);
      outcome = "connected";
    }
  } catch { /* Never expose codes, tokens or provider payloads in redirects or logs. */ }
  const url = new URL(socialPath(shell, "contas"), getAppBaseUrl());
  url.searchParams.set("connection", outcome);
  const response = NextResponse.redirect(url);
  response.cookies.set({ ...cookie, value: "", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
