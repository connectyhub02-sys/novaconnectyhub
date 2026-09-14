import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {aiDatabaseFixture} from './helpers/ai-database';
describe('Shared external capacity',()=>{
  it('limits across keys, permits replay and other wallets, and preserves uncertain credit holds',async()=>{
    const f=await aiDatabaseFixture();try{
      await f.db.exec('create function public.assert_ai_financial_rpc_boundary() returns void language sql as $$select$$;');
      await f.db.exec(readFileSync('supabase/migrations/0145_ai_gateway_capacity.sql','utf8'));
      await f.db.exec('update ai_gateway_policy set organization_requests_per_minute=2,organization_concurrency=1');
      await f.db.query('select admit_ai_gateway_request($1)',[f.org]);
      await f.db.query('select admit_ai_gateway_request($1)',[f.org]);
      await expect(f.db.query('select admit_ai_gateway_request($1)',[f.org])).rejects.toThrow('ai_rate_limit_requests');
      await f.db.query('select admit_ai_gateway_request($1)',[randomUUID()]);
      const one=await f.claim('one');await f.reserve(one.id,40);
      expect((await f.claim('one')).claimed).toBe(false);
      await expect(f.claim('two')).rejects.toThrow('ai_rate_limit_concurrency');
      await f.finish(one.id,'uncertain');await f.claim('two');
      const wallet=(await f.db.query<{reserved_credits:string}>('select reserved_credits from credit_wallets')).rows[0];
      expect(Number(wallet.reserved_credits)).toBe(40);
      await f.db.exec('set role authenticated');
      await expect(f.db.query('select admit_ai_gateway_request($1)',[f.org])).rejects.toThrow('permission denied');
    }finally{await f.db.close();}
  });
});
