import { describe, it, expect, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
function fixture(failure?: Error, existingStatus?: string) {
  const campaign = {
    id: "campaign",
    organization_id: "org",
    phone_number_id: "123456",
    created_by: "actor",
    status: "running",
    template_name: "approved",
    language: "pt_BR",
    parameters: [],
    template_snapshot: { components: [] },
    consent_note: "Formulário com autorização",
  };
  const recipients = [1, 2].map((n) => ({
    id: String(n),
    organization_id: "org",
    campaign_id: "campaign",
    phone: "551199999999" + n,
    request_key: "stable-" + n,
    status: "processing",
    message_id: null as string | null,
  }));
  const send = vi.fn(async () => {
    if (failure) throw failure;
    return { id: "message", status: "accepted" };
  });
  const billing = vi.fn(async () => {});
  const client = {
    rpc: vi.fn(async () => ({
      data: recipients.map((r) => ({ ...r })),
      error: null,
    })),
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let update: Record<string, unknown> | null = null,
        head = false;
      const result = () => {
        if (table === "meta_whatsapp_campaigns") {
          if (update && (!filters.status || filters.status === campaign.status))
            Object.assign(campaign, update);
          return {
            data: filters.id
              ? { ...campaign }
              : campaign.status === "running"
                ? [{ ...campaign }]
                : [],
            error: null,
          };
        }
        if (table === "meta_whatsapp_messages")
          return {
            data: existingStatus
              ? { id: "existing", status: existingStatus }
              : null,
            error: null,
          };
        if (update)
          Object.assign(
            recipients.find((r) => r.id === filters.id)!,
            update,
          );
        return {
          error: null,
          data: null,
          count: head
            ? recipients.filter((r) =>
                ["pending", "processing"].includes(r.status),
              ).length
            : undefined,
        };
      };
      const q = {
        select: (_s?: string, options?: { head?: boolean }) => {
          head = !!options?.head;
          return q;
        },
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return q;
        },
        in: () => q,
        limit: () => q,
        update: (v: Record<string, unknown>) => {
          update = v;
          return q;
        },
        maybeSingle: async () => result(),
        then: (f: (v: unknown) => unknown) => Promise.resolve(result()).then(f),
      };
      return q;
    },
  };
  const worker = serverModuleHarness<
    typeof import("../src/lib/meta/whatsapp-campaigns")
  >(
    "src/lib/meta/whatsapp-campaigns.ts",
    {
      "@/lib/billing/trial": { assertBillableAccess: billing },
      "./whatsapp-cloud": {
        officialConnection: async () => ({ phone_number_id: "123456" }),
        sendOfficialMessage: send,
      },
    },
    [],
    { Error },
  );
  return {
    campaign,
    recipients,
    send,
    billing,
    run: () => worker.dispatchOfficialCampaignBatch(client as never),
  };
}
describe("official campaign worker", () => {
  it("sends through the official transport using stable per-recipient keys and reviewed templates", async () => {
    const f = fixture();
    expect(await f.run()).toEqual({ processed: 2 });
    expect(f.billing).toHaveBeenCalledTimes(2);
    expect(f.send.mock.calls).toHaveLength(2);
    expect((f.send.mock.calls[0] as unknown[])[3]).toMatchObject({
      requestKey: "stable-1",
      type: "template",
      expectedTemplate: [],
      consent: true,
    });
    expect(f.recipients.every((r) => r.status === "sent")).toBe(true);
    expect(f.campaign.status).toBe("completed");
  });
  it("skips opt-outs without stopping the rest of the audience", async () => {
    const f = fixture(new Error("Contato pediu para não receber mensagens."));
    await f.run();
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.recipients.every((r) => r.status === "skipped")).toBe(true);
  });
  it("pauses on an uncertain external response and releases the remaining batch", async () => {
    const f = fixture(new Error("Resposta indeterminada"), "uncertain");
    await f.run();
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.recipients.map((r) => r.status)).toEqual(["uncertain", "pending"]);
    expect(f.campaign.status).toBe("paused");
  });
  it("reconciles accepted reservations if a later persistence step failed", async () => {
    const f = fixture(new Error("Falha no recibo"), "accepted");
    await f.run();
    expect(f.recipients[0]).toMatchObject({
      status: "sent",
      message_id: "existing",
    });
    expect(f.send).toHaveBeenCalledTimes(1);
  });
});
