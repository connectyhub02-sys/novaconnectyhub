import { describe, expect, it } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as automations from "../src/lib/meta/comment-automations";
const subject = serverModuleHarness<
  typeof import("../src/lib/meta/social-follow-up")
>("src/lib/meta/social-follow-up.ts", { "./comment-automations": automations });
const config = automations.normalizeSocialAutomations({
  followUp: { enabled: true, delayMinutes: 60 },
}).followUp!;
describe("social follow-up eligibility", () => {
  const input = {
    config,
    channel: "instagram_direct",
    inboundAt: "2026-10-11T10:00:00Z",
    sentAt: "2026-10-11T10:01:00Z",
    now: Date.parse("2026-10-11T11:02:00Z"),
  };
  it("requires a delivered private conversation and the configured delay", () => {
    expect(subject.socialFollowUpIsDue(input)).toBe(true);
    expect(
      subject.socialFollowUpIsDue({ ...input, channel: "instagram_comments" }),
    ).toBe(false);
    expect(
      subject.socialFollowUpIsDue({
        ...input,
        now: Date.parse("2026-10-11T10:30:00Z"),
      }),
    ).toBe(false);
    expect(subject.socialFollowUpIsDue({ ...input, sentAt: "invalid" })).toBe(
      false,
    );
    expect(
      subject.socialFollowUpIsDue({
        ...input,
        config: { ...config, enabled: false },
      }),
    ).toBe(false);
    expect(
      subject.socialFollowUpIsDue({
        ...input,
        config: { ...config, platform: "facebook" },
      }),
    ).toBe(false);
  });
  it("expires with a margin before the 24-hour window and rejects future inbound timestamps", () => {
    expect(
      subject.socialFollowUpIsDue({
        ...input,
        now: Date.parse("2026-10-12T09:00:00Z"),
      }),
    ).toBe(false);
    expect(
      subject.socialFollowUpIsDue({
        ...input,
        inboundAt: "2026-10-12T10:00:00Z",
      }),
    ).toBe(false);
  });
  it.each([
    "new_inbound",
    "human_reply",
    "closed",
    "opt_out",
    "changed_config",
  ])("revalidates %s before a delayed send", async (block) => {
    const fixedNow = Date.now();
    const metadata = {
      social_follow_up: config,
      channel: "instagram_direct",
      occurredAt: new Date(fixedNow - 2 * 3600000).toISOString(),
      follow_up_source_sent_at: new Date(fixedNow - 90 * 60000).toISOString(),
      messageId: "in",
      follow_up_source_outbound_id: "out",
    };
    const scopes: unknown[] = [];
    const client = {
      from(table: string) {
        let direction = "";
        const q = {
          select: () => q,
          eq: (key: string, value: unknown) => {
            scopes.push([table, key, value]);
            if (key === "direction") direction = String(value);
            return q;
          },
          order: () => q,
          limit: () => q,
          maybeSingle: async () => ({
            error: null,
            data:
              table === "conversations"
                ? { status: block === "closed" ? "closed" : "open" }
                : {
                    id:
                      direction === "inbound"
                        ? block === "new_inbound"
                          ? "new"
                          : "in"
                        : block === "human_reply"
                          ? "human"
                          : "out",
                    text_content:
                      block === "opt_out"
                        ? "Não quero receber"
                        : "Tenho interesse",
                  },
          }),
        };
        return q;
      },
    };
    await expect(
      subject.assertSocialFollowUpCurrent(
        client as never,
        "org",
        "conversation",
        metadata,
        {
          followUp:
            block === "changed_config" ? { ...config, enabled: false } : config,
        },
      ),
    ).rejects.toThrow();
    if (block !== "changed_config")
      expect(scopes).toContainEqual([
        "conversations",
        "organization_id",
        "org",
      ]);
  });
});
