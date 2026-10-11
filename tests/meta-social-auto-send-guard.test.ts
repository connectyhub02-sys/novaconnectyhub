import { describe, it, expect } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { resolveMetaSocialQueueDecision } from "../src/lib/meta/social-agent-policy";
function fixture(block?: "pause" | "optout" | "approval" | "foreign") {
  const scopes: Array<[string, string, unknown]> = [];
  const client = {
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          scopes.push([table, k, v]);
          return q;
        },
        maybeSingle: async () => ({
          error: null,
          data:
            block === "foreign"
              ? null
              : table === "agent_registry"
                ? {
                    status: "active",
                    requires_human_approval: block === "approval",
                    metadata: {
                      multichannel_config: {
                        channels: {
                          instagram_direct: {
                            enabled: true,
                            autoReply: true,
                            requiresHumanApproval: false,
                          },
                        },
                      },
                    },
                  }
                : table === "conversations"
                  ? {
                      channel: "instagram_direct",
                      lead_id: "lead",
                      metadata:
                        block === "pause"
                          ? {
                              human_intervention: {
                                paused_until: "2099-01-01",
                              },
                            }
                          : {},
                    }
                  : {
                      metadata:
                        block === "optout"
                          ? { opt_out: { requested_at: "2026-10-11" } }
                          : {},
                    },
        }),
      };
      return q;
    },
  };
  const subject = serverModuleHarness<
    typeof import("../src/lib/meta/social-auto-send-guard")
  >("src/lib/meta/social-auto-send-guard.ts", {
    "./social-agent-policy": { resolveMetaSocialQueueDecision },
    "@/lib/whatsapp/agent-behavior": {
      normalizeWhatsappBehaviorSettings: () => ({ agentEnabled: true }),
    },
  });
  return {
    run: () =>
      subject.assertMetaAutomaticSendAllowed({
        client: client as never,
        organizationId: "org-a",
        agentId: "agent",
        conversationId: "conversation",
        channel: "instagram_direct",
      }),
    scopes,
  };
}
describe("autonomous social send revalidation", () => {
  it.each(["pause", "optout", "approval", "foreign"] as const)(
    "blocks when %s changes after generation",
    async (block) => {
      await expect(fixture(block).run()).rejects.toThrow();
    },
  );
  it("checks the current agent, conversation and lead inside one organization", async () => {
    const f = fixture();
    expect(await f.run()).toMatchObject({ enabled: true, autoReply: true });
    for (const table of ["agent_registry", "conversations", "leads"])
      expect(f.scopes).toContainEqual([table, "organization_id", "org-a"]);
  });
});
