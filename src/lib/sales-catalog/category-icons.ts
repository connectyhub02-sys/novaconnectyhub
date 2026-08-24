export const salesCatalogCategoryIconOptions = [
  { id: "shopping-bag", label: "Sacola" },
  { id: "shopping-cart", label: "Carrinho" },
  { id: "store", label: "Loja" },
  { id: "package", label: "Caixa" },
  { id: "box", label: "Produto" },
  { id: "boxes", label: "Estoque" },
  { id: "package-check", label: "Entrega pronta" },
  { id: "layers", label: "Colecao" },
  { id: "pill", label: "Capsula" },
  { id: "syringe", label: "Seringa" },
  { id: "stethoscope", label: "Consulta" },
  { id: "hospital", label: "Clinica" },
  { id: "dumbbell", label: "Fitness" },
  { id: "shirt", label: "Moda" },
  { id: "watch", label: "Relogio" },
  { id: "glasses", label: "Oculos" },
  { id: "baby", label: "Infantil" },
  { id: "home", label: "Casa" },
  { id: "sofa", label: "Moveis" },
  { id: "bed", label: "Quarto" },
  { id: "bath", label: "Banho" },
  { id: "lamp", label: "Decoracao" },
  { id: "gift", label: "Presente" },
  { id: "sparkles", label: "Beleza" },
  { id: "flower", label: "Flores" },
  { id: "leaf", label: "Natural" },
  { id: "gem", label: "Joias" },
  { id: "scissors", label: "Salao" },
  { id: "spray-can", label: "Cosmeticos" },
  { id: "tag", label: "Oferta" },
  { id: "ticket-percent", label: "Cupom" },
  { id: "percent", label: "Desconto" },
  { id: "badge-percent", label: "Promocao" },
  { id: "heart-pulse", label: "Saude" },
  { id: "monitor", label: "Eletronicos" },
  { id: "smartphone", label: "Celular" },
  { id: "laptop", label: "Notebook" },
  { id: "headphones", label: "Audio" },
  { id: "camera", label: "Camera" },
  { id: "music", label: "Musica" },
  { id: "gamepad", label: "Games" },
  { id: "basket", label: "Cesta" },
  { id: "utensils", label: "Alimentos" },
  { id: "apple", label: "Frutas" },
  { id: "coffee", label: "Cafe" },
  { id: "cake", label: "Doces" },
  { id: "pizza", label: "Pizza" },
  { id: "beef", label: "Carnes" },
  { id: "cup-soda", label: "Bebidas" },
  { id: "wine", label: "Vinhos" },
  { id: "salad", label: "Saladas" },
  { id: "wrench", label: "Servicos" },
  { id: "hammer", label: "Reparos" },
  { id: "paintbrush", label: "Criativo" },
  { id: "briefcase", label: "Consultoria" },
  { id: "calendar", label: "Agenda" },
  { id: "book-open", label: "Cursos" },
  { id: "graduation-cap", label: "Mentoria" },
  { id: "car", label: "Carro" },
  { id: "bike", label: "Bike" },
  { id: "plane", label: "Viagem" },
  { id: "truck", label: "Frete" },
  { id: "wallet-cards", label: "Carteira" },
  { id: "credit-card", label: "Cartao" },
  { id: "qr-code", label: "Pix" },
  { id: "landmark", label: "Financeiro" },
  { id: "map-pin", label: "Local" },
  { id: "circle-dollar", label: "Preco" },
  { id: "badge-dollar", label: "Venda" },
  { id: "receipt", label: "Pedido" },
  { id: "palette", label: "Arte" },
  { id: "badge-check", label: "Destaque" },
] as const;

export type SalesCatalogCategoryIconId = (typeof salesCatalogCategoryIconOptions)[number]["id"];

export const defaultSalesCatalogCategoryIconId: SalesCatalogCategoryIconId = "shopping-bag";

const categoryIconIds = new Set<string>(salesCatalogCategoryIconOptions.map((option) => option.id));

export function normalizeSalesCatalogCategoryIconId(value: unknown): SalesCatalogCategoryIconId | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  return categoryIconIds.has(normalized) ? normalized as SalesCatalogCategoryIconId : null;
}

export function resolveSalesCatalogCategoryIconId(
  category: string,
  explicitIconId?: unknown,
): SalesCatalogCategoryIconId {
  const explicit = normalizeSalesCatalogCategoryIconId(explicitIconId);
  if (explicit) return explicit;

  const normalized = normalizeCategoryText(category);
  if (/(injet|ampola|agulha|seringa|injec)/.test(normalized)) return "syringe";
  if (/(clinica|hospital|medic|consulta|terapia)/.test(normalized)) return "stethoscope";
  if (/(oral|capsula|capsulas|pilula|pilulas|comprimido|comprimidos|remedio)/.test(normalized)) return "pill";
  if (/(fitness|treino|academia|suplement|muscul|performance|esport)/.test(normalized)) return "dumbbell";
  if (/(moda|roupa|camisa|camiseta|vestido|calcado|tenis)/.test(normalized)) return "shirt";
  if (/(oculos|lente)/.test(normalized)) return "glasses";
  if (/(relogio|joia|joias|anel|colar)/.test(normalized)) return "gem";
  if (/(infantil|crianca|bebe|kids)/.test(normalized)) return "baby";
  if (/(casa|lar|home)/.test(normalized)) return "home";
  if (/(decor|decoracao)/.test(normalized)) return "lamp";
  if (/(moveis|sofa)/.test(normalized)) return "sofa";
  if (/(beleza|cosmet|perfume|skincare|estetica)/.test(normalized)) return "sparkles";
  if (/(saude|clinica|wellness|cuidado)/.test(normalized)) return "heart-pulse";
  if (/(celular|smartphone)/.test(normalized)) return "smartphone";
  if (/(notebook|laptop|computador)/.test(normalized)) return "laptop";
  if (/(fone|audio|som)/.test(normalized)) return "headphones";
  if (/(eletron|tech|gadget)/.test(normalized)) return "monitor";
  if (/(bebida|refrigerante|suco)/.test(normalized)) return "cup-soda";
  if (/(cafe|cafeteria)/.test(normalized)) return "coffee";
  if (/(doce|bolo|sobremesa)/.test(normalized)) return "cake";
  if (/(pizza)/.test(normalized)) return "pizza";
  if (/(carne|churrasco)/.test(normalized)) return "beef";
  if (/(comida|alimento|prato|restaurante|lanche)/.test(normalized)) return "utensils";
  if (/(curso|aula|ebook|livro)/.test(normalized)) return "book-open";
  if (/(mentoria|treinamento)/.test(normalized)) return "graduation-cap";
  if (/(servico|instalacao|suporte|manutencao)/.test(normalized)) return "wrench";
  if (/(carro|auto|automotivo)/.test(normalized)) return "car";
  if (/(viagem|turismo)/.test(normalized)) return "plane";
  if (/(kit|combo|cesta)/.test(normalized)) return "basket";
  if (/(cupom)/.test(normalized)) return "ticket-percent";
  if (/(desconto)/.test(normalized)) return "percent";
  if (/(promocao|promo|sale)/.test(normalized)) return "badge-percent";
  if (/(oferta)/.test(normalized)) return "tag";
  if (/(presente|gift|brinde)/.test(normalized)) return "gift";

  return defaultSalesCatalogCategoryIconId;
}

export function normalizeSalesCatalogCategoryIconMap(
  value: unknown,
  categories: string[] = [],
): Record<string, SalesCatalogCategoryIconId> {
  const record = readRecord(value);
  if (!record) return {};

  const output: Record<string, SalesCatalogCategoryIconId> = {};
  const canonicalCategories = new Map(categories.map((category) => [normalizeCategoryKey(category), category]));

  for (const [category, iconId] of Object.entries(record)) {
    const cleanCategory = cleanCategoryLabel(category);
    if (!cleanCategory) continue;

    const canonicalCategory = canonicalCategories.size > 0
      ? canonicalCategories.get(normalizeCategoryKey(cleanCategory))
      : cleanCategory;
    if (!canonicalCategory) continue;

    const normalizedIcon = normalizeSalesCatalogCategoryIconId(iconId);
    if (!normalizedIcon) continue;

    output[canonicalCategory] = normalizedIcon;
  }

  return output;
}

function cleanCategoryLabel(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

function normalizeCategoryKey(value: string) {
  return normalizeCategoryText(value);
}

function normalizeCategoryText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
