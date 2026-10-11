import { describe, expect, it } from "vitest";
import { isMetaReviewPath, readMetaReviewAccess } from "../src/lib/auth/meta-review-access";

describe("dedicated Meta review access", () => {
  const grant = { organization_id: "bf240c2b-1be2-4d73-955e-528eec184bd0", expires_at: "2026-12-01T00:00:00Z" };
  it("ignores self-editable user metadata", () => {
    expect(readMetaReviewAccess({ user_metadata: { meta_review: grant } } as never)).toBeNull();
  });
  it("retains expired grants as denied rather than falling back to normal access", () => {
    expect(readMetaReviewAccess({ app_metadata: { meta_review: grant } }, Date.parse("2027-01-01"))?.active).toBe(false);
    expect(readMetaReviewAccess({ app_metadata: { meta_review: grant } }, Date.parse("2026-11-01"))?.active).toBe(true);
  });
  it("permits only exact review paths, excluding billing, admin and unrelated integrations", () => {
    for (const path of ["/admin", "/api/dashboard/integrations/asaas", "/api/dashboard/integrations/meta/whatsapp/evil", "/dashboard/planos"]) expect(isMetaReviewPath(path)).toBe(false);
    expect(isMetaReviewPath("/dashboard/chat-meta")).toBe(true);
  });
});
