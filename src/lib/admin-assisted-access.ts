import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { CurrentWorkspace } from "@/lib/supabase/profile";

export const ASSISTED_COOKIE = process.env.NODE_ENV === "production" ? "__Host-connectyhub-assisted" : "connectyhub-assisted";
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" };
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export const hashAssistedToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Decode only the exact token just verified by Auth, never request claims or metadata.
export async function verifiedAuthSession(client: SupabaseClient) {
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session) return null;
  const { data: { user }, error: userError } = await client.auth.getUser(session.access_token);
  if (userError || !user) return null;
  try {
    const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString());
    if (claims.sub !== user.id || !uuid.test(claims.session_id ?? "") || !(claims.exp * 1000 > Date.now())) return null;
    return { userId: user.id, sessionId: claims.session_id as string };
  } catch { return null; }
}

export type AssistedAccess = { tokenHash: string; targetSessionId: string; targetUserId: string; adminUserId: string; expiresAt: string };
export async function getAdminAssistedAccess(workspace: CurrentWorkspace): Promise<AssistedAccess | null> {
  if (!workspace.organization || workspace.profile.isPlatformAdmin || workspace.organization.planCode === "internal") return null;
  const token = (await cookies()).get(ASSISTED_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await verifiedAuthSession(await createClient());
  if (!session || session.userId !== workspace.user.id) return null;
  const tokenHash = hashAssistedToken(token);
  const { data, error } = await createServiceClient().rpc("check_admin_assisted_session", {
    p_token_hash: tokenHash, p_target_session_id: session.sessionId,
    p_target_user_id: session.userId, p_organization_id: workspace.organization.id,
  });
  if (error) throw new Error("ASSISTED_ACCESS_UNAVAILABLE");
  if (!data?.adminUserId || !data?.expiresAt) return null;
  return { tokenHash, targetSessionId: session.sessionId, targetUserId: session.userId, adminUserId: data.adminUserId, expiresAt: data.expiresAt };
}

export async function revokeAdminAssistedAccess() {
  const store = await cookies();
  const token = store.get(ASSISTED_COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const { error } = await createServiceClient().from("admin_assisted_sessions")
      .update({ revoked_at: new Date().toISOString() }).eq("token_hash", hashAssistedToken(token)).is("revoked_at", null);
    if (error) throw new Error("ASSISTED_REVOCATION_UNAVAILABLE");
  }
  store.set(ASSISTED_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

export async function issueAdminAssistedAccess(client: SupabaseClient, input: {
  adminUserId: string; adminSessionId: string; targetUserId: string; targetSessionId: string; organizationId: string;
}) {
  await revokeAdminAssistedAccess();
  const token = randomBytes(32).toString("hex");
  const { error } = await client.from("admin_assisted_sessions").insert({
    token_hash: hashAssistedToken(token), admin_user_id: input.adminUserId, admin_session_id: input.adminSessionId,
    target_user_id: input.targetUserId, target_session_id: input.targetSessionId, organization_id: input.organizationId,
  });
  if (error) throw new Error("ASSISTED_ISSUE_UNAVAILABLE");
  const checked = await client.rpc("check_admin_assisted_session", {
    p_token_hash: hashAssistedToken(token), p_target_session_id: input.targetSessionId,
    p_target_user_id: input.targetUserId, p_organization_id: input.organizationId,
  });
  if (checked.error || checked.data?.adminUserId !== input.adminUserId) {
    await client.from("admin_assisted_sessions").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hashAssistedToken(token));
    throw new Error("ASSISTED_ISSUE_DENIED");
  }
  (await cookies()).set(ASSISTED_COOKIE, token, { ...cookieOptions, maxAge: 30 * 60 });
}

export function isSameOriginRequest(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
