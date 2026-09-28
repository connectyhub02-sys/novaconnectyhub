// Realistic test menu for "Pizzaria Macedo&Dias" (Joinville/SC): the environment where the
// WhatsApp food flow is exercised before and after each phase of the food plan.
import type { FoodCompositionPolicy, FoodOptionGroup } from "../../../src/lib/sales-catalog/food-composition";

export type SeedProduct = {
  key: string;
  title: string;
  category: string;
  description: string;
  /** Simple products only; products with composition take the price from the composition. */
  price: string;
  photo: string;
  gallery?: string[];
  highlight?: string;
  featured?: boolean;
  food?: FoodCompositionPolicy;
};

const money = (value: number) => value.toFixed(2);
const option = (id: string, name: string, price: number, maxQuantity = 1) => ({ id, name, active: true, price: money(price), maxQuantity });
const flavor = (id: string, name: string, prices: Record<string, number>, incompatibleWith: string[] = []) => ({
  id, name, active: true, incompatibleWith, prices: Object.fromEntries(Object.entries(prices).map(([size, value]) => [size, money(value)])),
});

// Whole-pizza price by size, derived from the "grande" price like a real price list.
const pizzaPrices = (grande: number) => ({
  broto: Math.round(grande * 0.55) - 0.1,
  media: Math.round(grande * 0.82) - 0.1,
  grande,
  gigante: Math.round(grande * 1.32) - 0.1,
});

const pizzaSizes = [
  { id: "broto", name: "Broto (4 fatias)", active: true, price: "0.00", maxFlavors: 1, portions: 1 },
  { id: "media", name: "Média (6 fatias)", active: true, price: "0.00", maxFlavors: 2, portions: 2 },
  { id: "grande", name: "Grande (8 fatias)", active: true, price: "0.00", maxFlavors: 3, portions: 6 },
  { id: "gigante", name: "Gigante (12 fatias)", active: true, price: "0.00", maxFlavors: 4, portions: 12 },
];

const savoryFlavors: Array<[string, string, number]> = [
  // Tradicionais
  ["mussarela", "Mussarela", 59.9],
  ["calabresa", "Calabresa", 62.9],
  ["margherita", "Margherita", 64.9],
  ["portuguesa", "Portuguesa", 66.9],
  ["frango-catupiry", "Frango com Catupiry", 66.9],
  ["napolitana", "Napolitana", 63.9],
  ["milho-bacon", "Milho com Bacon", 64.9],
  ["atum", "Atum", 68.9],
  ["baiana", "Baiana (apimentada)", 65.9],
  ["alho-oleo", "Alho e Óleo", 59.9],
  // Especiais
  ["quatro-queijos", "Quatro Queijos", 74.9],
  ["calabresa-cheddar", "Calabresa com Cheddar", 74.9],
  ["pepperoni", "Pepperoni", 79.9],
  ["palmito", "Palmito", 76.9],
  ["toscana", "Toscana", 76.9],
  ["strogonoff-frango", "Strogonoff de Frango", 78.9],
  ["brocolis-bacon", "Brócolis com Bacon", 77.9],
  ["lombo-canadense", "Lombo Canadense", 79.9],
  ["vegetariana", "Vegetariana", 74.9],
  // Premium
  ["file-gorgonzola", "Filé Mignon com Gorgonzola", 109.9],
  ["camarao", "Camarão", 129.9],
  ["costela", "Costela Desfiada com Catupiry", 104.9],
  ["parma-rucula", "Parma com Rúcula", 114.9],
  ["carne-seca", "Carne Seca com Catupiry", 99.9],
];

const sweetFlavors: Array<[string, string, number]> = [
  ["chocolate", "Chocolate", 64.9],
  ["chocolate-morango", "Chocolate com Morango", 72.9],
  ["prestigio", "Prestígio", 69.9],
  ["romeu-julieta", "Romeu e Julieta", 67.9],
  ["banana-canela", "Banana com Canela", 62.9],
  ["brigadeiro", "Brigadeiro", 68.9],
  ["doce-leite-coco", "Doce de Leite com Coco", 67.9],
  ["ovomaltine", "Ovomaltine", 74.9],
];

const crustGroup = (sweet = false): FoodOptionGroup => ({
  id: "borda", name: "Borda", min: 1, max: 1, scope: "unit",
  options: sweet
    ? [option("sem-borda", "Sem borda", 0), option("borda-chocolate", "Borda de chocolate", 14), option("borda-doce-leite", "Borda de doce de leite", 14)]
    : [option("sem-borda", "Sem borda", 0), option("borda-catupiry", "Borda de catupiry", 12), option("borda-cheddar", "Borda de cheddar", 12),
      option("borda-cream-cheese", "Borda de cream cheese", 14), option("borda-chocolate", "Borda de chocolate", 14)],
});

const doughGroup: FoodOptionGroup = {
  id: "massa", name: "Massa", min: 1, max: 1, scope: "unit",
  options: [option("massa-tradicional", "Tradicional", 0), option("massa-fina", "Fina e crocante", 0), option("massa-integral", "Integral", 6)],
};

const savoryExtras: FoodOptionGroup = {
  id: "adicionais", name: "Adicionais", min: 0, max: 8, scope: "portion",
  options: [
    option("bacon", "Bacon", 8, 2), option("calabresa-extra", "Calabresa extra", 7, 2), option("catupiry-extra", "Catupiry extra", 8, 2),
    option("cheddar", "Cheddar", 8, 2), option("mussarela-extra", "Mussarela extra", 7, 2), option("cebola", "Cebola", 3, 2),
    option("azeitona", "Azeitona", 4, 2), option("ovo", "Ovo", 4, 2), option("milho", "Milho", 3, 2), option("palmito-extra", "Palmito", 9, 2),
    option("champignon", "Champignon", 8, 2), option("tomate-seco", "Tomate seco", 8, 2), option("parmesao", "Parmesão", 6, 2),
    option("rucula", "Rúcula", 5, 2), option("pimenta-calabresa", "Pimenta calabresa", 0, 1),
  ],
};

const removableIngredients: FoodOptionGroup = {
  id: "retirar", name: "Retirar ingredientes", min: 0, max: 8, scope: "portion",
  options: [
    option("sem-cebola", "Sem cebola", 0), option("sem-azeitona", "Sem azeitona", 0), option("sem-tomate", "Sem tomate", 0),
    option("sem-oregano", "Sem orégano", 0), option("sem-milho", "Sem milho", 0), option("sem-ervilha", "Sem ervilha", 0),
    option("sem-pimentao", "Sem pimentão", 0), option("sem-ovo", "Sem ovo", 0),
  ],
};

const soda2l: FoodOptionGroup = {
  id: "refri-2l", name: "Refrigerante 2 litros", min: 1, max: 1, scope: "unit",
  options: [option("coca-2l", "Coca-Cola 2L", 0), option("coca-zero-2l", "Coca-Cola Sem Açúcar 2L", 0), option("guarana-2l", "Guaraná Antarctica 2L", 0), option("fanta-2l", "Fanta Laranja 2L", 0)],
};

const pizzaFood = (flavors: Array<[string, string, number]>, sizes = pizzaSizes, sweet = false): FoodCompositionPolicy => ({
  enabled: true,
  pricing: "weighted",
  localOnly: true,
  sizes,
  flavors: flavors.map(([id, name, grande]) => flavor(id, name, Object.fromEntries(Object.entries(pizzaPrices(grande)).filter(([size]) => sizes.some(row => row.id === size))))),
  groups: sweet ? [crustGroup(true)] : [crustGroup(), doughGroup, savoryExtras, removableIngredients],
});

const singleSize = (id: string, name: string, price = 0) => [{ id, name, active: true, price: money(price), maxFlavors: 1, portions: 1 }];

export const storeSettings = {
  businessType: "food",
  categories: ["Pizzas", "Pizzas Doces", "Combos", "Esfihas e Calzones", "Porções", "Bebidas", "Cervejas", "Sobremesas"],
  heroTitle: "Pizza quentinha",
  heroHighlight: "na sua porta",
  heroSubtitle: "Forno a lenha, massa de fermentação natural e entrega em Joinville.",
  footerText: "Pizzaria Macedo&Dias — pizzas artesanais em forno a lenha desde 2012.",
  footerContactText: "Rua XV de Novembro, 1200 — Centro, Joinville/SC",
  minimumOrderValue: "40.00",
};

export const menu: SeedProduct[] = [
  {
    key: "pizza", title: "Pizza Salgada", category: "Pizzas", featured: true, highlight: "Mais pedida",
    description: "Monte sua pizza: escolha o tamanho, até 4 sabores na gigante, borda, massa e adicionais. Cobramos a média proporcional dos sabores escolhidos.",
    price: "0", photo: "pizza-hero", food: pizzaFood(savoryFlavors),
    gallery: ["flavor-calabresa", "flavor-quatro-queijos", "flavor-portuguesa", "flavor-frango-catupiry", "flavor-margherita", "flavor-pepperoni", "flavor-file-gorgonzola"],
  },
  {
    key: "pizza-doce", title: "Pizza Doce", category: "Pizzas Doces", highlight: "Sobremesa",
    description: "Pizza doce com chocolate de verdade e frutas frescas. Até 3 sabores na grande, com borda doce opcional.",
    price: "0", photo: "pizza-doce",
    food: pizzaFood(sweetFlavors, pizzaSizes.filter(size => size.id !== "gigante"), true),
  },
  {
    key: "combo-familia", title: "Combo Família", category: "Combos", featured: true, highlight: "Economize R$ 20",
    description: "Pizza gigante com até 4 sabores tradicionais ou especiais + refrigerante 2 litros. Ideal para 4 a 5 pessoas.",
    price: "0", photo: "combo-familia",
    food: {
      enabled: true, pricing: "fixed", localOnly: true,
      sizes: [{ id: "gigante", name: "Gigante (12 fatias)", active: true, price: "129.90", maxFlavors: 4, portions: 12 }],
      flavors: savoryFlavors.slice(0, 19).map(([id, name]) => flavor(id, name, {})),
      groups: [crustGroup(), soda2l, removableIngredients],
    },
  },
  {
    key: "combo-casal", title: "Combo Casal", category: "Combos", highlight: "Para dois",
    description: "Pizza média com até 2 sabores tradicionais + 2 refrigerantes lata. Perfeito para a noite a dois.",
    price: "0", photo: "combo-casal",
    food: {
      enabled: true, pricing: "fixed", localOnly: true,
      sizes: [{ id: "media", name: "Média (6 fatias)", active: true, price: "79.90", maxFlavors: 2, portions: 2 }],
      flavors: savoryFlavors.slice(0, 10).map(([id, name]) => flavor(id, name, {})),
      groups: [crustGroup(), {
        id: "refri-lata", name: "Refrigerantes lata", min: 2, max: 2, scope: "unit",
        options: [option("coca-lata", "Coca-Cola lata", 0, 2), option("coca-zero-lata", "Coca-Cola Sem Açúcar lata", 0, 2), option("guarana-lata", "Guaraná Antarctica lata", 0, 2), option("fanta-lata", "Fanta Laranja lata", 0, 2), option("sprite-lata", "Sprite lata", 0, 2)],
      }, removableIngredients],
    },
  },
  {
    key: "esfiha", title: "Esfiha Aberta", category: "Esfihas e Calzones",
    description: "Esfiha aberta assada no forno a lenha, massa leve e recheio generoso. Escolha o sabor de cada unidade.",
    price: "0", photo: "esfiha",
    food: {
      enabled: true, pricing: "weighted", localOnly: true, sizes: singleSize("unidade", "Unidade"),
      flavors: [
        flavor("carne", "Carne", { unidade: 7.5 }), flavor("frango", "Frango", { unidade: 7.5 }), flavor("queijo", "Queijo", { unidade: 7.5 }),
        flavor("calabresa", "Calabresa", { unidade: 7.9 }), flavor("carne-queijo", "Carne com Queijo", { unidade: 8.9 }),
        flavor("frango-catupiry", "Frango com Catupiry", { unidade: 8.9 }), flavor("espinafre", "Espinafre com Ricota", { unidade: 7.9 }),
        flavor("chocolate", "Chocolate", { unidade: 9.9 }),
      ],
      groups: [],
    },
  },
  {
    key: "calzone", title: "Calzone", category: "Esfihas e Calzones",
    description: "Pizza fechada e recheada, dourada no forno a lenha. Serve bem uma pessoa com fome.",
    price: "0", photo: "calzone",
    food: {
      enabled: true, pricing: "weighted", localOnly: true, sizes: singleSize("unico", "Tamanho único"),
      flavors: [
        flavor("calabresa", "Calabresa com Mussarela", { unico: 44.9 }), flavor("frango-catupiry", "Frango com Catupiry", { unico: 46.9 }),
        flavor("quatro-queijos", "Quatro Queijos", { unico: 48.9 }), flavor("portuguesa", "Portuguesa", { unico: 46.9 }),
        flavor("carne-seca", "Carne Seca com Catupiry", { unico: 52.9 }),
      ],
      groups: [{ ...savoryExtras, scope: "unit", max: 4 }, { ...removableIngredients, scope: "unit" }],
    },
  },
  {
    key: "batata", title: "Batata Frita", category: "Porções",
    description: "Batata frita crocante, sequinha e bem temperada. Escolha o tamanho e turbine com cheddar e bacon.",
    price: "0", photo: "batata-frita",
    food: {
      enabled: true, pricing: "fixed", localOnly: true,
      sizes: [
        { id: "p", name: "Pequena (300g)", active: true, price: "22.00", maxFlavors: 1, portions: 1 },
        { id: "m", name: "Média (500g)", active: true, price: "32.00", maxFlavors: 1, portions: 1 },
        { id: "g", name: "Grande (800g)", active: true, price: "42.00", maxFlavors: 1, portions: 1 },
      ],
      flavors: [],
      groups: [
        { id: "cobertura", name: "Cobertura", min: 0, max: 2, scope: "unit", options: [option("cheddar", "Cheddar cremoso", 8), option("bacon", "Bacon crocante", 9), option("parmesao", "Parmesão ralado", 6)] },
        { id: "molhos", name: "Molhos", min: 0, max: 3, scope: "unit", options: [option("maionese-casa", "Maionese da casa", 0), option("barbecue", "Barbecue", 0), option("ketchup", "Ketchup", 0), option("mostarda-mel", "Mostarda e mel", 2)] },
      ],
    },
  },
  {
    key: "frango-passarinho", title: "Frango a Passarinho", category: "Porções",
    description: "Frango a passarinho frito na hora, com alho dourado e limão. Acompanha maionese da casa.",
    price: "0", photo: "frango-passarinho",
    food: {
      enabled: true, pricing: "fixed", localOnly: true,
      sizes: [
        { id: "meia", name: "Meia porção (500g)", active: true, price: "36.00", maxFlavors: 1, portions: 1 },
        { id: "inteira", name: "Porção inteira (1kg)", active: true, price: "62.00", maxFlavors: 1, portions: 1 },
      ],
      flavors: [], groups: [],
    },
  },
  { key: "calabresa-acebolada", title: "Calabresa Acebolada", category: "Porções", price: "45.00", photo: "calabresa-acebolada",
    description: "Calabresa fatiada e acebolada na chapa, servida com pão italiano. Porção para 3 pessoas." },
  { key: "polenta", title: "Polenta Frita", category: "Porções", price: "29.90", photo: "polenta-frita",
    description: "Polenta frita crocante por fora e macia por dentro, com parmesão ralado. Porção de 500g." },
  {
    key: "refrigerante", title: "Refrigerante", category: "Bebidas", highlight: "Gelado",
    description: "Refrigerante bem gelado em lata, garrafa 600ml ou 2 litros. Coca-Cola, Guaraná, Fanta e Sprite.",
    price: "0", photo: "refrigerantes",
    food: {
      enabled: true, pricing: "weighted", localOnly: true,
      sizes: [
        { id: "lata", name: "Lata 350ml", active: true, price: "0.00", maxFlavors: 1, portions: 1 },
        { id: "600", name: "Garrafa 600ml", active: true, price: "0.00", maxFlavors: 1, portions: 1 },
        { id: "2l", name: "Garrafa 2 litros", active: true, price: "0.00", maxFlavors: 1, portions: 1 },
      ],
      flavors: [
        flavor("coca", "Coca-Cola", { lata: 6.5, "600": 9, "2l": 15 }), flavor("coca-zero", "Coca-Cola Sem Açúcar", { lata: 6.5, "600": 9, "2l": 15 }),
        flavor("guarana", "Guaraná Antarctica", { lata: 6, "600": 8.5, "2l": 13 }), flavor("guarana-zero", "Guaraná Antarctica Zero", { lata: 6, "600": 8.5, "2l": 13 }),
        flavor("fanta-laranja", "Fanta Laranja", { lata: 6, "600": 8.5, "2l": 13 }), flavor("fanta-uva", "Fanta Uva", { lata: 6, "600": 8.5, "2l": 13 }),
        flavor("sprite", "Sprite", { lata: 6, "600": 8.5, "2l": 13 }), flavor("soda", "Soda Limonada Antarctica", { lata: 6, "600": 8, "2l": 12 }),
      ],
      groups: [],
    },
  },
  {
    key: "suco", title: "Suco Natural", category: "Bebidas",
    description: "Suco natural feito na hora com fruta de verdade, sem conservantes. Copo de 500ml ou jarra de 1 litro.",
    price: "0", photo: "suco-natural",
    food: {
      enabled: true, pricing: "weighted", localOnly: true,
      sizes: [
        { id: "500", name: "Copo 500ml", active: true, price: "0.00", maxFlavors: 1, portions: 1 },
        { id: "1l", name: "Jarra 1 litro", active: true, price: "0.00", maxFlavors: 1, portions: 1 },
      ],
      flavors: [
        flavor("laranja", "Laranja", { "500": 11, "1l": 19 }), flavor("limao", "Limão", { "500": 10, "1l": 17 }),
        flavor("maracuja", "Maracujá", { "500": 12, "1l": 20 }), flavor("abacaxi-hortela", "Abacaxi com Hortelã", { "500": 12, "1l": 20 }),
        flavor("morango", "Morango", { "500": 13, "1l": 22 }),
      ],
      groups: [{ id: "acucar", name: "Açúcar", min: 1, max: 1, scope: "unit", options: [option("com-acucar", "Com açúcar", 0), option("sem-acucar", "Sem açúcar", 0), option("adocante", "Com adoçante", 0)] }],
    },
  },
  { key: "agua", title: "Água Mineral sem Gás 500ml", category: "Bebidas", price: "4.00", photo: "agua-sem-gas", description: "Água mineral natural sem gás, garrafa de 500ml gelada." },
  { key: "agua-gas", title: "Água Mineral com Gás 500ml", category: "Bebidas", price: "5.00", photo: "agua-com-gas", description: "Água mineral com gás, garrafa de 500ml gelada." },
  { key: "h2oh", title: "H2OH! Limão 500ml", category: "Bebidas", price: "7.50", photo: "h2oh", description: "Bebida levemente gaseificada sabor limão, garrafa de 500ml." },
  { key: "cha", title: "Chá Gelado de Pêssego 450ml", category: "Bebidas", price: "7.00", photo: "cha-gelado", description: "Chá gelado sabor pêssego, garrafa de 450ml." },
  ...([
    ["heineken-ln", "Heineken Long Neck 330ml", "12.90", "cerveja-heineken-ln", "Cerveja puro malte lager, long neck de 330ml bem gelada."],
    ["heineken-zero", "Heineken 0.0 Long Neck 330ml", "12.90", "cerveja-heineken-zero", "Cerveja sem álcool, long neck de 330ml."],
    ["heineken-600", "Heineken 600ml", "17.90", "cerveja-heineken-600", "Cerveja puro malte lager, garrafa de 600ml para dividir."],
    ["stella-ln", "Stella Artois Long Neck 330ml", "11.90", "cerveja-stella", "Cerveja lager premium belga, long neck de 330ml."],
    ["corona-ln", "Corona Extra Long Neck 330ml", "13.90", "cerveja-corona", "Cerveja mexicana leve, long neck de 330ml. Vai bem com limão."],
    ["budweiser-ln", "Budweiser Long Neck 330ml", "10.90", "cerveja-budweiser", "Cerveja lager americana, long neck de 330ml."],
    ["eisenbahn-ln", "Eisenbahn Pilsen Long Neck 355ml", "11.90", "cerveja-eisenbahn", "Cerveja pilsen puro malte feita em Blumenau, long neck de 355ml."],
    ["original-600", "Original 600ml", "14.90", "cerveja-original", "Cerveja pilsen tradicional, garrafa de 600ml."],
    ["brahma-lata", "Brahma Duplo Malte Lata 350ml", "6.90", "cerveja-brahma", "Cerveja duplo malte, lata de 350ml."],
    ["skol-lata", "Skol Lata 350ml", "5.90", "cerveja-skol", "Cerveja pilsen leve, lata de 350ml."],
  ] as const).map(([key, title, price, photo, text]) => ({
    key, title, category: "Cervejas", price, photo,
    description: `${text} Venda proibida para menores de 18 anos.`,
  })),
  { key: "petit-gateau", title: "Petit Gâteau com Sorvete", category: "Sobremesas", price: "24.90", photo: "petit-gateau", highlight: "Favorita",
    description: "Bolinho de chocolate com recheio cremoso, servido com sorvete de creme." },
  { key: "brownie", title: "Brownie com Sorvete", category: "Sobremesas", price: "22.90", photo: "brownie", description: "Brownie de chocolate meio amargo com nozes e bola de sorvete de creme." },
  { key: "pudim", title: "Pudim de Leite", category: "Sobremesas", price: "14.90", photo: "pudim", description: "Pudim de leite condensado lisinho, com calda de caramelo. Fatia generosa." },
  { key: "mousse", title: "Mousse de Maracujá", category: "Sobremesas", price: "12.90", photo: "mousse-maracuja", description: "Mousse aerado de maracujá com calda da fruta. Pote de 200ml." },
  {
    key: "sorvete", title: "Sorvete Pote 1,5L", category: "Sobremesas",
    description: "Pote de sorvete cremoso de 1,5 litro para a família toda. Escolha o sabor.",
    price: "0", photo: "sorvete-pote",
    food: {
      enabled: true, pricing: "fixed", localOnly: true, sizes: singleSize("pote", "Pote 1,5 litro", 34.9),
      flavors: [flavor("creme", "Creme", {}), flavor("chocolate", "Chocolate", {}), flavor("morango", "Morango", {}), flavor("napolitano", "Napolitano", {}), flavor("flocos", "Flocos", {})],
      groups: [],
    },
  },
];

/** One prompt per photo: realistic food photography, no brand logos or text. */
export const photoPrompts: Record<string, string> = {
  "pizza-hero": "a whole artisanal wood-fired pizza half pepperoni half four cheese on a wooden board, rustic pizzeria table",
  "pizza-doce": "a sweet dessert pizza topped with melted chocolate and fresh strawberries on a wooden board",
  "combo-familia": "a very large family pizza with four different toppings next to a 2 liter bottle of cola soda without label, on a pizzeria table",
  "combo-casal": "a medium pizza half calabresa half margherita with two unbranded soda cans, cozy dinner for two",
  "esfiha": "several open-faced Brazilian esfihas (meat, cheese, chicken) freshly baked on a tray",
  "calzone": "a golden baked calzone cut open showing melted cheese filling, on a wooden board",
  "batata-frita": "a portion of crispy french fries topped with melted cheddar and bacon bits in a basket",
  "frango-passarinho": "Brazilian frango a passarinho fried chicken pieces with golden garlic and lime wedges on a plate",
  "calabresa-acebolada": "sliced Brazilian calabresa sausage sauteed with onions on a sizzling iron plate with bread",
  "polenta-frita": "crispy fried polenta sticks sprinkled with grated parmesan in a bowl",
  "refrigerantes": "assorted cold soda cans and bottles without any labels or logos, with ice and condensation",
  "suco-natural": "glasses of fresh natural juices orange, passion fruit and strawberry with fruits around",
  "agua-sem-gas": "a cold 500ml bottle of still mineral water without label, droplets, plain background",
  "agua-com-gas": "a cold 500ml bottle of sparkling mineral water without label with bubbles, plain background",
  "h2oh": "a 500ml bottle of lightly sparkling lemon flavored water without logo, lemon slices",
  "cha-gelado": "a bottle and glass of peach iced tea without label, peach slices and ice",
  "cerveja-heineken-ln": "a cold green long neck beer bottle without label with condensation, bar counter",
  "cerveja-heineken-zero": "a cold long neck non-alcoholic beer bottle without label, blue tones, condensation",
  "cerveja-heineken-600": "a cold 600ml green beer bottle without label next to a filled beer glass",
  "cerveja-stella": "a cold long neck beer bottle without label and a chalice glass of golden lager",
  "cerveja-corona": "a cold clear long neck beer bottle without label with a lime wedge in the neck",
  "cerveja-budweiser": "a cold long neck beer bottle without label, red tones, condensation",
  "cerveja-eisenbahn": "a cold brown long neck beer bottle without label with a pilsner glass",
  "cerveja-original": "a cold 600ml brown beer bottle without label and an American glass of pilsner beer, Brazilian bar",
  "cerveja-brahma": "a cold beer can without logo and a glass of golden beer with foam",
  "cerveja-skol": "a cold yellow beer can without logo with condensation on a table",
  "petit-gateau": "a chocolate petit gateau with flowing center and a scoop of vanilla ice cream on a plate",
  "brownie": "a chocolate brownie with walnuts topped with a scoop of vanilla ice cream",
  "pudim": "a slice of Brazilian pudim de leite flan with caramel sauce on a plate",
  "mousse-maracuja": "passion fruit mousse in a small glass cup topped with passion fruit pulp",
  "sorvete-pote": "a 1.5 liter tub of creamy ice cream with scoops of vanilla, chocolate and strawberry",
  "flavor-calabresa": "Brazilian calabresa pizza with sliced sausage, onions and black olives, top view",
  "flavor-quatro-queijos": "four cheese pizza with mozzarella, gorgonzola, parmesan and catupiry, top view",
  "flavor-portuguesa": "Brazilian portuguesa pizza with ham, eggs, onion, peas and olives, top view",
  "flavor-frango-catupiry": "Brazilian chicken and catupiry cream cheese pizza, top view",
  "flavor-margherita": "margherita pizza with fresh basil, tomato slices and mozzarella, top view",
  "flavor-pepperoni": "pepperoni pizza with crispy pepperoni slices, top view",
  "flavor-file-gorgonzola": "gourmet pizza with beef tenderloin strips and gorgonzola cheese, top view",
};
