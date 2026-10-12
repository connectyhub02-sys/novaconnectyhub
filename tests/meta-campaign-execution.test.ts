import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({graph:vi.fn(),context:vi.fn()}));
vi.mock("@/lib/meta/ads-leads-context",()=>({adsLeadsGraph:m.graph,loadAdsLeadsContext:m.context,requireMetaScopes:()=>{},metaRecord:(v:unknown)=>v&&typeof v==="object"?v:{},selectedMetaAsset:()=>""}));
vi.mock("@/lib/billing/contract-access",()=>({assertContractAccess:async()=>({})}));
vi.mock("@/lib/storage/r2",()=>({loadR2Config:vi.fn(),buildPublicObjectUrl:vi.fn()}));
import {executeCampaign} from "../src/lib/meta/campaign-execution";
import type {SupabaseClient} from "@supabase/supabase-js";
let row:Record<string,any>,objects:Record<string,any>,writes:{path:string;params:Record<string,string>}[],failCampaign=false;
// In-memory query adapter exercises CAS ownership/transition checks, not a real database.
function client(){return {from:()=>{let patch:Record<string,unknown>|null=null;const filters:[string,unknown][]=[];let single=false;const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters.push([k,v]);return q;},in:()=>q,lt:()=>{filters.push(["stale",true]);return q;},update:(p:Record<string,unknown>)=>{patch=p;return q;},order:()=>q,limit:()=>q,single:()=>{single=true;return q;},maybeSingle:()=>{single=true;return q;},then:(resolve:any)=>{const match=filters.every(([k,v])=>row[k]===v);if(patch&&match)Object.assign(row,patch);return Promise.resolve({data:match?(single?structuredClone(row):[structuredClone(row)]):single?null:[],error:null}).then(resolve);}};return q;}} as unknown as SupabaseClient;}
beforeEach(()=>{vi.clearAllMocks();failCampaign=false;writes=[];objects={};row={id:"job",proposal_id:"proposal",organization_id:"org",status:"draft",remote_ids:{},remote_fingerprint:null,snapshot_hash:"approved",snapshot:{name:"Teste",accountId:"act_123",accountName:"Conta",pageId:"456",instagramId:"",settings:{dailyBudget:20,currency:"BRL",days:7,country:"BR",placement:"facebook_feed",destination:"https://example.com"},dailyMinor:2000,totalMinor:14000,budgetMode:"CBO",media:{contentType:"image/jpeg",url:"https://cdn.example.com/a.jpg"},adSets:[{name:"A",dailyMinor:2000}],ads:[{name:"Anúncio",headline:"Título",primaryText:"Texto"}],targeting:{geo_locations:{countries:["BR"]}}}};
 m.context.mockResolvedValue({adAccountId:"act_123",pageId:"456"});vi.stubGlobal("fetch",vi.fn(async()=>new Response(new Uint8Array([1,2,3]))));
 m.graph.mockImplementation(async(_ctx,path:string,params:Record<string,string>={},_page=false,method="GET")=>{
  if(method==="POST"){
   writes.push({path,params});if(path.endsWith("/adimages"))return {images:{a:{hash:"imagehash"}}};
   if(path.endsWith("/campaigns")&&failCampaign)throw Error("Timeout");
   if(path.includes("/")){const id=String(1000+Object.keys(objects).length);const o:any={id,account_id:"123",...params};if(params.targeting)o.targeting=JSON.parse(params.targeting);if(params.creative){const creative=JSON.parse(params.creative);o.creative={id:creative.creative_id,object_story_spec:JSON.parse(objects[creative.creative_id].object_story_spec)};o.campaign_id=objects[params.adset_id].campaign_id;}objects[id]=o;return {id};}
   objects[path].status=params.status;return {success:true};
  }
  if(path==="act_123")return {id:"act_123",account_status:1,currency:"BRL"};
  if(path.endsWith("/adsets"))return {data:Object.values(objects).filter(o=>o.campaign_id===path.split("/")[0]&&o.targeting)};
  if(path.endsWith("/ads"))return {data:Object.values(objects).filter(o=>o.campaign_id===path.split("/")[0]&&o.creative)};
  return structuredClone(objects[path]);
 });
});
it("creates real hierarchy requests exclusively PAUSED, records IDs and prevents duplicate create",async()=>{await executeCampaign(client(),"org","u","job","create_paused",{});expect(row.status).toBe("paused");expect(row.remote_ids.campaign).toBeTruthy();expect(writes.filter(w=>w.params.status).every(w=>w.params.status==="PAUSED")).toBe(true);const count=writes.length;await expect(executeCampaign(client(),"org","u","job","create_paused",{})).rejects.toThrow();expect(writes).toHaveLength(count);});
it("rejects unapproved activation and activates the parent last only with exact consent",async()=>{await executeCampaign(client(),"org","u","job","create_paused",{});writes=[];await expect(executeCampaign(client(),"org","u","job","activate",{})).rejects.toThrow(/aprove/);expect(writes).toHaveLength(0);await executeCampaign(client(),"org","u","job","activate",{approveSpend:true,hash:"approved",totalMinor:14000,currency:"BRL"});expect(row.status).toBe("active");expect(writes.at(-1)).toMatchObject({path:row.remote_ids.campaign,params:{status:"ACTIVE"}});expect(row.activation_approval.userId).toBe("u");});
it("blocks changed remote budgets before any activation and confirms compensating pause",async()=>{await executeCampaign(client(),"org","u","job","create_paused",{});objects[row.remote_ids.campaign].daily_budget="99999";writes=[];await expect(executeCampaign(client(),"org","u","job","activate",{approveSpend:true,hash:"approved",totalMinor:14000,currency:"BRL"})).rejects.toThrow(/difere/);expect(writes.some(w=>w.params.status==="ACTIVE")).toBe(false);expect(row.status).toBe("uncertain");expect(objects[row.remote_ids.campaign].status).toBe("PAUSED");});
it("never repeats an ambiguous creation or allows another tenant to use it",async()=>{failCampaign=true;await expect(executeCampaign(client(),"org","u","job","create_paused",{})).rejects.toThrow(/Timeout/);expect(row.status).toBe("uncertain");const count=writes.length;await expect(executeCampaign(client(),"org","u","job","create_paused",{})).rejects.toThrow();await expect(executeCampaign(client(),"victim","u","job","pause",{})).rejects.toThrow(/encontrada/);expect(writes).toHaveLength(count);});
