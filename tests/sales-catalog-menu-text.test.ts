import { describe, expect, it } from "vitest";
import { foodCompositionSizePrices, foodCompositionStartingCents } from "@/lib/sales-catalog/food-composition";
import { describeFoodCompositionForAgent } from "@/lib/sales-catalog/food-conversation";
import { buildSalesCatalogMenuMessages, isMenuRequest } from "@/lib/sales-catalog/menu-text";
import { menu, storeSettings } from "../scripts/seed/pizzaria-macedo-dias/menu";

const items = menu.map(item => ({
  id: item.key, title: item.title, category: item.category, price: item.price, status: "active" as const, salesDestination: "connectyhub_checkout" as const,
  inventory: { status: "in_stock", quantity: null, allowBackorder: false, lowStockThreshold: null } as never, offer: { salePrice: null } as never,
  foodComposition: item.food,
}));
const pizza = menu.find(item => item.key === "pizza")!.food!;

describe("food menu for WhatsApp", () => {
  it("recognizes a menu request in the customer's own words", () => {
    for (const text of ["me mostra o cardápio", "quais as opções do cardapio", "tem menu?", "o que vcs tem ai", "não tem mais opções?", "manda o catálogo"]) expect([text, isMenuRequest(text)]).toEqual([text, true]);
    for (const text of ["quero uma grande meia calabresa", "qual o valor da entrega", "boa noite"]) expect([text, isMenuRequest(text)]).toEqual([text, false]);
  });

  it("prices an assembled product from its cheapest size and flavor", () => {
    expect(foodCompositionStartingCents(pizza)).toBe(3290); // broto mussarela
    expect(foodCompositionSizePrices(pizza).map(size => size.cents)).toEqual([3290, 4890, 5990, 7890]);
    expect(foodCompositionStartingCents(menu.find(item => item.key === "combo-familia")!.food)).toBe(12990);
    expect(foodCompositionStartingCents(menu.find(item => item.key === "batata")!.food)).toBe(2200);
  });

  it("lists every category, product, price and flavor in store order, in short messages", () => {
    const messages = buildSalesCatalogMenuMessages(items, storeSettings.categories);
    const text = messages.join("\n\n");
    expect(messages.every(message => message.length <= 1400)).toBe(true);
    expect(text.indexOf("*Pizzas*")).toBeLessThan(text.indexOf("*Bebidas*"));
    expect(text).toContain(["• Pizza Salgada — até 4 sabores", "   Broto R$ 32,90 · Média R$ 48,90 · Grande R$ 59,90 · Gigante R$ 78,90 (a partir de)"].join("\n"));
    expect(text).toContain("   Opções: Coca-Cola, Coca-Cola Sem Açúcar");
    expect(text).toContain("Camarão");
    expect(text).toContain("• Combo Família — R$ 129,90 (até 4 sabores)");
    expect(text).toContain("• Heineken Long Neck 330ml — R$ 12,90");
    expect(text).toContain("Coca-Cola Sem Açúcar");
    expect(text).not.toContain("R$ 0,00");
  });

  it("gives the agent a compact assembly with ids, names and prices, not the raw setup", () => {
    const description = describeFoodCompositionForAgent(pizza);
    expect(description).toContain("gigante=Gigante (12 fatias): 12 fração(ões), até 4 sabor(es)");
    expect(description).toContain("calabresa=Calabresa: 34,90/51,90/62,90/82,90");
    expect(description).toContain("Grupo borda=Borda (obrigatório escolher 1; na unidade inteira)");
    expect(description).not.toContain("\"active\"");
    expect(description.length).toBeLessThan(JSON.stringify(pizza).length * 0.7);
  });
});
