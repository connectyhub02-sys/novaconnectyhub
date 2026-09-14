import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import * as origins from "../src/lib/whatsapp/tracking-origin";
import * as status from "../src/lib/uazapi/status";
import * as contactMessages from "../src/lib/automations/lead-contact-message";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

afterEach(() => vi.unstubAllEnvs());
function fixture(apiClient: string | null = "api", organization = "org") {
  vi.stubEnv("WHATSAPP_NATIVE_LINK_ORIGINS_JSON", JSON.stringify({ org: "https://betel.example" }));
  const db = commerceDatabase({ whatsapp_instances: [{ id: "instance", organization_id: organization,
    provider: "uazapi", provider_instance_id: "provider", status: "disconnected", connectyhub_api_client_id: apiClient }] });
  const rpc = vi.fn(async () => { throw new Error("normal CRM path"); });
  const service = serverModuleHarness<typeof import("../src/lib/whatsapp/webhook-ingest")>("src/lib/whatsapp/webhook-ingest.ts", {
    "node:crypto": { createHash }, "./tracking-origin": origins, "@/lib/uazapi/status": status,
    "@/lib/automations/lead-contact-message": contactMessages,
    "./lead-avatar-sync": { readLeadProfileImageUrl: () => null },
  });
  const send = (payload: unknown, eventType = "messages") => service.ingestUazapiWebhook({
    client: { ...db.client, rpc } as never, payload, eventType,
    requestUrl: "https://fixture.invalid/webhook?instanceId=provider", headers: new Headers(),
  });
  return { db, rpc, send };
}
it.each([true, false])("keeps a technical receipt without CRM for native fromMe=%s", async fromMe => {
  const f = fixture();
  const payload = { message: { id: "receipt", fromMe, chatid: "5511999999999@s.whatsapp.net", text: "Private customer text", file: "https://assets.example/private.mp3" } };
  const result = await f.send(payload);
  expect(result).toMatchObject({ transportOnly: true, status: "processed", whatsappInstanceId: "instance", leadId: null, conversationId: null, messageId: null, agentRunId: null });
  expect(f.rpc).not.toHaveBeenCalled();
  expect(Object.keys(f.db.tables).sort()).toEqual(["whatsapp_instances", "whatsapp_webhook_events"]);
  expect(f.db.tables.whatsapp_webhook_events[0]).toMatchObject({ payload: { transport_only: true }, provider_message_id: "receipt", provider_chat_id: null, processing_status: "processed" });
  expect(JSON.stringify(f.db.tables)).not.toContain("Private customer text");
  expect(JSON.stringify(f.db.tables)).not.toContain("private.mp3");
});
it("updates native connection status without scheduling CRM history catchup", async () => {
  const f = fixture();
  const result = await f.send({ state: "open" }, "connection");
  expect(result.transportOnly).toBe(true);
  expect(f.db.tables.whatsapp_instances[0].status).toBe("connected");
  expect(JSON.stringify(f.db.tables)).not.toContain("last_reconnect_catchup_enqueued_at");
});
it.each([[null, "org"], ["api", "foreign"]])("does not bypass CRM for api=%s org=%s", async (api, org) => {
  const f = fixture(api, org!);
  await expect(f.send({ message: { id: "receipt", fromMe: false, chatid: "5511999999999@s.whatsapp.net", text: "Customer" } })).rejects.toThrow("normal CRM path");
  expect(f.rpc).toHaveBeenCalled();
});
