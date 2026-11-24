import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { serverModuleHarness } from "./helpers/server-module-harness";
function fixture(anonymous = false, denied = false) {
  const send = vi.fn(async () => ({ status: "sent" }));
  const route = serverModuleHarness<typeof import("../src/app/api/dashboard/meta-social/reply/route")>("src/app/api/dashboard/meta-social/reply/route.ts", {
    "next/server": { NextResponse },
    "@/lib/client-os/guided-oauth": { getAppBaseUrl: () => "https://www.connectyhub.com.br/" },
    "@/lib/meta/company-access": {
      getMetaWorkspace: async () => anonymous ? null : { user: { id: "user-a" }, organization: { id: "org-a" } },
      requireMetaCompanyAccess: async (input: { companyId: string }) => { if (denied) throw new Error("Forbidden"); return { id: input.companyId }; },
    },
    "@/lib/supabase/service": { createServiceClient: () => ({}) },
    "@/lib/meta/inbox-reply": { sendInboxReply: send },
  });
  return { route, send };
}
const request = (origin = "https://www.connectyhub.com.br", contentType = "application/json") => new Request("http://0.0.0.0:3000/api/dashboard/meta-social/reply", { method: "POST", headers: { origin, "content-type": contentType }, body: JSON.stringify({ companyId: "org-foreign", userId: "foreign", requestId: "request", text: "Olá", conversationId: "conversation" }) });
describe("manual inbox endpoint", () => {
  it("accepts the configured public origin behind the internal reverse proxy and uses only session scope", async () => {
    const f = fixture(); const result = await f.route.POST(request());
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
    expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ company: { id: "org-a" }, userId: "user-a" }));
  });
  it.each([["https://attacker.test", "application/json"], ["https://www.connectyhub.com.br", "text/plain"]])("rejects an unsafe origin or form body", async (origin, contentType) => {
    const f = fixture(); expect((await f.route.POST(request(origin, contentType))).status).toBe(403); expect(f.send).not.toHaveBeenCalled();
  });
  it("requires a session", async () => { const f = fixture(true); expect((await f.route.POST(request())).status).toBe(401); expect(f.send).not.toHaveBeenCalled(); });
  it("requires company access before dispatch", async () => { const f = fixture(false, true); expect((await f.route.POST(request())).status).toBe(400); expect(f.send).not.toHaveBeenCalled(); });
});
