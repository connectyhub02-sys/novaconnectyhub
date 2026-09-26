import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const org = randomUUID();
const lead = randomUUID();
const order = randomUUID();

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table organizations(id uuid primary key);
    create table leads(id uuid primary key, organization_id uuid);
    create table sales_catalog_orders(id uuid primary key, organization_id uuid, lead_id uuid);
    create table customer_agenda_bookings(id uuid primary key);
    create table intelligence_events(id uuid default gen_random_uuid(), scope text, organization_id uuid, source_type text, source_id uuid, event_type text,
      title text, summary text, visibility text, tags text[], payload jsonb);
    create table automation_policies(organization_id uuid primary key, follow_up_enabled boolean not null default false);
    create table automation_dispatches(id uuid primary key default gen_random_uuid(), journey text not null
      constraint automation_dispatches_journey_check check (journey in ('conversation','recovery','return','recommendation')));
    create table public.customer_lead_visits (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      lead_id uuid not null references public.leads(id),
      description text not null check(length(description) between 1 and 300),
      kind text not null check(kind in ('visit','purchase','service')),
      occurred_at timestamptz not null,
      return_at timestamptz,
      return_status text not null default 'pending' check(return_status in ('pending','scheduled','cancelled','completed')),
      booking_id uuid references public.customer_agenda_bookings(id),
      order_id uuid references public.sales_catalog_orders(id),
      request_key text not null,
      created_by uuid references auth.users(id),
      created_at timestamptz not null default now(),
      check(return_at is null or return_at>occurred_at),
      unique(organization_id,request_key));
  `);
  await db.exec(readFileSync("supabase/migrations/0162_post_sale_returns.sql", "utf8").replace("notify pgrst, 'reload schema';", ""));
  await db.query("insert into organizations values ($1)", [org]);
  await db.query("insert into leads values ($1,$2)", [lead, org]);
  await db.query("insert into sales_catalog_orders values ($1,$2,$3)", [order, org, lead]);
}, 30000);
afterAll(async () => { await db?.close(); });

type Visit = { id: string; return_status: string; return_note: string | null; repeat_every_days: number | null; repeat_remaining: number; source: string; order_id: string | null };
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString();
async function record(key: string, options: { description?: string; occurred?: string; returnAt?: string | null; note?: string | null; repeatDays?: number | null;
  repeatRemaining?: number; source?: string; order?: string | null } = {}) {
  const result = await db.query<{ visit: Visit }>("select record_customer_visit_v2($1,$2,$3,'purchase',$4,$5,$6,null,$7,$8,$9,$10,$11,null) as visit", [
    org, lead, options.description ?? "Corte de cabelo", options.occurred ?? day(-1), options.returnAt === undefined ? day(24) : options.returnAt, key,
    options.note ?? null, options.repeatDays ?? null, options.repeatRemaining ?? 0, options.source ?? "manual", options.order ?? null]);
  return result.rows[0].visit;
}

describe.sequential("returns with note, repetition and origin", () => {
  it("records the note, repetition and origin with the return", async () => {
    const options = { note: "Perguntar se quer marcar o próximo corte", repeatDays: 25, repeatRemaining: 2, source: "product_rule", order, occurred: day(-1), returnAt: day(24) };
    const visit = await record("rule-1", options);
    expect(visit).toMatchObject({ return_status: "pending", return_note: "Perguntar se quer marcar o próximo corte", repeat_every_days: 25, repeat_remaining: 2, source: "product_rule", order_id: order });
    expect((await record("rule-1", options)).id).toBe(visit.id);
  });

  it("cancels the pending return when the customer comes back before it", async () => {
    const first = await record("cut-a", { description: "Barba", occurred: day(-10) });
    await record("cut-b", { description: "barba", occurred: day(-2) });
    const status = (await db.query<{ return_status: string }>("select return_status from customer_lead_visits where id=$1", [first.id])).rows[0];
    expect(status.return_status).toBe("cancelled");
  });

  it.each([
    ["an unknown origin", { source: "robot" }],
    ["a repetition without interval", { repeatRemaining: 2 }],
    ["too many repetitions", { repeatDays: 7, repeatRemaining: 9 }],
    ["an empty note", { note: "   " }],
    ["an order of another lead", { order: randomUUID() }],
  ])("rejects %s", async (_label, options) => {
    await expect(record(`bad-${randomUUID()}`, options)).rejects.toThrow(/INVALID_VISIT|LEAD_SCOPE/);
  });

  it("accepts the new follow-up journeys and keeps returns on by default", async () => {
    await db.query("insert into automation_dispatches(journey) values ('post_sale'),('birthday')");
    await expect(db.query("insert into automation_dispatches(journey) values ('mass_message')")).rejects.toThrow();
    await db.query("insert into automation_policies(organization_id) values ($1)", [org]);
    expect((await db.query<{ returns_enabled: boolean }>("select returns_enabled from automation_policies where organization_id=$1", [org])).rows[0].returns_enabled).toBe(true);
  });
});
