import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { commerceDatabase } from "./helpers/commerce-database";

function fixture(allowed = false) {
  const db = commerceDatabase();
  const contract = { getContractAccess: vi.fn(async () => ({ allowed })) };
  const fetch = vi.fn(async (url: string) => Response.json(url.endsWith("listfolders")
    ? [{ id: "active", status: "sending" }, { id: "scheduled", status: "scheduled" }, { id: "manual-pause", status: "paused" }, { id: "done", status: "done" }]
    : { status: "paused" }));
  const service = serverModuleHarness<typeof import("../src/lib/whatsapp/contract-campaign-guard")>("src/lib/whatsapp/contract-campaign-guard.ts", {
    "@/lib/billing/contract-access": contract, "@/lib/security/credentials-crypto": { decryptCredentialValue: () => "test-token" },
    "./uazapi-credentials": { loadUazapiCredentials: async () => ({ baseUrl: "https://provider.test" }) },
  }, [], { fetch });
  return { db, contract, fetch, service, run: () => service.pauseSuspendedInstanceCampaigns(db.client as never, { id: "instance", organization_id: "org", instance_token_encrypted: "encrypted" }) };
}

describe("provider queue contract suspension", () => {
  it("pauses only active/scheduled campaigns and preserves completed or manually paused campaigns", async () => {
    const f = fixture();
    expect(await f.run()).toBe(2);
    const calls = f.fetch.mock.calls as unknown as [string, RequestInit][];
    expect(calls.slice(1).map(([, init]) => JSON.parse(String(init.body)))).toEqual([{ folder_id: "active", action: "stop" }, { folder_id: "scheduled", action: "stop" }]);
    expect(f.db.tables.intelligence_events).toHaveLength(2);
    expect(f.db.tables.intelligence_events[0]).toMatchObject({ organization_id: "org", event_type: "whatsapp.campaign.contract_paused" });
  });
  it("does not call the provider for an active contract", async () => {
    const f = fixture(true);
    expect(await f.run()).toBe(0);
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("stops pausing as soon as access is restored during the scan", async () => {
    const f = fixture();
    f.contract.getContractAccess.mockResolvedValueOnce({ allowed: false }).mockResolvedValue({ allowed: true });
    expect(await f.run()).toBe(0);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it("does not claim a successful pause on provider errors", async () => {
    const f = fixture();
    f.fetch.mockImplementationOnce(async () => Response.json([{ id: "one", status: "scheduled" }])).mockResolvedValueOnce(Response.json({ error: "unavailable" }, { status: 503 }));
    await expect(f.run()).rejects.toThrow("CAMPAIGN_QUEUE_PAUSE_FAILED");
    expect(f.db.tables).toEqual({});
  });
});
