import { describe, it, expect, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { commerceDatabase } from "./helpers/commerce-database";

function fixture() {
  const db = commerceDatabase({
    agent_runs: [{ id: "run", organization_id: "org", agent_id: "agent", metadata: { conversationId: "conversation" } }],
    whatsapp_instances: [
      {
        id: "instance",
        organization_id: "org",
        status: "connected",
        instance_token_encrypted: "test",
        metadata: { agent_id: "agent" },
      },
    ],
    conversations: [
      {
        id: "conversation",
        organization_id: "org",
        lead_id: "lead",
        whatsapp_instance_id: "instance",
        status: "waiting_customer",
        metadata: {},
      },
    ],
    leads: [
      {
        id: "lead",
        organization_id: "org",
        phone_number: "5547999999999",
        status: "active",
        metadata: {},
      },
    ],
    conversation_messages: [
      {
        id: "1",
        conversation_id: "conversation",
        whatsapp_instance_id: "instance",
        direction: "outbound",
        occurred_at: new Date(Date.now() - 300000).toISOString(),
        text_content: "Quer que eu confira?",
        payload: { agent_run_id: "run" },
      },
    ],
    agent_registry: [
      {
        id: "agent",
        organization_id: "org",
        name: "Agente",
        prompt: "Atenda com o estilo da minha marca.",
        model_id: "test-model",
      },
    ],
  });
  const patches: Array<Record<string, unknown>> = [];
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "Ficou alguma dúvida?" }] } },
          ],
        }),
        { status: 200 },
      ),
  );
  const finance = vi.fn(async () => ({ unavailable: false }));
  const policy = {
    follow_up_enabled: true,
    window_start: "00:00",
    window_end: "23:59",
    timezone: "UTC",
  };
  const metering = vi.fn(async () => ({
    usageEventId: "usage",
    billingMode: "credits",
    chargeCredits: 1,
  }));
  const imports = {
    "@/lib/billing/contract-access": {
      getContractAccess: async () => ({ allowed: true }),
    },
    "@/lib/billing/trial": { assertBillableAccess: async () => ({}) },
    "@/lib/sales-catalog/payment-reviews": {
      getLeadPaymentReviews: async () => [],
      refreshLeadOrderFinance: finance,
    },
    "@/lib/automations/dispatch": {
      loadAutomationPolicy: async () => policy,
      updateDispatch: async (
        _c: unknown,
        _id: string,
        patch: Record<string, unknown>,
      ) => {
        patches.push(patch);
      },
    },
    "@/lib/automations/contact-preferences": {
      checkContactPreferences: async () => ({ reason: null, deferUntil: null }),
    },
    "@/lib/automations/relationship-context": {
      relationshipContext: async () => ({
        context: "",
        link: "",
        reason: null,
        deferUntil: null,
      }),
    },
    "@/lib/automations/contact-window": { isContactWindow: () => true },
    "@/lib/security/credentials-crypto": {
      decryptCredentialValue: () => "test-token",
    },
    "@/lib/gemini/credentials": {
      loadGeminiCredentials: async () => ({
        apiKey: "test-key",
        model: "test-model",
      }),
    },
    "@/lib/billing/gemini-metering": { meterGeminiGenerationUsage: metering },
    "./agent-behavior": {
      normalizeWhatsappBehaviorConfig: () => ({
        agentEnabled: true,
        proactiveFollowUp: true,
        followUpMaxPerConversation: 2,
      }),
    },
    "./uazapi-credentials": {
      loadUazapiCredentials: async () => ({
        baseUrl: "https://provider.invalid",
      }),
    },
    "./outbound-language": {
      normalizeOutboundLanguageText: (text: string) => text,
      outboundLanguageQualityPromptLines: [],
    },
  };
  const service = serverModuleHarness<{
    executeWhatsappProactiveFollowUp: (
      input: unknown,
    ) => Promise<{ status: string; reason?: string }>;
  }>(
    "src/lib/whatsapp/proactive-followup.ts",
    imports,
    ["executeWhatsappProactiveFollowUp"],
    { fetch },
  );
  const data = {
    organizationId: "org",
    leadId: "lead",
    conversationId: "conversation",
    whatsappInstanceId: "instance",
    agentId: "agent",
    agentRunId: "run",
    dispatchId: "dispatch",
    claimToken: "claim",
  };
  return {
    db,
    data,
    patches,
    fetch,
    finance,
    policy,
    metering,
    execute: (extra = {}) =>
      service.executeWhatsappProactiveFollowUp({
        client: db.client,
        data: { ...data, ...extra },
      }),
  };
}
describe("follow-up execution gates", () => {
  it("rejects an old queued job assigned to someone other than the attending agent",async()=>{
    const f=fixture();f.db.tables.agent_runs[0].agent_id="original-agent";
    expect(await f.execute()).toMatchObject({reason:"attendance_agent_mismatch"});
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("allows a recorded first return but still stops on an intervening reply", async () => {
    const f = fixture();
    f.db.tables.conversation_messages = [];
    f.metering.mockImplementation(async () => {
      f.db.tables.conversation_messages.push({
        id: "2",
        conversation_id: "conversation",
        whatsapp_instance_id: "instance",
        direction: "inbound",
        occurred_at: new Date().toISOString(),
        text_content: "Prefiro outra semana",
      });
      return {
        usageEventId: "usage",
        billingMode: "credits",
        chargeCredits: 1,
      };
    });
    expect(
      await f.execute({ initialReturn: true, returnId: "visit" }),
    ).toMatchObject({ reason: "conversation_changed_during_generation" });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it("does not approach a lead who replied after scheduling", async () => {
    const f = fixture();
    f.db.tables.conversation_messages.push({
      id: "2",
      conversation_id: "conversation",
      whatsapp_instance_id: "instance",
      direction: "inbound",
      text_content: "Já resolvi",
      occurred_at: new Date().toISOString(),
    });
    expect(await f.execute()).toMatchObject({
      reason: "lead_replied_after_reference",
    });
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("requires real payment delivery before treating a cart as abandoned", async () => {
    const f = fixture();
    expect(
      await f.execute({
        salesCatalogOrderId: "order",
        salesCatalogFollowUpKind: "abandoned_order",
      }),
    ).toMatchObject({ reason: "payment_delivery_not_confirmed" });
    expect(f.finance).not.toHaveBeenCalled();
  });
  it("refreshes the gateway and stops when a payment was confirmed", async () => {
    const f = fixture();
    f.db.tables.leads[0].metadata = {
      checkout_runtime_state: { stage: "payment_sent", order_id: "order" },
    };
    f.db.tables.sales_catalog_orders = [
      {
        id: "order",
        organization_id: "org",
        status: "pending_payment",
        payment_status: "pending",
      },
    ];
    f.finance.mockImplementation(async () => {
      f.db.tables.sales_catalog_orders[0].payment_status = "confirmed";
      return { unavailable: false };
    });
    expect(
      await f.execute({
        salesCatalogOrderId: "order",
        salesCatalogFollowUpKind: "abandoned_order",
      }),
    ).toMatchObject({ reason: "sales_catalog_order_not_pending" });
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("checks the conversation again after generating the message", async () => {
    const f = fixture();
    f.metering.mockImplementation(async () => {
      f.db.tables.conversation_messages.push({
        id: "2",
        conversation_id: "conversation",
        whatsapp_instance_id: "instance",
        direction: "inbound",
        text_content: "Agora não",
        occurred_at: new Date().toISOString(),
      });
      return {
        usageEventId: "usage",
        billingMode: "credits",
        chargeCredits: 1,
      };
    });
    expect(await f.execute()).toMatchObject({
      reason: "conversation_changed_during_generation",
    });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.patches).toHaveLength(0);
  });
  it("preserves the persona and records uncertainty rather than retrying a 500", async () => {
    const f = fixture();
    f.fetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: "Ficou alguma dúvida?" }] } },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    expect(await f.execute()).toMatchObject({ status: "uncertain" });
    expect(f.fetch).toHaveBeenCalledTimes(2);
    expect(f.patches.map((p) => p.status)).toEqual(["sending", "uncertain"]);
  });
  it("stops if the company switches follow-up off during generation", async () => {
    const f = fixture();
    f.metering.mockImplementation(async () => {
      f.policy.follow_up_enabled = false;
      return {
        usageEventId: "usage",
        billingMode: "credits",
        chargeCredits: 1,
      };
    });
    expect(await f.execute()).toMatchObject({ reason: "disabled_before_send" });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
});
