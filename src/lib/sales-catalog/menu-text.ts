import { foodCompositionSizePrices, readFoodComposition } from "./food-composition";
import { deliveryMoneyCents } from "./local-delivery";
import type { ClientSalesCatalogItem } from "./shared";

type MenuItem = Pick<ClientSalesCatalogItem, "id" | "title" | "category" | "price" | "status" | "salesDestination" | "inventory" | "foodComposition" | "offer">;

const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const shortSize = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, "").trim();

/** Menu request in the customer's own words: "cardápio", "menu", "quais as opções", "o que vocês têm". */
export function isMenuRequest(text: string) {
  const normalized = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /\b(cardapio|menu|catalogo)\b/.test(normalized)
    || /\b(quais|que)\s+(sao\s+)?(as\s+)?(opcoes|produtos)\b/.test(normalized)
    || /\bo\s+que\s+(voces\s+|vcs\s+|vc\s+)?(tem|tem\s+ai|vende|vendem|serve|servem)\b/.test(normalized)
    || /\b(mais|outras|todas\s+as)\s+opcoes\b/.test(normalized);
}

function itemCents(item: MenuItem) {
  return deliveryMoneyCents(item.offer?.salePrice) ?? deliveryMoneyCents(item.price);
}

function describeItem(item: MenuItem): string[] {
  const food = item.foodComposition?.enabled ? readFoodComposition(item.foodComposition) : null;
  if (!food) {
    const cents = itemCents(item);
    return cents ? [`• ${item.title} — ${brl(cents)}`] : [];
  }
  const sizes = foodCompositionSizePrices(food);
  if (!sizes.length) return [];
  const flavors = food.flavors.filter(flavor => flavor.active).map(flavor => flavor.name);
  const maxFlavors = Math.max(...sizes.map(size => size.maxFlavors));
  const lines: string[] = [];
  if (sizes.length === 1) {
    const label = food.pricing === "fixed" ? brl(sizes[0].cents) : `a partir de ${brl(sizes[0].cents)}`;
    lines.push(`• ${item.title} — ${label}${maxFlavors > 1 ? ` (até ${maxFlavors} sabores)` : ""}`);
  } else if (food.pricing === "fixed" && maxFlavors === 1) {
    lines.push(`• ${item.title} — ${sizes.map(size => `${shortSize(size.name)} ${brl(size.cents)}`).join(" · ")}`);
  } else {
    lines.push(`• ${item.title}${maxFlavors > 1 ? ` — até ${maxFlavors} sabores` : ""}`);
    lines.push(`   ${sizes.map(size => `${shortSize(size.name)} ${brl(size.cents)}`).join(" · ")}${food.pricing === "fixed" ? "" : " (a partir de)"}`);
  }
  if (flavors.length) lines.push(`   ${maxFlavors > 1 ? "Sabores" : "Opções"}: ${flavors.join(", ")}`);
  return lines;
}

/** The store menu as short WhatsApp messages, one or more categories each, in the order the store set. */
export function buildSalesCatalogMenuMessages(items: MenuItem[], categories: string[], maxChars = 1400): string[] {
  const available = items.filter(item => item.status === "active"
    && item.salesDestination !== "appointment"
    && (item.inventory?.status !== "out_of_stock" || item.inventory?.allowBackorder));
  const order = [...categories, ...new Set(available.map(item => item.category ?? "Outros"))];
  const blocks: string[] = [];
  for (const category of [...new Set(order)]) {
    const lines = available.filter(item => (item.category ?? "Outros") === category).flatMap(describeItem);
    if (lines.length) blocks.push([`*${category}*`, ...lines].join("\n"));
  }
  const messages: string[] = [];
  for (const block of blocks) {
    const last = messages.at(-1);
    if (last && last.length + block.length + 2 <= maxChars) messages[messages.length - 1] = `${last}\n\n${block}`;
    else messages.push(block);
  }
  return messages;
}
