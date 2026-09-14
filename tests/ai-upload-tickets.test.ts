import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {aiDatabaseFixture} from './helpers/ai-database';

describe('Disposable upload admission',()=>{
  it('rejects guessed, expired, reused and revoked tickets without consuming a valid ticket',async()=>{
    const f=await aiDatabaseFixture();
    try {
      await f.db.exec(`create table ai_resources(id uuid primary key,organization_id uuid,project_id uuid,key_id uuid,kind text,status text,metadata jsonb,expires_at timestamptz,updated_at timestamptz);
        create function assert_ai_financial_rpc_boundary() returns void language sql as $$select$$;`);
      await f.db.exec(readFileSync('supabase/migrations/0144_ai_upload_tickets.sql','utf8'));
      const id=randomUUID();
      await f.db.query(`insert into ai_resources values($1,$2,$3,$4,'file','preparing','{"ticket_hash":"expected","size_bytes":3}',now()+interval '2 minutes',now())`,[id,f.org,f.project,f.key]);
      const consume=(hash='expected')=>f.db.query<{r:{status:string;metadata:Record<string,unknown>}}>('select consume_ai_upload_ticket($1,$2) r',[id,hash]);
      await expect(consume('wrong')).rejects.toThrow('ai_upload_ticket_invalid');
      await f.db.exec(`update ai_resources set expires_at=now()-interval '1 second'`);
      await expect(consume()).rejects.toThrow('ai_upload_ticket_invalid');
      await f.db.exec(`update ai_resources set expires_at=now()+interval '2 minutes'; update ai_api_keys set status='revoked'`);
      await expect(consume()).rejects.toThrow('ai_key_inactive');
      await f.db.exec(`update ai_api_keys set status='active'; update organizations set status='inactive'`);
      await expect(consume()).rejects.toThrow('ai_key_inactive');
      await f.db.exec(`update organizations set status='active'`);
      await f.db.query('update ai_resources set organization_id=$1',[randomUUID()]);
      await expect(consume()).rejects.toThrow('ai_key_inactive');
      await f.db.query('update ai_resources set organization_id=$1',[f.org]);
      const result=(await consume()).rows[0].r;
      expect(result.status).toBe('processing');
      expect(result.metadata).toEqual({size_bytes:3});
      await expect(consume()).rejects.toThrow('ai_upload_ticket_invalid');
      for(const role of ['anon','authenticated']) {
        await f.db.exec(`set role ${role}`);
        await expect(consume()).rejects.toThrow('permission denied');
        await f.db.exec('reset role');
      }
      expect((await f.db.query('select * from credit_transactions')).rows).toHaveLength(0);
    } finally {await f.db.close();}
  });
});
