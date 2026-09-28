import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Sent = { endpoint: string; email: unknown };

describe("Asaas webhook contact e-mail", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function connect(ownerEmail: string, rejectEmails: string[]) {
    const sent: Sent[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const endpoint = new URL(url).pathname.replace(/^\/v3/, "");
      if (endpoint.startsWith("/myAccount") || endpoint.startsWith("/pix/addressKeys") || endpoint.startsWith("/wallets")) {
        return new Response(JSON.stringify({ name: "Loja", status: "APPROVED", data: [], totalCount: 0, id: "w1", walletId: "w1" }), { status: 200 });
      }
      if (endpoint === "/webhooks" && init.method === "POST") {
        const body = JSON.parse(String(init.body));
        sent.push({ endpoint, email: body.email });
        if (rejectEmails.includes(body.email)) {
          return new Response(JSON.stringify({ errors: [{ code: "invalid_email", description: "O email informado é inválido." }] }), { status: 400 });
        }
        return new Response(JSON.stringify({ id: "wh_1", name: body.name, events: body.events }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    const saved: Array<Record<string, unknown>> = [];
    const chain = {
      upsert: (row: Record<string, unknown>) => { saved.push(row); return chain; },
      select: () => chain, single: async () => ({ data: saved.at(-1), error: null }),
      eq: () => chain, maybeSingle: async () => ({ data: null, error: null }),
    };
    const client = { from: () => chain };
    const { saveAsaasPaymentIntegration } = await import("@/lib/sales-catalog/asaas");
    await saveAsaasPaymentIntegration({ client: client as never, organizationId: "org-1", accessToken: "$aact_test_key", mode: "sandbox", webhookEmail: ownerEmail }).catch(() => null);
    return { sent, saved };
  }

  it("never sends an address Asaas refuses and falls back to the platform contact", async () => {
    const { sent } = await connect("pizzariamacedo&dias@gmail.com", []);
    expect(sent[0]?.email).not.toContain("&");
    expect(String(sent[0]?.email)).toMatch(/^[a-z0-9._%+-]+@/);
  });

  it("retries with the platform contact when Asaas refuses the owner's e-mail", async () => {
    const { sent } = await connect("dono@loja.com.br", ["dono@loja.com.br"]);
    expect(sent.map(item => item.email)).toEqual(["dono@loja.com.br", expect.not.stringMatching(/^dono@/)]);
  });
});
