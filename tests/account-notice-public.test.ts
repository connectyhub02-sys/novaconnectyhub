import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as page from "../src/lib/billing/account-notice-page";
import * as actions from "../src/lib/billing/account-notice-actions";

const key = "10000000-0000-4000-8000-000000000001";
function fixture(enabled = true) {
  const load = vi.fn(async () => ({ enabled, phone: "5511999999999", welcome_contact_phone: "5511888888888" }));
  const optOut = vi.fn(async () => true);
  const imports = {
    "@/lib/supabase/service": { createServiceClient: () => "service" },
    "@/lib/billing/account-notice-preferences": { loadNoticeRecipientByKey: load, optOutAccountNotices: optOut, validNoticeKey: (v: string) => v === key },
    "@/lib/billing/account-notice-page": page, "@/lib/billing/account-notice-actions": actions,
  };
  const globals = { Response };
  return { load, optOut, context: { params: Promise.resolve({ key }) },
    route: serverModuleHarness<typeof import("../src/app/avisos/[key]/route")>("src/app/avisos/[key]/route.ts", imports, [], globals),
    contact: serverModuleHarness<typeof import("../src/app/avisos/[key]/contato/route")>("src/app/avisos/[key]/contato/route.ts", imports, [], globals),
  };
}
it("requires confirmation and exposes no subscriber data on link previews", async () => {
  const f = fixture(); const response = await f.route.GET(new Request(`https://fixture.invalid/avisos/${key}`), f.context);
  const body = await response.text();
  expect(response.status).toBe(200); expect(body).toContain('method="post"'); expect(body).not.toContain("5511999999999");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer"); expect(response.headers.get("cache-control")).toContain("no-store");
  expect(f.optOut).not.toHaveBeenCalled();
});
it("processes only an explicit unsubscribe POST, without login or a re-enable action", async () => {
  const f = fixture();
  const response = await f.route.POST(new Request(`https://fixture.invalid/avisos/${key}`, { method: "POST", body: new URLSearchParams({ action: "unsubscribe" }) }), f.context);
  expect(await response.text()).toContain("Você saiu da lista"); expect(f.optOut).toHaveBeenCalledWith("service", key);
  f.optOut.mockClear();
  expect((await f.route.POST(new Request(`https://fixture.invalid/avisos/${key}`, { method: "POST", body: new URLSearchParams({ action: "enable" }) }), f.context)).status).toBe(422);
  expect(f.optOut).not.toHaveBeenCalled();
});
it("rejects malformed keys and cross-origin mutations", async () => {
  const f = fixture();
  expect((await f.route.GET(new Request("https://fixture.invalid"), { params: Promise.resolve({ key: "bad" }) })).status).toBe(404);
  expect(f.load).not.toHaveBeenCalled();
  expect((await f.route.POST(new Request(`https://fixture.invalid/avisos/${key}`, { method: "POST", headers: { origin: "https://foreign.invalid" } }), f.context)).status).toBe(403);
  expect(f.optOut).not.toHaveBeenCalled();
});
it("accepts the no-referrer form's null Origin only with same-origin browser metadata", async () => {
  const f = fixture();
  const make = (site: string) => new Request(`https://fixture.invalid/avisos/${key}`, { method: "POST", headers: { origin: "null", "sec-fetch-site": site }, body: new URLSearchParams({ action: "unsubscribe" }) });
  expect((await f.route.POST(make("same-origin"), f.context)).status).toBe(200);
  f.optOut.mockClear(); expect((await f.route.POST(make("cross-site"), f.context)).status).toBe(403);
  expect(f.optOut).not.toHaveBeenCalled();
});
it("downloads only the actual platform contact, never the recipient's phone", async () => {
  const f = fixture(); const response = await f.contact.GET(new Request(`https://fixture.invalid/avisos/${key}/contato`), f.context);
  expect(response.headers.get("content-type")).toContain("text/vcard");
  const body = await response.text(); expect(body).toContain("TEL;TYPE=CELL:+5511888888888"); expect(body).not.toContain("5511999999999");
  expect(f.optOut).not.toHaveBeenCalled();
});
it("keeps checkout/Pix and unsubscribe within three buttons and every text fallback", () => {
  const links = { unsubscribeUrl: "https://fixture.invalid/avisos/key", contactUrl: "https://fixture.invalid/avisos/key/contato" };
  const choices = actions.noticeActionChoices(links, { label: "Pagar", url: "https://fixture.invalid/pay" }, "pix-code");
  expect(choices).toEqual(["Copiar código Pix|copy:pix-code", `Salvar contato|${links.contactUrl}`, `Sair da lista|${links.unsubscribeUrl}`]);
  expect(actions.noticeActionsMessage("Aviso", links)).toContain(links.unsubscribeUrl);
  expect(() => actions.connectyHubContactCard("123\r\nINJECTED:yes")).toThrow();
});
