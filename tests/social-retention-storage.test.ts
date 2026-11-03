import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

const org='11111111-1111-4111-8111-111111111111',other='33333333-3333-4333-8333-333333333333',user='22222222-2222-4222-8222-222222222222';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key);create table organizations(id uuid primary key);
 insert into auth.users values('${user}');insert into organizations values('${org}'),('${other}');`);
 for(const name of ['0220_social_connections.sql','0221_social_publishing.sql','0222_social_api_data_retention.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
},30000);
beforeEach(async()=>{await db.exec('delete from social_deliveries;delete from social_posts;delete from social_connections;delete from social_oauth_attempts;');});
afterAll(async()=>{await db.close();});
async function seed(organization=org,provider='youtube',status='published'){
 const c=await db.query<{id:string}>(`insert into social_connections(organization_id,provider,encrypted_tokens,accounts,selected_account_id,checked_at) values($1,$2,'encrypted','[{"id":"channel","name":"Name"}]','channel',now()) returning id`,[organization,provider]);
 const p=await db.query<{id:string}>(`insert into social_posts(id,organization_id,created_by,draft,state) values(gen_random_uuid(),$1,$2,'{"title":"Original","mediaId":"original-file","tiktok":{"accountId":"channel","privacy":"SELF_ONLY"}}','approved') returning id`,[organization,user]);
 const d=await db.query<{id:string}>(`insert into social_deliveries(post_id,organization_id,target,account_id,connection_id,status,progress,provider_id,result_url) values($1,$2,$3,'channel',$4,$5,'{"session":"secret-upload-session"}','video','https://provider.example/video') returning id`,[p.rows[0].id,organization,provider,c.rows[0].id,status]);
 return {connection:c.rows[0].id,post:p.rows[0].id,delivery:d.rows[0].id};
}
it('disconnect scrubs only the selected tenant/provider and preserves original media and outcomes',async()=>{
 const mine=await seed(org,'tiktok');await seed(other,'tiktok');await seed(org,'youtube');
 await db.query('delete from social_connections where id=$1',[mine.connection]);
 const r=(await db.query<Record<string,unknown>>('select * from social_deliveries where id=$1',[mine.delivery])).rows[0];
 expect(r).toMatchObject({status:'published',account_id:'',connection_id:null,progress:{},provider_id:null,result_url:null,error_message:null});expect(r.api_data_deleted_at).toBeTruthy();
 expect((await db.query('select * from social_deliveries where api_data_deleted_at is null')).rows).toHaveLength(2);
 expect((await db.query<{draft:unknown}>('select draft from social_posts where id=$1',[mine.post])).rows[0].draft).toEqual({title:'Original',mediaId:'original-file',tiktok:{privacy:'SELF_ONLY'}});
});
it('fences late worker writes and retries after disconnect, preserving uncertain receipt',async()=>{
 const mine=await seed(org,'youtube','processing');
 await db.query('delete from social_connections where id=$1',[mine.connection]);
 expect((await db.query<{status:string}>('select status from social_deliveries where id=$1',[mine.delivery])).rows[0].status).toBe('uncertain');
 await expect(db.query("update social_deliveries set progress='{\"videoId\":\"late\"}' where id=$1",[mine.delivery])).rejects.toThrow(/social_erased_data/);
 await expect(db.query('select retry_social_delivery($1,$2)',[org,mine.delivery])).rejects.toThrow();
});
it('rejects queue insertion for a disconnected, changed or foreign account',async()=>{
 const mine=await seed();
 await expect(db.query("insert into social_deliveries(post_id,organization_id,target,account_id,connection_id) values($1,$2,'tiktok','channel',$3)",[mine.post,org,mine.connection])).rejects.toThrow(/connection changed/);
 await db.query('delete from social_connections where id=$1',[mine.connection]);
 await expect(db.query("insert into social_deliveries(post_id,organization_id,target,account_id,connection_id) values($1,$2,'youtube','channel',$3)",[mine.post,org,mine.connection])).rejects.toThrow(/connection changed/);
});
it('clears 29-day API receipts and six-day stale authorizations but retains fresh data',async()=>{
 const old=await seed(org,'youtube'),fresh=await seed(other,'youtube'),expired=await seed(org,'tiktok','queued');
 await db.query("update social_deliveries set created_at=now()-interval '30 days' where id=$1",[old.delivery]);
 await db.query("update social_connections set checked_at=now()-interval '7 days' where id=$1",[expired.connection]);
 await db.query('select expire_social_api_data()');
 expect((await db.query('select * from social_deliveries where api_data_deleted_at is not null')).rows).toHaveLength(2);
 expect((await db.query('select * from social_connections')).rows).toHaveLength(2);
 expect((await db.query('select * from social_deliveries where id=$1 and api_data_deleted_at is null',[fresh.delivery])).rows).toHaveLength(1);
 expect((await db.query<{status:string}>('select status from social_deliveries where id=$1',[expired.delivery])).rows[0].status).toBe('cancelled');
});
it('denies cleanup to both browser roles',async()=>{
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);try{
 await expect(db.query('select expire_social_api_data()')).rejects.toThrow(/permission denied/);
 await expect(db.query("select erase_social_provider_data($1,'youtube')",[org])).rejects.toThrow(/permission denied/);
 }finally{await db.exec('reset role');}}
});
