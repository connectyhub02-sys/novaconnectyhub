import {expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {aiDatabaseFixture} from "./helpers/ai-database";
async function fixture(){const f=await aiDatabaseFixture();const user=randomUUID();await f.db.query("insert into auth.users values($1)",[user]);await f.db.exec("alter table usage_events add column user_id uuid");await f.db.exec(readFileSync("supabase/migrations/0197_meta_trend_research.sql","utf8"));
 const id=randomUUID();await f.db.query("insert into meta_trend_jobs(id,organization_id,billing_organization_id,user_id,input_hash,brief,model,prices) values($1,$2,$2,$3,'hash','{}','gemini-test','{}')",[id,f.org,user]);return {...f,id};}
it("reserves against the shared wallet, settles once and preserves unrelated holds",async()=>{const f=await fixture();try{
 await f.db.query("select reserve_meta_trend($1,80)",[f.id]);
 await expect(f.db.query("select debit_credit_wallet($1,30)",[f.org])).rejects.toThrow(/Insufficient/);
 await f.db.query("update credit_wallets set reserved_credits=reserved_credits+5 where organization_id=$1",[f.org]);
 await f.db.query("update meta_trend_jobs set status='generated',provider_response='{}',settlement=$2 where id=$1",[f.id,{input:10,output:20,cost:.1,charge:12,billingMode:"customer_billable",metering:{search:1}}]);
 await f.db.query("select finish_meta_trend($1)",[f.id]);await f.db.query("select finish_meta_trend($1)",[f.id]);
 const w=(await f.db.query<{balance_credits:number;reserved_credits:number}>("select * from credit_wallets")).rows[0];expect(Number(w.balance_credits)).toBe(88);expect(Number(w.reserved_credits)).toBe(5);
 expect((await f.db.query("select * from usage_events")).rows).toHaveLength(1);expect((await f.db.query("select * from credit_transactions")).rows).toHaveLength(1);
}finally{await f.db.close();}},30000);
it("retains uncertain reservations, rejects direct client access and releases definitive failures",async()=>{const f=await fixture();try{
 await f.db.query("select reserve_meta_trend($1,80)",[f.id]);await f.db.query("update meta_trend_jobs set status='uncertain' where id=$1",[f.id]);
 await expect(f.db.query("select finish_meta_trend($1,true)",[f.id])).rejects.toThrow(/failure_state/);
 await f.db.exec("set role authenticated");await expect(f.db.query("select * from meta_trend_jobs")).rejects.toThrow(/permission denied/);await expect(f.db.query("select finish_meta_trend($1)",[f.id])).rejects.toThrow(/permission denied/);await f.db.exec("reset role");
 await f.db.query("update meta_trend_jobs set status='processing' where id=$1",[f.id]);await f.db.query("select finish_meta_trend($1,true)",[f.id]);
 expect(Number((await f.db.query<{reserved_credits:number}>("select reserved_credits from credit_wallets")).rows[0].reserved_credits)).toBe(0);
}finally{await f.db.close();}},30000);
