import { describe, expect, it, vi } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Channel = typeof import("../src/lib/whatsapp/channel-operations");
type Helpers = {
  sendInteractiveCampaignToRecipient: (...args: unknown[]) => Promise<unknown>;
  sendTargetCampaignPayloadToRecipient: (...args: unknown[]) => Promise<unknown>;
  prepareCampaignAudio: (...args: unknown[]) => Promise<unknown>;
};
const product = (id: string) => ({ id, status: "active", title: `Produto ${id}`, description: `Descrição de ${id}.`, media: [{kind:"image",storageUrl:`https://media.test/${id}.jpg`}], offer: {}, productUrl:`https://shop.test/${id}` });
function fixture(scope = "organization") {
  const db = commerceDatabase({ content_pipeline_items: [], intelligence_events: [],
    whatsapp_channel_targets: [{ id:"g",whatsapp_instance_id:"inst",target_type:"group",provider_jid:"group@g.us",campaign_enabled:true,display_name:"Grupo" }],
    intelligence_memory: ["a","b","c"].map(id => ({...product(id), organization_id:"org",scope:"organization",memory_type:"sales_catalog_item",metadata:{}})),
  });
  const voice = vi.fn(async () => ({audioUrl:"https://media.test/audio.ogg",mediaId:"audio",text:"fala",chargeCredits:2}));
  const fetch = vi.fn<(url: unknown, init: RequestInit) => Promise<Response>>(async () => Response.json({messageid:"sent"}));
  const channel = serverModuleHarness<Channel & Helpers>("src/lib/whatsapp/channel-operations.ts", {
    "@/lib/voice/tts": { generateConnectyVoiceAudio: voice },
    "@/lib/client-os/sales-catalog": { mapSalesCatalogItem: (row: unknown) => row },
    "@/lib/sales-catalog/public-urls": { buildSalesCatalogProductUrl: (id: string) => `https://shop.test/${id}` },
    "@/lib/billing/contract-access": { assertContractAccess: async () => null },
    "@/lib/supabase/service": { createServiceClient: () => db.client },
  }, ["sendInteractiveCampaignToRecipient","sendTargetCampaignPayloadToRecipient","prepareCampaignAudio"], {fetch,setTimeout,clearTimeout});
  const context = { scope, organizationId:scope === "platform" ? null : "org", sectorId:null,
    instance:{id:"inst",status:"connected",organization_id:scope === "platform" ? "platform-org" : "org",metadata:{}},
    credentials:{baseUrl:"https://provider.test"},token:"fake",behavior:{campaignBroadcasts:true,interactiveMessages:true,audioVoiceId:"voice",audioVoiceSource:"gemini"} };
  const item = { id:"job",metadata:{},body:"Texto" };
  db.tables.content_pipeline_items.push(item);
  return {db,voice,fetch,channel,context,item};
}
const carousel = { type:"carousel", text:"Confira", include_audio:true,audio_text:"Pessoal, confiram os produtos.",carousel:[{text:"Produto A",image:"https://media.test/a.jpg",buttons:[{type:"URL",text:"Ver produto",id:"https://shop.test/a"}]}] };

describe("carousel and poll audio", () => {
  it("queues exactly the selected cards in order and derives the narration from those cards", async () => {
    const f=fixture();
    await f.channel.queueWhatsappTargetCarouselCampaign(f.db.client as never,f.context as never,{title:"Oferta",targetIds:["g"],catalogItemIds:["c","a"],carouselSize:2,includeAudio:true});
    const metadata=f.db.tables.content_pipeline_items.at(-1)!.metadata as {payload:{carousel:Array<{text:string}>;audio_text:string;include_audio:boolean}};
    expect(metadata.payload.carousel.map(c=>c.text)).toEqual(["Produto c\nDescrição de c.","Produto a\nDescrição de a."]);
    expect(metadata.payload.audio_text).toContain("Descrição de c.");
    expect(metadata.payload.audio_text).not.toContain("Produto b");
    expect(metadata.payload.include_audio).toBe(true);
    expect(f.voice).not.toHaveBeenCalled();
    await expect(f.channel.queueWhatsappTargetCarouselCampaign(f.db.client as never,f.context as never,{title:"Oferta",targetIds:["g"],catalogItemIds:["a","foreign"],carouselSize:2})).rejects.toThrow("exatamente 2");
  });

  it("filters unavailable media and foreign products while preserving selection order", async () => {
    const f=fixture();
    f.db.tables.intelligence_memory[1].media=[];
    f.db.tables.intelligence_memory.push({...product("foreign"),organization_id:"other",scope:"organization",memory_type:"sales_catalog_item",metadata:{}});
    expect(await f.channel.listWhatsappCarouselProductIds(f.db.client as never,f.context as never,["c","b","foreign","a"])).toEqual(["c","a"]);
  });

  it("queues a poll narration from its actual question and choices", async () => {
    const f=fixture();
    await f.channel.queueWhatsappTargetPollCampaign(f.db.client as never,f.context as never,{question:"Qual cor?",choices:["Azul","Verde"],targetIds:["g"],includeAudio:true});
    const payload=(f.db.tables.content_pipeline_items.at(-1)!.metadata as {payload:Record<string,unknown>}).payload;
    expect(payload).toMatchObject({include_audio:true,choices:["Azul","Verde"]});
    expect(payload.audio_text).toContain("Qual cor?");
    expect(payload.audio_text).toContain("Azul; Verde");
  });

  it.each(["organization","platform"])("sends carousel before audio for %s and reuses one charged generation across recipients", async scope => {
    const f=fixture(scope);
    for(const to of ["one@g.us","two@g.us"]) await f.channel.sendInteractiveCampaignToRecipient(f.db.client,f.context,f.item,carousel,to,"target_carousel");
    expect(f.fetch.mock.calls.map(([url])=>new URL(String(url)).pathname)).toEqual(["/send/carousel","/send/media","/send/carousel","/send/media"]);
    expect(f.voice).toHaveBeenCalledTimes(1);
    expect(f.voice).toHaveBeenCalledWith(expect.objectContaining({organizationId:scope === "platform" ? "platform-org":"org",voiceId:"voice",metadata:expect.objectContaining({agentScope:scope === "platform"?"platform":"customer"})}));
    const bodies=f.fetch.mock.calls.map(([,init])=>JSON.parse(String(init.body)));
    expect(bodies[1]).toMatchObject({type:"ptt",track_id:"campaign_job_audio",number:"one@g.us"});
    expect(bodies[3]).toMatchObject({track_id:"campaign_job_audio",number:"two@g.us"});
  });

  it("sends poll then audio, and leaves audio off when not selected", async () => {
    const f=fixture();
    await f.channel.sendInteractiveCampaignToRecipient(f.db.client,f.context,f.item,{text:"Qual?",choices:["A","B"],include_audio:true,audio_text:"Qual opção?"},"one@g.us","target_poll");
    expect(f.fetch.mock.calls.map(([url])=>new URL(String(url)).pathname)).toEqual(["/send/menu","/send/media"]);
    const off=fixture();
    await off.channel.sendInteractiveCampaignToRecipient(off.db.client,off.context,off.item,{...carousel,include_audio:false},"one@g.us","target_carousel");
    expect(off.voice).not.toHaveBeenCalled();expect(off.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not send orphan audio after a failed carousel and preserves generated audio for review", async () => {
    const f=fixture();f.fetch.mockResolvedValueOnce(Response.json({error:"offline"},{status:503}));
    await expect(f.channel.sendInteractiveCampaignToRecipient(f.db.client,f.context,f.item,carousel,"one@g.us","target_carousel")).rejects.toThrow("offline");
    expect(f.fetch).toHaveBeenCalledTimes(1);expect(f.voice).toHaveBeenCalledTimes(1);
    await f.channel.prepareCampaignAudio(f.db.client,f.context,f.item,carousel.audio_text);
    expect(f.voice).toHaveBeenCalledTimes(1);
  });

  it("does not repeat uncertain voice generation or send anything when generation fails", async () => {
    const f=fixture();f.voice.mockRejectedValueOnce(new Error("voice unavailable"));
    await expect(f.channel.sendInteractiveCampaignToRecipient(f.db.client,f.context,f.item,carousel,"one@g.us","target_carousel")).rejects.toThrow("voice unavailable");
    await expect(f.channel.prepareCampaignAudio(f.db.client,f.context,f.item,carousel.audio_text)).rejects.toThrow("sem confirmação");
    expect(f.voice).toHaveBeenCalledTimes(1);expect(f.fetch).not.toHaveBeenCalled();
  });
});
