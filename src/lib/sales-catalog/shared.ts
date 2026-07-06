export type SalesCatalogItemStatus = "active" | "draft" | "archived";
export type SalesCatalogMediaKind = "image" | "video" | "document";
export type SalesCatalogSource = "manual" | "whatsapp_catalog";

export type SalesCatalogMedia = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  storageUrl: string;
  kind: SalesCatalogMediaKind;
  createdAt: string | null;
};

export type ClientSalesCatalogItem = {
  id: string;
  companyId: string;
  title: string;
  description: string;
  category: string | null;
  price: string | null;
  currency: string;
  status: SalesCatalogItemStatus;
  tag: string;
  media: SalesCatalogMedia[];
  source: SalesCatalogSource;
  whatsappCatalogId: string | null;
  readiness: "ready" | "needs_media" | "needs_description";
  createdAt: string | null;
  updatedAt: string | null;
};

export type SalesCatalogContentInput = {
  title: string;
  description: string;
  category?: string | null;
  price?: string | null;
  currency?: string | null;
  media?: SalesCatalogMedia[];
};

export function createSalesCatalogSlug(label: string) {
  const slug = label
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 44);

  return slug || "produto";
}

export function createSalesCatalogTag(label: string, id: string) {
  return `{{produto_${createSalesCatalogSlug(label)}_${id.slice(0, 6)}}}`;
}

export function resolveSalesCatalogMediaKind(contentType: string, fileName = ""): SalesCatalogMediaKind {
  const lowerType = contentType.toLowerCase();
  const lowerName = fileName.toLowerCase();

  if (lowerType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(lowerName)) {
    return "image";
  }

  if (lowerType.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(lowerName)) {
    return "video";
  }

  return "document";
}

export function buildSalesCatalogContent(input: SalesCatalogContentInput) {
  const lines = [
    `Produto/oferta: ${input.title}`,
    input.category ? `Categoria: ${input.category}` : "",
    input.price ? `Preco: ${input.price}${input.currency ? ` ${input.currency}` : ""}` : "",
    input.description ? `Descricao: ${input.description}` : "",
  ];
  const media = input.media ?? [];

  if (media.length > 0) {
    lines.push("Arquivos disponiveis:");
    for (const item of media) {
      lines.push(`- ${item.kind}: ${item.fileName} (${item.storageUrl})`);
    }
  }

  return lines.filter(Boolean).join("\n");
}

export function getSalesCatalogReadiness(input: { description: string; media: SalesCatalogMedia[] }) {
  if (!input.description.trim()) return "needs_description" as const;
  if (input.media.length === 0) return "needs_media" as const;
  return "ready" as const;
}

export function formatSalesCatalogInline(item: ClientSalesCatalogItem) {
  const lines = [
    item.title,
    item.price ? `Valor: ${item.price}${item.currency ? ` ${item.currency}` : ""}` : "",
    item.description,
  ];
  const media = item.media.slice(0, 4);

  if (media.length > 0) {
    lines.push("Arquivos que vou te mandar aqui no WhatsApp:");
    for (const file of media) {
      lines.push(`- ${file.fileName}`);
    }
  }

  return lines.filter(Boolean).join("\n");
}
