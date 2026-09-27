import { describe, expect, it } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as groupSchedule from "../src/lib/whatsapp/group-schedule";

const { describeHolder, holderConflicts, schedulesOverlap } = groupSchedule;
const luna = { groupName: "Buffalo Administração", agentName: "Luna", always: false, rooms: [{ open: 18, close: 20, days: [0, 1, 2, 3, 4, 5, 6] }] };

describe("one agent per group at a time", () => {
  it("blocks the same hours, touching hours and answers at any time", () => {
    expect(holderConflicts(luna, { open: 19, close: 21, days: [1] })).toBe(true);
    expect(holderConflicts(luna, { open: 20, close: 22, days: [1] })).toBe(true);
    expect(holderConflicts(luna, null)).toBe(true);
    expect(holderConflicts({ ...luna, always: true, rooms: [] }, { open: 9, close: 11, days: [1] })).toBe(true);
  });

  it("allows other hours or other days", () => {
    expect(holderConflicts(luna, { open: 9, close: 11, days: [0, 1, 2, 3, 4, 5, 6] })).toBe(false);
    expect(holderConflicts(luna, { open: 21, close: 23, days: [1] })).toBe(false);
    expect(schedulesOverlap({ open: 18, close: 20, days: [1, 2] }, { open: 18, close: 20, days: [6] })).toBe(false);
  });

  it("describes who holds the group and when", () => {
    expect(describeHolder(luna)).toBe("Luna atende 18h–20h");
    expect(describeHolder({ ...luna, rooms: [{ open: 18, close: 20, days: [1, 3] }] })).toBe("Luna atende 18h–20h (seg, qua)");
  });
});

describe("the panel sees who answers each group", () => {
  it("finds Luna's question room on the group when looking from Gustavo's number", async () => {
    const db = commerceDatabase({
      whatsapp_channel_targets: [
        { id: "luna-target", organization_id: "org", target_type: "group", provider_jid: "adm@g.us", display_name: "Buffalo Administração", enabled: true, reply_mode: "off", whatsapp_instance_id: "luna-inst" },
        { id: "gustavo-target", organization_id: "org", target_type: "group", provider_jid: "adm@g.us", display_name: "Buffalo Administração", enabled: false, reply_mode: "mentions", whatsapp_instance_id: "gustavo-inst" },
      ],
      whatsapp_instances: [{ id: "luna-inst", status: "connected", metadata: { agent_id: "luna" } }, { id: "gustavo-inst", status: "connected", metadata: { agent_id: "gustavo" } }],
      whatsapp_traffic_routines: [{ organization_id: "org", agent_id: "luna", room_enabled: true, room_target_ids: ["luna-target"], room_open_hour: 18, room_close_hour: 20, room_days: [0, 1, 2, 3, 4, 5, 6] }],
      agent_registry: [{ id: "luna", name: "Luna", persona_name: "Luna" }],
    });
    const channel = serverModuleHarness<typeof import("../src/lib/whatsapp/channel-operations")>("src/lib/whatsapp/channel-operations.ts", {
      "@/lib/whatsapp/group-schedule": groupSchedule,
    });
    const holders = await channel.mapOtherGroupResponders(db.client as never, { organizationId: "org", instanceId: "gustavo-inst", groupJids: ["adm@g.us"] });
    expect(holders.get("adm@g.us")).toMatchObject({ agentName: "Luna", always: false, rooms: [{ open: 18, close: 20 }] });
    expect(await channel.findOtherGroupResponder(db.client as never, { organizationId: "org", instanceId: "gustavo-inst", groupJids: ["adm@g.us"], schedule: { open: 19, close: 20, days: [] } })).toMatchObject({ agentName: "Luna" });
    expect(await channel.findOtherGroupResponder(db.client as never, { organizationId: "org", instanceId: "gustavo-inst", groupJids: ["adm@g.us"], schedule: { open: 9, close: 11, days: [] } })).toBeNull();
  });
});
