import { expect,it,vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
const key="10000000-0000-4000-8000-000000000001",destination="https://checkout.invalid/path?sig=exact%2Fbytes#fragment";
function fixture(){
 const rpc=vi.fn(async()=>({data:destination,error:null}));const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{target_url:destination},error:null})};
 const route=serverModuleHarness<typeof import("../src/app/w/[key]/route")>("src/app/w/[key]/route.ts",{"@/lib/supabase/service":{createServiceClient:()=>({rpc,from:()=>q})}},[],{Response});
 return{rpc,route,context:{params:Promise.resolve({key})}};
}
it("redirects to the stored URL unchanged and never accepts query overrides or sends lead identity",async()=>{
 const f=fixture();const r=await f.route.GET(new Request(`https://app.invalid/w/${key}?target=https://evil.invalid&lead_id=foreign`,{headers:{"user-agent":"Mozilla/5.0"}}),f.context);
 expect(r.status).toBe(302);expect(r.headers.get("location")).toBe(destination);expect(r.headers.get("referrer-policy")).toBe("no-referrer");expect(f.rpc).toHaveBeenCalledExactlyOnceWith("record_whatsapp_outbound_click",{p_link:key});
});
it("does not count HEAD requests or identified link previews as human clicks",async()=>{
 const f=fixture();await f.route.HEAD(new Request(`https://app.invalid/w/${key}`),f.context);
 await f.route.GET(new Request(`https://app.invalid/w/${key}`,{headers:{"user-agent":"facebookexternalhit/1.1"}}),f.context);
 await f.route.GET(new Request(`https://app.invalid/w/${key}`,{headers:{"sec-purpose":"prefetch"}}),f.context);
 expect(f.rpc).not.toHaveBeenCalled();
});
it("rejects invalid keys and reports storage failure without inventing a successful click",async()=>{
 const f=fixture();expect((await f.route.GET(new Request("https://app.invalid"),{params:Promise.resolve({key:"bad"})})).status).toBe(404);
 f.rpc.mockResolvedValue({data:null,error:{code:"offline"}} as never);expect((await f.route.GET(new Request(`https://app.invalid/w/${key}`),f.context)).status).toBe(503);
});
