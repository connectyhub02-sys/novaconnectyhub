import {describe,it,expect} from 'vitest';
import {readInngestMetadata} from '../services/managed-worker/inngest-reader.mjs';
import {readFileSync} from 'node:fs';
import {managedDatabaseFixture,ids} from './helpers/managed-database';
const app='60000000-0000-4000-8000-000000000001',other='60000000-0000-4000-8000-000000000002';
const config={endpoint:'http://127.0.0.1:8288/v0/gql',authorization:'Bearer fictional-test-only',appId:app};
const body=()=>({data:{app:{id:app,name:'Fictional',functions:[{id:other,name:'Ping',appID:app,config:'must not escape'}]},runs:{edges:[],pageInfo:{hasNextPage:false}}}});
describe('fixed Inngest metadata reader and binding',()=>{
 it('constrains upstream query to one app and returns only metadata',async()=>{let sent='';const data=await readInngestMetadata({...config,request:async(_url:unknown,options?:RequestInit)=>{sent=String(options?.body);return Response.json(body());}});expect(JSON.parse(sent).variables.filter.appIDs).toEqual([app]);expect(sent).not.toContain('mutation');expect(data.functions[0]).toEqual({id:other,name:'Ping'});expect(JSON.stringify(data)).not.toContain('must not escape');});
 it('fails closed on mixed scope, engine errors and excessive response',async()=>{const mixed=body();mixed.data.app.functions[0].appID=other;for(const response of [Response.json(mixed),Response.json({errors:[{message:'private engine error'}]}),new Response('x'.repeat(262145))])await expect(readInngestMetadata({...config,request:async()=>response})).rejects.toThrow();});
 it('rejects unsafe destination before calling transport',async()=>{let calls=0;await expect(readInngestMetadata({...config,endpoint:'http://public.example/v0/gql',request:async()=>{calls++;return Response.json(body());}})).rejects.toThrow();expect(calls).toBe(0);});
 it('requires global admin to bind and prevents sharing an app across projects',async()=>{const f=await managedDatabaseFixture();try{await f.db.exec(readFileSync('supabase/migrations/0152_managed_inngest_bindings.sql','utf8'));await expect(f.as(ids.a,'insert into managed_inngest_bindings(project_id,app_id) values($1,$2)',[ids.pA,app])).rejects.toThrow();await f.as(ids.admin,'insert into managed_inngest_bindings(project_id,app_id) values($1,$2)',[ids.pA,app]);expect((await f.as(ids.b,'select * from managed_inngest_bindings')).rows).toEqual([]);await expect(f.as(ids.admin,'insert into managed_inngest_bindings(project_id,app_id) values($1,$2)',[ids.pB,app])).rejects.toThrow();}finally{await f.db.close();}},30000);
});
