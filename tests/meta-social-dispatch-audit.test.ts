import { describe, expect, it } from "vitest";
import {
  appendMetaDispatchAudit,
  readMetaDispatchAudit,
} from "../src/lib/meta/social-dispatch-audit";

describe("Meta social dispatch audit", () => {
  it("appends dispatch audit entries without losing existing metadata", () => {
    const metadata = appendMetaDispatchAudit({
      channel: "instagram_direct",
      meta_dispatch_status: "pending_adapter",
    }, {
      at: "2026-07-19T10:00:00.000Z",
      type: "dispatch_queued",
      status: "pending_adapter",
    });

    expect(metadata.channel).toBe("instagram_direct");
    expect(readMetaDispatchAudit(metadata.meta_dispatch_audit)).toEqual([
      {
        at: "2026-07-19T10:00:00.000Z",
        type: "dispatch_queued",
        status: "pending_adapter",
      },
    ]);
  });

  it("keeps only the latest audit entries", () => {
    const metadata = Array.from({ length: 14 }, (_, index) => index).reduce(
      (current, index) => appendMetaDispatchAudit(current, {
        at: `2026-07-19T10:${String(index).padStart(2, "0")}:00.000Z`,
        type: `event_${index}`,
      }),
      {} as Record<string, unknown>,
    );

    const audit = readMetaDispatchAudit(metadata.meta_dispatch_audit);
    expect(audit).toHaveLength(12);
    expect(audit[0]?.type).toBe("event_2");
    expect(audit[11]?.type).toBe("event_13");
  });
});
