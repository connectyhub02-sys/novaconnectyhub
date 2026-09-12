import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { commerceDatabase } from "./helpers/commerce-database";
import type * as Route from "../src/app/api/public/sales-catalog/products/[productId]/appointments/route";
import * as contactTime from "../src/lib/automations/contact-window";
const productId = "11111111-1111-4111-8111-111111111111";
function fixture(destination = "appointment") {
  const startsAt = new Date(Date.now() + 86400000).toISOString(), endsAt = new Date(Date.now() + 90000000).toISOString();
  const db = commerceDatabase({ intelligence_memory: [{ id: productId, organization_id: "org", scope: "organization", memory_type: "sales_catalog_item" }],
    leads: [{ id: "lead", organization_id: "org", channel: "whatsapp", phone_number: "5567999999999" }], customer_agenda_settings: [{organization_id:"org",timezone:"America/Manaus"}] });
  const reserve = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({data:{starts_at:startsAt,ends_at:endsAt},error:null}));
  const available = vi.fn(async (_client: unknown, _org: string, _resource: string, _from: Date) => [{starts_at:startsAt,ends_at:endsAt}]);
  const client = {...db.client,rpc:reserve};
  const route = serverModuleHarness<typeof Route>("src/app/api/public/sales-catalog/products/[productId]/appointments/route.ts", {
    "node:crypto": {createHash}, "next/server": {NextResponse: {json: (value:unknown, init?:ResponseInit) => Response.json(value,init)}},
    "@/lib/supabase/service": {createServiceClient:()=>client},
    "@/lib/client-os/sales-catalog": {mapSalesCatalogItem:()=>({id:productId,companyId:"org",status:"active",salesDestination:destination,fulfillment:{agendaResourceId:"resource"}})},
    "@/lib/sales-catalog/shared":{isSalesCatalogDisplayableProduct:()=>true},
    "@/lib/sales-catalog/public-commerce-access":{publicCommerceBlockResponse:async()=>null},
    "@/lib/automations/agenda":{availableAppointments:available,agendaErrorMessage:(s:string)=>s},
    "@/lib/automations/contact-window":contactTime,
    "@/lib/security/public-request-guard":{validatePublicWriteRequest:()=>({ok:true})},
  });
  const context={params:Promise.resolve({productId})};
  const request=(body:unknown, query="")=>({headers:new Headers(),url:`https://fixture.invalid/agenda${query}`,nextUrl:new URL(`https://fixture.invalid/agenda${query}`),text:async()=>JSON.stringify(body)}) as never;
  return {db,route,reserve,available,context,request,startsAt};
}
it("reserves using the same organization, lead and resource as the panel, with an idempotent key",async()=>{
  const f=fixture(), body={name:"Cliente",phone:"55 67 99999-9999",startsAt:f.startsAt};
  const response=await f.route.POST(f.request(body),f.context);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({booked:true,startsAt:f.startsAt});
  expect(f.reserve.mock.calls[0]).toMatchObject(["reserve_customer_appointment",{p_org:"org",p_resource:"resource",p_lead:"lead",p_start:f.startsAt}]);
});
it("does not reserve a slot that is no longer available",async()=>{
  const f=fixture();f.available.mockResolvedValue([]);
  expect((await f.route.POST(f.request({name:"Cliente",phone:"5567999999999",startsAt:f.startsAt}),f.context)).status).toBe(422);
  expect(f.reserve).not.toHaveBeenCalled();
});
it("does not expose a booking confirmation when persistence fails",async()=>{
  const f=fixture(); f.reserve.mockResolvedValue({data:null,error:{message:"SLOT_UNAVAILABLE"}} as never);
  const response=await f.route.POST(f.request({name:"Cliente",phone:"5567999999999",startsAt:f.startsAt}),f.context);
  expect(response.status).toBe(422); expect(await response.json()).not.toHaveProperty("booked");
});
it("uses the panel timezone when looking up a selected calendar date",async()=>{
  const f=fixture(), day=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const response=await f.route.GET(f.request(null,`?day=${day}`),f.context);
  expect(response.status).toBe(200);
  const from=f.available.mock.calls[0][3] as Date;
  expect(contactTime.localContactTime(from,"America/Manaus")).toEqual({day,minute:0});
  expect(f.available.mock.calls[0]).toMatchObject([expect.anything(), "org", "resource", expect.any(Date), 1, undefined, day]);
  expect(await response.json()).toMatchObject({ day, timezone: "America/Manaus" });
});
it("rejects a retail item and malformed data before reserving",async()=>{
  const f=fixture("connectyhub_checkout");
  expect((await f.route.GET(f.request(null),f.context)).status).toBe(422);
  expect((await f.route.POST(f.request(null),f.context)).status).toBe(422);
  expect(f.reserve).not.toHaveBeenCalled();
});
