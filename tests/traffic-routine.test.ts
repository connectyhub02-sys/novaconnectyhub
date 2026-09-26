import { describe, expect, it, vi } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Routine = typeof import("../src/lib/whatsapp/traffic-routine");

const routineRow = (extra: Record<string, unknown> = {}) => ({
  id: "r1", organization_id: "org", agent_id: "agent", enabled: true, post_status: true, target_ids: ["g1"], product_mode: "featured",
  catalog_item_ids: [], idea: "Frete grátis", intensity: "normal", start_hour: 9, lead_status_view: false, lead_status_react: false,
  lead_status_comment: false, planned_until: null, last_run_at: null, last_error: null, ...extra,
});

function setup(options: { connected?: boolean } = {}) {
  const db = commerceDatabase({
    whatsapp_traffic_routines: [routineRow()],
    whatsapp_channel_targets: [{ id: "g1", target_type: "group", campaign_enabled: true, whatsapp_instance_id: "inst" }],
    intelligence_memory: [
      { id: "p1", scope: "organization", memory_type: "sales_catalog_item", organization_id: "org", metadata: { status: "active" }, updated_at: "2" },
      { id: "p2", scope: "organization", memory_type: "sales_catalog_item", organization_id: "org", metadata: { status: "active", store_featured: true }, updated_at: "1" },
      { id: "p3", scope: "organization", memory_type: "sales_catalog_item", organization_id: "org", metadata: { status: "archived" }, updated_at: "3" },
    ],
    content_pipeline_items: [],
  });
  const plans: Array<Record<string, unknown>> = [];
  let queuedId = 0;
  const channel = {
    resolveClientWhatsappOperationalContext: async () => ({ instance: { id: "inst", status: options.connected === false ? "disconnected" : "connected" },
      behavior: { statusBroadcasts: true, campaignBroadcasts: true, newsletterBroadcasts: false, interactiveMessages: true } }),
    enableWhatsappAutomationCapability: vi.fn(async () => ({})),
    updateWhatsappChannelTargetSettings: vi.fn(async () => ({})),
    generateWhatsappGrowthCampaignPlan: async (_c: unknown, _ctx: unknown, input: Record<string, unknown>) => {
      plans.push(input);
      return { modelId: "gemini", systemInstruction: "s", prompt: "p", responseData: {}, items: [{ text: "post" }, { text: "post 2" }] };
    },
    queueWhatsappGrowthCampaignPlan: async () => {
      const items = [++queuedId, ++queuedId].map(n => ({ id: `item-${n}` }));
      for (const item of items) db.tables.content_pipeline_items.push({ id: item.id, organization_id: "org", status: "scheduled", tags: ["whatsapp"], scheduled_for: `2026-09-27T1${item.id.at(-1)}:00:00Z` });
      return { count: items.length, items };
    },
  };
  const meter = vi.fn(async () => ({}));
  const routine = serverModuleHarness<Routine>("src/lib/whatsapp/traffic-routine.ts", {
    "@/lib/whatsapp/channel-operations": channel,
    "@/lib/billing/gemini-metering": { meterGeminiGenerationUsage: meter },
    "@/lib/billing/trial": { assertBillableAccess: async () => null },
  });
  return { db, routine, plans, meter, channel };
}

describe("next day of the traffic routine", () => {
  it("plans today when turned on early and tomorrow when most of the window is gone", async () => {
    const { routine } = setup();
    expect(routine.nextRoutineDayStart(new Date("2026-09-27T10:00:00Z"), 9, null).toISOString()).toBe("2026-09-27T12:00:00.000Z");
    expect(routine.nextRoutineDayStart(new Date("2026-09-27T13:00:00Z"), 9, null).toISOString()).toBe("2026-09-27T13:20:00.000Z");
    expect(routine.nextRoutineDayStart(new Date("2026-09-27T20:00:00Z"), 9, null).toISOString()).toBe("2026-09-28T12:00:00.000Z");
  });

  it("continues on the day after what is already planned, at the owner's hour", async () => {
    const { routine } = setup();
    expect(routine.nextRoutineDayStart(new Date("2026-09-27T14:00:00Z"), 9, "2026-09-27T22:00:00Z").toISOString()).toBe("2026-09-28T12:00:00.000Z");
  });

  it("rotates the products so each day shows a different window", async () => {
    const { routine } = setup();
    const ids = ["a", "b", "c", "d", "e", "f"];
    const monday = routine.pickRoutineProducts(ids, new Date("2026-09-28T12:00:00Z"));
    const tuesday = routine.pickRoutineProducts(ids, new Date("2026-09-29T12:00:00Z"));
    expect(monday).toHaveLength(4);
    expect(monday).not.toEqual(tuesday);
  });
});

describe("running the routine", () => {
  it("plans status and groups separately, bills the AI, tags the posts and remembers the planned day", async () => {
    const { db, routine, plans, meter } = setup();
    const result = await routine.runTrafficRoutine(db.client as never, routineRow() as never, new Date("2026-09-27T10:00:00Z"));
    expect(result).toMatchObject({ scheduled: 4 });
    expect(plans.map(plan => plan.preferredFormats)).toEqual([["status"], ["text", "carousel", "poll", "text_audio"]]);
    expect(plans[0]).toMatchObject({ targetIds: [], postsPerDay: 2, durationDays: 1, catalogItemIds: ["p2", "p1"], startFrom: "2026-09-27T12:00:00.000Z" });
    expect(meter).toHaveBeenCalledTimes(2);
    expect(db.tables.content_pipeline_items.every(row => (row.tags as string[]).includes("traffic_routine:r1"))).toBe(true);
    expect(db.tables.whatsapp_traffic_routines[0]).toMatchObject({ planned_until: "2026-09-27T22:00:00.000Z", last_error: null });
  });

  it("records a clear warning instead of posting when WhatsApp is disconnected", async () => {
    const { db, routine, plans } = setup({ connected: false });
    const result = await routine.runTrafficRoutine(db.client as never, routineRow() as never, new Date("2026-09-27T10:00:00Z"));
    expect(result).toMatchObject({ error: expect.stringContaining("desconectado") });
    expect(plans).toHaveLength(0);
    expect(db.tables.whatsapp_traffic_routines[0].last_error).toContain("desconectado");
  });

  it("turning the routine off cancels the posts it had scheduled", async () => {
    const { db, routine } = setup();
    await routine.runTrafficRoutine(db.client as never, routineRow() as never, new Date("2026-09-27T10:00:00Z"));
    await routine.saveTrafficRoutine(db.client as never, { organizationId: "org", agentId: "agent", userId: "u", changes: { enabled: false } });
    expect(db.tables.content_pipeline_items.every(row => row.status === "archived")).toBe(true);
    expect(db.tables.whatsapp_traffic_routines[0]).toMatchObject({ enabled: false, planned_until: null });
  });
});

describe("two numbers", () => {
  it("copies the choices to the other number, marking the groups both share and keeping it off", async () => {
    const { db, routine } = setup();
    db.tables.whatsapp_channel_targets[0].provider_jid = "elite@g.us";
    db.tables.whatsapp_channel_targets.push({ id: "g2", target_type: "group", provider_jid: "elite@g.us", whatsapp_instance_id: "inst", campaign_enabled: true },
      { id: "g3", target_type: "group", provider_jid: "other@g.us", whatsapp_instance_id: "inst", campaign_enabled: true });
    const copied = await routine.copyTrafficRoutine(db.client as never, { organizationId: "org", fromAgentId: "agent", toAgentId: "agent-2", userId: "u" });
    expect(copied).toMatchObject({ agent_id: "agent-2", intensity: "normal", idea: "Frete grátis", post_status: true });
    expect(copied.target_ids).toContain("g2");
    expect(copied.target_ids).not.toContain("g3");
    expect(copied.enabled).not.toBe(true);
  });
});
