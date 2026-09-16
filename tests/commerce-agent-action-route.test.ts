import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type * as Route from "../src/app/api/public/commerce-agent/action/route";
import { serverModuleHarness } from "./helpers/server-module-harness";

function fixture() {
  class WebActionError extends Error { constructor(message: string, public status = 409) { super(message); } }
  const handle = vi.fn(async () => ({ ok: true }));
  const record = vi.fn();
  const resolve = vi.fn(async (): Promise<Record<string, unknown>> => ({ ok: true, commerceSessionId: "session" }));
  const route = serverModuleHarness<typeof Route>("src/app/api/public/commerce-agent/action/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/security/public-request-guard": { validatePublicWriteRequest: () => ({ ok: true }) },
    "@/lib/commerce-agent/web-actions-server": { handleWebAction: handle, WebActionError },
    "@/lib/commerce-agent/server": { readCommerceAgentBody: (body: unknown) => body, resolveCommerceAgentContext: resolve, recordCommerceAgentAction: record },
  });
  const request = (body: unknown) => new Request("http://localhost/api/public/commerce-agent/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as NextRequest;
  return { handle, record, resolve, route, request, WebActionError };
}
describe("public assisted action route", () => {
  it("routes stored commands through the scope/consent handler rather than legacy telemetry", async () => {
    const f = fixture(); const body = { web_action_id: "id", phase: "execute" };
    expect((await f.route.POST(f.request(body))).status).toBe(200);
    expect(f.handle).toHaveBeenCalledWith({ ok: true, commerceSessionId: "session" }, body);
    expect(f.record).not.toHaveBeenCalled();
  });
  it("preserves legacy telemetry", async () => {
    const f = fixture();
    expect((await f.route.POST(f.request({ action_type: "contextual_opener" }))).status).toBe(200);
    expect(f.record).toHaveBeenCalled(); expect(f.handle).not.toHaveBeenCalled();
  });
  it("preserves authorization failures and maps consent/DB errors without private details", async () => {
    const f = fixture(); const request = () => f.request({ web_action_id: "id" });
    f.resolve.mockResolvedValueOnce({ ok: false, status: 403, error: "Contexto inválido" });
    expect((await f.route.POST(request())).status).toBe(403); expect(f.handle).not.toHaveBeenCalled();
    f.handle.mockRejectedValueOnce(new f.WebActionError("Confirme o item", 403));
    expect((await f.route.POST(request())).status).toBe(403);
    f.handle.mockRejectedValueOnce(new Error("private database details"));
    const response = await f.route.POST(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private");
  });
});
