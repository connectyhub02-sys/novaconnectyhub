import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { estimateReplies, repliesForBalance } from "../src/lib/billing/reply-estimate";

const own = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222", fresh = "33333333-3333-4333-8333-333333333333";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table usage_events(organization_id uuid, provider text, feature_code text, status text, billing_mode text, connecty_charge_credits numeric, occurred_at timestamptz default now());`);
  await db.exec(readFileSync("supabase/migrations/0182_reply_credit_estimate.sql", "utf8"));
  // Own company: 10 replies at 40 credits plus 10 credits of memories each; voice and API are excluded.
  for (let i = 0; i < 10; i++) {
    await db.query("insert into usage_events values($1,'gemini','chat_completion','completed','customer_billable',40),($1,'gemini','lead_memory','completed','customer_billable',10)", [own]);
  }
  await db.query("insert into usage_events values($1,'elevenlabs','voice_reply_whatsapp','completed','customer_billable',500),($1,'gemini','external_ai','completed','customer_billable',900)", [own]);
  await db.query("insert into usage_events values($1,'gemini','chat_completion','completed','customer_billable',999,now()-interval '40 days')", [own]);
  // Another company: 2 replies at 100.
  await db.query("insert into usage_events values($1,'gemini','chat_completion','completed','trial_billable',100),($1,'gemini','chat_completion','completed','trial_billable',100),($1,'gemini','chat_completion','completed','internal_shadow',300)", [other]);
}, 30000);
afterAll(async () => { await db?.close(); });

const estimate = async (org: string) => (await db.query<{ r: Record<string, unknown> }>("select reply_credit_estimate($1) r", [org])).rows[0].r;

describe("replies the balance covers", () => {
  it("uses the company's own attendance average when it has enough replies", async () => {
    expect(await estimate(own)).toEqual({ credits_per_reply: 50, basis: "organization", replies: 10 });
  });

  it("falls back to the platform average for new companies, ignoring internal use", async () => {
    // (500 + 200) credits / 12 replies.
    expect(await estimate(fresh)).toEqual({ credits_per_reply: 58.33, basis: "platform", replies: 12 });
    expect(await estimate(other)).toMatchObject({ basis: "platform" });
  });

  it("is private to the server", async () => {
    await db.exec("set role authenticated");
    await expect(db.query("select reply_credit_estimate($1)", [own])).rejects.toThrow();
    await db.exec("reset role");
  });

  it("rounds down and caches per organization", async () => {
    expect(repliesForBalance(999, 50)).toBe(19);
    expect(repliesForBalance(0, 50)).toBe(0);
    expect(repliesForBalance(100, null)).toBeNull();
    let calls = 0;
    const client = { rpc: async () => { calls++; return { data: { credits_per_reply: 50, basis: "organization" }, error: null }; } };
    expect(await estimateReplies(client as never, "org-a", 1000, 0)).toEqual({ estimatedReplies: 20, creditsPerReply: 50, basis: "organization" });
    expect((await estimateReplies(client as never, "org-a", 500, 60_000)).estimatedReplies).toBe(10);
    expect(calls).toBe(1);
    const broken = { rpc: async () => { throw new Error("down"); } };
    expect(await estimateReplies(broken as never, "org-b", 1000, 0)).toEqual({ estimatedReplies: null, creditsPerReply: null, basis: "none" });
  });
});
