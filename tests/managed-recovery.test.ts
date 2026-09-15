import {describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {createHash} from 'node:crypto';
import {managedDatabaseFixture,ids} from './helpers/managed-database';
describe('managed pilot recovery and existing resource ownership',()=>{
 it('restores file bytes, jobs, RLS and explicit roles into another database',async()=>{
  const f=await managedDatabaseFixture();let restored:PGlite|undefined;
  try{
   const file=(await f.as(ids.a,"select managed_put_file($1,'restore.txt','cmVjb3Zlcnk=') id",[ids.pA])).rows[0].id;
   const job=(await f.as(ids.a,"select managed_enqueue($1,'recover-job') id",[ids.pA])).rows[0].id;
   const blob=await f.db.dumpDataDir();const bytes=await blob.arrayBuffer();expect(createHash('sha256').update(Buffer.from(bytes)).digest('hex')).toMatch(/^[a-f0-9]{64}$/);
   restored=new PGlite({loadDataDir:blob});
   expect((await restored.query<{status:string}>('select status from managed_jobs where id=$1',[job])).rows[0].status).toBe('queued');
   await restored.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.a]);await restored.exec('set role authenticated');
   expect((await restored.query<{content:string}>('select managed_read_file($1,$2) content',[ids.pA,file])).rows[0].content).toBe('cmVjb3Zlcnk=');
   await restored.exec('reset role');await restored.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.b]);await restored.exec('set role authenticated');
   expect((await restored.query('select id,name,bytes from managed_files where project_id=$1',[ids.pA])).rows).toEqual([]);
  }finally{await restored?.close();await f.db.close();}
 },30000);
 it('links resources without changing ownership and rejects another company',async()=>{
  const f=await managedDatabaseFixture();try{
   const resource='40000000-0000-4000-8000-000000000001';await f.db.query('insert into ai_projects values($1,$2)',[resource,ids.orgA]);
   await expect(f.as(ids.admin,'insert into managed_resource_links(project_id,organization_id,ai_project_id) values($1,$2,$3)',[ids.pB,ids.orgB,resource])).rejects.toThrow();
   await f.as(ids.admin,'insert into managed_resource_links(project_id,organization_id,ai_project_id) values($1,$2,$3)',[ids.pA,ids.orgA,resource]);
   expect((await f.as(ids.b,'select * from managed_resource_links')).rows).toEqual([]);
   await expect(f.db.query('update ai_projects set organization_id=$1 where id=$2',[ids.orgB,resource])).rejects.toThrow();
  }finally{await f.db.close();}
 });
});
