import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ user: null as unknown, membership: true }));
vi.mock("@/lib/supabase/env", () => ({ getSupabasePublicEnv: () => ({ configured: true, url: "https://example.test", publishableKey: "test" }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({
  auth: { getUser: async () => ({ data: { user: state.user } }) },
  from: () => { const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: state.membership ? { organization_id: "bf240c2b-1be2-4d73-955e-528eec184bd0" } : null, error: null }) }; return query; },
}) }));
import { updateSession } from "../src/lib/supabase/proxy";
describe("review session boundary", () => {
  beforeEach(() => { state.membership = true; state.user = { id: "review-user", app_metadata: { meta_review: { organization_id: "bf240c2b-1be2-4d73-955e-528eec184bd0", expires_at: "2099-01-01T00:00:00Z" } } }; });
  const request = (path: string) => updateSession(new NextRequest(`https://www.connectyhub.com.br${path}`));
  it("requires a session", async () => { state.user = null; expect((await request("/api/dashboard/integrations/meta/whatsapp")).status).toBe(401); });
  it("requires membership even for the allowed integration", async () => { state.membership = false; expect((await request("/dashboard/chat-meta")).status).toBe(403); });
  it("denies admin, billing and unrelated APIs including signup outside dashboard", async () => { for (const path of ["/admin/meta", "/dashboard/planos", "/api/dashboard/account", "/api/account/completion", "/api/account/security", "/api/dashboard/integrations/asaas"]) expect((await request(path)).status).toBe(403); });
  it("routes login to the actual integration panel", async () => { expect((await request("/login")).headers.get("location")).toBe("https://www.connectyhub.com.br/dashboard/integracoes"); });
  it("lets the integration handler perform its normal tenant checks", async () => { expect((await request("/api/dashboard/integrations/meta/whatsapp")).headers.get("x-middleware-next")).toBe("1"); });
  it("revokes expired review sessions", async () => { (state.user as { app_metadata: { meta_review: { expires_at: string } } }).app_metadata.meta_review.expires_at = "2000-01-01T00:00:00Z"; expect((await request("/dashboard/chat-meta")).status).toBe(403); });
});
