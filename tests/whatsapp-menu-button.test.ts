import { describe, expect, it } from "vitest";
import { scenario, type Row } from "./helpers/order-revision-scenario";

type MenuResult = { sent: Row[]; duplicate: boolean } | null;

/** Pizzeria store with a public page, the customer asking for the menu (Max, 05/10 and 12/10). */
function menuRequest(text = "Tem como me mandar o cardapio") {
  const s = scenario();
  Object.assign(s.ctx.organization, { slug: "macedo-dias" });
  s.ctx.salesCatalogSettings = { businessType: "food", categories: [] } as never;
  const latest = s.message("inbound", text);
  s.ctx.messages = [latest];
  s.db.tables.conversation_messages = [latest];
  s.db.tables.intelligence_events = [];
  const send = () => s.call<Promise<MenuResult>>("maybeSendSalesCatalogMenu", { client: s.db.client, context: s.ctx, token: "fake", phone: "5500000000000", latestInbound: latest });
  return { ...s, latest, send };
}

describe("menu request in WhatsApp", () => {
  it("answers with one short line and the store button, never the whole menu as text", async () => {
    const t = menuRequest();
    const result = await t.send();
    expect(result).toMatchObject({ duplicate: false });
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0].url).toContain("/send/menu");
    expect(t.requests[0].body).toMatchObject({ type: "button", choices: ["Ver cardápio|https://loja.example/loja/macedo-dias"] });
    expect(String(t.requests[0].body.text).length).toBeLessThan(260);
    expect(t.requests[0].body.text).not.toContain("R$");
  });

  it("sends the button once when two runs pick the same request", async () => {
    const t = menuRequest();
    const insert = t.db.client.from;
    t.db.client.from = ((table: string) => table === "intelligence_events"
      ? { insert: async () => ({ error: { code: "23505", message: "duplicate key value violates unique constraint" } }) }
      : insert(table)) as typeof insert;
    expect(await t.send()).toEqual({ sent: [], duplicate: true });
    expect(t.requests).toHaveLength(0);
  });

  it("records the delivery with a key unique to the conversation and the request", async () => {
    const t = menuRequest();
    await t.send();
    expect(t.db.tables.intelligence_events.filter(event => event.event_type === "sales_catalog.menu_link_sent")).toEqual([expect.objectContaining({
      event_type: "sales_catalog.menu_link_sent", tracking_event_key: `catalog_menu:conversation:${t.latest.id}` })]);
  });

  it("leaves recommendations and stores without a page to the agent", async () => {
    expect(await menuRequest("o que vc me recomenda para hoje").send()).toBeNull();
    const noPage = menuRequest();
    Object.assign(noPage.ctx.organization, { slug: null });
    expect(await noPage.send()).toBeNull();
  });
});
