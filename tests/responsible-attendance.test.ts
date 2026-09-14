import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attendanceSender, sameAttendancePhone, matchesAgentResponsible, assertAgentAttendanceAllowed, ResponsibleAttendanceBlocked } from "../src/lib/whatsapp/responsible-attendance";
import { commerceDatabase } from "./helpers/commerce-database";

const full = "5511987654321", legacy = "551187654321";
const metadata = { responsible_humans: [{ phone: "5548998877665" }, { phone: full, notifyOperational: false }] };
describe("responsible attendance identity", () => {
  it.each([legacy, full, "+55 (11) 98765-4321", "11987654321", "551187654321@s.whatsapp.net", "5511987654321:4@c.us"])("recognizes the entire registered mobile: %s", phone => {
    expect(matchesAgentResponsible(metadata, { phone })).toBe(true);
  });
  it.each(["5521987654321", "5411987654321", "5511987654320", "551197654321", "551187654321@lid", "551187654321@g.us", "987654321", "abc5511987654321"])("never identifies a responsible from a suffix or an opaque ID: %s", phone => {
    expect(matchesAgentResponsible(metadata, { phone })).toBe(false);
  });
  it("does not invent a ninth digit for fixed lines or international numbers", () => {
    expect(sameAttendancePhone("551132345678", "5511932345678")).toBe(false);
    expect(sameAttendancePhone("+14155552671", "554155552671")).toBe(false);
  });
  it("uses the current complete list, including explicit removal, ahead of stale legacy fields", () => {
    const old = { responsible_human: { phone: full }, whatsapp_behavior_config: { humanHandoffNotificationNumbers: full } };
    expect(matchesAgentResponsible(old, { phone: legacy })).toBe(true);
    expect(matchesAgentResponsible({ ...old, responsible_humans: [] }, { phone: legacy })).toBe(false);
    expect(matchesAgentResponsible({ ...old, responsible_humans: [{ phone: "5521987654321" }] }, { phone: legacy })).toBe(false);
  });
  it("resolves LID only with explicit matching phone mapping", () => {
    const input = { providerChatId: "100000000000000@lid", phone: full };
    expect(attendanceSender(input)).toBeNull();
    expect(matchesAgentResponsible(metadata, { ...input, payload: { chat: { wa_chatlid: input.providerChatId, wa_chatid: `${legacy}@s.whatsapp.net` } } })).toBe(true);
    expect(attendanceSender({ ...input, payload: { chat: { wa_chatlid: "different@lid", wa_chatid: full } } })).toBeNull();
  });
  it("checks the actual group author, not the group, quoted author, or another participant", () => {
    const group = { providerChatId: "1200000000000@g.us", isGroupChat: true, phone: full };
    expect(matchesAgentResponsible(metadata, group)).toBe(false);
    expect(matchesAgentResponsible(metadata, { ...group, payload: { message: { participant_pn: legacy } } })).toBe(true);
    expect(matchesAgentResponsible(metadata, { ...group, payload: { message: { participant: "5521987654321@s.whatsapp.net", quoted: { participant: full } } } })).toBe(false);
    expect(matchesAgentResponsible(metadata, { ...group, payload: { message: { key: { participant: "123456789000000@lid", participantAlt: `${legacy}@s.whatsapp.net` } } } })).toBe(true);
  });
  it("reloads only the target agent in the target organization before each action", async () => {
    const db = commerceDatabase({ agent_registry: [
      { id: "a", organization_id: "org", metadata },
      { id: "b", organization_id: "org", metadata: {} },
      { id: "c", organization_id: "other", metadata },
    ] });
    const client = db.client as unknown as SupabaseClient;
    const input = { organizationId: "org", agentId: "b", phone: legacy };
    await expect(assertAgentAttendanceAllowed(client, input)).resolves.toBeUndefined();
    db.tables.agent_registry[1].metadata = metadata;
    await expect(assertAgentAttendanceAllowed(client, input)).rejects.toBeInstanceOf(ResponsibleAttendanceBlocked);
    db.tables.agent_registry[1].metadata = { responsible_humans: [] };
    await expect(assertAgentAttendanceAllowed(client, input)).resolves.toBeUndefined();
    await expect(assertAgentAttendanceAllowed(client, { ...input, agentId: "c" })).rejects.toThrow("conferir");
  });
});
