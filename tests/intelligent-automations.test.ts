import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  isContactWindow,
  nextContactWindow,
  observedContactWindow,
  observedPurchaseCadence,
  nextObservedWindow,
  nextContactIntersection,
} from "@/lib/automations/contact-window";

describe("contact windows", () => {
  it("keeps a weekly pattern and rejects conflicting preferred hours", () => {
    const learned = observedContactWindow(
      ["2026-08-21T22:00:00Z", "2026-08-28T22:15:00Z", "2026-09-04T22:30:00Z"],
      "America/Sao_Paulo",
    );
    expect(learned).toMatchObject({ hour: 19, weekday: 5 });
    expect(
      nextObservedWindow(
        new Date("2026-09-09T12:00:00Z"),
        learned!,
        "America/Sao_Paulo",
      ).toISOString(),
    ).toBe("2026-09-11T22:00:00.000Z");
    expect(
      nextContactIntersection(
        new Date("2026-09-09T12:00:00Z"),
        [
          { start: "09:00", end: "18:00" },
          { start: "20:00", end: "22:00" },
        ],
        "America/Sao_Paulo",
      ),
    ).toBeNull();
  });
  it("learns regular repurchases only after repeated purchases on separate days", () => {
    expect(
      observedPurchaseCadence(["2026-09-01", "2026-09-08", "2026-09-15"]),
    ).toBe(7);
    expect(
      observedPurchaseCadence(["2026-09-01", "2026-09-01", "2026-09-08"]),
    ).toBeNull();
    expect(
      observedPurchaseCadence(["2026-09-01", "2026-09-03", "2026-09-27"]),
    ).toBeNull();
  });
  it("respects configured minutes and exclusive closing boundary", () => {
    expect(
      isContactWindow(
        new Date("2026-09-09T12:14:00Z"),
        "09:15",
        "20:30",
        "America/Sao_Paulo",
      ),
    ).toBe(false);
    expect(
      isContactWindow(
        new Date("2026-09-09T12:15:00Z"),
        "09:15",
        "20:30",
        "America/Sao_Paulo",
      ),
    ).toBe(true);
    expect(
      isContactWindow(
        new Date("2026-09-09T23:30:00Z"),
        "09:15",
        "20:30",
        "America/Sao_Paulo",
      ),
    ).toBe(false);
  });
  it("reschedules across midnight and respects overnight windows", () => {
    expect(
      nextContactWindow(
        new Date("2026-09-09T23:35:00Z"),
        "09:15",
        "20:30",
        "America/Sao_Paulo",
      ).toISOString(),
    ).toBe("2026-09-10T12:15:00.000Z");
    expect(
      isContactWindow(
        new Date("2026-09-10T04:00:00Z"),
        "22:00",
        "02:00",
        "America/Sao_Paulo",
      ),
    ).toBe(true);
  });
  it("handles DST gaps without inventing a local time", () => {
    expect(
      nextContactWindow(
        new Date("2026-03-08T06:50:00Z"),
        "02:30",
        "04:00",
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-03-08T07:00:00.000Z");
  });
  it("does not confuse repeated clicks on one day with an established habit", () => {
    expect(
      observedContactWindow(
        Array(20).fill("2026-09-09T21:00:00Z"),
        "America/Sao_Paulo",
      ),
    ).toBeNull();
    expect(
      observedContactWindow(
        [
          "2026-09-07T21:00:00Z",
          "2026-09-08T21:30:00Z",
          "2026-09-09T21:45:00Z",
        ],
        "America/Sao_Paulo",
      ),
    ).toMatchObject({ hour: 18, observedDays: 3, confidence: "low" });
  });
});

describe("durable automation dispatch", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      "create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create table organizations(id uuid primary key); create table leads(id uuid primary key); create table conversations(id uuid primary key);",
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/0114_intelligent_automation_dispatch.sql",
        "utf8",
      ),
    );
  }, 45000);
  afterAll(async () => {
    await db?.close();
  });
  async function fixture() {
    const org = randomUUID(),
      lead = randomUUID(),
      conversation = randomUUID();
    await db.query("insert into organizations values($1)", [org]);
    await db.query("insert into leads values($1)", [lead]);
    await db.query("insert into conversations values($1)", [conversation]);
    async function task() {
      const id = randomUUID();
      await db.query(
        "insert into automation_dispatches(id,organization_id,lead_id,conversation_id,opportunity_key,journey,scheduled_for,event_data) values($1::uuid,$2,$3,$4,$1::text,'conversation',now()-interval '1 minute','{}')",
        [id, org, lead, conversation],
      );
      return id;
    }
    return { org, lead, task };
  }
  async function claim(id: string) {
    return (
      await db.query<{ result: { id: string; claim_token: string } | null }>(
        "select claim_automation_dispatch($1) result",
        [id],
      )
    ).rows[0].result;
  }
  it("claims an opportunity once and coordinates agents on the same lead", async () => {
    const f = await fixture(),
      a = await f.task(),
      b = await f.task();
    expect(await claim(a)).toMatchObject({ id: a });
    expect(await claim(a)).toBeNull();
    expect(await claim(b)).toBeNull();
  });
  it("recovers work before sending with a new fencing token", async () => {
    const f = await fixture(),
      a = await f.task();
    const first = await claim(a);
    await db.query(
      "update automation_dispatches set lease_until=now()-interval '1 minute' where id=$1",
      [a],
    );
    const next = await claim(a);
    expect(next?.id).toBe(a);
    expect(next?.claim_token).not.toBe(first?.claim_token);
  });
  it("does not retry an ambiguous delivery or approach the lead again", async () => {
    const f = await fixture(),
      a = await f.task(),
      b = await f.task();
    await claim(a);
    await db.query(
      "update automation_dispatches set status='sending',lease_until=now()-interval '1 minute' where id=$1",
      [a],
    );
    expect(await claim(a)).toBeNull();
    expect(await claim(b)).toBeNull();
    const states = await db.query<{ status: string }>(
      "select status from automation_dispatches where id in ($1,$2) order by status",
      [a, b],
    );
    expect(states.rows.map((x) => x.status)).toEqual(["skipped", "uncertain"]);
  });
  it("does not coordinate unrelated organizations together", async () => {
    const f = await fixture(),
      g = await fixture();
    expect(await claim(await f.task())).not.toBeNull();
    expect(await claim(await g.task())).not.toBeNull();
  });
  it("keeps company policy off until explicitly selected and restricts database access", async () => {
    const f = await fixture();
    await db.query(
      "insert into automation_policies(organization_id) values($1)",
      [f.org],
    );
    expect(
      (
        await db.query<{ follow_up_enabled: boolean }>(
          "select follow_up_enabled from automation_policies where organization_id=$1",
          [f.org],
        )
      ).rows[0].follow_up_enabled,
    ).toBe(false);
    await db.exec("set role authenticated");
    await expect(db.query("select * from automation_policies")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.query("select claim_automation_dispatch($1)", [randomUUID()]),
    ).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
});
