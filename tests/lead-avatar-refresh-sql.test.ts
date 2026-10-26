import {PGlite} from '@electric-sql/pglite';import {randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';import {it,expect,beforeAll,afterAll} from 'vitest';
let db:PGlite;const org=randomUUID(),lead=randomUUID(),sender=randomUUID(),other=randomUUID();
beforeAll(async()=>{db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;
create table leads(id uuid primary key,organization_id uuid,metadata jsonb);
create table whatsapp_instances(id uuid primary key,organization_id uuid,status text,instance_token_encrypted text);
insert into leads values('${lead}','${org}','{"person_name":"Nome original","profile_image_url":"https://pps.whatsapp.net/old"}');
insert into whatsapp_instances values('${sender}','${org}','connected','encrypted'),('${other}','${randomUUID()}','connected','encrypted');`);
await db.exec(readFileSync('supabase/migrations/0219_lead_avatar_refresh.sql','utf8'));},30000);
afterAll(async()=>{await db.close();});
it('requires the same organization, an active connection and a single current lease',async()=>{
 expect((await db.query('select claim_lead_avatar_sync($1,$2) r',[lead,other])).rows[0]).toEqual({r:null});
 const first=(await db.query<{r:{claim:string}}>('select claim_lead_avatar_sync($1,$2) r',[lead,sender])).rows[0].r;expect(first.claim).toBeTruthy();
 expect((await db.query('select claim_lead_avatar_sync($1,$2,true) r',[lead,sender])).rows[0]).toEqual({r:null});
 await db.query("update leads set metadata=metadata||'{\"person_name\":\"Nome corrigido\",\"human_handoff\":{\"status\":\"paused\"}}' where id=$1",[lead]);
 const patch={profile_image_url:'https://pps.whatsapp.net/new',profile_image_synced_at:new Date().toISOString(),person_name:'Do not overwrite',human_handoff:{status:'active'}};
 expect((await db.query('select complete_lead_avatar_sync($1,$2,$3,$4) r',[lead,sender,randomUUID(),patch])).rows[0]).toEqual({r:null});
 const r=(await db.query<{r:Record<string,unknown>}>('select complete_lead_avatar_sync($1,$2,$3,$4) r',[lead,sender,first.claim,patch])).rows[0].r;
 expect(r).toMatchObject({person_name:'Nome corrigido',human_handoff:{status:'paused'},profile_image_url:patch.profile_image_url});expect(r.profile_image_refresh_claim).toBeUndefined();
 expect((await db.query('select complete_lead_avatar_sync($1,$2,null,$3) r',[lead,sender,patch])).rows[0]).toEqual({r:null});
 expect((await db.query('select claim_lead_avatar_sync($1,$2) r',[lead,sender])).rows[0]).toEqual({r:null});
});
it('preserves a newer photo received by webhook while a lookup was running',async()=>{
 const claim=(await db.query<{r:{claim:string}}>('select claim_lead_avatar_sync($1,$2,true) r',[lead,sender])).rows[0].r;
 await db.query("update leads set metadata=metadata||jsonb_build_object('profile_image_url','https://pps.whatsapp.net/webhook','profile_image_synced_at',now()+interval '1 second') where id=$1",[lead]);
 const r=(await db.query<{r:Record<string,unknown>}>('select complete_lead_avatar_sync($1,$2,$3,$4) r',[lead,sender,claim.claim,{profile_image_url:'https://pps.whatsapp.net/stale'}])).rows[0].r;
 expect(r.profile_image_url).toBe('https://pps.whatsapp.net/webhook');
});
it('denies mutations to browser roles',async()=>{
 for(const role of ['anon','authenticated'])for(const fn of ['claim_lead_avatar_sync(uuid,uuid,boolean)','complete_lead_avatar_sync(uuid,uuid,uuid,jsonb)'])expect((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') ok',[role,fn])).rows[0]).toEqual({ok:false});
});
