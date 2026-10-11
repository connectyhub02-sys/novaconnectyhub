import { describe, it, expect, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { normalizeMetaSocialApprovalText } from "../src/lib/meta/social-approval-policy";
function fixture(
  options: { foreign?: boolean; billingFails?: boolean; paused?: boolean } = {},
) {
  const scoped: Array<[string, string, unknown]> = [],
    saved: unknown[] = [];
  const meter = vi.fn(async () => {
    if (options.billingFails) throw new Error("billing");
  });
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [{ text: "Posso ajudar com os produtos da sua loja." }],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 12 },
        }),
        { status: 200 },
      ),
  );
  const client = {
    from: (table: string) => {
      let update: unknown;
      const data =
        table === "agent_registry"
          ? options.foreign
            ? null
            : {
                id: "agent",
                prompt: "Você é a Ana, atendente da empresa A.",
                persona_name: "Ana",
                model_id: "gemini-3.6-flash",
                status: "active",
                metadata: {},
              }
          : table === "conversations"
            ? {
                id: "conversation",
                lead_id: "lead",
                metadata: options.paused
                  ? { human_intervention: { paused_until: "2099-01-01" } }
                  : {},
              }
            : table === "leads"
              ? {
                  display_name: "Maria",
                  last_event_summary: "Buscou o catálogo",
                }
              : table === "conversation_messages"
                ? [
                    {
                      direction: "inbound",
                      text_content: "Quais produtos você tem?",
                    },
                  ]
                : null;
      const q = {
        select: () => q,
        eq: (key: string, value: unknown) => {
          scoped.push([table, key, value]);
          return q;
        },
        order: () => q,
        limit: () => q,
        update: (value: unknown) => {
          update = value;
          saved.push(value);
          return q;
        },
        maybeSingle: async () => ({ data, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: update ? null : data, error: null }).then(
            resolve,
          ),
      };
      return q;
    },
  };
  const subject = serverModuleHarness<
    typeof import("../src/lib/meta/social-agent-generation")
  >(
    "src/lib/meta/social-agent-generation.ts",
    {
      "@/lib/gemini/credentials": {
        loadGeminiCredentials: async () => ({
          apiKey: "test-secret",
          model: "gemini-3.6-flash",
        }),
      },
      "@/lib/billing/gemini-metering": { meterGeminiGenerationUsage: meter },
      "@/lib/billing/trial": { assertBillableAccess: async () => ({}) },
      "@/lib/billing/contract-access": {
        assertContractAccess: async () => ({}),
      },
      "@/lib/whatsapp/agent-behavior": {
        normalizeWhatsappBehaviorSettings: () => ({ agentEnabled: true }),
      },
      "./social-approval-policy": { normalizeMetaSocialApprovalText },
    },
    [],
    { fetch },
  );
  const run = () =>
    subject.generateMetaAgentReply({
      client: client as never,
      org: "org-a",
      agentId: "agent",
      runId: "run-a",
      instruction: "Instagram Direct",
      metadata: { conversationId: "conversation", channel: "instagram_direct" },
    });
  return { run, fetch, meter, scoped, saved };
}
describe("social agent generation", () => {
  it("uses the company's agent prompt and private history, stores the answer and meters by run", async () => {
    const f = fixture();
    const reply = await f.run();
    expect(reply.text).toContain("produtos");
    const init = f.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(init[1].body)).toContain("Ana");
    expect(String(init[1].body)).toContain("Quais produtos");
    for (const table of [
      "agent_registry",
      "conversations",
      "conversation_messages",
      "leads",
      "agent_runs",
    ])
      expect(f.scoped).toContainEqual([table, "organization_id", "org-a"]);
    expect(f.saved.length).toBe(1);
    expect(f.meter).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-a",
        requestId: "meta-social:run-a",
        agentId: "agent",
      }),
    );
  });
  it("does not call the provider for a foreign or missing agent", async () => {
    const f = fixture({ foreign: true });
    await expect(f.run()).rejects.toThrow("Agente");
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("honors a human pause before generating", async () => {
    const f = fixture({ paused: true });
    await expect(f.run()).rejects.toThrow("pausa");
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("does not return an answer as ready if billing fails, while retaining generated evidence", async () => {
    const f = fixture({ billingFails: true });
    await expect(f.run()).rejects.toThrow("billing");
    expect(f.saved.length).toBe(1);
  });
});
