import { describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";
import { serverModuleHarness } from "./helpers/server-module-harness";
function fixture(options: { anonymous?: boolean; foreign?: boolean } = {}) {
  const scopes: Array<[string, string, unknown]> = [];
  const from = vi.fn((table: string) => {
    const q = {
      select: () => q,
      eq: (key: string, value: unknown) => {
        scopes.push([table, key, value]);
        return q;
      },
      in: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({
        data: options.foreign ? null : { id: "conversation" },
        error: null,
      }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return q;
  });
  const route = serverModuleHarness<
    typeof import("../src/app/api/dashboard/meta-social/route")
  >("src/app/api/dashboard/meta-social/route.ts", {
    "next/server": { NextResponse },
    "@/lib/supabase/profile": {
      getCurrentWorkspace: async () =>
        options.anonymous
          ? null
          : { user: { id: "user-a" }, organization: { id: "org-a" } },
    },
    "@/lib/client-os/companies": {
      requireClientCompanyAccess: async () => ({ id: "org-a" }),
    },
    "@/lib/supabase/service": { createServiceClient: () => ({ from }) },
  });
  return { route, scopes, from };
}
describe("Meta social inbox isolation", () => {
  it("requires a session before accessing the database", async () => {
    const f = fixture({ anonymous: true });
    const r = await f.route.GET(new Request("https://example.test/api"));
    expect(r.status).toBe(401);
    expect(f.from).not.toHaveBeenCalled();
  });
  it("does not load another company's conversation history", async () => {
    const f = fixture({ foreign: true });
    const r = await f.route.GET(
      new Request(
        "https://example.test/api?conversation=foreign&companyId=org-b",
      ),
    );
    expect(r.status).toBe(404);
    expect(f.scopes).toContainEqual([
      "conversations",
      "organization_id",
      "org-a",
    ]);
    expect(f.from).not.toHaveBeenCalledWith("conversation_messages");
  });
  it("scopes own messages to the session organization and disables caching", async () => {
    const f = fixture();
    const r = await f.route.GET(
      new Request("https://example.test/api?conversation=conversation"),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(f.scopes).toContainEqual([
      "conversation_messages",
      "organization_id",
      "org-a",
    ]);
    expect(f.scopes).toContainEqual([
      "conversation_messages",
      "conversation_id",
      "conversation",
    ]);
  });
});
