import { expect, it, vi, afterEach } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { commerceDatabase } from "./helpers/commerce-database";
const instanceId = "11111111-1111-4111-8111-111111111111";
afterEach(() => vi.unstubAllEnvs());
function fixture() {
  vi.stubEnv("CONNECTYHUB_INTERNAL_API_KEY", "internal-test");
  const db = commerceDatabase({ whatsapp_instances: [{ id: instanceId, instance_token_encrypted: "encrypted" }] });
  const call = vi.fn(async () => ({ ok: true }));
  const route = serverModuleHarness<typeof import("../src/app/api/whatsapp/uazapi/route")>("src/app/api/whatsapp/uazapi/route.ts", {
    "@/lib/uazapi/client": { callUazapiOperation: call, UazapiRequestError: class extends Error {} },
    "@/lib/uazapi/operations": { getUazapiOperation: () => ({ path: "/send/text", auth: "instance" }) },
    "@/lib/supabase/service": { createServiceClient: () => db.client },
    "@/lib/security/credentials-crypto": { decryptCredentialValue: () => "saved-test-key" },
  }, [], { Response });
  const send = (body: Record<string, unknown>, authorized = true) => route.POST(new Request("https://app.invalid/api/whatsapp/uazapi", {
    method: "POST", headers: authorized ? { "x-connectyhub-internal-key": "internal-test" } : {},
    body: JSON.stringify({ operationId: "sendText", payload: { number: "5511999999999", text: "Oi" }, ...body }),
  }) as never);
  return { call, send };
}
it("requires an internal key and a registered sender before sending", async () => {
  const f = fixture();
  expect((await f.send({ whatsappInstanceId: instanceId }, false)).status).toBe(401);
  expect((await f.send({})).status).toBe(400);
  expect(f.call).not.toHaveBeenCalled();
});
it("ties the archive scope and credential to the same registered instance", async () => {
  const f = fixture();
  expect((await f.send({ whatsappInstanceId: instanceId, instanceTokenOverride: "foreign-key" })).status).toBe(400);
  expect(f.call).not.toHaveBeenCalled();
  expect((await f.send({ whatsappInstanceId: instanceId })).status).toBe(200);
  expect(f.call).toHaveBeenCalledWith(expect.objectContaining({
    instanceTokenOverride: "saved-test-key", outbound: expect.objectContaining({ instanceId, source: "internal-operation" }),
  }));
});
it("routes the generic provider executor through the archive boundary", async () => {
  const transport = vi.fn(async () => new Response('{"id":"receipt"}', { headers: { "content-type": "application/json" } }));
  const service = serverModuleHarness<typeof import("../src/lib/uazapi/client")>("src/lib/uazapi/client.ts", {
    "@/lib/whatsapp/outbound-delivery": { fetchWhatsappOutbound: transport },
    "./config": { getUazapiConfig: () => ({ baseUrl: "https://provider.invalid" }) },
    "./operations": { getUazapiOperation: () => ({ path: "/send/text", method: "POST", auth: "instance" }) },
  });
  const outbound = { instanceId };
  await service.callUazapiOperation({ operationId: "sendText", instanceTokenOverride: "test", payload: { text: "Oi" }, outbound });
  expect(transport).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ body: '{"text":"Oi"}' }), outbound);
});
