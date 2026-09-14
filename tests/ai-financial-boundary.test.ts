import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const signatures = [
  'claim_ai_request(uuid,text,text)', 'reserve_ai_credits(uuid,numeric,text,jsonb)',
  'finish_ai_request(uuid,text,jsonb,jsonb,text)', 'settle_ai_operation(uuid,text,jsonb,jsonb,text)',
  'save_credit_topup_policy(uuid,uuid,jsonb)', 'claim_credit_topup(uuid)',
  'fulfill_confirmed_billing_payment(uuid,text,timestamptz,timestamptz,jsonb)',
];
describe('Published AI financial permission boundary', () => {
  it('repairs permissive restored ACLs, preserves legitimate client RPCs and blocks a blanket grant', async () => {
    const db = new PGlite();
    try {
      await db.exec('create role anon; create role authenticated; create role service_role;');
      for (const signature of signatures) {
        await db.exec(`create function public.${signature} returns int language sql security definer as $$select 1$$;
          grant execute on function public.${signature} to anon,authenticated,service_role;`);
      }
      await db.exec('create function public.client_read() returns int language sql as $$select 1$$; grant execute on function public.client_read() to authenticated;');
      const migration = readFileSync('supabase/migrations/0143_ai_financial_rpc_boundary.sql', 'utf8');
      await db.exec(migration);
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await expect(db.query('select claim_credit_topup(null)')).rejects.toThrow('permission denied');
        await db.exec('reset role');
      }
      await db.exec('set role service_role');
      expect((await db.query('select claim_credit_topup(null) as ok')).rows).toEqual([{ok:1}]);
      await db.exec('reset role; set role authenticated');
      expect((await db.query('select client_read() as ok')).rows).toEqual([{ok:1}]);
      await db.exec('reset role');
      await expect(db.exec('grant execute on all functions in schema public to anon,authenticated')).rejects.toThrow('AI_RPC_ACL_DRIFT');
      await db.exec('select public.assert_ai_financial_rpc_boundary()');
      await expect(db.exec('begin; drop function public.claim_credit_topup(uuid); create function public.claim_credit_topup(uuid) returns int language sql as $$select 1$$; commit;')).rejects.toThrow('AI_RPC_ACL_DRIFT');
      await db.exec('rollback; select public.assert_ai_financial_rpc_boundary()');
      await db.exec('grant execute on function public.client_read() to anon');
      await db.exec(migration);
      await db.exec('select public.assert_ai_financial_rpc_boundary()');
    } finally { await db.close(); }
  });
});
