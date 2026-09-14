import { deliveryMoneyCents } from "./local-delivery";

export type FoodSize = { id: string; name: string; active: boolean; price: string; maxFlavors: number; portions: number };
export type FoodFlavor = { id: string; name: string; active: boolean; prices: Record<string, string>; incompatibleWith: string[] };
export type FoodOption = { id: string; name: string; active: boolean; price: string; maxQuantity: number };
export type FoodOptionGroup = { id: string; name: string; min: number; max: number; scope: "unit" | "portion"; options: FoodOption[] };
export type FoodCompositionPolicy = { enabled: boolean; pricing: "fixed" | "highest" | "weighted"; localOnly: boolean; sizes: FoodSize[]; flavors: FoodFlavor[]; groups: FoodOptionGroup[] };
export type FoodUnitSelection = { sizeId: string; flavors: Array<{ flavorId: string; portions: number }>; options: Array<{ groupId: string; optionId: string; quantity: number; flavorId?: string | null }>; note: string };
export type FoodUnitSnapshot = { selection: FoodUnitSelection; size: string; flavors: Array<{ id: string; name: string; portions: number; wholePriceCents: number }>; options: Array<{ groupId: string; optionId: string; name: string; quantity: number; flavorId: string | null; totalCents: number }>; portions: number; baseCents: number; totalCents: number; note: string };
export type FoodCompositionSnapshot = { version: 1; pricing: FoodCompositionPolicy["pricing"]; units: FoodUnitSnapshot[]; totalCents: number; summary: string };
export class FoodCompositionError extends Error { constructor(message: string) { super(message); this.name = "FoodCompositionError"; } }
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown) => Array.isArray(value) ? value : [];
const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => typeof value === "number" ? value : NaN;
export function defaultFoodComposition(): FoodCompositionPolicy { return { enabled: false, pricing: "" as FoodCompositionPolicy["pricing"], localOnly: true, sizes: [], flavors: [], groups: [] }; }
export function readFoodComposition(value: unknown): FoodCompositionPolicy {
  const data = record(value);
  return { enabled: data.enabled === true, pricing: text(data.pricing) as FoodCompositionPolicy["pricing"], localOnly: data.localOnly !== false,
    sizes: list(data.sizes).map(value => { const row = record(value); return { id: text(row.id), name: text(row.name), active: row.active === true, price: text(row.price), maxFlavors: number(row.maxFlavors), portions: number(row.portions) }; }),
    flavors: list(data.flavors).map(value => { const row = record(value); return { id: text(row.id), name: text(row.name), active: row.active === true, prices: record(row.prices) as Record<string, string>, incompatibleWith: list(row.incompatibleWith).map(text) }; }),
    groups: list(data.groups).map(value => { const row = record(value); return { id: text(row.id), name: text(row.name), min: number(row.min), max: number(row.max), scope: text(row.scope) as FoodOptionGroup["scope"], options: list(row.options).map(value => { const option = record(value); return { id: text(option.id), name: text(option.name), active: option.active === true, price: text(option.price), maxQuantity: number(option.maxQuantity) }; }) }; }),
  };
}
const integer = (value: number, min: number, max: number) => Number.isSafeInteger(value) && value >= min && value <= max;
const keysValid = (rows: Array<{ id: string; name: string }>) => rows.every(row => /^[a-zA-Z0-9_-]{1,80}$/.test(row.id) && row.name.trim().length > 0 && row.name.length <= 120) && new Set(rows.map(row => row.id)).size === rows.length;
export function validateFoodComposition(policy: FoodCompositionPolicy): string | null {
  if (!policy.enabled) return null;
  if (!["fixed", "highest", "weighted"].includes(policy.pricing)) return "Escolha a regra de preço da montagem.";
  if (!policy.sizes.length || policy.sizes.length > 20 || !keysValid(policy.sizes) || !policy.sizes.some(size => size.active)) return "Cadastre tamanhos válidos, com ao menos um disponível.";
  if (policy.sizes.some(size => !integer(size.portions, 1, 12) || !integer(size.maxFlavors, 1, size.portions) || policy.pricing === "fixed" && deliveryMoneyCents(size.price) === null)) return "Confira preço, frações e limite de sabores de cada tamanho.";
  if (policy.flavors.length > 200 || !keysValid(policy.flavors)) return "Confira os nomes e identificadores dos sabores.";
  if (policy.pricing !== "fixed" && !policy.flavors.some(flavor => flavor.active)) return "Cadastre sabores com preço para calcular a combinação.";
  if (policy.flavors.some(flavor => flavor.incompatibleWith.some(id => !policy.flavors.some(other => other.id === id) || id === flavor.id) || policy.sizes.some(size => size.active && flavor.active && policy.pricing !== "fixed" && deliveryMoneyCents(flavor.prices[size.id]) === null))) return "Informe o preço inteiro de cada sabor por tamanho e confira incompatibilidades.";
  if (policy.groups.length > 30 || !keysValid(policy.groups) || policy.groups.some(group => !["unit", "portion"].includes(group.scope) || !integer(group.min, 0, 30) || !integer(group.max, group.min, 30) || group.scope === "portion" && !policy.flavors.length || group.options.length > 100 || !keysValid(group.options) || group.options.some(option => deliveryMoneyCents(option.price) === null || !integer(option.maxQuantity, 1, 30)))) return "Confira os grupos de bordas, adicionais ou combos: limites, opções, preço e quantidade máxima.";
  return null;
}
/** Server recomputes every cent from the current catalog. Client totals and snapshots are never accepted as prices. */
export function quoteFoodComposition(value: unknown, selections: unknown, quantity: number): FoodCompositionSnapshot | null {
  const policy = readFoodComposition(value);
  if (!policy.enabled) return null;
  const invalid = validateFoodComposition(policy);
  if (invalid) throw new FoodCompositionError("A loja precisa conferir a configuração da montagem antes de fechar o pedido.");
  if (!integer(quantity, 1, 100) || !Array.isArray(selections) || selections.length !== quantity) throw new FoodCompositionError("Informe a montagem de cada unidade antes de conferir o total.");
  const units = selections.map((value, index): FoodUnitSnapshot => {
    const input = record(value), size = policy.sizes.find(size => size.id === input.sizeId && size.active);
    if (!size) throw new FoodCompositionError(`Escolha um tamanho disponível para a unidade ${index + 1}.`);
    const flavors = list(input.flavors).map(value => { const choice = record(value), flavor = policy.flavors.find(flavor => flavor.id === choice.flavorId && flavor.active), portions = number(choice.portions);
      if (!flavor || !integer(portions, 1, size.portions)) throw new FoodCompositionError(`Confira os sabores e frações da unidade ${index + 1}.`);
      return { id: flavor.id, name: flavor.name, portions, wholePriceCents: policy.pricing === "fixed" ? 0 : deliveryMoneyCents(flavor.prices[size.id])! };
    });
    if (flavors.length > size.maxFlavors || new Set(flavors.map(flavor => flavor.id)).size !== flavors.length || (policy.flavors.length > 0 || policy.pricing !== "fixed") && flavors.reduce((sum, flavor) => sum + flavor.portions, 0) !== size.portions || !policy.flavors.length && flavors.length) throw new FoodCompositionError(`Complete as frações da unidade ${index + 1}, respeitando o limite de ${size.maxFlavors} sabor(es).`);
    if (flavors.some(flavor => policy.flavors.find(row => row.id === flavor.id)!.incompatibleWith.some(id => flavors.some(other => other.id === id)))) throw new FoodCompositionError(`Os sabores escolhidos para a unidade ${index + 1} não podem ser combinados.`);
    const baseCents = policy.pricing === "fixed" ? deliveryMoneyCents(size.price)! : policy.pricing === "highest" ? Math.max(...flavors.map(flavor => flavor.wholePriceCents)) : Math.round(flavors.reduce((sum, flavor) => sum + flavor.wholePriceCents * flavor.portions, 0) / size.portions);
    const seen = new Set<string>();
    const options = list(input.options).map(value => {
      const choice = record(value), group = policy.groups.find(group => group.id === choice.groupId), option = group?.options.find(option => option.id === choice.optionId && option.active), count = number(choice.quantity), flavorId = text(choice.flavorId) || null;
      if (!group || !option || !integer(count, 1, option.maxQuantity)) throw new FoodCompositionError(`Confira as opções e quantidades da unidade ${index + 1}.`);
      const key = `${group.id}:${option.id}:${flavorId ?? ""}`;
      if (seen.has(key)) throw new FoodCompositionError("Agrupe a quantidade de cada adicional antes de confirmar."); seen.add(key);
      const flavor = flavors.find(flavor => flavor.id === flavorId);
      if (group.scope === "unit" && flavorId || group.scope === "portion" && !flavor) throw new FoodCompositionError(`Informe onde aplicar ${option.name}: ${group.scope === "unit" ? "na unidade inteira" : "na fração de sabor"}.`);
      const totalCents = Math.round(deliveryMoneyCents(option.price)! * count * (group.scope === "portion" ? flavor!.portions : size.portions) / size.portions);
      return { groupId: group.id, optionId: option.id, name: option.name, quantity: count, flavorId, totalCents };
    });
    for (const group of policy.groups) {
      const targets = group.scope === "portion" ? flavors.map(flavor => flavor.id) : [null];
      for (const target of targets) { const count = options.filter(option => option.groupId === group.id && option.flavorId === target).reduce((sum, option) => sum + option.quantity, 0);
        if (count < group.min || count > group.max) throw new FoodCompositionError(`Escolha entre ${group.min} e ${group.max} opção(ões) de ${group.name}${target ? " para cada fração" : " por unidade"}.`);
      }
    }
    const note = text(input.note).trim();
    if (note.length > 500) throw new FoodCompositionError("Resuma a observação de cada unidade em até 500 caracteres.");
    const totalCents = baseCents + options.reduce((sum, option) => sum + option.totalCents, 0);
    if (!Number.isSafeInteger(totalCents) || totalCents < 1) throw new FoodCompositionError("Confira o preço da montagem com a loja.");
    return { size: size.name, portions: size.portions, flavors, options, baseCents, totalCents, note,
      selection: { sizeId: size.id, flavors: flavors.map(flavor => ({ flavorId: flavor.id, portions: flavor.portions })), options: options.map(option => ({ groupId: option.groupId, optionId: option.optionId, quantity: option.quantity, flavorId: option.flavorId })), note } };
  });
  const totalCents = units.reduce((sum, unit) => sum + unit.totalCents, 0);
  if (!Number.isSafeInteger(totalCents)) throw new FoodCompositionError("Confira o total da montagem com a loja.");
  const summary = units.map(foodUnitSummary).join("\n");
  return { version: 1, pricing: policy.pricing, units, totalCents, summary };
}

export function foodUnitSummary(unit: FoodUnitSnapshot, index = 0) {
  return `${index + 1}. ${unit.size}${unit.flavors.length ? `: ${unit.flavors.map(flavor => `${flavor.portions}/${unit.portions} ${flavor.name}`).join(" + ")}` : ""}${unit.options.length ? `; ${unit.options.map(option => `${option.quantity}x ${option.name}${option.flavorId ? ` em ${unit.flavors.find(flavor => flavor.id === option.flavorId)!.name}` : ""}`).join(", ")}` : ""}${unit.note ? `; observação: ${unit.note}` : ""} — R$ ${(unit.totalCents / 100).toFixed(2).replace(".", ",")}`;
}
export function foodSnapshotForUnit(snapshot: FoodCompositionSnapshot, index: number): FoodCompositionSnapshot {
  const unit = snapshot.units[index];
  return { ...snapshot, units: [unit], totalCents: unit.totalCents, summary: foodUnitSummary(unit, index) };
}
function stableFoodValue(value: unknown): string { return Array.isArray(value) ? `[${value.map(stableFoodValue).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableFoodValue(item)}`).join(",")}}` : JSON.stringify(value); }
/** JSONB reorders object keys. Compare fulfillment facts and prices, not key order or display numbering. */
export function foodSnapshotsEqual(left: FoodCompositionSnapshot, right: unknown) {
  const saved = record(right);
  return stableFoodValue({ pricing: left.pricing, units: left.units, totalCents: left.totalCents }) === stableFoodValue({ pricing: saved.pricing, units: saved.units, totalCents: saved.totalCents });
}

export function readFoodUnitSelections(value: unknown): FoodUnitSelection[] {
  return list(value).slice(0, 100).map(value => { const unit = record(value); return { sizeId: text(unit.sizeId), note: text(unit.note), flavors: list(unit.flavors).map(value => { const flavor = record(value); return { flavorId: text(flavor.flavorId), portions: number(flavor.portions) }; }), options: list(unit.options).map(value => { const option = record(value); return { groupId: text(option.groupId), optionId: text(option.optionId), quantity: number(option.quantity), flavorId: text(option.flavorId) || null }; }) }; });
}
export function foodLineQuote(product: { foodComposition?: FoodCompositionPolicy; priceCents: number | null }, quantity: number, foodUnits?: FoodUnitSelection[]) {
  if (!product.foodComposition?.enabled) return { totalCents: (product.priceCents ?? 0) * quantity, error: null, snapshot: null };
  try { const snapshot = quoteFoodComposition(product.foodComposition, foodUnits, quantity)!; return { totalCents: snapshot.totalCents, error: null, snapshot }; }
  catch (error) { return { totalCents: null, error: error instanceof Error ? error.message : "Confira a montagem.", snapshot: null }; }
}
