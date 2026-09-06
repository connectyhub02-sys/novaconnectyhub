import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { commerceDatabase } from "./helpers/commerce-database";
const media = serverModuleHarness("src/lib/whatsapp/message-media.ts");
function setup(type: string, fail = false) {
  const job = { id: "archive", organization_id: "store", lead_id: "lead", message_id: "message", conversation_id: "conversation", attempts: 1, claimed_at: "lease",
    snapshot: { id: "message", provider_message_id: "provider", provider_chat_id: "chat", whatsapp_instance_id: "instance", message_type: type, payload: {} } };
  const db = commerceDatabase({ lead_message_archive: [job], conversation_messages: [{ id: "message" }], whatsapp_instances: [{ id: "instance", organization_id: "store", instance_token_encrypted: "fixture" }] });
  const upload = vi.fn(async () => ({ error: null }));
  const fetch = vi.fn(async (url: string) => {
    if (fail) throw new Error("provider timeout with sensitive raw data");
    return url.endsWith("/message/download") ? new Response(JSON.stringify({ fileURL: "https://media.example.test/file", mimetype: type === "audio" ? "audio/ogg" : "image/png" })) : new Response(new Uint8Array([1, 2, 3]));
  });
  const client = { ...db.client, rpc: vi.fn(async (name: string) => ({ data: name === "backfill_lead_message_archive" ? 0 : [job], error: null })), storage: { from: (bucket: string) => { expect(bucket).toBe("lead-archive"); return { upload }; } } };
  const archive = serverModuleHarness<typeof import("../src/lib/leads/message-archive")>("src/lib/leads/message-archive.ts", {
    "@/lib/whatsapp/message-media": media,
    "@/lib/security/credentials-crypto": { decryptCredentialValue: () => "fixture" },
    "@/lib/storage/quotas": { assertStorageUploadAllowed: async () => undefined, recordOrganizationStorageUsage: async () => undefined },
    "@/lib/whatsapp/uazapi-credentials": { loadUazapiCredentials: async () => ({ baseUrl: "https://provider.example.test" }) },
  }, [], { fetch });
  return { run: () => archive.archiveLeadMediaBatch(client as never), db, fetch, upload };
}
describe("media archive independent of agent execution", () => {
  it.each(["image", "audio", "video", "document"])("archives %s without loading an active agent and deduplicates retries", async type => {
    const fixture = setup(type);
    expect(await fixture.run()).toMatchObject({ saved: 1, deferred: 0 });
    expect(fixture.upload).toHaveBeenCalledOnce();
    expect(fixture.db.tables.lead_files[0]).toMatchObject({ archive_id: "archive", file_type: type, public_url: "/api/dashboard/lead-archive/archive/file" });
    await fixture.run();
    expect(fixture.upload).toHaveBeenCalledOnce();
  });
  it("keeps failed downloads pending without raw errors or a false stored file", async () => {
    const fixture = setup("image", true);
    expect(await fixture.run()).toMatchObject({ saved: 0, deferred: 1 });
    expect(fixture.db.tables.lead_message_archive[0]).toMatchObject({ media_status: "retry", last_error: "MEDIA_ARCHIVE_RETRY_REQUIRED", claimed_at: null });
    expect(fixture.db.tables.lead_files).toHaveLength(0);
    expect(JSON.stringify(fixture.db.tables)).not.toContain("sensitive raw data");
  });
  it("does not download or mislabel text as audio", async () => {
    const fixture = setup("text");
    expect(await fixture.run()).toMatchObject({ saved: 1 });
    expect(fixture.fetch).not.toHaveBeenCalled();
    expect(fixture.db.tables.lead_message_archive[0].media_status).toBe("not_media");
  });
});
