import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {managedDatabaseFixture,ids} from './helpers/managed-database';
describe('managed projects: real PostgreSQL permissions and operation invariants',()=>{
 let f:Awaited<ReturnType<typeof managedDatabaseFixture>>;
 beforeAll(async()=>{f=await managedDatabaseFixture();},30000);afterAll(async()=>{await f.db.close();});
 it('lists only assigned projects, not all projects of an organization',async()=>{const a=await f.as(ids.a,'select id from managed_projects');expect(a.rows).toEqual([{id:ids.pA}]);const b=await f.as(ids.b,'select id from managed_projects');expect(b.rows).toEqual([{id:ids.pB}]);});
 it('does not treat product administrator as infrastructure administrator',async()=>{expect((await f.as(ids.productAdmin,'select is_infrastructure_admin() allowed')).rows).toEqual([{allowed:false}]);expect((await f.as(ids.productAdmin,'select id from managed_projects')).rows).toEqual([]);expect((await f.as(ids.admin,'select id from managed_projects')).rows).toHaveLength(3);});
 it('rejects self-enrollment as global administrator and access to worker secrets',async()=>{await expect(f.as(ids.a,'insert into infrastructure_admins(user_id) values($1)',[ids.a])).rejects.toThrow();await expect(f.as(ids.admin,'select key_hash from managed_workers')).rejects.toThrow();});
 it('rejects granting a member to a different organization',async()=>{await expect(f.as(ids.admin,"insert into managed_project_members values($1,$2,$3,'viewer')",[ids.pB,ids.orgB,ids.a])).rejects.toThrow();});
 it('enforces data scope on direct SQL, composite FK and edits',async()=>{
 await f.as(ids.a,"insert into managed_records(project_id,organization_id,collection,data) values($1,$2,'notes','{\"text\":\"private A\"}')",[ids.pA,ids.orgA]);
 expect((await f.as(ids.b,'select * from managed_records')).rows).toHaveLength(0);
 await expect(f.as(ids.a,"insert into managed_records(project_id,organization_id,collection,data) values($1,$2,'notes','{}')",[ids.pA,ids.orgB])).rejects.toThrow();
 await expect(f.as(ids.a,"update managed_records set project_id=$1,organization_id=$2",[ids.pB,ids.orgB])).rejects.toThrow();
 await expect(f.as(ids.viewer,"insert into managed_records(project_id,organization_id,collection,data) values($1,$2,'notes','{}')",[ids.pA,ids.orgA])).rejects.toThrow();
 });
 it('keeps files private and counts actual bytes with a serialized quota',async()=>{
 await f.db.query('update managed_projects set storage_limit_bytes=5 where id=$1',[ids.pA]);
 const file=String((await f.as(ids.a,"select managed_put_file($1,'a.txt','aGVsbG8=') id",[ids.pA])).rows[0].id);
 expect((await f.as(ids.a,'select bytes from managed_files')).rows[0].bytes).toBe(5);
 await expect(f.as(ids.a,'select content from managed_files')).rejects.toThrow();
 await expect(f.as(ids.b,'select managed_read_file($1,$2)',[ids.pA,file])).rejects.toThrow();
 expect((await f.as(ids.b,'select managed_read_file($1,$2) content',[ids.pB,file])).rows[0].content).toBeNull();
 await expect(f.as(ids.a,"select managed_put_file($1,'b.txt','YQ==')",[ids.pA])).rejects.toThrow('storage_limit');
 expect((await f.as(ids.a,'select managed_read_file($1,$2) content',[ids.pA,file])).rows[0].content).toBe('aGVsbG8=');
 expect((await f.as(ids.a,'select managed_delete_file($1,$2) ok',[ids.pA,file])).rows[0].ok).toBe(true);
 expect((await f.as(ids.a,'select managed_delete_file($1,$2) ok',[ids.pA,file])).rows[0].ok).toBe(false);
 expect((await f.as(ids.a,"select sum(quantity) n from managed_usage where unit='released_bytes'")).rows[0].n).toBe('5');
 });
 it('serializes queued work, fences completion and accounts only once',async()=>{
 const j1=(await f.as(ids.a,"select managed_enqueue($1,'once') id",[ids.pA])).rows[0].id;
 expect((await f.as(ids.a,"select managed_enqueue($1,'once') id",[ids.pA])).rows[0].id).toBe(j1);
 await f.as(ids.a,"select managed_enqueue($1,'second')",[ids.pA]);await f.as(ids.b,"select managed_enqueue($1,'first-b')",[ids.pB]);
 await expect(f.as(ids.a,'select managed_claim($1)',['a'.repeat(64)])).rejects.toThrow();
 const lease=(await f.service('select managed_claim($1) job',['a'.repeat(64)])).rows[0].job as {id:string;lease_token:string};
 expect(lease.id).toBe(j1);expect((await f.service('select managed_claim($1) job',['a'.repeat(64)])).rows[0].job).toBeNull();
 expect((await f.service('select managed_claim($1) job',['b'.repeat(64)])).rows[0].job).not.toBeNull();
 expect((await f.service('select managed_finish($1,$2,$3,true) ok',['b'.repeat(64),lease.id,lease.lease_token])).rows[0].ok).toBe(false);
 expect((await f.service('select managed_finish($1,$2,$3,true) ok',['a'.repeat(64),lease.id,lease.lease_token])).rows[0].ok).toBe(true);
 expect((await f.service('select managed_finish($1,$2,$3,true) ok',['a'.repeat(64),lease.id,lease.lease_token])).rows[0].ok).toBe(false);
 expect((await f.as(ids.a,"select count(*) n from managed_usage where unit='job'")).rows[0].n).toBe(1);
 expect((await f.as(ids.b,'select * from managed_logs where project_id=$1',[ids.pA])).rows).toHaveLength(0);
 });
 it('does not automatically replay uncertain work after a worker crash',async()=>{
 const lease=(await f.service('select managed_claim($1) job',['a'.repeat(64)])).rows[0].job as {id:string;lease_token:string};
 await f.db.query("update managed_jobs set lease_until=now()-interval '1 minute' where id=$1",[lease.id]);
 expect((await f.service('select managed_claim($1) job',['a'.repeat(64)])).rows[0].job).toBeNull();
 expect((await f.db.query<{status:string}>('select status from managed_jobs where id=$1',[lease.id])).rows[0].status).toBe('uncertain');
 expect((await f.service('select managed_finish($1,$2,$3,true) ok',['a'.repeat(64),lease.id,lease.lease_token])).rows[0].ok).toBe(false);
 });
 it('blocks paused projects, queue overflow, expired and revoked workers',async()=>{
 await f.db.query("update managed_projects set status='paused' where id=$1",[ids.pA]);await expect(f.as(ids.a,"select managed_enqueue($1,'paused')",[ids.pA])).rejects.toThrow();
 await f.db.query("update managed_projects set status='active',queue_limit=1 where id=$1",[ids.pA]);
 await f.as(ids.a,"select managed_enqueue($1,'queue-limit')",[ids.pA]);await expect(f.as(ids.a,"select managed_enqueue($1,'overflow')",[ids.pA])).rejects.toThrow('queue_limit');
 await f.db.query("update managed_workers set enabled=false where project_id=$1",[ids.pA]);await expect(f.service('select managed_claim($1)',['a'.repeat(64)])).rejects.toThrow();
 await f.db.query("update managed_workers set expires_at=now()-interval '1 minute' where project_id=$1",[ids.pB]);await expect(f.service('select managed_claim($1)',['b'.repeat(64)])).rejects.toThrow();
 });
 it('respects revocation at the data layer immediately',async()=>{await f.db.query('delete from organization_members where user_id=$1',[ids.a]);expect((await f.as(ids.a,'select * from managed_projects')).rows).toHaveLength(0);expect((await f.as(ids.a,'select * from managed_records')).rows).toHaveLength(0);});
 it('does not expose global telemetry or permit fabricated usage',async()=>{await f.db.exec("insert into infrastructure_samples(measured_at,memory_total,memory_available,disk_total,disk_used) values(now(),100,80,100,10)");expect((await f.as(ids.b,'select * from infrastructure_samples')).rows).toHaveLength(0);expect((await f.as(ids.productAdmin,'select * from infrastructure_samples')).rows).toHaveLength(0);expect((await f.as(ids.admin,'select * from infrastructure_samples')).rows).toHaveLength(1);await expect(f.as(ids.b,"insert into managed_usage(project_id,organization_id,operation_id,unit,quantity) values($1,$2,gen_random_uuid(),'job',1)",[ids.pB,ids.orgB])).rejects.toThrow();});
});
