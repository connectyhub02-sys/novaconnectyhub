import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock=vi.hoisted(()=>({workspace:vi.fn(),change:vi.fn(),list:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/profile",()=>({getCurrentWorkspace:mock.workspace}));
vi.mock("@/lib/supabase/service",()=>({createServiceClient:()=>"service"}));
vi.mock("@/lib/billing/card-management",()=>({changeBillingCard:mock.change,listBillingCards:mock.list,CardManagementError:class extends Error{constructor(message:string,public status=409){super(message);}}}));
import { GET, POST } from "@/app/api/dashboard/billing/payment-methods/route";
const id="11111111-1111-4111-8111-111111111111";
const req=(body:unknown,origin="https://www.connectyhub.com.br")=>new NextRequest("https://www.connectyhub.com.br/api/dashboard/billing/payment-methods",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mock.workspace.mockResolvedValue({user:{id:"actor"},organization:{id:"session-org",role:"owner"}});mock.change.mockResolvedValue({methodId:id});mock.list.mockResolvedValue({cards:[]});});
it("denies unauthenticated and non-admin members",async()=>{
 mock.workspace.mockResolvedValue(null);expect((await POST(req({}))).status).toBe(401);
 mock.workspace.mockResolvedValue({user:{id:"actor"},organization:{id:"org",role:"member"}});expect((await POST(req({}))).status).toBe(403);expect(mock.change).not.toHaveBeenCalled();
});
it("rejects cross-site submissions before reading card data",async()=>{expect((await POST(req({},"https://evil.example"))).status).toBe(403);expect(mock.change).not.toHaveBeenCalled();});
it("uses only the session organization, keeps responses uncached, and never trusts a supplied organization",async()=>{
 const r=await POST(req({organizationId:"other-org",subscriptionId:id}));expect(r.status).toBe(200);expect(r.headers.get("Cache-Control")).toBe("no-store");expect(mock.change.mock.calls[0].slice(0,3)).toEqual(["service","session-org","actor"]);
 const get=await GET(new NextRequest(`https://www.connectyhub.com.br/api/dashboard/billing/payment-methods?subscriptionId=${id}`));expect(get.status).toBe(200);expect(mock.list).toHaveBeenCalledWith("service","session-org",id);
});
