import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
const admin="00000000-0000-4000-8000-000000000001", target="00000000-0000-4000-8000-000000000002";
class JsonResponse extends Response { static json(body: unknown, init?: ResponseInit) { return new JsonResponse(JSON.stringify(body),init); } }
function fixture(options: {authDenied?: boolean; platformTarget?: boolean; internal?: boolean; issueFails?: boolean; switchFails?: boolean}={}) {
  const switchSession=vi.fn(async () => ({error:options.switchFails?new Error("switch"):null}));
  const source={auth:{setSession:switchSession}};
  const session={access_token:"target-access",refresh_token:"target-refresh"};
  const signOut=vi.fn(async () => ({}));
  const targetClient={auth:{verifyOtp:vi.fn(async () => ({data:{session,user:{id:target}},error:null})),signOut}};
  const generateLink=vi.fn(async () => ({data:{properties:{hashed_token:"one-time-hash"}},error:null}));
  const service = {
    auth: { admin: { getUserById: async () => ({ data: { user: { id: target, email: "test@example.invalid" } } }), generateLink } },
    from: (table: string) => ({ select: () => ({ eq: () => {
      if (table === "profiles") return { single: async () => ({ data: { is_platform_admin: options.platformTarget ?? false } }) };
      return { order: () => ({ limit: async () => ({ data: [{ organizations: { id: "server-org", plan_code: options.internal ? "internal" : "pro", slug: "customer" } }] }) }) };
    } }) }),
  };
  const issue=vi.fn(async () => {if(options.issueFails)throw new Error("issue");});
  const revoke=vi.fn(async () => {});
  const route=serverModuleHarness<{POST(r:Request):Promise<Response>}>("src/app/api/admin/users/assisted-access/route.ts",{
    "next/server":{NextResponse:JsonResponse},
    "@supabase/supabase-js":{createClient:()=>targetClient},
    "@/lib/supabase/admin-auth":{requirePlatformAdmin:async()=>options.authDenied?JsonResponse.json({}, {status:403}):{supabase:source,userId:admin}},
    "@/lib/supabase/service":{createServiceClient:()=>service},
    "@/lib/supabase/env":{getSupabasePublicEnv:()=>({url:"https://auth.invalid",publishableKey:"public"})},
    "@/lib/admin-assisted-access":{isSameOriginRequest:(r:Request)=>r.headers.get("origin")===new URL(r.url).origin,verifiedAuthSession:async (c:unknown)=>c===source?{userId:admin,sessionId:"origin-session"}:{userId:target,sessionId:"target-session"},issueAdminAssistedAccess:issue,revokeAdminAssistedAccess:revoke},
  });
  const call=(userId=target,origin="https://app.test")=>route.POST(new Request("https://app.test/api/admin/users/assisted-access",{method:"POST",headers:{origin},body:JSON.stringify({userId,organizationId:"forged",isPlatformAdmin:true})}));
  return {call,issue,revoke,generateLink,switchSession,targetClient,service};
}
it("creates the durable grant for the authenticated originator and fresh target session before switching cookies", async()=>{
  const f=fixture(); expect((await f.call()).status).toBe(200);
  expect(f.issue).toHaveBeenCalledWith(f.service,{adminUserId:admin,adminSessionId:"origin-session",targetUserId:target,targetSessionId:"target-session",organizationId:"server-org"});
  expect(f.issue.mock.invocationCallOrder[0]).toBeLessThan(f.switchSession.mock.invocationCallOrder[0]);
  expect(f.targetClient.auth.verifyOtp).toHaveBeenCalledWith({type:"magiclink",token_hash:"one-time-hash"});
});
it("refuses clients, internal/admin targets, self-access and foreign origin without issuing access",async()=>{
  for(const options of [{authDenied:true},{platformTarget:true},{internal:true}]) {
    const f=fixture(options); expect((await f.call()).status).toBe(403); expect(f.issue).not.toHaveBeenCalled(); expect(f.generateLink).not.toHaveBeenCalled();
  }
  const f=fixture(); expect((await f.call(admin)).status).toBe(400); expect((await f.call(target,"https://foreign.test")).status).toBe(403); expect(f.issue).not.toHaveBeenCalled();
});
it.each([{issueFails:true},{switchFails:true}])("cleans up failed starts without signing out the client's other sessions: %j",async(options)=>{
  const f=fixture(options); expect((await f.call()).status).toBe(503);
  expect(f.targetClient.auth.signOut).toHaveBeenCalledWith({scope:"local"}); expect(f.revoke).toHaveBeenCalled();
  if(options.issueFails) expect(f.switchSession).not.toHaveBeenCalled();
});
