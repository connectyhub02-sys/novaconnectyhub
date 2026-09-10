import { describe, expect, it, vi } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

const routing = serverModuleHarness<{
  resolveConversationSender: (
    client: unknown,
    input: Record<string, unknown>,
  ) => Promise<{ whatsappInstanceId: string; agentId: string } | null>;
}>("src/lib/whatsapp/conversation-sender.ts");
function fixture() {
  return commerceDatabase({
    conversations: [
      {
        id: "luna-chat",
        organization_id: "org",
        lead_id: "lead",
        channel: "whatsapp",
        whatsapp_instance_id: "luna-phone",
        last_message_at: "2026-09-09",
      },
    ],
    agent_runs: [
      {
        id: "run",
        organization_id: "org",
        agent_id: "luna",
        run_status: "completed",
        metadata: { conversationId: "luna-chat" },
      },
    ],
    whatsapp_instances: [
      {
        id: "luna-phone",
        organization_id: "org",
        status: "connected",
        metadata: { agent_id: "luna" },
      },
      {
        id: "gustavo-phone",
        organization_id: "org",
        status: "connected",
        metadata: { agent_id: "gustavo" },
      },
    ],
  });
}
const input = {
  organizationId: "org",
  leadId: "lead",
  defaultWhatsappInstanceId: "gustavo-phone",
};
describe("the attendance owns the sender", () => {
  it("keeps Luna for a lead she served even when the company default is Gustavo", async () => {
    const db = fixture();
    expect(
      await routing.resolveConversationSender(db.client, input),
    ).toMatchObject({ whatsappInstanceId: "luna-phone", agentId: "luna" });
  });
  it("keeps an order's original conversation even if another agent spoke more recently", async () => {
    const db = fixture();
    db.tables.conversations.push({
      id: "new-chat",
      organization_id: "org",
      lead_id: "lead",
      channel: "whatsapp",
      whatsapp_instance_id: "gustavo-phone",
      last_message_at: "2026-09-10",
    });
    expect(
      await routing.resolveConversationSender(db.client, {
        ...input,
        conversationId: "luna-chat",
        agentId: "luna",
      }),
    ).toMatchObject({ whatsappInstanceId: "luna-phone", agentId: "luna" });
  });
  it.each(["disconnected", "missing", "reassigned"])(
    "never substitutes the sender when the origin is %s",
    async (mode) => {
      const db = fixture();
      if (mode === "disconnected")
        db.tables.whatsapp_instances[0].status = "disconnected";
      if (mode === "missing")
        db.tables.conversations[0].whatsapp_instance_id = null;
      if (mode === "reassigned")
        db.tables.whatsapp_instances[0].metadata = { agent_id: "gustavo" };
      expect(
        await routing.resolveConversationSender(db.client, input),
      ).toBeNull();
    },
  );
  it("does not use a default for a missing or foreign explicit conversation", async () => {
    const db = fixture();
    expect(
      await routing.resolveConversationSender(db.client, {
        ...input,
        conversationId: "foreign-chat",
      }),
    ).toBeNull();
  });
  it("uses the default only for a customer without prior attendance", async () => {
    const db = fixture();
    expect(
      await routing.resolveConversationSender(db.client, {
        ...input,
        leadId: "new-lead",
      }),
    ).toMatchObject({
      agentId: "gustavo",
      whatsappInstanceId: "gustavo-phone",
    });
  });
  it("uses the exact booking connection even when the agent has another connected number", async () => {
    const db = fixture();
    db.tables.whatsapp_instances.unshift({
      id: "other-luna-phone",
      organization_id: "org",
      status: "connected",
      metadata: { agent_id: "luna" },
    });
    expect(
      await routing.resolveConversationSender(db.client, {
        ...input,
        conversationId: "luna-chat",
        agentId: "luna",
      }),
    ).toMatchObject({ whatsappInstanceId: "luna-phone" });
  });
  it("fails closed on database failure instead of using the company default", async () => {
    const db = commerceDatabase(
      {},
      { table: "conversations", operation: "select" },
    );
    await expect(
      routing.resolveConversationSender(db.client, input),
    ).rejects.toThrow("origem do atendimento");
  });
});
describe("payment notices enforce the attendance route", () => {
  it.each([
    "maybeNotifyPaymentApproved",
    "maybeNotifyResponsiblePaymentApproved",
    "maybeNotifyPaymentStatus",
    "maybeNotifyResponsiblePaymentStatus",
  ])("%s ignores the legacy opt-out of conversation priority", async (name) => {
    const resolve = vi.fn(async () => null);
    const service = serverModuleHarness<
      Record<string, (input: unknown) => Promise<unknown>>
    >(
      "src/lib/sales-catalog/post-payment.ts",
      {
        "@/lib/billing/contract-access": {
          getContractAccess: async () => ({ allowed: true }),
        },
        "@/lib/client-os/sales-catalog": {
          getOrganizationSalesCatalogSettings: async () => ({
            automationSettings: {
              paymentStatusNotifications: true,
              useConversationWhatsappFirst: false,
              defaultWhatsappInstanceId: "gustavo-phone",
            },
          }),
        },
        "@/lib/whatsapp/conversation-sender": {
          resolveConversationSender: resolve,
        },
      },
      [name],
    );
    expect(
      await service[name]({
        client: fixture().client,
        order: {
          id: "order",
          organization_id: "org",
          lead_id: "lead",
          conversation_id: "luna-chat",
          metadata: { agent_id: "luna" },
        },
        paymentSessionId: "session",
        status: "rejected",
      }),
    ).toBe(false);
    expect(resolve).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        conversationId: "luna-chat",
        agentId: "luna",
        organizationId: "org",
      }),
    );
  });
});
