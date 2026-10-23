import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

it('keeps dispatch claims private and unique per company without changing existing data', async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table organizations(id uuid primary key); insert into organizations values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');");
    await db.exec(readFileSync('supabase/migrations/0211_agent_voice_generations.sql', 'utf8'));
    const insert = (org: string) => db.query("insert into agent_voice_generations(organization_id,request_key,input_hash,quote,status) values($1,'same','hash','{}','processing') on conflict(organization_id,request_key) do nothing returning id", [org]);
    expect((await insert('00000000-0000-4000-8000-000000000001')).rows).toHaveLength(1);
    expect((await insert('00000000-0000-4000-8000-000000000001')).rows).toHaveLength(0);
    expect((await insert('00000000-0000-4000-8000-000000000002')).rows).toHaveLength(1);
    expect((await db.query("select has_table_privilege('authenticated','agent_voice_generations','select') allowed")).rows).toEqual([{ allowed: false }]);
    expect((await db.query("select has_table_privilege('anon','agent_voice_generations','insert') allowed")).rows).toEqual([{ allowed: false }]);
    expect((await db.query("select has_table_privilege('service_role','agent_voice_generations','update') allowed")).rows).toEqual([{ allowed: true }]);
    expect((await db.query("select relrowsecurity from pg_class where oid='agent_voice_generations'::regclass")).rows).toEqual([{ relrowsecurity: true }]);
  } finally { await db.close(); }
});
