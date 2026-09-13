import { describe, it, expect, vi } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type * as Handoff from "../src/lib/automations/agenda-handoff";

function fixture(result: Record<string, unknown>, status = "pending", attempts = 0) {
 const db = commerceDatabase({customer_agenda_requests:[{id:"request",organization_id:"org",lead_id:"lead",agent_id:"agent",run_id:"run",conversation_id:"chat",whatsapp_instance_id:"instance",status,attempts,due_at:"2000-01-01T00:00:00Z",lease_until:"2000-01-01T00:00:00Z",reason:"no_calendar",request_text:"Quero visitar amanhã"}],leads:[{id:"lead",organization_id:"org",display_name:"Teste",phone_number:"5500000000000"}],agent_registry:[{id:"agent",organization_id:"org",metadata:{}}]});
 const send=vi.fn(async(input: {beforeSend?:()=>Promise<void>})=>{await input.beforeSend?.();return result;});
 const api=serverModuleHarness<typeof Handoff>("src/lib/automations/agenda-handoff.ts",{"@/lib/whatsapp/handoff-notifications":{processWhatsappHandoffNotification:send},"@/lib/agents/responsible-human":{readAgentResponsibleHumans:()=>[{notifyOperational:true,phone:"5500000000001"}]}});
 const client={...db.client,rpc:vi.fn(async()=>{const r=db.tables.customer_agenda_requests[0];if (!r||!db.tables.leads.length) return {data:false};r.status="sending";r.lease_until=new Date(Date.now()+120000).toISOString();return {data:true};})};
 return {db,send,client,run:()=>api.dispatchAgendaHandoffs(client as never)};
}
describe("agenda handoff delivery",()=>{
 it("records confirmed delivery separately from the booking and passes current context",async()=>{const f=fixture({status:"sent",sent:1,failed:0});expect(await f.run()).toEqual({sent:1});expect(f.db.tables.customer_agenda_requests[0].status).toBe("sent");expect(f.send.mock.calls[0]).toBeDefined();});
 it.each([{status:"failed"},{status:"sent",sent:1,failed:1}])("does not replay uncertain transport or partial delivery",async result=>{const f=fixture(result);await f.run();expect(f.db.tables.customer_agenda_requests[0].status).toBe("uncertain");await f.run();expect(f.send).toHaveBeenCalledTimes(1);});
 it("retries only a known pre-send failure, with bounded attempts",async()=>{const f=fixture({status:"skipped",reason:"missing_recipients"});await f.run();expect(f.db.tables.customer_agenda_requests[0].status).toBe("pending");expect(Date.parse(String(f.db.tables.customer_agenda_requests[0].due_at))).toBeGreaterThan(Date.now());const last=fixture({status:"failed",reason:"missing_token"},"pending",2);await last.run();expect(last.db.tables.customer_agenda_requests[0].status).toBe("failed");});
 it("marks an expired sending lease uncertain without another send",async()=>{const f=fixture({status:"sent"},"sending");await f.run();expect(f.db.tables.customer_agenda_requests[0].status).toBe("uncertain");expect(f.send).not.toHaveBeenCalled();});
 it("stops before sending when the delivery lease expires",async()=>{const f=fixture({status:"sent"});let delivered=false;f.send.mockImplementation(async input=>{f.db.tables.customer_agenda_requests[0].lease_until="2000-01-01T00:00:00Z";await input.beforeSend?.();delivered=true;return {status:"sent"};});await f.run();expect(delivered).toBe(false);expect(f.db.tables.customer_agenda_requests[0].status).toBe("uncertain");});
 it("does not send a stale claimed request after the lead disappears",async()=>{const f=fixture({status:"sent"});f.db.tables.leads=[];await f.run();expect(f.send).not.toHaveBeenCalled();});
});
