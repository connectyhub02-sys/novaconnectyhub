import { describe, expect, it, vi } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Traffic = typeof import("../src/lib/whatsapp/traffic-routine");

const campaignRow = (extra: Record<string, unknown> = {}) => ({
  id: "c1", organization_id: "org", agent_id: "agent", name: "Semana do Whey", status: "active", post_status: true, target_ids: ["g1"],
  product_mode: "featured", catalog_item_ids: [], idea: "Frete grátis", manual_text: null, post_format: "auto", intensity: "normal", start_hour: 9,
  schedule_mode: "continuous", starts_at: "2026-09-27T00:00:00Z", ends_at: null, planned_until: null, last_run_at: null, last_error: null, created_at: "2026-09-27T00:00:00Z",
  status_audience: "all", status_style: "single", status_color: null, ...extra,
});
const routineRow = (extra: Record<string, unknown> = {}) => ({
  id: "r1", organization_id: "org", agent_id: "agent", lead_status_view: false, lead_status_react: false, lead_status_comment: false,
  room_enabled: true, room_target_ids: ["g1", "g9"], room_open_hour: 19, room_close_hour: 20, room_days: [0, 1, 2, 3, 4, 5, 6], room_replies: true,
  room_planned_until: null, last_run_at: null, last_error: null, ...extra,
});

function setup(options: { connected?: boolean; responder?: { groupName: string; agentName: string } | null } = {}) {
  const db = commerceDatabase({
    whatsapp_traffic_campaigns: [campaignRow()],
    whatsapp_traffic_routines: [routineRow()],
    whatsapp_channel_targets: [
      { id: "g1", target_type: "group", campaign_enabled: true, whatsapp_instance_id: "inst", is_admin: true, display_name: "Elite", organization_id: "org", provider_jid: "elite@g.us" },
      { id: "g9", target_type: "group", campaign_enabled: true, whatsapp_instance_id: "inst", is_admin: false, display_name: "Pedidos", organization_id: "org", provider_jid: "pedidos@g.us" },
    ],
    intelligence_memory: [
      { id: "p1", scope: "organization", memory_type: "sales_catalog_item", organization_id: "org", metadata: { status: "active" }, updated_at: "2" },
      { id: "p2", scope: "organization", memory_type: "sales_catalog_item", organization_id: "org", metadata: { status: "active", store_featured: true }, updated_at: "1" },
      { id: "p3", scope: "organization", memory_type: "sales_catalog_item", organization_id: "org", metadata: { status: "archived" }, updated_at: "3" },
    ],
    content_pipeline_items: [],
    leads: [
      { id: "buyer", organization_id: "org", phone_number: "554799990001", metadata: {} },
      { id: "hot", organization_id: "org", phone_number: "554799990002", metadata: { lead_qualification: { temperature: "hot" } } },
      { id: "optout", organization_id: "org", phone_number: "554799990003", metadata: { whatsapp_opt_out: true, lead_temperature: "vip" } },
    ],
    sales_catalog_orders: [{ id: "o1", organization_id: "org", lead_id: "buyer", payment_status: "confirmed" }, { id: "o2", organization_id: "org", lead_id: "hot", payment_status: "pending" }],
    sales_catalog_order_items: [], intelligence_events: [],
  });
  const plans: Array<Record<string, unknown>> = [];
  const queuedPlans: Array<Record<string, unknown>> = [];
  const windows: Array<Record<string, unknown>> = [];
  const direct: Array<Record<string, unknown>> = [];
  let sequence = 0;
  const push = () => { const id = `item-${++sequence}`; db.tables.content_pipeline_items.push({ id, organization_id: "org", status: "scheduled", tags: ["whatsapp"] }); return { id }; };
  const channel = {
    resolveClientWhatsappOperationalContext: async () => ({ instance: { id: "inst", status: options.connected === false ? "disconnected" : "connected" },
      behavior: { statusBroadcasts: true, campaignBroadcasts: true, newsletterBroadcasts: false, interactiveMessages: true, allowGroupChats: true } }),
    enableWhatsappAutomationCapability: vi.fn(async () => ({})),
    findOtherGroupResponder: vi.fn(async () => options.responder ?? null),
    groupResponderConflictMessage: (conflict: { groupName: string; agentName: string }) => `O grupo ${conflict.groupName} já é atendido por ${conflict.agentName}.`,
    updateWhatsappChannelTargetSettings: vi.fn(async () => ({})),
    generateWhatsappGrowthCampaignPlan: async (_c: unknown, _ctx: unknown, input: Record<string, unknown>) => {
      plans.push(input);
      return { modelId: "gemini", systemInstruction: "s", prompt: "p", responseData: {}, items: [{ text: "post", productIds: ["p1", "p2"] }, { text: "post 2" }] };
    },
    queueWhatsappGrowthCampaignPlan: async (_c: unknown, _ctx: unknown, input: Record<string, unknown>) => {
      queuedPlans.push(input);
      return { count: 2, items: [push(), push()] };
    },
    queueWhatsappStatusBroadcast: async (_c: unknown, _ctx: unknown, input: Record<string, unknown>) => { direct.push({ kind: "status", ...input }); return push(); },
    queueWhatsappTargetTextCampaign: async (_c: unknown, _ctx: unknown, input: Record<string, unknown>) => { direct.push({ kind: "targets", ...input }); return push(); },
    generateWhatsappShortText: async () => ({ modelId: "gemini", responseData: {},
      text: '[{"foto":"Enantato 10ml por R$ 269,99","beneficio":"Base clássica para ganho de força","oferta":"Responde este status e garanta o seu hoje!"},{"foto":"Deca 10ml","beneficio":"Volume com qualidade","oferta":"Me chama aqui!"}]' }),
    queueWhatsappGroupWindow: async (_c: unknown, _ctx: unknown, input: Record<string, unknown>) => { windows.push(input); return { items: [push(), push()] }; },
  };
  const meter = vi.fn(async () => ({}));
  const traffic = serverModuleHarness<Traffic>("src/lib/whatsapp/traffic-routine.ts", {
    "@/lib/whatsapp/channel-operations": channel,
    "@/lib/billing/gemini-metering": { meterGeminiGenerationUsage: meter },
    "@/lib/billing/trial": { assertBillableAccess: async () => null },
  });
  const campaign = () => db.tables.whatsapp_traffic_campaigns[0];
  return { db, traffic, plans, queuedPlans, windows, direct, meter, campaign };
}

describe("planning dates", () => {
  it("plans today when turned on early and tomorrow when most of the window is gone", async () => {
    const { traffic } = setup();
    expect(traffic.nextRoutineDayStart(new Date("2026-09-27T10:00:00Z"), 9, null).toISOString()).toBe("2026-09-27T12:00:00.000Z");
    expect(traffic.nextRoutineDayStart(new Date("2026-09-27T13:00:00Z"), 9, null).toISOString()).toBe("2026-09-27T13:20:00.000Z");
    expect(traffic.nextRoutineDayStart(new Date("2026-09-27T20:00:00Z"), 9, null).toISOString()).toBe("2026-09-28T12:00:00.000Z");
    expect(traffic.nextRoutineDayStart(new Date("2026-09-27T14:00:00Z"), 9, "2026-09-27T22:00:00Z").toISOString()).toBe("2026-09-28T12:00:00.000Z");
  });

  it("rotates the products so each day shows a different window", async () => {
    const { traffic } = setup();
    const ids = ["a", "b", "c", "d", "e", "f"];
    expect(traffic.pickRoutineProducts(ids, new Date("2026-09-28T12:00:00Z"))).not.toEqual(traffic.pickRoutineProducts(ids, new Date("2026-09-29T12:00:00Z")));
  });
});

describe("campaigns", () => {
  it("plans status and groups separately, bills the AI, tags the posts and remembers the planned day", async () => {
    const { db, traffic, plans, meter, campaign } = setup();
    const result = await traffic.runTrafficCampaign(db.client as never, campaignRow() as never, new Date("2026-09-27T10:00:00Z"));
    expect(result).toMatchObject({ scheduled: 4 });
    expect(plans.map(plan => plan.preferredFormats)).toEqual([["status"], ["text", "carousel", "poll", "text_audio"]]);
    expect(plans[0]).toMatchObject({ targetIds: [], postsPerDay: 2, durationDays: 1, catalogItemIds: ["p2", "p1"] });
    expect(String(plans[0].brief)).toContain("Status não tem botão");
    expect(String(plans[1].brief)).not.toContain("Status não tem botão");
    expect(meter).toHaveBeenCalledTimes(2);
    expect(db.tables.content_pipeline_items.every(row => (row.tags as string[]).includes("traffic_campaign:c1"))).toBe(true);
    expect(campaign()).toMatchObject({ planned_until: "2026-09-27T22:00:00.000Z", last_error: null });
  });

  it("a one-product campaign with button and audio talks about that product in every post", async () => {
    const { db, traffic, plans, queuedPlans } = setup();
    await traffic.runTrafficCampaign(db.client as never, campaignRow({ post_status: false, product_mode: "single", catalog_item_ids: ["p1"], post_format: "product_audio" }) as never, new Date("2026-09-27T10:00:00Z"));
    expect(plans[0]).toMatchObject({ preferredFormats: ["text_audio"], catalogItemIds: ["p1"], brief: expect.stringContaining("único produto") });
    expect(queuedPlans[0]).toMatchObject({ buttonEnabled: true, buttonLabel: "Ver produto" });
    expect((queuedPlans[0].planItems as Array<{ productIds: string[] }>).every(item => item.productIds.length === 1)).toBe(true);
  });

  it("'uma vez agora' with the owner's text posts it as written, without the AI, and ends the campaign", async () => {
    const { db, traffic, plans, direct, campaign } = setup();
    await traffic.runTrafficCampaign(db.client as never, campaignRow({ schedule_mode: "once", manual_text: "Promoção relâmpago até 18h!" }) as never, new Date("2026-09-27T10:00:00Z"));
    expect(plans).toHaveLength(0);
    expect(direct.map(item => [item.kind, item.text])).toEqual([["status", "Promoção relâmpago até 18h!"], ["targets", "Promoção relâmpago até 18h!"]]);
    expect(campaign().status).toBe("ended");
  });

  it("a one-week campaign ends when its period is over", async () => {
    const { db, traffic, plans, campaign } = setup();
    await traffic.runTrafficCampaign(db.client as never, campaignRow({ schedule_mode: "week", ends_at: "2026-10-04T03:00:00Z", planned_until: "2026-10-03T22:00:00Z" }) as never, new Date("2026-10-03T20:00:00Z"));
    expect(plans).toHaveLength(0);
    expect(campaign().status).toBe("ended");
  });

  it("records a clear warning instead of posting when WhatsApp is disconnected", async () => {
    const { db, traffic, plans, campaign } = setup({ connected: false });
    const result = await traffic.runTrafficCampaign(db.client as never, campaignRow() as never, new Date("2026-09-27T10:00:00Z"));
    expect(result).toMatchObject({ error: expect.stringContaining("desconectado") });
    expect(plans).toHaveLength(0);
    expect(campaign().last_error).toContain("desconectado");
  });

  it("pausing cancels the posts it had scheduled", async () => {
    const { db, traffic, campaign } = setup();
    await traffic.runTrafficCampaign(db.client as never, campaignRow() as never, new Date("2026-09-27T10:00:00Z"));
    await traffic.setTrafficCampaignStatus(db.client as never, { organizationId: "org", agentId: "agent", campaignId: "c1", action: "pause", userId: "u" });
    expect(db.tables.content_pipeline_items.every(row => row.status === "archived")).toBe(true);
    expect(campaign()).toMatchObject({ status: "paused", planned_until: null });
  });

  it("a new campaign needs a place to post and, with one product, the product", async () => {
    const { db, traffic } = setup();
    await expect(traffic.saveTrafficCampaign(db.client as never, { organizationId: "org", agentId: "agent", userId: "u", changes: { name: "x", post_status: false, target_ids: [] } })).rejects.toThrow("Escolha onde");
    await expect(traffic.saveTrafficCampaign(db.client as never, { organizationId: "org", agentId: "agent", userId: "u", changes: { name: "x", post_status: true, product_mode: "single" } })).rejects.toThrow("produto");
    const week = await traffic.saveTrafficCampaign(db.client as never, { organizationId: "org", agentId: "agent", userId: "u", changes: { name: "Semana", post_status: true, schedule_mode: "week" } });
    expect(week).toMatchObject({ status: "active", schedule_mode: "week" });
    expect(new Date(week.ends_at!).getTime() - Date.now()).toBeGreaterThan(6 * 24 * 3600_000);
  });
});

describe("question room in groups", () => {
  it("opens on the next chosen weekday at the owner's hour", async () => {
    const { traffic } = setup();
    const window = traffic.nextRoomWindow(new Date("2026-09-26T23:30:00Z"), { room_open_hour: 19, room_close_hour: 20, room_days: [1, 2, 3, 4, 5], room_planned_until: null });
    expect(window?.open.toISOString()).toBe("2026-09-28T22:00:00.000Z");
    expect(window?.close.toISOString()).toBe("2026-09-28T23:00:00.000Z");
  });

  it("turned on during today's room hours, opens right away; too close to closing, waits for the next day", async () => {
    const { traffic } = setup();
    const room = { room_open_hour: 15, room_close_hour: 16, room_days: [0, 1, 2, 3, 4, 5, 6], room_planned_until: null };
    // 15h05 BRT: opens at 15h07 and closes at 16h.
    expect(traffic.nextRoomWindow(new Date("2026-09-27T18:05:00Z"), room)).toEqual({ open: new Date("2026-09-27T18:07:00Z"), close: new Date("2026-09-27T19:00:00Z") });
    // 15h50 BRT: only 8 minutes left, so tomorrow at 15h.
    expect(traffic.nextRoomWindow(new Date("2026-09-27T18:50:00Z"), room)?.open.toISOString()).toBe("2026-09-28T18:00:00.000Z");
  });

  it("schedules the opening with answers on, skips groups where the number is not admin and warns about them", async () => {
    const { db, traffic, windows } = setup();
    const result = await traffic.runTrafficRoom(db.client as never, routineRow() as never, new Date("2026-09-27T12:00:00Z"));
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ targetId: "g1", roomReplies: true, preCloseMinutes: 10, openScheduledFor: "2026-09-27T22:00:00.000Z" });
    expect(String(windows[0].closingText)).toContain("Abro de novo");
    expect(result).toMatchObject({ roomWarning: expect.stringContaining("Pedidos") });
    expect(db.tables.whatsapp_traffic_routines[0].room_planned_until).toBe("2026-09-27T23:00:00.000Z");
  });

  it("turning the room off cancels the openings and stops answering in those groups", async () => {
    const { db, traffic } = setup();
    await traffic.runTrafficRoom(db.client as never, routineRow() as never, new Date("2026-09-27T12:00:00Z"));
    db.tables.whatsapp_channel_targets[0].reply_mode = "all";
    await traffic.saveTrafficRoutine(db.client as never, { organizationId: "org", agentId: "agent", userId: "u", changes: { room_enabled: false } });
    expect(db.tables.content_pipeline_items.every(item => item.status === "archived")).toBe(true);
    expect(db.tables.whatsapp_channel_targets[0].reply_mode).toBe("off");
  });
});

describe("two numbers", () => {
  it("copies the campaigns paused, with the groups both numbers share", async () => {
    const { db, traffic } = setup();
    db.tables.whatsapp_channel_targets.push({ id: "g2", target_type: "group", provider_jid: "elite@g.us", whatsapp_instance_id: "inst", organization_id: "org" });
    await traffic.copyTrafficRoutine(db.client as never, { organizationId: "org", fromAgentId: "agent", toAgentId: "agent-2", userId: "u" });
    const copied = db.tables.whatsapp_traffic_campaigns.find(row => row.agent_id === "agent-2");
    expect(copied).toMatchObject({ name: "Semana do Whey", status: "paused" });
    expect(copied?.target_ids).toContain("g2");
  });
});

describe("one agent answers per group", () => {
  it("blocks the question room when another agent of the company already answers in the group", async () => {
    const { db, traffic } = setup({ responder: { groupName: "Buffalo Administração", agentName: "Gustavo" } });
    db.tables.whatsapp_traffic_routines[0].room_enabled = false;
    await expect(traffic.saveTrafficRoutine(db.client as never, { organizationId: "org", agentId: "agent", userId: "u", changes: { room_enabled: true, room_target_ids: ["g1"] } }))
      .rejects.toThrow("já é atendido por Gustavo");
    expect(db.tables.whatsapp_traffic_routines[0].room_enabled).toBe(false);
  });

  it("turns the room on when no other agent answers there", async () => {
    const { db, traffic } = setup();
    db.tables.whatsapp_traffic_routines[0].room_enabled = false;
    const saved = await traffic.saveTrafficRoutine(db.client as never, { organizationId: "org", agentId: "agent", userId: "u", changes: { room_enabled: true, room_target_ids: ["g1"] } });
    expect(saved.room_enabled).toBe(true);
  });
});

describe("status for the right people", () => {
  it("sends the status only to customers with a confirmed payment", async () => {
    const { traffic } = setup();
    const db = setup().db;
    expect(await traffic.resolveStatusRecipients(db.client as never, { organization_id: "org", status_audience: "customers" }, [])).toEqual(["554799990001"]);
    expect(await traffic.resolveStatusRecipients(db.client as never, { organization_id: "org", status_audience: "hot" }, [])).toEqual(["554799990002"]);
    expect(await traffic.resolveStatusRecipients(db.client as never, { organization_id: "org", status_audience: "all" }, [])).toBeNull();
  });

  it("posts a story of three statuses per slot, colored, to the chosen audience", async () => {
    const { db, traffic, direct } = setup();
    await traffic.runTrafficCampaign(db.client as never, campaignRow({ target_ids: [], status_style: "story", status_audience: "customers", status_color: 8 }) as never, new Date("2026-09-27T10:00:00Z"));
    expect(direct.map(item => item.text)).toEqual(["Enantato 10ml por R$ 269,99", "Base clássica para ganho de força", "Responde este status e garanta o seu hoje!", "Deca 10ml", "Volume com qualidade", "Me chama aqui!"]);
    expect(direct.every(item => JSON.stringify(item.recipients) === JSON.stringify(["554799990001"]) && item.backgroundColor === 8)).toBe(true);
    expect(direct.slice(1, 3).every(item => item.statusType === "text")).toBe(true);
    expect(new Date(String(direct[1].scheduledFor)).getTime() - new Date(String(direct[0].scheduledFor)).getTime()).toBe(2 * 60_000);
  });

  it("with nobody in the audience yet, skips the status with a warning and keeps the groups going", async () => {
    const { db, traffic, direct, plans, campaign } = setup();
    db.tables.sales_catalog_orders = [];
    const result = await traffic.runTrafficCampaign(db.client as never, campaignRow({ status_audience: "customers" }) as never, new Date("2026-09-27T10:00:00Z"));
    expect(direct).toHaveLength(0);
    expect(plans).toHaveLength(1);
    expect(result).toMatchObject({ scheduled: 2, warning: expect.stringContaining("clientes que já compraram") });
    expect(campaign().last_error).toContain("clientes que já compraram");
  });
});
