import { describe,it,expect,vi,afterEach } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/client-os/guided-oauth",()=>({loadMetaGuidedOAuthConfig:vi.fn()}));
import { canDeliverConversion,conversionUserData,purchaseData,conversionOrigin } from "../src/lib/meta/conversion-policy";
import { listMetaPixels,savePixelConfiguration,queueConversion } from "../src/lib/meta/pixel-conversions";
import type { AdsLeadsContext } from "../src/lib/meta/ads-leads-context";
import type { SupabaseClient } from "@supabase/supabase-js";
import { metaClickAttribution } from "../src/lib/meta/click-attribution";
afterEach(()=>vi.unstubAllGlobals());
const config={pixel_id:"123",revision:"v1",enabled:true,ad_account_id:"act_456"};
const event={pixel_id:"123",revision:"v1",event_time:Math.floor(Date.now()/1000)};
describe("Meta conversion privacy and accounting",()=>{
  it("captures an authorized ad click without retaining unrelated URL data",()=>{
    const now=1791770000000;
    expect(metaClickAttribution("?fbclid=CLICK_ID&email=private",null,now)).toBe(`fb.1.${now}.CLICK_ID`);
    expect(metaClickAttribution("?fbclid=https://private",null,now)).toBeUndefined();
    expect(metaClickAttribution("",`fb.1.${now-91*86400000}.OLD`,now)).toBeUndefined();
    expect(metaClickAttribution("",`fb.1.${now}.CLICK_ID`,now)).toBe(`fb.1.${now}.CLICK_ID`);
  });
  it("never exposes an internal container origin to Meta",()=>{
    expect(conversionOrigin({})).toBe("https://www.connectyhub.com.br");
    expect(conversionOrigin({NEXT_PUBLIC_APP_URL:"https://0.0.0.0:3000"})).toBe("https://www.connectyhub.com.br");
    expect(conversionOrigin({APP_URL:"https://shop.example/path?private=1"})).toBe("https://shop.example");
  });
  it("blocks cross-account, changed pixel, revoked consent, disabled settings and old events",()=>{
    expect(canDeliverConversion(event,config,"act_456",true)).toBe(true);
    expect(canDeliverConversion(event,config,"act_other",true)).toBe(false);
    expect(canDeliverConversion({...event,pixel_id:"other"},config,"act_456",true)).toBe(false);
    expect(canDeliverConversion({...event,revision:"old"},config,"act_456",true)).toBe(false);
    expect(canDeliverConversion(event,config,"act_456",false)).toBe(false);
    expect(canDeliverConversion(event,{...config,enabled:false},"act_456",true)).toBe(false);
    expect(canDeliverConversion({...event,event_time:event.event_time-7*86400},config,"act_456",true)).toBe(false);
  });
  it.each(["pending","proof_sent","failed","refunded"])("never counts %s orders as paid",status=>{
    expect(purchaseData({payment_status:status,total:100},{status:"approved"})).toBeNull();
  });
  it("requires both financial confirmation and an approved session and takes value from the order",()=>{
    expect(purchaseData({id:"order",payment_status:"confirmed",total:"12.50"},{status:"pending",amount:999})).toBeNull();
    expect(purchaseData({id:"order",payment_status:"confirmed",total:"12.50"},{status:"approved",amount:999})).toEqual({value:12.5,currency:"BRL",order_id:"order"});
    expect(purchaseData({payment_status:"confirmed",total:"NaN"},{status:"approved"})).toBeNull();
  });
  it("pseudonymizes visitors per tenant and drops malformed cookies",()=>{
    const a=conversionUserData("org-a","visitor","ua","token-secret","https://evil.test");
    const b=conversionUserData("org-b","visitor","ua");
    expect(a.external_id).not.toEqual(b.external_id);expect(a.external_id[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toHaveProperty("fbp");expect(a).not.toHaveProperty("fbc");
  });
});
describe("Meta pixel account selection",()=>{
  const ctx={organizationId:"org-a",adAccountId:"act_456",scopes:["ads_read","ads_management"],token:"TEST_SECRET",config:{appSecret:"TEST_APP_SECRET",graphVersion:"v24.0"}} as AdsLeadsContext;
  it("lists only the selected ad account's pixels with authentication in headers",async()=>{
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{id:"123",name:"Own Pixel"}]})));vi.stubGlobal("fetch",fetch);
    expect(await listMetaPixels(ctx)).toEqual([{id:"123",name:"Own Pixel"}]);
    expect(String(fetch.mock.calls[0][0])).toContain("act_456/adspixels");expect(String(fetch.mock.calls[0][0])).not.toContain("TEST_SECRET");
  });
  it("rejects injected pixels before database writes",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{id:"123",name:"Own Pixel"}]}))));
    const from=vi.fn();await expect(savePixelConfiguration({...ctx,client:{from} as unknown as SupabaseClient},{pixelId:"999",enabled:true,testEventCode:"TEST1"})).rejects.toThrow("não pertence");
    expect(from).not.toHaveBeenCalled();
  });
  it("fails closed on missing scopes without fetching",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);await expect(listMetaPixels({...ctx,scopes:[]})).rejects.toThrow("ads_read");expect(fetch).not.toHaveBeenCalled();
  });
  it("reuses event identity and never overwrites a delivered event on retry",async()=>{
    const upsert=vi.fn().mockResolvedValue({error:null});const client={from:vi.fn(()=>({upsert}))} as unknown as SupabaseClient;
    await queueConversion(client,{organizationId:"org-a",visitorId:"visitor",config,name:"PageView",eventId:"same-id",sourceUrl:"https://www.connectyhub.com.br/loja/test",userData:{external_id:["hash"]}});
    const [row,options]=upsert.mock.calls[0];expect(row.organization_id).toBe("org-a");expect(row.event_id).toBe(row.payload.event_id);
    expect(options).toEqual({onConflict:"organization_id,pixel_id,event_name,event_id",ignoreDuplicates:true});
  });
});
