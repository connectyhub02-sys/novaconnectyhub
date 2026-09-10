import { describe, it, expect } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

const service = serverModuleHarness<{
  offlineReturnContext: (
    client: unknown,
    org: string,
    lead: string,
    visit: string,
  ) => Promise<Record<string, unknown> | null>;
}>(
  "src/lib/automations/offline-return-context.ts",
  {
    "@/lib/client-os/sales-catalog": {
      getOrganizationSalesCatalogSettings: async () => ({
        automationSettings: { defaultWhatsappInstanceId: "instance" },
      }),
    },
    "@/lib/agents/responsible-human": {
      normalizeBrazilianWhatsappPhone: (value: unknown) =>
        typeof value === "string" ? value : null,
    },
  },
  ["offlineReturnContext"],
);
function fixture() {
  return commerceDatabase({
    leads: [
      {
        id: "lead",
        organization_id: "org",
        phone_number: "5547999999999",
        metadata: {},
        status: "active",
      },
    ],
    whatsapp_instances: [
      {
        id: "instance",
        organization_id: "org",
        status: "connected",
        metadata: { agent_id: "agent" },
      },
    ],
    conversations: [],
    conversation_messages: [],
    agent_runs: [],
  });
}
describe("return invitation without previous WhatsApp messages", () => {
  it("uses the company selected connection without fabricating customer history and reuses preparation", async () => {
    const db = fixture();
    const first = await service.offlineReturnContext(
      db.client,
      "org",
      "lead",
      "visit",
    );
    expect(first).toMatchObject({
      organizationId: "org",
      leadId: "lead",
      whatsappInstanceId: "instance",
      initialReturn: true,
      returnId: "visit",
    });
    expect(db.tables.conversation_messages).toHaveLength(0);
    expect(db.tables.conversations).toHaveLength(1);
    expect(
      await service.offlineReturnContext(db.client, "org", "lead", "visit"),
    ).toEqual(first);
    expect(db.tables.agent_runs).toHaveLength(1);
  });
  it("does not reopen an archived conversation or contact an opted-out customer", async () => {
    const db = fixture();
    db.tables.leads[0].metadata = { whatsapp_opt_out: true };
    expect(
      await service.offlineReturnContext(db.client, "org", "lead", "visit"),
    ).toBeNull();
    db.tables.leads[0].metadata = {};
    db.tables.conversations.push({
      id: "existing",
      organization_id: "org",
      lead_id: "lead",
      channel: "whatsapp",
      status: "archived",
      whatsapp_instance_id: "instance",
    });
    expect(
      await service.offlineReturnContext(db.client, "org", "lead", "visit"),
    ).toBeNull();
    expect(db.tables.agent_runs).toHaveLength(0);
  });
  it("does not label a conversation with real messages as an initial return", async () => {
    const db = fixture();
    db.tables.conversations.push({
      id: "existing",
      organization_id: "org",
      lead_id: "lead",
      channel: "whatsapp",
      status: "open",
      whatsapp_instance_id: "instance",
    });
    db.tables.conversation_messages.push({
      id: "message",
      organization_id: "org",
      conversation_id: "existing",
      direction: "inbound",
    });
    expect(
      await service.offlineReturnContext(db.client, "org", "lead", "visit"),
    ).toBeNull();
    expect(db.tables.agent_runs).toHaveLength(0);
  });
});
