import { describe, it, expect } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
const profiles = serverModuleHarness<
  typeof import("../src/lib/meta/whatsapp-contact-profile")
>(
  "src/lib/meta/whatsapp-contact-profile.ts",
  {
    "@/lib/whatsapp/lead-avatar-sync": {
      readLeadProfileImageUrl: (value: { avatar_url?: string }) =>
        value?.avatar_url,
    },
  },
  [],
  {},
);
describe("official contact profiles", () => {
  it("accepts names only from the exact provider-confirmed sender", () => {
    expect(
      profiles.officialInboundProfileName(
        [{ wa_id: "123", profile: { name: " Maria " } }],
        "123",
      ),
    ).toBe("Maria");
    expect(
      profiles.officialInboundProfileName(
        [{ wa_id: "other", profile: { name: "Other" } }],
        "123",
      ),
    ).toBeNull();
  });
  it("reads CRM photos only through tenant-owned contacts and leads", async () => {
    const scopes: unknown[] = [];
    const client = {
      from: (table: string) => {
        const q = {
          select: () => q,
          eq: (k: string, v: unknown) => {
            scopes.push([table, k, v]);
            return q;
          },
          in: () => q,
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({
              data:
                table === "meta_whatsapp_contacts"
                  ? [{ phone: "123", lead_id: "lead-a" }]
                  : [
                      {
                        id: "lead-a",
                        metadata: {
                          avatar_url: "https://cdn.example.com/maria.jpg",
                        },
                      },
                    ],
              error: null,
            }).then(resolve),
        };
        return q;
      },
    };
    const result = await profiles.enrichOfficialContacts(
      client as never,
      "org-a",
      [{ phone: "123" }],
    );
    expect(result[0].avatar_url).toBe("https://cdn.example.com/maria.jpg");
    expect(scopes).toContainEqual([
      "meta_whatsapp_contacts",
      "organization_id",
      "org-a",
    ]);
    expect(scopes).toContainEqual(["leads", "organization_id", "org-a"]);
  });
});
