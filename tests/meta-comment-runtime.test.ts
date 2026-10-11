import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as automations from "../src/lib/meta/comment-automations";
import * as channels from "../src/lib/agents/multichannel";
import * as policy from "../src/lib/meta/social-agent-policy";

function fixture(stale = false) {
  const rule = automations.normalizeSocialAutomations({
    rules: [
      {
        id: "offer",
        name: "Offer",
        enabled: true,
        trigger: "any_comment",
        action: "private_message",
        text: "Aqui está seu material",
        requireApproval: false,
      },
    ],
  }).rules[0];
  const metadata = {
    channel: "instagram_comments",
    messageId: "message",
    conversationId: "conversation",
    comment_automation: rule,
  };
  const run = {
    id: "run",
    agent_id: "agent",
    organization_id: "org",
    run_status: "queued",
    metadata,
  };
  const writes: Record<string, unknown>[] = [];
  const client = {
    from: (table: string) => {
      let writing = false;
      const q = {
        select: () => q,
        eq: () => q,
        update: (data: Record<string, unknown>) => {
          writing = true;
          writes.push(data);
          return q;
        },
        maybeSingle: async () => ({
          error: null,
          data: writing
            ? { id: "run" }
            : table === "agent_runs"
              ? run
              : {
                  id: "agent",
                  status: "active",
                  metadata: {
                    multichannel_config: {
                      channels: { instagram_comments: { enabled: true } },
                    },
                  },
                },
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(resolve),
      };
      return q;
    },
  };
  const generate = vi.fn();
  const dispatch = vi.fn();
  const guard = vi.fn(async () => {
    if (stale) throw new Error("Rule disabled");
  });
  const subject = serverModuleHarness<
    typeof import("../src/lib/meta/social-agent-queue")
  >("src/lib/meta/social-agent-queue.ts", {
    "./comment-automations": automations,
    "../agents/multichannel": channels,
    "./social-agent-policy": policy,
    "@/lib/billing/trial": { getOrganizationBillingAccess: async () => ({}) },
    "@/lib/billing/plan-entitlements": {
      resolveMetaSocialChannelsEntitlement: () => ({ allowed: true }),
    },
    "./social-agent-generation": { generateMetaAgentReply: generate },
    "./social-auto-send-guard": { assertMetaAutomaticSendAllowed: guard },
    "./social-dispatcher": { enqueueApprovedMetaSocialDispatch: dispatch },
  });
  return {
    process: () =>
      subject.processMetaSocialAgentRun({
        runId: "run",
        client: client as never,
      }),
    generate,
    dispatch,
    guard,
    writes,
  };
}
describe("comment automation runtime", () => {
  it("uses the chosen private message without generating or billing AI", async () => {
    const f = fixture();
    expect(await f.process()).toMatchObject({ status: "completed" });
    expect(f.generate).not.toHaveBeenCalled();
    expect(f.guard).toHaveBeenCalled();
    expect(f.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          social_suggested_reply_text: "Aqui está seu material",
          social_suggested_reply_source: "automation_message",
        }),
      }),
    );
  });
  it("does not dispatch or generate after a rule is paused", async () => {
    const f = fixture(true);
    expect(await f.process()).toMatchObject({ status: "failed" });
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
  });
});
