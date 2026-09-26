import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Ingest = typeof import("../src/lib/whatsapp/webhook-ingest");
const ingest = serverModuleHarness<Ingest>("src/lib/whatsapp/webhook-ingest.ts", {}, ["shouldReinstateLeadContact"]);

describe("back on the list when the lead talks again", () => {
  const optedOut = { whatsapp_opt_out: true, opt_out: { requested_at: "2026-09-26T12:00:00Z", source: "public_link" } };

  it("only after some minutes, so the same click is not undone", () => {
    expect(ingest.shouldReinstateLeadContact(optedOut, "2026-09-26T12:00:25Z")).toBe(false);
    expect(ingest.shouldReinstateLeadContact(optedOut, "2026-09-26T12:15:00Z")).toBe(true);
    expect(ingest.shouldReinstateLeadContact({}, "2026-09-26T12:15:00Z")).toBe(false);
  });

  it("lifts only the pause caused by leaving the list", async () => {
    const db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table organizations(id uuid primary key);
      create table leads(id uuid primary key, organization_id uuid, status text default 'active', metadata jsonb default '{}');
      create table automation_lead_profiles(organization_id uuid, lead_id uuid, preferences jsonb default '{}', updated_at timestamptz, primary key(organization_id, lead_id));
      create table automation_dispatches(organization_id uuid, lead_id uuid, status text, reason text, lease_until timestamptz, updated_at timestamptz);
      create table customer_agenda_bookings(id uuid primary key, organization_id uuid, lead_id uuid);
      create table customer_agenda_notices(organization_id uuid, booking_id uuid, audience text, status text, reason text, lease_until timestamptz, updated_at timestamptz);
      create table custom_software_requests(id uuid primary key, organization_id uuid, lead_id uuid);
      create table custom_software_meeting_notices(request_id uuid, state text, error_code text, updated_at timestamptz);
      create table customer_lead_visits(organization_id uuid, lead_id uuid, return_status text);`);
    await db.exec(readFileSync("supabase/migrations/0123_lead_contact_opt_out.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/0164_opt_out_return.sql", "utf8").replace("notify pgrst, 'reload schema';", ""));
    const org = randomUUID(), clicked = randomUUID(), ownerPaused = randomUUID();
    await db.query("insert into organizations values ($1)", [org]);
    await db.query("insert into leads(id,organization_id) values ($1,$3),($2,$3)", [clicked, ownerPaused, org]);
    await db.query("insert into automation_lead_profiles(organization_id,lead_id,preferences) values ($1,$2,'{\"paused\":true}')", [org, ownerPaused]);
    await db.query("select opt_out_lead_contact($1,$2,'public_link')", [org, clicked]);
    // The owner paused this lead on purpose before the opt-out: that pause is not the opt-out's to lift.
    await db.query("select opt_out_lead_contact($1,$2,'public_link')", [org, ownerPaused]);

    expect((await db.query<{ ok: boolean }>("select reinstate_lead_contact($1,$2) as ok", [org, clicked])).rows[0].ok).toBe(true);
    const lead = (await db.query<{ metadata: Record<string, unknown> }>("select metadata from leads where id=$1", [clicked])).rows[0].metadata;
    expect(lead.whatsapp_opt_out).toBeUndefined();
    expect(lead.opt_out).toBeUndefined();
    expect((lead.opt_out_history as unknown[]).length).toBe(1);
    const profile = (await db.query<{ preferences: Record<string, unknown> }>("select preferences from automation_lead_profiles where lead_id=$1", [clicked])).rows[0].preferences;
    expect(profile.paused).toBeUndefined();
    const link = (await db.query<{ link: { enabled: boolean } }>("select ensure_lead_contact_link($1,$2) as link", [org, clicked])).rows[0].link;
    expect(link.enabled).toBe(true);

    await db.query("select reinstate_lead_contact($1,$2)", [org, ownerPaused]);
    const kept = (await db.query<{ preferences: Record<string, unknown> }>("select preferences from automation_lead_profiles where lead_id=$1", [ownerPaused])).rows[0].preferences;
    expect(kept.paused).toBe(true);
    expect((await db.query<{ ok: boolean }>("select reinstate_lead_contact($1,$2) as ok", [org, clicked])).rows[0].ok).toBe(false);
    await db.close();
  }, 30000);
});
