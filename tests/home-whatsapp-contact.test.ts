import { afterEach, expect, it, vi } from "vitest";
import { normalizePlatformWhatsapp, platformWhatsappFallback } from "../src/lib/marketing/platform-whatsapp-phone";

vi.mock("server-only", () => ({}));
const service = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: service.create }));
import { GET } from "../src/app/contato/whatsapp/route";
afterEach(() => vi.resetAllMocks());

function mockInstance(phone: string | null, agentId: string | null = "global") {
  const contains = vi.fn();
  service.create.mockReturnValue({ from: (table: string) => {
    const query = {
      select: () => query, eq: () => query, neq: () => query, order: () => query,
      limit: () => query, abortSignal: () => query,
      contains: (...args: unknown[]) => { contains(...args); return query; },
      maybeSingle: async () => ({ data: table === "platform_billing_settings"
        ? { billing_whatsapp_agent_id: agentId }
        : phone ? { phone_number: phone } : null }),
    }; return query;
  } });
  return contains;
}

it("home WhatsApp follows the attendance instance connected in the admin panel", async () => {
  const contains = mockInstance("5511999990000");
  const response = await GET();
  expect(contains).toHaveBeenCalledWith("metadata", { agent_id: "global", admin_whatsapp: true, platform_whatsapp: true });
  const location = new URL(response.headers.get("location")!);
  expect(location.hostname).toBe("wa.me");
  expect(location.pathname).toBe("/5511999990000");
  expect(location.searchParams.get("text")).toBe("Olá ConnectyHub");
  expect(response.status).toBe(302);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
});

it("falls back to the confirmed public number without instance or database", async () => {
  mockInstance(null);
  expect((await GET()).headers.get("location")).toContain(`https://wa.me/${platformWhatsappFallback}?`);
  mockInstance("5511999990000", null);
  expect((await GET()).headers.get("location")).toContain(`https://wa.me/${platformWhatsappFallback}?`);
  service.create.mockImplementation(() => { throw new Error("not configured"); });
  expect((await GET()).headers.get("location")).toContain(`https://wa.me/${platformWhatsappFallback}?`);
});

it("restores the Brazilian ninth digit and rejects invalid values", () => {
  expect(normalizePlatformWhatsapp("+55 (47) 8855-6936")).toBe("5547988556936");
  expect(normalizePlatformWhatsapp("5511910188233")).toBe("5511910188233");
  expect(normalizePlatformWhatsapp("554733334444")).toBe("554733334444");
  expect(normalizePlatformWhatsapp("https://evil.example")).toBe(platformWhatsappFallback);
});
