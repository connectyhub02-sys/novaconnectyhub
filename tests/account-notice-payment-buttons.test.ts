import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as actions from "../src/lib/billing/account-notice-actions";

it("keeps Pix, checkout, save contact and unsubscribe accessible in a single notice", async () => {
  const fetch = vi.fn(async (_url: string, _options: RequestInit) => ({ ok: true, status: 200, text: async () => '{"id":"message"}' })); // eslint-disable-line @typescript-eslint/no-unused-vars
  const mod = serverModuleHarness<{ sendBillingWhatsappNotice: (input: unknown) => Promise<unknown> }>("src/lib/billing/platform-billing-webhook.ts", {
    "./account-notice-actions": actions, "@/lib/billing/platform-billing-messages": { PLATFORM_BILLING_MESSAGE_TEMPLATE_DEFINITIONS: [] },
  }, ["sendBillingWhatsappNotice"], { fetch });
  await mod.sendBillingWhatsappNotice({ credentials: { baseUrl: "https://fixture.invalid" }, token: "fixture", phone: "5511999999999", message: "Confira a cobrança.", pixCode: "pix-fixture", button: { label: "Abrir cobrança", url: "https://fixture.invalid/checkout" }, actions: { unsubscribeUrl: "https://fixture.invalid/avisos/key", contactUrl: "https://fixture.invalid/avisos/key/contato" }, trackId: "fixture" });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("https://fixture.invalid/send/menu");
  const body = JSON.parse(String(fetch.mock.calls[0][1].body));
  expect(body.text).toContain("https://fixture.invalid/checkout");
  expect(body.choices).toEqual(["Copiar código Pix|copy:pix-fixture", "Salvar contato|https://fixture.invalid/avisos/key/contato", "Sair da lista|https://fixture.invalid/avisos/key"]);
});
