import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('keeps coexistence credentials and event copies private, with unique bindings and receipts',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role;create table organizations(id uuid primary key);create table connectyhub_api_clients(id uuid primary key);create table whatsapp_instances(id uuid primary key);');
 await db.exec(readFileSync('supabase/migrations/0223_api_meta_coexistence.sql','utf8'));
 for(const table of ['connectyhub_meta_coexistence','connectyhub_meta_coexistence_events']){
  expect((await db.query<{allowed:boolean}>("select has_table_privilege('authenticated',$1,'SELECT') allowed",[table])).rows[0].allowed).toBe(false);
  expect((await db.query<{allowed:boolean}>("select has_table_privilege('anon',$1,'SELECT') allowed",[table])).rows[0].allowed).toBe(false);
  expect((await db.query<{allowed:boolean}>("select has_table_privilege('service_role',$1,'SELECT') allowed",[table])).rows[0].allowed).toBe(true);
 }
 const constraints=await db.query<{columns:string}>("select pg_get_constraintdef(oid) columns from pg_constraint where conrelid in ('connectyhub_meta_coexistence'::regclass,'connectyhub_meta_coexistence_events'::regclass) and contype='u'");
 expect(constraints.rows.map(r=>r.columns)).toEqual(expect.arrayContaining(['UNIQUE (instance_id)','UNIQUE (waba_id)','UNIQUE (phone_number_id)','UNIQUE (connection_id, event_hash)']));
 }finally{await db.close()}
},30000);
