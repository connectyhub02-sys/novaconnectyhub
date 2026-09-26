import * as responsibleAttendance from "../src/lib/whatsapp/responsible-attendance";
import * as contactMessage from "../src/lib/automations/lead-contact-message";
import * as followUpGeneration from "../src/lib/whatsapp/follow-up-generation";
import * as conversationEnding from "../src/lib/whatsapp/conversation-ending";
import { defaultWhatsappBehaviorConfig } from "../src/lib/whatsapp/agent-behavior";
import { describe, it, expect, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { commerceDatabase } from "./helpers/commerce-database";
import * as contactWindow from "../src/lib/automations/contact-window";
const leadHabit = serverModuleHarness<typeof import("../src/lib/automations/lead-habit")>("src/lib/automations/lead-habit.ts", {
  "./contact-window": contactWindow,
});
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
  const queued: Array<{ data: Record<string, unknown>; when: Date }> = [];
  const scheduled: unknown[] = [];
  const activeHour: { current: number | null } = { current: null };
  const discountPlan: { current: null | { percent: number; discount: number; total: number; applied: boolean; apply: () => Promise<void> } } = { current: null };
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
    "./responsible-attendance": responsibleAttendance,
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
    "@/lib/automations/lead-habit": { loadLeadActiveHour: async () => activeHour.current, leadHabitSendTime: leadHabit.leadHabitSendTime },
    "@/lib/automations/recovery-discount": { planRecoveryDiscount: async () => discountPlan.current },
    "@/lib/inngest/client": { inngest: { send: async (event: unknown) => { scheduled.push(event); } } },
    "@/lib/automations/dispatch": {
      persistFollowUpDispatch: async (_c: unknown, data: Record<string, unknown>, when: Date) => {
        queued.push({ data, when });
        return { id: `next-${queued.length}`, status: "pending", scheduled_for: when.toISOString() };
      },
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
    queued,
    scheduled,
    discountPlan,
    activeHour,
    execute: (extra = {}) =>
      service.executeWhatsappProactiveFollowUp({
        client: db.client,
        data: { ...data, ...extra },
      }),
  };
}
function recoveryFixture() {
  const f = fixture();
  f.db.tables.leads[0].metadata = { checkout_runtime_state: { stage: "payment_sent", order_id: "order" } };
  f.db.tables.sales_catalog_orders = [{ id: "order", organization_id: "org", lead_id: "lead", status: "pending_payment", payment_status: "pending", total: 90, latest_payment_session_id: "session" }];
  f.db.tables.sales_catalog_payment_sessions = [{ id: "session", organization_id: "org", order_id: "order", method: "pix", status: "pending", amount: 90, metadata: {}, created_at: new Date().toISOString() }];
  f.db.tables.sales_catalog_order_items = [{ order_id: "order", organization_id: "org", catalog_item_id: "product", title: "Produto", quantity: 1, total: 90 }];
  f.db.tables.intelligence_memory = [{ id: "product", organization_id: "org", scope: "organization", memory_type: "sales_catalog_item", metadata: { sales_destination: "connectyhub_checkout" } }];
  const prompt = () => {
    const call = (f.fetch.mock.calls as unknown as Array<[string, { body: string }]>).find(([url]) => String(url).includes("generativelanguage"));
    return call ? JSON.parse(call[1].body).contents[0].parts[0].text as string : "";
  };
  return { ...f, prompt };
}

describe("returns, post-sale and birthday", () => {
  const visit = (extra: Record<string, unknown> = {}) => ({ id: "visit", organization_id: "org", lead_id: "lead", description: "Corte", return_status: "scheduled",
    return_at: new Date(Date.now() - 3600_000).toISOString(), repeat_every_days: 25, repeat_remaining: 2, ...extra });

  it("sends a return the owner scheduled even with the smart follow-up off, and schedules the repetition", async () => {
    const f = fixture();
    f.policy.follow_up_enabled = false;
    f.db.tables.customer_lead_visits = [visit()];
    expect(await f.execute({ returnId: "visit", returnDueAt: "due" })).toMatchObject({ status: "sent" });
    const saved = f.db.tables.customer_lead_visits[0];
    expect(saved).toMatchObject({ return_status: "pending", repeat_remaining: 1 });
    expect(Date.parse(saved.return_at as string) - Date.now()).toBeGreaterThan(23 * 86400000);
  });

  it("completes a return with no repetition left", async () => {
    const f = fixture();
    f.db.tables.customer_lead_visits = [visit({ repeat_remaining: 0 })];
    expect(await f.execute({ returnId: "visit" })).toMatchObject({ status: "sent" });
    expect(f.db.tables.customer_lead_visits[0].return_status).toBe("completed");
  });

  it("respects the owner turning returns off", async () => {
    const f = fixture();
    (f.policy as Record<string, unknown>).returns_enabled = false;
    f.db.tables.customer_lead_visits = [visit()];
    expect(await f.execute({ returnId: "visit" })).toMatchObject({ status: "skipped", reason: "disabled" });
  });

  it("sends the birthday message even after two contacts this week, and post-sale needs the smart follow-up", async () => {
    const sent = (id: string) => ({ id, organization_id: "org", lead_id: "lead", status: "sent", sent_at: new Date(Date.now() - 86400000).toISOString() });
    const f = fixture();
    f.db.tables.automation_dispatches = [sent("a"), sent("b")];
    expect(await f.execute({ birthdayYear: 2026 })).toMatchObject({ status: "sent" });
    const g = fixture();
    g.policy.follow_up_enabled = false;
    expect(await g.execute({ postSaleKind: "checkin", postSaleOrderId: "order" })).toMatchObject({ status: "skipped", reason: "disabled" });
  });
});

describe("lead's usual hour and weekly limit", () => {
  const laterHour = () => (new Date().getUTCHours() + 6) % 24;

  it("moves a conversation retake to the lead's usual hour once, then sends it", async () => {
    const f = fixture();
    f.activeHour.current = laterHour();
    expect(await f.execute()).toMatchObject({ status: "deferred", reason: "lead_active_hour" });
    const patch = f.patches.at(-1)!;
    expect(patch).toMatchObject({ status: "pending", reason: "lead_active_hour", event_data: { habitDeferred: true } });
    expect((patch.event_data as Record<string, unknown>).dispatchId).toBeUndefined();
    const hoursAhead = (Date.parse(patch.scheduled_for as string) - Date.now()) / 3600_000;
    expect(hoursAhead).toBeGreaterThan(5);
    expect(hoursAhead).toBeLessThan(7);
    expect(await f.execute({ habitDeferred: true })).toMatchObject({ status: "sent" });
  });

  it("sends at once when it is already the lead's usual hour or there is no evidence", async () => {
    const f = fixture();
    f.activeHour.current = new Date().getUTCHours();
    expect(await f.execute()).toMatchObject({ status: "sent" });
    const g = fixture();
    expect(await g.execute()).toMatchObject({ status: "sent" });
  });

  it("never delays the first payment attempt, but waits for the usual hour on the next ones", async () => {
    const f = recoveryFixture();
    f.activeHour.current = laterHour();
    expect(await f.execute({ salesCatalogOrderId: "order", salesCatalogFollowUpKind: "abandoned_order" })).toMatchObject({ status: "sent" });
    const g = recoveryFixture();
    g.activeHour.current = laterHour();
    expect(await g.execute({ salesCatalogOrderId: "order", salesCatalogFollowUpKind: "abandoned_order", recoveryStep: 2 })).toMatchObject({ status: "deferred", reason: "lead_active_hour" });
  });

  it("stops unscheduled contacts at two per week, without blocking an unpaid order", async () => {
    const sent = (id: string) => ({ id, organization_id: "org", lead_id: "lead", status: "sent", sent_at: new Date(Date.now() - 86400000).toISOString() });
    const f = fixture();
    f.db.tables.automation_dispatches = [sent("a"), sent("b")];
    expect(await f.execute()).toMatchObject({ status: "skipped", reason: "weekly_contact_limit" });
    const g = recoveryFixture();
    g.db.tables.automation_dispatches = [sent("a"), sent("b")];
    expect(await g.execute({ salesCatalogOrderId: "order", salesCatalogFollowUpKind: "abandoned_order" })).toMatchObject({ status: "sent" });
  });
});

describe("payment recovery in three attempts", () => {
  it("schedules the next attempt a day later after each one, up to the third", async () => {
    const f = recoveryFixture();
    expect(await f.execute({ salesCatalogOrderId: "order", salesCatalogFollowUpKind: "abandoned_order" })).toMatchObject({ status: "sent" });
    expect(f.prompt()).toContain("tentativa 1 de 3");
    expect(f.queued).toHaveLength(1);
    expect(f.queued[0].data).toMatchObject({ recoveryStep: 2, salesCatalogOrderId: "order" });
    expect(f.queued[0].data.dispatchId).toBeUndefined();
    expect(f.queued[0].when.getTime() - Date.now()).toBeGreaterThan(23 * 3600_000);
    expect(f.scheduled).toHaveLength(1);

    const last = recoveryFixture();
    expect(await last.execute({ salesCatalogOrderId: "order", salesCatalogFollowUpKind: "abandoned_order", recoveryStep: 3 })).toMatchObject({ status: "sent" });
    expect(last.prompt()).toContain("última mensagem sobre este pedido");
    expect(last.queued).toHaveLength(0);
  });

  it("offers Pix after a declined card instead of dropping the sale", async () => {
    const f = recoveryFixture();
    f.db.tables.sales_catalog_orders[0].payment_status = "failed";
    f.db.tables.sales_catalog_payment_sessions[0] = { ...f.db.tables.sales_catalog_payment_sessions[0], method: "card", status: "rejected" };
    expect(await f.execute({ salesCatalogOrderId: "order", salesCatalogFollowUpKind: "abandoned_order", recoveryStep: 2 })).toMatchObject({ status: "sent" });
    expect(f.prompt()).toContain("cartão foi recusado");
  });

  it("tells the lead an expired Pix can be generated again, without a dead payment button", async () => {
    const f = recoveryFixture();
    f.db.tables.sales_catalog_payment_sessions[0].expires_at = new Date(Date.now() - 60_000).toISOString();
    expect(await f.execute({ salesCatalogOrderId: "order", salesCatalogFollowUpKind: "abandoned_order", recoveryStep: 2 })).toMatchObject({ status: "sent" });
    expect(f.prompt()).toContain("O Pix gerado venceu");
    const calls = f.fetch.mock.calls as unknown as Array<[string, { body: string }]>;
    expect(calls.some(([url, init]) => String(url).includes("/send/") && init.body.includes("Continuar pagamento"))).toBe(false);
  });

  it("announces the owner's discount on the last attempt and applies it only when sending", async () => {
    const f = recoveryFixture();
    const apply = vi.fn(async () => {
      f.db.tables.sales_catalog_payment_sessions[0].status = "cancelled";
      f.db.tables.sales_catalog_payment_sessions.push({ id: "discounted", organization_id: "org", order_id: "order", method: "pix", status: "created", amount: 81, metadata: {}, created_at: new Date().toISOString() });
      Object.assign(f.db.tables.sales_catalog_orders[0], { total: 81, latest_payment_session_id: "discounted" });
    });
    f.discountPlan.current = { percent: 10, discount: 9, total: 81, applied: false, apply };
    expect(await f.execute({ salesCatalogOrderId: "order", salesCatalogFollowUpKind: "abandoned_order", recoveryStep: 3 })).toMatchObject({ status: "sent" });
    expect(f.prompt()).toContain("10% de desconto");
    expect(apply).toHaveBeenCalledTimes(1);
    const calls = f.fetch.mock.calls as unknown as Array<[string, { body: string }]>;
    const delivery = calls.find(([url]) => String(url).endsWith("/send/menu"));
    expect(JSON.parse(delivery![1].body).choices[0]).toBe("Continuar pagamento|https://fixture.invalid/checkout/discounted");
  });

  it("never sends a discount message when the discount could not be applied", async () => {
    const f = recoveryFixture();
    f.discountPlan.current = { percent: 10, discount: 9, total: 81, applied: false, apply: async () => { throw new Error("CHECKOUT_CHANGED"); } };
    expect(await f.execute({ salesCatalogOrderId: "order", salesCatalogFollowUpKind: "abandoned_order", recoveryStep: 3 })).toMatchObject({ status: "failed", reason: "recovery_discount_unavailable" });
    const calls = f.fetch.mock.calls as unknown as Array<[string]>;
    expect(calls.some(([url]) => String(url).includes("/send/"))).toBe(false);
  });

  it("does not touch the order when the lead answered before the last attempt", async () => {
    const f = recoveryFixture();
    const apply = vi.fn(async () => {});
    f.discountPlan.current = { percent: 10, discount: 9, total: 81, applied: false, apply };
    f.db.tables.conversation_messages.push({ id: "2", conversation_id: "conversation", whatsapp_instance_id: "instance", direction: "inbound",
      occurred_at: new Date().toISOString(), text_content: "já paguei", payload: {} });
    expect(await f.execute({ salesCatalogOrderId: "order", salesCatalogFollowUpKind: "abandoned_order", recoveryStep: 3 })).toMatchObject({ status: "skipped" });
    expect(apply).not.toHaveBeenCalled();
  });

  it("stops the sequence when the lead answered", async () => {
    const f = recoveryFixture();
    f.db.tables.conversation_messages.push({ id: "2", conversation_id: "conversation", whatsapp_instance_id: "instance", direction: "inbound",
      occurred_at: new Date().toISOString(), text_content: "vou pagar mais tarde", payload: {} });
    expect(await f.execute({ salesCatalogOrderId: "order", salesCatalogFollowUpKind: "abandoned_order", recoveryStep: 2 })).toMatchObject({ status: "skipped" });
    expect(f.queued).toHaveLength(0);
  });
});

describe("follow-up execution gates", () => {
  it("blocks a queued follow-up to a registered responsible without generation or debit", async () => {
    const f = fixture();
    f.db.tables.agent_registry[0].metadata = { responsible_humans: [{ phone: "5547999999999" }] };
    f.db.tables.leads[0].phone_number = "554799999999";
    await expect(f.execute()).rejects.toBeInstanceOf(responsibleAttendance.ResponsibleAttendanceBlocked);
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.metering).not.toHaveBeenCalled();
  });
  it("rechecks a responsible added during generation before sending", async () => {
    const f = fixture();
    f.metering.mockImplementationOnce(async () => {
      f.db.tables.agent_registry[0].metadata = { responsible_humans: [{ phone: "5547999999999" }] };
      return { usageEventId: "usage", billingMode: "credits", chargeCredits: 1 };
    });
    await expect(f.execute()).rejects.toBeInstanceOf(responsibleAttendance.ResponsibleAttendanceBlocked);
    const calls = f.fetch.mock.calls as unknown as Array<[string]>;
    expect(calls.some(([url]) => String(url).includes("/send/"))).toBe(false);
    expect(f.metering).toHaveBeenCalledTimes(1);
  });
  it("does not block another agent's lead and respects removed responsibles", async () => {
    const f = fixture();
    f.db.tables.agent_registry.push({ id: "another", organization_id: "org", metadata: { responsible_humans: [{ phone: "5547999999999" }] } });
    f.db.tables.agent_registry[0].metadata = { responsible_humans: [], responsible_human: { phone: "5547999999999" } };
    expect(await f.execute()).toMatchObject({ status: "sent" });
  });
  it("recovers an existing payment with distinct purchase and unsubscribe buttons", async () => {
    const f = fixture();
    f.db.tables.leads[0].metadata = { checkout_runtime_state: {stage:"payment_sent",order_id:"order"} };
    f.db.tables.sales_catalog_orders = [{id:"order",organization_id:"org",lead_id:"lead",status:"pending_payment",payment_status:"pending",total:90,latest_payment_session_id:"session"}];
    f.db.tables.sales_catalog_payment_sessions = [{id:"session",organization_id:"org",order_id:"order",status:"pending",amount:90,metadata:{}}];
    f.db.tables.sales_catalog_order_items = [{order_id:"order",organization_id:"org",catalog_item_id:"product",title:"Produto",quantity:1,total:90}];
    f.db.tables.intelligence_memory = [{id:"product",organization_id:"org",scope:"organization",memory_type:"sales_catalog_item",metadata:{sales_destination:"connectyhub_checkout"}}];
    expect(await f.execute({salesCatalogOrderId:"order",salesCatalogFollowUpKind:"abandoned_order"})).toMatchObject({status:"sent"});
    const calls = f.fetch.mock.calls as unknown as Array<[string,{body:string}]>;
    const delivery = calls.find(([url]) => String(url).endsWith("/send/menu"));
    expect(delivery).toBeDefined();
    expect(JSON.parse(delivery![1].body).choices).toEqual([
      "Continuar pagamento|https://fixture.invalid/checkout/session",
      "Sair da lista|https://fixture.invalid/contato/preferencias/10000000-0000-4000-8000-000000000001",
    ]);
    expect(f.db.tables.sales_catalog_payment_sessions).toHaveLength(1);
  });
  it.each(["Obrigado, até a próxima!", "De nada, se precisar estou aqui!"])("does not treat the agent's goodbye as abandonment: %s", async text => {
    const f = fixture();
    f.db.tables.conversation_messages[0].text_content = text;
    expect(await f.execute()).toMatchObject({ status: "skipped", reason: "conversation_ended" });
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.metering).not.toHaveBeenCalled();
    expect(f.prepareContact).not.toHaveBeenCalled();
  });
  it.each([
    { finishReason: "STOP", content: { parts: [{ text: '" without accents like "você",' }] } },
    { finishReason: "MAX_TOKENS", content: { parts: [{ text: JSON.stringify({ action: "send", message: "Conseguiu conferir?" }) }] } },
    { finishReason: "STOP", content: { parts: [] } },
  ])("records a generation failure and never sends an opt-out-only message", async candidate => {
    const f = fixture();
    f.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [candidate], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } }), { status: 200 }));
    expect(await f.execute()).toMatchObject({ status: "failed" });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.metering).toHaveBeenCalledTimes(1);
    expect(f.prepareContact).not.toHaveBeenCalled();
    expect(f.db.tables.conversation_messages).toHaveLength(1);
    expect(f.patches.map(p => p.status)).toEqual(["failed"]);
    expect(JSON.stringify(f.patches)).not.toContain("without accents");
  });
  it("allows the model to skip a semantically resolved conversation", async () => {
    const f = fixture();
    f.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ action: "skip", message: "" }) }] } }] }), { status: 200 }));
    expect(await f.execute()).toMatchObject({ status: "skipped", reason: "no_relevant_approach" });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.prepareContact).not.toHaveBeenCalled();
  });
  it("stops on the final consent check before claiming delivery", async () => {
    const f=fixture(); f.prepareContact.mockResolvedValue(null);
    expect(await f.execute()).toMatchObject({status:"skipped",reason:"lead_opted_out"});
    expect(f.patches).toHaveLength(0); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it("archives the exact exit link sent with the follow-up button", async () => {
    const f=fixture();
    await f.execute();
    const [url,request]=f.fetch.mock.calls[1] as unknown as [string,RequestInit];
    expect(url).toContain("/send/menu");
    const body=JSON.parse(String(request.body));
    expect(body.choices[0]).toMatch(/^Sair da lista\|https:/);
    expect(body.text).not.toContain("Sair da lista");
    expect(f.db.tables.conversation_messages.at(-1)?.payload).toMatchObject({ choices: body.choices });
    expect(f.db.tables.conversation_messages.at(-1)?.text_content).toBe(body.text);
  });
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
              { finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ action: "send", message: "Ficou alguma dúvida?" }) }] } },
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
