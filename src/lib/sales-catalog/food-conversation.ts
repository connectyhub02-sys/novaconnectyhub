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
    "Frações devem completar portions do tamanho; metade = portions/2 quando inteiro. Não invente tamanho, bebida, borda, preço, substituição ou critério comercial. Se faltar escolha obrigatória ou a referência de unidade for ambígua, faça uma pergunta curta. O botão da página permite conferir todas as opções.",
    ...items.map(item => { const policy = JSON.stringify(item.foodComposition); if (policy.length > Math.min(18000, remaining)) return `Montagem de ${item.title}: opções extensas; ofereça o botão da página para montar sem omitir escolhas.`; remaining -= policy.length; return `Montagem cadastrada de ${item.title}; productId=${item.id}: ${policy}`; }),
  ];
}
