import { NextResponse } from "next/server";
import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
const org="12345678-1234-1234-1234-123456789abc", contract="12345678-1234-1234-1234-123456789def";
function setup(allowed=true) {
  const rpc=vi.fn(async()=>({data:{already_applied:false},error:null}));
  const route=serverModuleHarness<typeof import("../src/app/api/admin/custom-contracts/activate/route")>("src/app/api/admin/custom-contracts/activate/route.ts",{
    "next/server":{NextResponse},
    "@/lib/supabase/admin-auth":{requirePlatformAdmin:async()=>allowed?{userId:"trusted-admin"}:NextResponse.json({error:"Denied"},{status:403})},
    "@/lib/supabase/service":{createServiceClient:()=>({rpc})},
  },[],{process:{env:{NEXT_PUBLIC_APP_URL:"https://www.connectyhub.com.br"}}});
  return {route,rpc};
}
function request(body:unknown={organizationId:org,contractId:contract},origin="https://www.connectyhub.com.br") {
  return new Request("http://internal:3000/api/admin/custom-contracts/activate",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
}
it("activates only the server-authorized actor and stored version, never client-supplied credits",async()=>{
  const h=setup(); expect((await h.route.POST(request({organizationId:org,contractId:contract,actorId:"attacker",credits:999999}))).status).toBe(200);
  expect(h.rpc).toHaveBeenCalledWith("activate_custom_contract",{p_organization:org,p_contract:contract,p_actor:"trusted-admin"});
});
it("rejects unauthorized access, external origins and malformed identifiers before mutation",async()=>{
  const denied=setup(false);expect((await denied.route.POST(request())).status).toBe(403);expect(denied.rpc).not.toHaveBeenCalled();
  const h=setup();expect((await h.route.POST(request(undefined,"https://attacker.test"))).status).toBe(403);
  expect((await h.route.POST(request({organizationId:org,contractId:"bad"}))).status).toBe(422);expect(h.rpc).not.toHaveBeenCalled();
});
