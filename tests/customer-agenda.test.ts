import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
describe("customer agenda", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table organizations(id uuid primary key);create table leads(id uuid primary key,organization_id uuid,status text default 'active',last_message_at timestamptz default now());create table conversations(id uuid primary key,organization_id uuid,lead_id uuid);create table agent_registry(id uuid primary key,organization_id uuid);create table agent_runs(id uuid primary key);create table sales_catalog_orders(id uuid primary key);",
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/0114_intelligent_automation_dispatch.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/0115_customer_agenda_and_returns.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/0116_customer_agenda_notifications.sql",
        "utf8",
      ),
    );
    await db.exec(
      "create table intelligence_events(scope text,organization_id uuid,source_type text,source_id text,event_type text,title text,summary text,visibility text,tags text[],payload jsonb)",
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/0117_lead_relationship_profiles.sql",
        "utf8",
      ),
    );
    await db.exec(
      "create table whatsapp_instances(id uuid primary key,organization_id uuid)",
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/0118_automation_destination_discovery.sql",
        "utf8",
      ),
    );
  }, 45000);
  afterAll(async () => {
    await db?.close();
  });
  async function fixture(kind = "service", capacity = 1) {
    const org = randomUUID(),
      lead = randomUUID(),
      resource = randomUUID();
    await db.query("insert into organizations values($1)", [org]);
    await db.query("insert into leads(id,organization_id) values($1,$2)", [
      lead,
      org,
    ]);
    await db.query(
      "insert into customer_agenda_settings(organization_id,enabled) values($1,true)",
      [org],
    );
    await db.query(
      "insert into customer_agenda_resources(id,organization_id,name,service_name,kind,duration_minutes,capacity,weekly_hours,return_days) values($1,$2,'Profissional ou mesa','Atendimento',$3,60,$4,$5,30)",
      [
        resource,
        org,
        kind,
        capacity,
        JSON.stringify([
          { days: [1, 2, 3, 4, 5, 6, 7], start: "00:00", end: "23:59" },
        ]),
      ],
    );
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 7);
    start.setUTCHours(15, 0, 0, 0);
    async function book(
      offset = 0,
      party = 1,
      extra: {
        key?: string;
        replace?: string;
        version?: number;
        lead?: string;
      } = {},
    ) {
      return (
        await db.query<{
          result: {
            id: string;
            version: number;
            status: string;
            starts_at: string;
          };
        }>(
          "select reserve_customer_appointment($1,$2,$3,$4,$5,$6,null,null,$7,$8) result",
          [
            org,
            resource,
            extra.lead ?? lead,
            new Date(start.getTime() + offset * 60000).toISOString(),
            party,
            extra.key ?? randomUUID(),
            extra.replace ?? null,
            extra.version ?? null,
          ],
        )
      ).rows[0].result;
    }
    return { org, lead, resource, start, book };
  }
  it("prevents overlapping bookings and permits adjacent appointments", async () => {
    const f = await fixture();
    await f.book();
    await expect(f.book(30)).rejects.toThrow("SLOT_UNAVAILABLE");
    expect((await f.book(60)).status).toBe("booked");
  });
  it("uses peak simultaneous occupancy for resources with capacity", async () => {
    const f = await fixture("service", 2);
    await f.book();
    await f.book(60);
    await f.book(30);
    await expect(f.book(45)).rejects.toThrow("SLOT_UNAVAILABLE");
  });
  it("does not let two parties share a reserved restaurant table", async () => {
    const f = await fixture("table", 6);
    await f.book(0, 3);
    await expect(f.book(0, 2)).rejects.toThrow("SLOT_UNAVAILABLE");
    await expect(f.book(60, 7)).rejects.toThrow("INVALID_APPOINTMENT");
  });
  it("reuses idempotent requests and rejects a changed payload", async () => {
    const f = await fixture(),
      key = randomUUID(),
      first = await f.book(0, 1, { key });
    expect((await f.book(0, 1, { key })).id).toBe(first.id);
    await expect(f.book(60, 1, { key })).rejects.toThrow(
      "REQUEST_KEY_CONFLICT",
    );
  });
  it("preserves the old booking if a reschedule conflicts", async () => {
    const f = await fixture(),
      first = await f.book();
    await f.book(60);
    await expect(
      f.book(60, 1, { replace: first.id, version: first.version }),
    ).rejects.toThrow("SLOT_UNAVAILABLE");
    expect(
      (
        await db.query<{ starts_at: Date }>(
          "select starts_at from customer_agenda_bookings where id=$1",
          [first.id],
        )
      ).rows[0].starts_at.toISOString(),
    ).toBe(f.start.toISOString());
  });
  it("requires the current version to reschedule", async () => {
    const f = await fixture(),
      first = await f.book();
    await expect(f.book(60, 1, { replace: first.id })).rejects.toThrow(
      "STALE_BOOKING",
    );
    const moved = await f.book(60, 1, { replace: first.id, version: 1 });
    expect(moved.version).toBe(2);
    await expect(
      f.book(120, 1, { replace: first.id, version: 1 }),
    ).rejects.toThrow("STALE_BOOKING");
  });
  it("refuses cross-tenant leads and blocked dates", async () => {
    const f = await fixture(),
      other = await fixture();
    await expect(f.book(0, 1, { lead: other.lead })).rejects.toThrow(
      "LEAD_SCOPE",
    );
    await db.query(
      "update customer_agenda_resources set blocked_dates=array[$1::date] where id=$2",
      [f.start.toISOString().slice(0, 10), f.resource],
    );
    await expect(f.book()).rejects.toThrow("OUTSIDE_HOURS");
  });
  it("only creates the next return after recorded completion", async () => {
    const f = await fixture(),
      first = await f.book();
    await db.query(
      "select update_customer_appointment($1,$2,1,'confirm','test')",
      [f.org, first.id],
    );
    expect(
      (await db.query("select * from customer_lead_visits")).rows,
    ).toHaveLength(0);
    await db.query(
      "update customer_agenda_bookings set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=$1",
      [first.id],
    );
    await db.query(
      "select update_customer_appointment($1,$2,2,'complete','test')",
      [f.org, first.id],
    );
    const visits = await db.query<{ return_at: Date; occurred_at: Date }>(
      "select return_at,occurred_at from customer_lead_visits where organization_id=$1",
      [f.org],
    );
    expect(visits.rows).toHaveLength(1);
    expect(
      visits.rows[0].return_at.getTime() - visits.rows[0].occurred_at.getTime(),
    ).toBe(30 * 86400000);
  });
  it("binds action buttons to the recipient, organization and current booking version", async () => {
    const f = await fixture(),
      first = await f.book();
    const notice = randomUUID(),
      token = randomUUID();
    await db.query(
      "insert into customer_agenda_notices(id,organization_id,booking_id,booking_version,audience,recipient_phone,kind,due_at) values($1,$2,$3,1,'lead','5547999999999','reminder',now())",
      [notice, f.org, first.id],
    );
    await db.query(
      "insert into customer_agenda_actions(token,notice_id,organization_id,booking_id,booking_version,recipient_phone,action,expires_at) values($1,$2,$3,$4,1,'5547999999999','confirm',now()+interval '1 day')",
      [token, notice, f.org, first.id],
    );
    await expect(
      db.query("select consume_customer_agenda_action($1,$2,'5547888888888')", [
        f.org,
        token,
      ]),
    ).rejects.toThrow("ACTION_UNAVAILABLE");
    await expect(
      db.query("select consume_customer_agenda_action($1,$2,'5547999999999')", [
        randomUUID(),
        token,
      ]),
    ).rejects.toThrow("ACTION_UNAVAILABLE");
    const accepted = await db.query(
      "select consume_customer_agenda_action($1,$2,'5547999999999') result",
      [f.org, token],
    );
    expect(
      await db.query(
        "select consume_customer_agenda_action($1,$2,'5547999999999') result",
        [f.org, token],
      ),
    ).toEqual(accepted);
    const stale = randomUUID();
    await db.query(
      "insert into customer_agenda_actions(token,notice_id,organization_id,booking_id,booking_version,recipient_phone,action,expires_at) values($1,$2,$3,$4,1,'5547999999999','cancel',now()+interval '1 day')",
      [stale, notice, f.org, first.id],
    );
    await expect(
      db.query("select consume_customer_agenda_action($1,$2,'5547999999999')", [
        f.org,
        stale,
      ]),
    ).rejects.toThrow("STALE_BOOKING");
  });
  it("does not replace a recent visit with a historical import or duplicate request", async () => {
    const f = await fixture(),
      key = randomUUID();
    const now = new Date(Date.now() - 60000).toISOString(),
      older = new Date(Date.now() - 86400000).toISOString(),
      back = new Date(Date.now() + 30 * 86400000).toISOString();
    const sql =
      "select record_customer_visit($1,$2,'Corte','service',$3,$4,$5,null) result";
    const first = await db.query<{ result: { id: string } }>(sql, [
      f.org,
      f.lead,
      now,
      back,
      key,
    ]);
    expect(
      (
        await db.query<{ result: { id: string } }>(sql, [
          f.org,
          f.lead,
          now,
          back,
          key,
        ])
      ).rows[0].result.id,
    ).toBe(first.rows[0].result.id);
    const historical = await db.query<{ result: { return_status: string } }>(
      sql,
      [f.org, f.lead, older, back, randomUUID()],
    );
    expect(historical.rows[0].result.return_status).toBe("cancelled");
    await expect(
      db.query(sql, [f.org, randomUUID(), now, back, key]),
    ).rejects.toThrow("LEAD_SCOPE");
    expect(
      (
        await db.query(
          "select * from customer_lead_visits where organization_id=$1 and return_status='pending'",
          [f.org],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("rejects reusing a table request for a different party size", async () => {
    const f = await fixture("table", 6),
      key = randomUUID();
    await f.book(0, 2, { key });
    await expect(f.book(0, 3, { key })).rejects.toThrow("REQUEST_KEY_CONFLICT");
  });
  it("discovers destinations once per interval and refuses other companies", async () => {
    const f = await fixture(),
      instance = randomUUID();
    await db.query("insert into whatsapp_instances values($1,$2)", [
      instance,
      f.org,
    ]);
    const query =
      "select claim_automation_destination_discovery($1,$2) claimed";
    expect(
      (await db.query<{ claimed: boolean }>(query, [f.org, instance])).rows[0]
        .claimed,
    ).toBe(true);
    expect(
      (await db.query<{ claimed: boolean }>(query, [f.org, instance])).rows[0]
        .claimed,
    ).toBe(false);
    await expect(db.query(query, [randomUUID(), instance])).rejects.toThrow(
      "INSTANCE_SCOPE",
    );
  });
});
