import * as crypto from "node:crypto";
import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type { CurrentWorkspace } from "../src/lib/supabase/profile";
import type { AssistedAccess } from "../src/lib/admin-assisted-access";
const userId = crypto.randomUUID(), sessionId = crypto.randomUUID(), org = crypto.randomUUID();
const token = "b".repeat(64);
const workspace = { user: { id: userId }, profile: { id: userId, isPlatformAdmin: false }, organization: { id: org, planCode: "pro" } } as CurrentWorkspace;
function fixture(options: { cookie?: string | null; rejected?: boolean; claims?: Record<string, unknown>; data?: unknown; error?: unknown } = {}) {
  const jwt = "header." + Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId, exp: Date.now()/1000+300, ...options.claims })).toString("base64url") + ".signature";
  const session = { access_token: jwt };
  const auth = { getSession: vi.fn(async () => ({ data: { session }, error: null })), getUser: vi.fn(async () => ({ data: { user: options.rejected ? null : { id: userId } }, error: options.rejected ? new Error("bad signature") : null })) };
  const rpc = vi.fn(async () => ({ data: options.data === undefined ? { adminUserId: "operator", expiresAt: "2026-10-01T00:00:00Z" } : options.data, error: options.error }));
  const end = vi.fn(async () => ({error:null}));
  const update = vi.fn(() => ({ eq: () => ({is: end}) }));
  const set = vi.fn();
  const lib = serverModuleHarness<{ getAdminAssistedAccess(w: CurrentWorkspace): Promise<AssistedAccess|null>; revokeAdminAssistedAccess(): Promise<void> }>("src/lib/admin-assisted-access.ts", {
    "node:crypto": crypto,
    "next/headers": { cookies: async () => ({get: () => ({value: options.cookie === undefined ? token : options.cookie}),set}) },
    "@/lib/supabase/server": {createClient: async () => ({auth})},
    "@/lib/supabase/service": {createServiceClient: () => ({rpc,from: () => ({update})})},
  });
  return {lib,rpc,auth,set,update,end,jwt};
}
it("uses the verified exact Auth token and hashes the opaque HttpOnly cookie", async () => {
  const f=fixture();
  const result=await f.lib.getAdminAssistedAccess(workspace);
  expect(f.auth.getUser).toHaveBeenCalledWith(f.jwt);
  expect(f.rpc).toHaveBeenCalledWith("check_admin_assisted_session", {p_token_hash:crypto.createHash("sha256").update(token).digest("hex"),p_target_session_id:sessionId,p_target_user_id:userId,p_organization_id:org});
  expect(result).toMatchObject({adminUserId:"operator",targetSessionId:sessionId,targetUserId:userId});
});
it("ignores UI metadata and fails closed on missing cookie, invalid Auth, changed user and expired tokens", async () => {
  for (const options of [{cookie:null},{cookie:"forged"},{rejected:true},{claims:{session_id:"forged"}},{claims:{sub:"different"}},{claims:{exp:1}}]) {
    const f=fixture(options); expect(await f.lib.getAdminAssistedAccess(workspace)).toBeNull(); expect(f.rpc).not.toHaveBeenCalled();
  }
  const f=fixture(); expect(await f.lib.getAdminAssistedAccess({...workspace,user:{...workspace.user,id:"different"}})).toBeNull();
  expect(f.rpc).not.toHaveBeenCalled();
});
it("denies platform admin outside a client context and any server rejection", async () => {
  for (const w of [{...workspace,organization:null},{...workspace,profile:{...workspace.profile,isPlatformAdmin:true}},{...workspace,organization:{...workspace.organization!,planCode:"internal"}}]) {
    const f=fixture(); expect(await f.lib.getAdminAssistedAccess(w)).toBeNull(); expect(f.rpc).not.toHaveBeenCalled();
  }
  expect(await fixture({data:null}).lib.getAdminAssistedAccess(workspace)).toBeNull();
  await expect(fixture({error:new Error("offline")}).lib.getAdminAssistedAccess(workspace)).rejects.toThrow("ASSISTED_ACCESS_UNAVAILABLE");
});
it("revokes the persisted grant before clearing the browser cookie", async () => {
  const f=fixture(); await f.lib.revokeAdminAssistedAccess();
  expect(f.update).toHaveBeenCalled(); expect(f.end).toHaveBeenCalledWith("revoked_at",null);
  expect(f.set).toHaveBeenCalledWith(expect.any(String),"",expect.objectContaining({httpOnly:true,sameSite:"strict",path:"/",maxAge:0}));
});
