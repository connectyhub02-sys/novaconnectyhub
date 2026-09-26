import { describe, expect, it } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Reconciliation = typeof import("../src/lib/whatsapp/outbound-reconciliation");
type Row = Record<string, unknown>;
const now = new Date("2026-09-26T15:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60000).toISOString();

function setup(tables: Record<string, Row[]>, found: Record<string, string | null>) {
  const db = commerceDatabase({ whatsapp_instances: [{ id: "instance", status: "connected", instance_token_encrypted: "enc" }], ...tables });
  const calls: string[] = [];
  const module = serverModuleHarness<Reconciliation>("src/lib/whatsapp/outbound-reconciliation.ts", {
    "@/lib/security/credentials-crypto": { decryptCredentialValue: () => "token" },
    "./uazapi-credentials": { loadUazapiCredentials: async () => ({ baseUrl: "https://provider.invalid" }) },
  }, [], { fetch: async (_url: string, init: { body: string }) => {
    const track = JSON.parse(init.body).track_id as string;
    calls.push(track);
    if (!(track in found)) return new Response("down", { status: 503 });
    const id = found[track];
    return new Response(JSON.stringify({ messages: id ? [{ messageid: id }] : [] }), { status: 200 });
  } });
  return { db, calls, module };
}

const delivery = (id: string, track: string, minutesAgo: number) => ({ id, whatsapp_instance_id: "instance", status: "uncertain", payload: { track_id: track }, updated_at: ago(minutesAgo) });

describe("uncertain WhatsApp sends", () => {
  it("confirms a message that did go out and settles its operation, without resending", async () => {
    const s = setup({
      whatsapp_outbound_deliveries: [delivery("d1", "followup_x:delivery:d1", 5)],
      whatsapp_outbound_operations: [{ id: "op", delivery_ids: ["d1"], status: "uncertain" }],
    }, { "followup_x:delivery:d1": "WAMID-1" });
    expect(await s.module.reconcileUncertainDeliveries(s.db.client as never, now)).toMatchObject({ sent: 1, failed: 0 });
    expect(s.db.tables.whatsapp_outbound_deliveries[0]).toMatchObject({ status: "sent", provider_message_id: "WAMID-1" });
    expect(s.db.tables.whatsapp_outbound_operations[0]).toMatchObject({ status: "sent" });
  });

  it("marks a missing agent reply as not delivered and puts its run back in the queue once", async () => {
    const run = "4925ddd3-0ca3-43ac-94e8-afeed0906c3b";
    const s = setup({
      whatsapp_outbound_deliveries: [delivery("d2", `agent_text_${run}_1:delivery:d2`, 5)],
      whatsapp_outbound_operations: [{ id: "op", delivery_ids: ["d2"], status: "uncertain" }],
      agent_runs: [{ id: run, run_status: "failed", created_at: ago(8), metadata: {} }],
    }, { [`agent_text_${run}_1:delivery:d2`]: null });
    expect(await s.module.reconcileUncertainDeliveries(s.db.client as never, now)).toMatchObject({ failed: 1, requeued: 1 });
    expect(s.db.tables.whatsapp_outbound_operations[0].status).toBe("failed");
    expect(s.db.tables.agent_runs[0]).toMatchObject({ run_status: "queued" });
    expect((s.db.tables.agent_runs[0].metadata as Row).delivery_reconciliation_requeued_at).toBeTruthy();
  });

  it("waits while the provider may still be sending, and while it does not answer", async () => {
    const s = setup({ whatsapp_outbound_deliveries: [delivery("d3", "followup_y:delivery:d3", 2), delivery("d4", "followup_z:delivery:d4", 10)] },
      { "followup_y:delivery:d3": null });
    expect(await s.module.reconcileUncertainDeliveries(s.db.client as never, now)).toMatchObject({ sent: 0, failed: 0 });
    expect(s.db.tables.whatsapp_outbound_deliveries.map(row => row.status)).toEqual(["uncertain", "uncertain"]);
  });

  it("reads the agent run from the tracking id", () => {
    const s = setup({}, {});
    expect(s.module.agentRunIdFromTrack("agent_audio_fallback_b1b681d1-ac26-4b80-a19d-26f05715103d_1:delivery:x")).toBe("b1b681d1-ac26-4b80-a19d-26f05715103d");
    expect(s.module.agentRunIdFromTrack("followup_260df7f8-3180-459f-97ad-eaa24402395f:delivery:x")).toBeNull();
  });
});
