import { quoteFoodComposition, type FoodCompositionPolicy, type FoodUnitSelection } from "./food-composition";
type Product = { id: string; title: string; foodComposition?: FoodCompositionPolicy };
export function extractFoodConversationProposal(text: string, catalog: Product[]) {
  const blocks = [...text.matchAll(/<food_order>([\s\S]*?)<\/food_order>/g)];
  const cleanText = text.replace(/<food_order>[\s\S]*?(?:<\/food_order>|$)/g, "").trim();
  if (!blocks.length) return { text: cleanText, items: null, error: null };
  try {
    if (blocks.length !== 1 || blocks[0][1].length > 64 * 1024) throw new Error("Confira a montagem de cada produto.");
    const payload = JSON.parse(blocks[0][1]);
    if (!Array.isArray(payload.items) || !payload.items.length || payload.items.length > 10 || new Set(payload.items.map((item: { productId: string }) => item.productId)).size !== payload.items.length) throw new Error("Confira os produtos da montagem.");
    const items = payload.items.map((entry: { productId: string; units: FoodUnitSelection[] }) => {
      const product = catalog.find(item => item.id === entry.productId && item.foodComposition?.enabled);
      if (!product || !Array.isArray(entry.units) || entry.units.length > 20) throw new Error("Confira o produto e a quantidade de unidades.");
      const snapshot = quoteFoodComposition(product.foodComposition, entry.units, entry.units.length)!;
      return { productId: product.id, units: snapshot.units.map(unit => unit.selection), snapshot };
    }) as Array<{ productId: string; units: FoodUnitSelection[]; snapshot: NonNullable<ReturnType<typeof quoteFoodComposition>> }>;
    return { text: cleanText, items, error: null };
  } catch (error) { return { text: cleanText, items: null, error: error instanceof Error ? error.message : "Confira as escolhas da montagem." }; }
}
export function foodConversationInstructions(products: Product[]) {
  const items = products.filter(item => item.foodComposition?.enabled);
  if (!items.length) return [];
  let remaining = 40000;
  return [
    "MONTAGEM DE ALIMENTAÇÃO: preserve cada unidade separada, inclusive quando o produto se repete. Observações gratuitas não viram adicionais cobrados. 'Sem bacon' remove apenas o bacon indicado, nunca cancela o carrinho. Perguntar sobre combo não autoriza incluí-lo.",
    "Para uma montagem completa explicitamente pedida pelo cliente, acrescente internamente <food_order>{\"items\":[{\"productId\":\"id cadastrado\",\"units\":[{\"sizeId\":\"id\",\"flavors\":[{\"flavorId\":\"id\",\"portions\":2}],\"options\":[{\"groupId\":\"id\",\"optionId\":\"id\",\"quantity\":1,\"flavorId\":null}],\"note\":\"observação desta unidade\"}]}]}</food_order>. Use somente IDs e escolhas cadastrados, uma entrada por produto e uma montagem por unidade. Em alterações, informe todas as unidades do produto preservando as escolhas anteriores. Não envie este bloco em simples dúvidas, recomendações, confirmação sem mudança, dados de endereço ou forma de pagamento. O sistema calcula e pede confirmação; nunca prometa que já cobrou ou alterou um pedido.",
    "Frações devem completar as frações do tamanho; meia a meia = metade das frações para cada sabor, três sabores = um terço para cada. Use somente os tamanhos, sabores, bordas e adicionais listados abaixo, com os nomes exatos: nunca invente tamanho (como 'família'), sabor, bebida, borda, preço, substituição ou critério comercial. Se faltar escolha obrigatória ou a referência de unidade for ambígua, faça uma pergunta curta.",
    "Quando o cliente pedir os sabores, o cardápio ou mais opções de um produto de montagem, liste todos os sabores disponíveis desse produto com os preços do tamanho em conversa (ou do tamanho mais pedido), organizados e curtos. Nunca diga que outra pessoa vai enviar o cardápio: você mesmo envia.",
    ...items.map(item => { const policy = describeFoodCompositionForAgent(item.foodComposition!); if (policy.length > Math.min(18000, remaining)) return `Montagem de ${item.title}: opções extensas; pergunte o tamanho e apresente os sabores aos poucos.`; remaining -= policy.length; return `Montagem cadastrada de ${item.title}; productId=${item.id}\n${policy}`; }),
  ];
}

const money = (value: string) => { const cents = Number(value); return Number.isFinite(cents) ? cents.toFixed(2).replace(".", ",") : value; };

/** Compact, readable form of an assembly for the agent: ids for the order block, names and prices for the customer. */
export function describeFoodCompositionForAgent(policy: FoodCompositionPolicy) {
  const sizes = policy.sizes.filter(size => size.active);
  const pricing = policy.pricing === "weighted" ? "média proporcional às frações dos sabores" : policy.pricing === "highest" ? "preço do sabor mais caro" : "preço fixo do tamanho";
  const lines = [
    `Regra de preço: ${pricing}.`,
    `Tamanhos (id=nome: frações, máximo de sabores${policy.pricing === "fixed" ? ", preço" : ""}): ${sizes.map(size => `${size.id}=${size.name}: ${size.portions} fração(ões), até ${size.maxFlavors} sabor(es)${policy.pricing === "fixed" ? `, R$ ${money(size.price)}` : ""}`).join("; ")}.`,
  ];
  const flavors = policy.flavors.filter(flavor => flavor.active);
  if (flavors.length) {
    lines.push(policy.pricing === "fixed"
      ? `Sabores (id=nome): ${flavors.map(flavor => `${flavor.id}=${flavor.name}`).join("; ")}.`
      : `Sabores (id=nome: preço da unidade inteira por tamanho ${sizes.map(size => size.id).join("/")}): ${flavors.map(flavor => `${flavor.id}=${flavor.name}: ${sizes.map(size => money(flavor.prices[size.id] ?? "")).join("/")}`).join("; ")}.`);
    const incompatible = flavors.filter(flavor => flavor.incompatibleWith.length);
    if (incompatible.length) lines.push(`Não combinar: ${incompatible.map(flavor => `${flavor.id} com ${flavor.incompatibleWith.join(", ")}`).join("; ")}.`);
  }
  for (const group of policy.groups) {
    const options = group.options.filter(option => option.active);
    if (!options.length) continue;
    const rule = group.min > 0 ? `obrigatório escolher ${group.min === group.max ? group.min : `de ${group.min} a ${group.max}`}` : `opcional, até ${group.max}`;
    const where = group.scope === "portion" ? "pode ir só na fração de um sabor, preço proporcional" : "na unidade inteira";
    lines.push(`Grupo ${group.id}=${group.name} (${rule}; ${where}): ${options.map(option => `${option.id}=${option.name} R$ ${money(option.price)}${option.maxQuantity > 1 ? ` (até ${option.maxQuantity}x)` : ""}`).join("; ")}.`);
  }
  return lines.join("\n");
}
