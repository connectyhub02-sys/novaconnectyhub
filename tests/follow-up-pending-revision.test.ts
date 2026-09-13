import * as contactMessage from "../src/lib/automations/lead-contact-message";
import * as followUpGeneration from "../src/lib/whatsapp/follow-up-generation";
import * as conversationEnding from "../src/lib/whatsapp/conversation-ending";
import { defaultWhatsappBehaviorConfig } from "../src/lib/whatsapp/agent-behavior";
import { describe, it, expect, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { commerceDatabase } from "./helpers/commerce-database";
const followUpCheckout = serverModuleHarness("src/lib/whatsapp/follow-up-checkout.ts", {
  "@/lib/sales-catalog/mercado-pago": { buildSalesCatalogCheckoutUrl: (id: string) => `https://fixture.invalid/checkout/${id}`, normalizeCurrencyAmount: (n: unknown) => Number(n) || null },
});

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
            { finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ action: "send", message: "Ficou alguma dúvida?" }) }] } },
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
  const prepareContact = vi.fn(async (): Promise<string | null> => "https://fixture.invalid/contato/preferencias/10000000-0000-4000-8000-000000000001");
  const imports = {
    "./follow-up-generation": followUpGeneration,
    "./conversation-ending": conversationEnding,
    "@/lib/automations/lead-contact-preferences": { prepareLeadContact: prepareContact },
    "@/lib/automations/lead-contact-message": contactMessage,
    "@/lib/billing/contract-access": {
      getContractAccess: async () => ({ allowed: true }),
    },
    "./follow-up-checkout": followUpCheckout,
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
        ...defaultWhatsappBehaviorConfig,
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
    processWhatsappProactiveFollowUp: (input: unknown) => Promise<{ status: string; reason?: string }>;
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
    prepareContact,
    process: (extra = {}) => service.processWhatsappProactiveFollowUp({ client: { ...db.client,
      rpc: async () => ({ data: { event_data: { ...data, ...extra }, claim_token: "claim", created_at: new Date().toISOString(), journey: "recovery" }, error: null }) },
      data: { ...data, ...extra } }),
    execute: (extra = {}) =>
      service.executeWhatsappProactiveFollowUp({
        client: db.client,
        data: { ...data, ...extra },
      }),
  };
}
function pendingRevision(patch: Record<string, unknown> = {}) {
  return { organization_id: "org", conversation_id: "conversation", instance_id: "instance", order_id: "order",
    applied: false, ready: false, preview_text: null, request_id: "revision", expected_revision: 0,
    source_message_id: "earlier-request", items: [{ id: "shirt", quantity: 1, mention_text: "Camiseta azul" }],
    pending_intent: { kind: "add", productText: "outro produto", quantity: 1 }, ...patch };
}
function setRevision(f: ReturnType<typeof fixture>, patch: Record<string, unknown> = {}) {
  f.db.tables.leads[0].metadata = { checkout_order_revision: pendingRevision(patch) };
}

describe("proactive contact respects an unfinished cart revision", () => {
  it("does not generate or send a claim that an unresolved inclusion was already confirmed", async () => {
    const f = fixture();
    setRevision(f);
    f.db.tables.conversation_messages[0].text_content = "Vou incluir a Camiseta vermelha. Qual versão você quer?";
    f.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ action: "send", message: "Já confirmei a inclusão da Camiseta vermelha. Podemos fechar?" }) }] } }] }), { status: 200 }));
    expect(await f.execute()).toMatchObject({ status: "skipped", reason: "order_revision_pending" });
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.metering).not.toHaveBeenCalled();
    expect(f.prepareContact).not.toHaveBeenCalled();
    expect(f.db.tables.conversation_messages).toHaveLength(1);
  });

  it("records the skipped dispatch and clears its lease through the scheduled job processor", async () => {
    const f = fixture();
    setRevision(f);
    expect(await f.process()).toMatchObject({ status: "skipped", reason: "order_revision_pending" });
    expect(f.patches).toEqual([expect.objectContaining({ status: "skipped", reason: "order_revision_pending", lease_until: null })]);
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it("does not send an earlier payable checkout while a change to that order remains pending", async () => {
    const f = fixture();
    f.db.tables.leads[0].metadata = { checkout_order_revision: pendingRevision(), checkout_runtime_state: { stage: "payment_sent", order_id: "order" } };
    expect(await f.execute({ salesCatalogOrderId: "order", salesCatalogFollowUpKind: "abandoned_order" }))
      .toMatchObject({ status: "skipped", reason: "order_revision_pending" });
    expect(f.finance).not.toHaveBeenCalled();
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it("keeps a ready but unaccepted proposal distinct from a persisted revision", async () => {
    const f = fixture();
    setRevision(f, { pending_intent: null, ready: true, preview_text: "Confira 1 Camiseta azul e 1 Boné. Confirma a alteração?", total: "80,00" });
    expect(await f.execute()).toMatchObject({ status: "skipped", reason: "order_revision_pending" });
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it("checks again after generation if a pending revision appears without a new message", async () => {
    const f = fixture();
    f.metering.mockImplementation(async () => {
      setRevision(f);
      return { usageEventId: "usage", billingMode: "credits", chargeCredits: 1 };
    });
    expect(await f.process()).toMatchObject({ status: "skipped", reason: "order_revision_pending_before_send" });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.prepareContact).not.toHaveBeenCalled();
    expect(f.patches).toEqual([expect.objectContaining({ status: "skipped", reason: "order_revision_pending_before_send", lease_until: null })]);
    expect(f.db.tables.conversation_messages).toHaveLength(1);
  });

  it.each([
    { organization_id: "another-org" }, { conversation_id: "another-conversation" }, { instance_id: "another-instance" },
  ])("does not block this conversation for a pending revision in another scope: %o", async patch => {
    const f = fixture();
    setRevision(f, patch);
    expect(await f.execute()).toMatchObject({ status: "sent" });
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not mistake an applied revision for an unfinished proposal", async () => {
    const f = fixture();
    setRevision(f, { applied: true });
    expect(await f.execute()).toMatchObject({ status: "sent" });
  });

  it.each([{ returnId: "scheduled-visit" }, { recommendationProductId: "ordinary-product" }, { salesCatalogFollowUpKind: "manual" }])
    ("preserves independent relationship journeys and their own eligibility checks: %o", async event => {
      const f = fixture();
      setRevision(f);
      expect(await f.execute(event)).toMatchObject({ status: "sent" });
      expect(f.fetch).toHaveBeenCalledTimes(2);
    });
});

describe("follow-up selects the revision belonging to this conversation", () => {
  it("finds this conversation's pending revision in the map even when the legacy pointer belongs to the other agent", async () => {
    const f = fixture();
    f.db.tables.leads[0].metadata = {
      checkout_order_revisions: {
        conversation: pendingRevision(),
        "other-conversation": pendingRevision({ conversation_id: "other-conversation", instance_id: "other-instance", applied: true }),
      },
      checkout_order_revision: pendingRevision({ conversation_id: "other-conversation", instance_id: "other-instance", applied: true }),
    };
    expect(await f.process()).toMatchObject({ status: "skipped", reason: "order_revision_pending" });
    expect(f.patches).toEqual([expect.objectContaining({ status: "skipped", reason: "order_revision_pending", lease_until: null })]);
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it("does not import another conversation's pending revision when this conversation has already applied its own", async () => {
    const f = fixture();
    f.db.tables.leads[0].metadata = {
      checkout_order_revisions: {
        conversation: pendingRevision({ applied: true }),
        "other-conversation": pendingRevision({ conversation_id: "other-conversation", instance_id: "other-instance" }),
      },
      checkout_order_revision: pendingRevision({ conversation_id: "other-conversation", instance_id: "other-instance" }),
    };
    expect(await f.execute()).toMatchObject({ status: "sent" });
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it("prioritizes this conversation's mapped state over a stale pending legacy snapshot of the same conversation", async () => {
    const f = fixture();
    f.db.tables.leads[0].metadata = { checkout_order_revisions: { conversation: pendingRevision({ applied: true }) }, checkout_order_revision: pendingRevision() };
    expect(await f.execute()).toMatchObject({ status: "sent" });
  });

  it("rechecks the conversation map during generation even after another attendance replaced the legacy pointer", async () => {
    const f = fixture();
    f.metering.mockImplementation(async () => {
      f.db.tables.leads[0].metadata = {
        checkout_order_revisions: { conversation: pendingRevision() },
        checkout_order_revision: pendingRevision({ conversation_id: "other-conversation", instance_id: "other-instance" }),
      };
      return { usageEventId: "usage", billingMode: "credits", chargeCredits: 1 };
    });
    expect(await f.process()).toMatchObject({ status: "skipped", reason: "order_revision_pending_before_send" });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.prepareContact).not.toHaveBeenCalled();
  });

  it("rejects a mapped revision from another instance rather than treating its key alone as proof of scope", async () => {
    const f = fixture();
    f.db.tables.leads[0].metadata = { checkout_order_revisions: { conversation: pendingRevision({ instance_id: "another-instance" }) } };
    expect(await f.execute()).toMatchObject({ status: "sent" });
  });
});
