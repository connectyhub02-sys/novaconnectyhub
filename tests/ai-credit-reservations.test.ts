import {describe,it,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {aiDatabaseFixture as fixture} from "./helpers/ai-database";
describe("Shared AI wallet reservations",()=>{
it("allows repeated use without minute or account spending caps",async()=>{const f=await fixture();try{
  await f.db.query("update ai_projects set requests_per_minute=1,monthly_credit_limit=1 where id=$1",[f.project]);
  await f.db.query("insert into organization_billing_limits(organization_id,daily_credit_limit,monthly_credit_limit) values($1,1,1)",[f.org]);
  for(let i=0;i<35;i++) await f.claim(`call-${i}`);
  const request=await f.claim("spend");await f.reserve(request.id,30);await f.finish(request.id,"completed",20);
  expect(Number((await f.db.query<{balance_credits:number}>("select balance_credits from credit_wallets")).rows[0].balance_credits)).toBe(80);
}finally{await f.db.close();}});
it("aggregates the entire selected period and isolates accounts and projects",async()=>{const f=await fixture();try{
  const other=randomUUID(),otherProject=randomUUID();
  await f.db.query("insert into organizations(id) values($1)",[other]);
  await f.db.query("insert into ai_projects(id,organization_id,name) values($1,$2,'Other')",[otherProject,other]);
  await f.db.query("insert into ai_requests(organization_id,project_id,key_id,idempotency_key,request_hash,status,charged_credits) select $1,$2,$3,'bulk-'||n,'same','completed',0.125 from generate_series(1,125) n",[f.org,f.project,f.key]);
  await f.db.query("insert into ai_requests(organization_id,project_id,key_id,idempotency_key,request_hash,status,charged_credits,created_at) values($1,$2,$3,'old','same','completed',99,now()-interval '100 days')",[f.org,f.project,f.key]);
  const report=(await f.db.query<{r:{totals:{requests:number;credits:number};daily:unknown[];projects:unknown[]}}>("select ai_usage_summary($1,30,$2) r",[f.org,f.project])).rows[0].r;
  expect(report.totals.requests).toBe(125);expect(Number(report.totals.credits)).toBe(15.625);expect(report.daily).toHaveLength(30);expect(report.projects).toHaveLength(1);
  const empty=(await f.db.query<{r:{totals:{requests:number}}}>("select ai_usage_summary($1,7) r",[other])).rows[0].r;expect(empty.totals.requests).toBe(0);
  await expect(f.db.query("select ai_usage_summary($1,30,$2)",[f.org,otherProject])).rejects.toThrow("PROJECT_NOT_FOUND");
  await f.db.exec("set role authenticated");await expect(f.db.query("select ai_usage_summary($1,30)",[f.org])).rejects.toThrow("permission denied");
}finally{await f.db.close();}});
it("creates the project and its first key atomically",async()=>{const f=await fixture();try{
  const hash=randomUUID();const created=await f.db.query<{id:string}>("select create_ai_project_with_key($1,'My app',$2,'prefix') id",[f.org,hash]);
  const projectId=created.rows[0].id;
  expect((await f.db.query("select * from ai_api_keys where project_id=$1",[projectId])).rows).toHaveLength(1);
  await expect(f.db.query("select create_ai_project_with_key($1,'Rolled back',$2,'prefix')",[f.org,hash])).rejects.toThrow();
  expect((await f.db.query("select * from ai_projects where name='Rolled back'")).rows).toHaveLength(0);
}finally{await f.db.close();}});
it("serializes budgets, protects legacy agent spending and settles only once",async()=>{const f=await fixture();try{const a=await f.claim("one"),b=await f.claim("two");await f.reserve(a.id,80);await expect(f.reserve(b.id,30)).rejects.toThrow("ai_insufficient_credits");await expect(f.db.query("select debit_credit_wallet($1,30)",[f.org])).rejects.toThrow("Insufficient available");await f.db.query("select debit_credit_wallet($1,10)",[f.org]);await f.finish(a.id,"completed",12.123456);await f.finish(a.id,"completed",12.123456);const w=(await f.db.query<Record<string,number>>("select balance_credits,reserved_credits,lifetime_used_credits from credit_wallets")).rows[0];expect(Number(w.balance_credits)).toBeCloseTo(77.876544,6);expect(Number(w.reserved_credits)).toBe(0);expect(Number(w.lifetime_used_credits)).toBeCloseTo(22.123456,6);expect((await f.db.query("select * from usage_events")).rows).toHaveLength(1);}finally{await f.db.close();}});
it("keeps uncertain budgets; releases a failed call and cannot execute an idempotency key twice",async()=>{const f=await fixture();try{const a=await f.claim("one");expect((await f.claim("one")).claimed).toBe(false);await expect(f.claim("one","changed")).rejects.toThrow("ai_idempotency_conflict");await f.reserve(a.id,80);await f.finish(a.id,"uncertain");expect(Number((await f.db.query<Record<string,number>>("select reserved_credits from credit_wallets")).rows[0].reserved_credits)).toBe(80);await f.finish(a.id,"failed");expect(Number((await f.db.query<Record<string,number>>("select reserved_credits from credit_wallets")).rows[0].reserved_credits)).toBe(0);}finally{await f.db.close();}});
it("removes project caps while preserving revocation and server-only mutation",async()=>{const f=await fixture();try{await f.db.query("update ai_projects set monthly_credit_limit=20 where id=$1",[f.project]);const a=await f.claim("one");await f.reserve(a.id,21);await f.db.query("update ai_api_keys set status='revoked' where id=$1",[f.key]);await expect(f.claim("two")).rejects.toThrow("ai_key_inactive");await f.db.exec("set role authenticated");await expect(f.db.query("select finish_ai_request($1,'failed')",[a.id])).rejects.toThrow("permission denied");}finally{await f.db.close();}});
});
