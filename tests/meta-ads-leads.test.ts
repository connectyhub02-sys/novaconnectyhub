import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/client-os/guided-oauth",()=>({loadMetaGuidedOAuthConfig:vi.fn()}));
import {buildAdsMcpReadCall,listAdsMcpTools,parseMcpResponse,runAdsMcpReport} from "../src/lib/meta/ads-mcp";
import {selectedMetaAsset,type AdsLeadsContext} from "../src/lib/meta/ads-leads-context";
import {enqueueLeadAdsEvent,parseLeadFields} from "../src/lib/meta/lead-ads";
import type {SupabaseClient} from "@supabase/supabase-js";
const ctx={scopes:["ads_mcp_management","ads_read"],token:"PRIVATE_TEST_TOKEN",adAccountId:"act_123"} as AdsLeadsContext;
afterEach(()=>vi.unstubAllGlobals());
describe("Meta Ads MCP no-spend gateway",()=>{
  it.each(["ads_activate_entity","ads_update_entity","ads_boost_ig_post","ads_create_ad"])("rejects %s before network",name=>{
    expect(()=>buildAdsMcpReadCall({name,inputSchema:{properties:{ad_account_id:{}}}},"act_123")).toThrow("não permitida");
  });
  it("binds tool arguments to the selected account, not arbitrary fields",()=>{
    expect(buildAdsMcpReadCall({name:"ads_get_ad_entities",inputSchema:{properties:{ad_account_id:{},limit:{},status:{}},required:["ad_account_id"]}},"act_123"))
      .toEqual({name:"ads_get_ad_entities",arguments:{ad_account_id:"123",limit:20}});
  });
  it("fails closed if tool schema changes",()=>{
    expect(()=>buildAdsMcpReadCall({name:"ads_get_ad_entities",inputSchema:{properties:{ad_account_id:{}},required:["new_required_field"]}},"act_123")).toThrow("parâmetros");
  });
  it("never requests credentials from another workspace on permission failure",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    await expect(listAdsMcpTools({...ctx,scopes:["ads_read"]})).rejects.toThrow("ads_mcp_management");expect(fetch).not.toHaveBeenCalled();
  });
  it("executes only allowlisted tool with server-selected account",async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({id:1,result:{tools:[{name:"ads_get_ad_entities",inputSchema:{properties:{ad_account_id:{}},required:["ad_account_id"]}}]}})))
      .mockResolvedValueOnce(new Response(JSON.stringify({id:1,result:{content:[{type:"text",text:"no campaigns"}]}})));
    vi.stubGlobal("fetch",fetch);await runAdsMcpReport(ctx,"campaigns");
    expect(JSON.parse(fetch.mock.calls[1][1].body).params).toEqual({name:"ads_get_ad_entities",arguments:{ad_account_id:"123"}});
    expect(fetch.mock.calls.every(c=>c[0]==="https://mcp.facebook.com/ads")).toBe(true);
  });
  it("reads JSON and SSE and refuses protocol/tool errors",()=>{
    expect(parseMcpResponse('event: message\ndata: {"id":1,"result":{"tools":[]}}\n\n',1)).toEqual({tools:[]});
    expect(()=>parseMcpResponse('{"id":2,"result":{}}',1)).toThrow();
    expect(()=>parseMcpResponse('{"id":1,"error":{"message":"SECRET"}}',1)).toThrow("MCP não concluiu");
    expect(()=>parseMcpResponse('{"id":1,"result":{"isError":true}}',1)).toThrow("recusou");
  });
});
describe("Meta Lead Ads tenant and consent boundaries",()=>{
  it.each([null,"","other"])("does not reuse stale selected assets (%s)",selected=>{
    expect(selectedMetaAsset({selected_facebook_page_id:selected,facebook_page_id:"123"},"facebook_page_id")).toBe("");
  });
  it("imports form answers without granting marketing consent",()=>{
    const parsed=parseLeadFields({field_data:[{name:"full_name",values:["Lead teste"]},{name:"email",values:["test@example.com"]}],ad_id:"123"});
    expect(parsed.display_name).toBe("Lead teste");expect(parsed.email).toBe("test@example.com");expect(parsed).not.toHaveProperty("outreach_authorized",true);
  });
  it("does not enqueue forms not enabled in that organization",async()=>{
    const builder={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:null,error:null})};
    builder.select.mockReturnValue(builder);builder.eq.mockReturnValue(builder);
    const from=vi.fn().mockReturnValue(builder);
    const event={assetId:"123",eventType:"meta.page.leadgen",sourceEventId:"event",payload:{object:"page",change:{field:"leadgen",value:{page_id:"123",form_id:"456",leadgen_id:"789"}}}};
    await enqueueLeadAdsEvent({from} as unknown as SupabaseClient,"tenant",event);
    expect(builder.eq).toHaveBeenCalledWith("organization_id","tenant");expect(builder.eq).toHaveBeenCalledWith("page_id","123");expect(builder.eq).toHaveBeenCalledWith("enabled",true);
    expect(from).toHaveBeenCalledTimes(1);
  });
  it("ignores non-lead events without database writes",async()=>{
    const from=vi.fn();expect(await enqueueLeadAdsEvent({from} as unknown as SupabaseClient,"tenant",{assetId:"123",eventType:"meta.page.feed",sourceEventId:null,payload:{object:"page",change:{field:"feed"}}})).toBe(false);expect(from).not.toHaveBeenCalled();
  });
});
