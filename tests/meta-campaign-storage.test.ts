import {expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {aiDatabaseFixture} from "./helpers/ai-database";
it("enforces one immutable execution per tenant proposal and denies client-side writes",async()=>{
 const f=await aiDatabaseFixture();try{
 await f.db.exec(readFileSync("supabase/migrations/0195_meta_creative_studio.sql","utf8"));
 await f.db.exec(readFileSync("supabase/migrations/0198_meta_campaign_execution.sql","utf8"));
 const user=randomUUID(),proposal=randomUUID();await f.db.query("insert into auth.users values($1)",[user]);
 await f.db.query("insert into meta_creative_jobs(id,organization_id,user_id,input_hash,mode,brief) values($1,$2,$3,'h','campaign','{}')",[proposal,f.org,user]);
 await f.db.query("insert into meta_campaign_executions(organization_id,proposal_id,user_id,snapshot,snapshot_hash) values($1,$2,$3,'{\"totalMinor\":14000}','h')",[f.org,proposal,user]);
 await expect(f.db.query("insert into meta_campaign_executions(organization_id,proposal_id,user_id,snapshot,snapshot_hash) values($1,$2,$3,'{}','h')",[f.org,proposal,user])).rejects.toThrow(/unique/);
 await expect(f.db.query("update meta_campaign_executions set snapshot='{}'")).rejects.toThrow(/immutable/);
 await f.db.exec("set role authenticated");await expect(f.db.query("select * from meta_campaign_executions")).rejects.toThrow(/permission denied/);await expect(f.db.query("update meta_campaign_executions set status='active'")).rejects.toThrow(/permission denied/);
 }finally{await f.db.close();}
},30000);
