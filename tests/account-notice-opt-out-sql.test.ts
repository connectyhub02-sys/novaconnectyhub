import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it("persists recipient opt-out across senders and cancels only unsent notices in the same account", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table organizations(id uuid primary key,owner_id uuid,billing_organization_id uuid);
      create table billing_notification_events(id uuid primary key,organization_id uuid,recipient_phone text,status text,next_attempt_at timestamptz,error_message text,delivery_claimed_at timestamptz,delivery_uncertain boolean default false);`);
    await db.exec(readFileSync("supabase/migrations/0122_account_notice_opt_out.sql", "utf8"));
    const account = randomUUID(), child = randomUUID(), foreign = randomUUID(), owner = randomUUID();
    await db.query("insert into organizations values($1,$2,null),($3,$2,$1),($4,$5,null)", [account, owner, child, foreign, randomUUID()]);
    const cases = [
      [account, "5511999999999", "pending", null, false], [child, "5511999999999", "failed", null, false],
      [foreign, "5511999999999", "pending", null, false], [account, "5511888888888", "pending", null, false],
      [account, "5511999999999", "sent", null, false], [account, "5511999999999", "pending", new Date().toISOString(), false],
      [account, "5511999999999", "failed", null, true],
    ];
    const ids = cases.map(() => randomUUID());
    for (let i = 0; i < cases.length; i++) await db.query("insert into billing_notification_events(id,organization_id,recipient_phone,status,delivery_claimed_at,delivery_uncertain) values($1,$2,$3,$4,$5,$6)", [ids[i], ...cases[i]]);
    const result = await db.query<{ row: { public_key: string; enabled: boolean } }>("select ensure_account_notice_recipient($1,$2) as row", [account, "5511999999999"]);
    const key = result.rows[0].row.public_key;
    await db.query("update account_notice_recipients set enabled=false where public_key=$1", [key]);
    const again = await db.query<{ row: { public_key: string; enabled: boolean } }>("select ensure_account_notice_recipient($1,$2) as row", [account, "5511999999999"]);
    expect(again.rows[0].row).toMatchObject({ public_key: key, enabled: false });
    for (let i = 0; i < cases.length; i++) {
      const status = (await db.query<{ status: string }>("select status from billing_notification_events where id=$1", [ids[i]])).rows[0].status;
      expect(status).toBe(i < 2 ? "skipped" : cases[i][2]);
    }
    const duringMute = randomUUID();
    await db.query("insert into billing_notification_events(id,organization_id,recipient_phone,status) values($1,$2,$3,'pending')", [duringMute, child, "5511999999999"]);
    await db.query("update account_notice_recipients set enabled=true where public_key=$1", [key]);
    expect((await db.query("select status from billing_notification_events where id=$1", [duringMute])).rows[0]).toEqual({ status: "skipped" });
    expect((await db.query("select status from billing_notification_events where id=$1", [ids[0]])).rows[0]).toEqual({ status: "skipped" });
    await expect(db.query("select ensure_account_notice_recipient($1,$2)", [child, "5511999999999"])).rejects.toThrow("NOTICE_ACCOUNT_REQUIRED");
    const permissions = await db.query("select has_table_privilege('anon','account_notice_recipients','SELECT') as readable,has_function_privilege('authenticated','ensure_account_notice_recipient(uuid,text)','EXECUTE') as callable");
    expect(permissions.rows[0]).toEqual({ readable: false, callable: false });
  } finally { await db.close(); }
});
