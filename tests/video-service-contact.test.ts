import { afterEach, expect, it, vi } from "vitest";
import { videoWhatsappUrl } from "../src/lib/marketing/video-service";

vi.mock("server-only", () => ({}));
const service = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: service.create }));
import { GET } from "../src/app/solucoes/producao-de-videos/conversar/route";
afterEach(() => vi.resetAllMocks());

it("uses the global agent even when development has a different agent", async () => {
  const contains = vi.fn();
  service.create.mockReturnValue({ from: (table: string) => {
    const query = {
      select: () => query, eq: () => query, neq: () => query, order: () => query,
      limit: () => query, abortSignal: () => query,
      contains: (...args: unknown[]) => { contains(...args); return query; },
      maybeSingle: async () => ({ data: table === "platform_billing_settings"
        ? { billing_whatsapp_agent_id: "global", metadata: { custom_software_agent_id: "development" } }
        : { phone_number: "+55 (47) 8855-6936" } }),
    }; return query;
  } });
  const response = await GET(new Request("https://www.connectyhub.com.br/solucoes/producao-de-videos/conversar?estilo=ia"));
  expect(contains).toHaveBeenCalledWith("metadata", { agent_id: "global", admin_whatsapp: true, platform_whatsapp: true });
  const location = new URL(response.headers.get("location")!);
  expect(location.hostname).toBe("wa.me");
  expect(location.pathname).toBe("/554788556936");
  expect(location.searchParams.get("text")).toContain("produção de vídeos com IA");
  expect(response.status).toBe(302);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("keeps contact available when there are no database credentials", async () => {
  service.create.mockImplementation(() => { throw new Error("not configured"); });
  const response = await GET(new Request("https://www.connectyhub.com.br/solucoes/producao-de-videos/conversar"));
  expect(response.headers.get("location")).toContain("https://wa.me/554788556936?");
});

it("never uses arbitrary style text or invalid phone values in a redirect", () => {
  const link = new URL(videoWhatsappUrl("https://evil.example", "https://evil.example"));
  expect(link.pathname).toBe("/554788556936");
  expect(link.searchParams.get("text")).not.toContain("evil.example");
  expect(link.searchParams.get("text")).toContain("Olá, Eliane!");
});
