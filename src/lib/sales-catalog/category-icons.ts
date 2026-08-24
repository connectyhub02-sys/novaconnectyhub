export const salesCatalogCategoryIconOptions = [
  { id: "shopping-bag", label: "Sacola" },
  { id: "package", label: "Caixa" },
  { id: "pill", label: "Capsula" },
  { id: "syringe", label: "Seringa" },
  { id: "dumbbell", label: "Fitness" },
  { id: "shirt", label: "Moda" },
  { id: "home", label: "Casa" },
  { id: "gift", label: "Presente" },
  { id: "sparkles", label: "Beleza" },
  { id: "tag", label: "Oferta" },
  { id: "heart-pulse", label: "Saude" },
  { id: "monitor", label: "Eletronicos" },
  { id: "basket", label: "Cesta" },
  { id: "utensils", label: "Alimentos" },
  { id: "wrench", label: "Servicos" },
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
  if (/(oral|capsula|capsulas|pilula|pilulas|comprimido|comprimidos|remedio)/.test(normalized)) return "pill";
  if (/(fitness|treino|academia|suplement|muscul|performance|esport)/.test(normalized)) return "dumbbell";
  if (/(moda|roupa|camisa|camiseta|vestido|calcado|tenis)/.test(normalized)) return "shirt";
  if (/(casa|decor|lar|moveis|home)/.test(normalized)) return "home";
  if (/(beleza|cosmet|perfume|skincare|estetica)/.test(normalized)) return "sparkles";
  if (/(saude|clinica|wellness|cuidado)/.test(normalized)) return "heart-pulse";
  if (/(eletron|tech|celular|computador|notebook|gadget)/.test(normalized)) return "monitor";
  if (/(comida|alimento|bebida|prato|restaurante|lanche)/.test(normalized)) return "utensils";
  if (/(servico|consulta|instalacao|suporte|manutencao)/.test(normalized)) return "wrench";
  if (/(kit|combo|cesta)/.test(normalized)) return "basket";
  if (/(oferta|promocao|desconto|sale)/.test(normalized)) return "tag";
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
