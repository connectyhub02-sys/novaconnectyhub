import {describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {managedDatabaseFixture,ids} from './helpers/managed-database';
import {diskStore,digest,copyObjects} from '../services/managed-objects/disk-store.mjs';

describe('quiescent catalog and private objects recovery',()=>{
 it('restores matching bytes, pending reservations, tombstones and client isolation together',async()=>{
  const f=await managedDatabaseFixture();
  const root=await mkdtemp(join(tmpdir(),'managed-joint-recovery-'));
  let restored:PGlite|undefined;
  try{
   await f.db.exec(await readFile('supabase/migrations/0151_managed_objects.sql','utf8'));
   const source=await diskStore(join(root,'source'));
   const object='50000000-0000-4000-8000-000000000010';
   const pending='50000000-0000-4000-8000-000000000011';
   const deleted='50000000-0000-4000-8000-000000000012';
   const bytes=Buffer.from('fictional recovery content'),hash=digest(bytes);
   for(const id of [object,pending,deleted])await f.as(ids.a,'select managed_object_reserve($1,$2,$3,$4,$5)',[ids.pA,id,'recovery.txt',bytes.length,hash]);
   await source.put(ids.pA,object,bytes,hash);
   await f.service('select managed_object_complete($1,$2,false)',[ids.pA,object]);
   await f.as(ids.a,'select managed_object_delete_begin($1,$2)',[ids.pA,deleted]);
   await source.delete(ids.pA,deleted);
   await f.service('select managed_object_complete($1,$2,true)',[ids.pA,deleted]);
   // All fixture writers are stopped before this coordinated snapshot.
   const snapshot=await f.db.dumpDataDir();
   const target=await diskStore(join(root,'restored'));
   const manifest=await copyObjects(source,target);
   restored=new PGlite({loadDataDir:snapshot});
   const rows=(await restored.query<{id:string;sha256:string;bytes:number;status:string}>('select id,sha256,bytes,status from managed_objects order by id')).rows;
   expect(rows.map(r=>r.status)).toEqual(['ready','pending','deleted']);
   expect(manifest).toHaveLength(2);
   expect(await target.get(ids.pA,object,rows[0].sha256,Number(rows[0].bytes))).toEqual(bytes);
   await expect(target.get(ids.pA,pending,hash,bytes.length)).rejects.toThrow();
   await expect(target.put(ids.pA,deleted,bytes,hash)).rejects.toThrow('object_deleted');
   for(const user of [ids.a,ids.b]){
    await restored.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    await restored.exec('set role authenticated');
    expect((await restored.query('select id from managed_objects')).rows).toHaveLength(user===ids.a?3:0);
    await restored.exec('reset role');
   }
  }finally{
   await restored?.close();await f.db.close();
   const target=resolve(root);
   if(!target.startsWith(resolve(tmpdir())+sep)||!target.split(sep).at(-1)?.startsWith('managed-joint-recovery-'))throw Error('Unexpected fixture path');
   await rm(target,{recursive:true,force:true});
  }
 },30000);
});
