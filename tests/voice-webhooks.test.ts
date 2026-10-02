import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { aiDatabaseFixture } from "./helpers/ai-database";
vi.mock("server-only", () => ({}));
import { assertPublicWebhookUrl, isPrivateAddress, signWebhook, webhookPayload } from "../src/lib/voice-api/webhooks";

describe("voice webhooks", () => {
  it("signs t.body with HMAC-SHA256 so receivers can verify freshness and integrity", () => {
    const body = JSON.stringify({ type: "voice.operation.completed" });
    const header = signWebhook("whsec_test", body, 1790000000);
    expect(header).toBe(`t=1790000000,v1=${createHmac("sha256", "whsec_test").update(`1790000000.${body}`).digest("hex")}`);
  });

  it("refuses internal addresses and non-https URLs", async () => {
    for (const address of ["10.0.0.5", "127.0.0.1", "192.168.1.10", "172.20.0.1", "169.254.169.254", "100.64.1.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(address)).toBe(true);
    for (const address of ["8.8.8.8", "13.140.34.227", "2606:4700::1111"]) expect(isPrivateAddress(address)).toBe(false);
    await expect(assertPublicWebhookUrl("http://example.com/hook")).rejects.toThrow("https");
    await expect(assertPublicWebhookUrl("https://user:pass@example.com/hook")).rejects.toThrow("https");
    await expect(assertPublicWebhookUrl("https://localhost/hook")).rejects.toThrow("internos");
    await expect(assertPublicWebhookUrl("https://169.254.169.254/latest")).rejects.toThrow("público");
    await expect(assertPublicWebhookUrl("https://8.8.8.8/hook")).resolves.toBe("https://8.8.8.8/hook");
  });

  it("sends only the public receipt, never costs or secrets", () => {
    const payload = webhookPayload({ generation_id: "g1", project_id: "p1", status: "completed", operation: "long_tts", model_id: "eleven_flash_v2_5", charged_credits: 562.56, reserved_credits: 0, quoted_credits: 562.56,
      error_code: null, created_at: "", updated_at: "", webhook_url: "https://x", webhook_secret_ciphertext: "v1:secret", delivery_status: null, attempts: null }, "d1");
    expect(payload).toMatchObject({ id: "d1", type: "voice.operation.completed", data: { id: "g1", operation: "long_tts", usage: { credits: 562.56 }, result: { path: "/api/v1/voice/operations/g1/result" } } });
    expect(JSON.stringify(payload)).not.toMatch(/secret|webhook_url|provider/);
  });
});

describe("webhook queue and e-book receipts (SQL)", () => {
  it("lists finished operations once, retries failures with a growing pause and accepts e-book sized receipts", async () => {
    const f = await aiDatabaseFixture();
    try {
      await f.db.exec(`alter type billing_provider add value 'elevenlabs'; alter table organizations add column name text;
        create schema if not exists storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
        create table organization_storage_usage(organization_id uuid primary key,used_bytes bigint not null default 0,billable_file_count integer not null default 0);
        create function record_organization_storage_usage(uuid,bigint,integer,text,jsonb) returns void language sql as $$select$$;
        create function release_organization_storage_usage(uuid,bigint,integer,text,jsonb) returns void language sql as $$select$$;
        create function get_organization_storage_entitlement(uuid) returns table(total_storage_limit_bytes bigint,storage_file_max_bytes bigint,total_storage_file_limit integer) language sql as $$select 2000000000::bigint,262144000::bigint,100$$;`);
      for (const m of ["0147_connectyhub_voice", "0148_studio_assets", "0149_studio_operations", "0185_voice_developer_api"]) await f.db.exec(readFileSync(`supabase/migrations/${m}.sql`, "utf8"));
      const project = randomUUID(), done = randomUUID(), failed = randomUUID();
      await f.db.query("insert into voice_projects(id,organization_id,name,webhook_url,webhook_secret_ciphertext,webhook_updated_at) values($1,$2,'P','https://hooks.example.com/voz','v1:x',now()-interval '1 day')", [project, f.org]);
      for (const [id, status] of [[done, "completed"], [failed, "failed"]]) {
        await f.db.query(`insert into voice_generations(id,project_id,organization_id,billing_organization_id,idempotency_key,input_hash,voice_id,model_id,characters,reserved_credits,quoted_credits,estimated_provider_cost,rate_snapshot,operation,status,bytes_size)
          values($1,$2,$3,$3,$5,'h','v','scribe_v2',200000,0,10,0,'[]','studio',$4,150000000)`, [id, project, f.org, status, `key-${id}`]);
        await f.db.query("insert into studio_operations(id,operation,model_id,provider,feature_code,input,reserved_units,storage_reserved_bytes,storage_reserved_files) values($1,'transcription','scribe_v2','elevenlabs','studio_transcription','{}','{}',1000000,1)", [id]);
      }
      const pending = async () => (await f.db.query<{ generation_id: string }>("select generation_id from voice_webhook_pending(20,5)")).rows.map(r => r.generation_id).sort();
      expect(await pending()).toEqual([done, failed].sort());
      await f.db.query("insert into voice_webhook_deliveries(project_id,generation_id,event_type,status,attempts,last_attempt_at) values($1,$2,'voice.operation.completed','delivered',1,now())", [project, done]);
      await f.db.query("insert into voice_webhook_deliveries(project_id,generation_id,event_type,status,attempts,last_attempt_at) values($1,$2,'voice.operation.failed','failed',2,now()-interval '5 minutes')", [project, failed]);
      expect(await pending()).toEqual([]);
      await f.db.query("update voice_webhook_deliveries set last_attempt_at=now()-interval '11 minutes' where generation_id=$1", [failed]);
      expect(await pending()).toEqual([failed]);
      await f.db.query("update voice_webhook_deliveries set attempts=5 where generation_id=$1", [failed]);
      expect(await pending()).toEqual([]);
      await expect(f.db.query("update voice_projects set webhook_url='http://insecure.example.com' where id=$1", [project])).rejects.toThrow();
    } finally { await f.db.close(); }
  }, 30000);
});
