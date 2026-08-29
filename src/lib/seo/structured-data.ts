import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import type { ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";
import {
  buildCanonicalUrl,
  connectyhubSeoKeywords,
  connectyhubSiteDescription,
  connectyhubSiteName,
  getConnectyhubSiteUrl,
  toAbsoluteUrl,
  truncateSeoText,
} from "@/lib/seo/site";

type BreadcrumbItem = {
  name: string;
  url: string;
};

type StorefrontSchemaProduct = {
  id: string;
  title: string;
  description: string;
  category: string;
  priceCents: number | null;
  coverUrl: string | null;
  stockLabel: string;
};

type StorefrontStructuredDataInput = {
  storeSlug: string;
  displayName: string;
  description: string;
  logoUrl?: string | null;
  pagePath: string;
  products: StorefrontSchemaProduct[];
};

type ProductStructuredDataInput = {
  item: ClientSalesCatalogItem;
  organizationName: string;
  storeSlug: string;
};

export function buildConnectyhubRootStructuredData() {
  const siteUrl = getConnectyhubSiteUrl();
  const organizationId = `${siteUrl}/#organization`;
  const websiteId = `${siteUrl}/#website`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: connectyhubSiteName,
        url: siteUrl,
        logo: buildCanonicalUrl("/brand/connectyhub-app-icon-512.png"),
        description: connectyhubSiteDescription,
        knowsAbout: connectyhubSeoKeywords,
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        name: connectyhubSiteName,
        url: siteUrl,
        inLanguage: "pt-BR",
        publisher: { "@id": organizationId },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#software`,
        name: connectyhubSiteName,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: siteUrl,
        description: connectyhubSiteDescription,
        featureList: [
          "Agentes de IA para WhatsApp",
          "Automacao comercial",
          "Catalogo de vendas",
          "Checkout e pagamentos",
          "CRM e atendimento",
          "API para integradores",
        ],
        provider: { "@id": organizationId },
      },
    ],
  };
}

export function buildApiDocsStructuredData(input: {
  endpointCount: number;
  groupCount: number;
  schemaCount: number;
}) {
  const siteUrl = getConnectyhubSiteUrl();
  const docsUrl = buildCanonicalUrl("/docs/api");
  const apiId = `${docsUrl}#connectyhub-api`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${docsUrl}#webpage`,
        url: docsUrl,
        name: "Documentacao da API WhatsApp ConnectyHub",
        description:
          "Referencia publica e console de testes da API WhatsApp ConnectyHub para instancias, mensagens, webhooks, contatos e recursos avancados.",
        inLanguage: "pt-BR",
        isPartOf: { "@id": `${siteUrl}/#website` },
        mainEntity: { "@id": apiId },
      },
      {
        "@type": "WebAPI",
        "@id": apiId,
        name: "ConnectyHub API",
        description: `API REST com ${input.endpointCount} endpoints, ${input.groupCount} grupos e ${input.schemaCount} schemas para operacoes de WhatsApp, mensagens, webhooks e integracoes.`,
        documentation: docsUrl,
        termsOfService: buildCanonicalUrl("/termos"),
        provider: { "@id": `${siteUrl}/#organization` },
      },
      {
        "@type": "TechArticle",
        "@id": `${docsUrl}#article`,
        headline: "Como testar a API WhatsApp da ConnectyHub",
        description:
          "Documentacao tecnica com exemplos, payloads, respostas e ambiente de teste para integradores da ConnectyHub.",
        author: { "@id": `${siteUrl}/#organization` },
        publisher: { "@id": `${siteUrl}/#organization` },
        mainEntityOfPage: docsUrl,
        about: { "@id": apiId },
      },
      buildBreadcrumbList([
        { name: "ConnectyHub", url: siteUrl },
        { name: "API", url: docsUrl },
      ]),
    ],
  };
}

export function buildStorefrontStructuredData(input: StorefrontStructuredDataInput) {
  const siteUrl = getConnectyhubSiteUrl();
  const pageUrl = buildCanonicalUrl(input.pagePath);
  const storeUrl = buildCanonicalUrl(`/loja/${encodeURIComponent(input.storeSlug)}`);
  const storeId = `${storeUrl}#store`;
  const products = input.products.slice(0, 60);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: `${input.displayName} | Loja`,
        description: input.description,
        inLanguage: "pt-BR",
        isPartOf: { "@id": `${siteUrl}/#website` },
        mainEntity: { "@id": storeId },
      },
      {
        "@type": "Organization",
        "@id": storeId,
        name: input.displayName,
        url: storeUrl,
        logo: toAbsoluteUrl(input.logoUrl) ?? undefined,
        description: input.description,
        parentOrganization: { "@id": `${siteUrl}/#organization` },
      },
      {
        "@type": "OfferCatalog",
        "@id": `${storeUrl}#catalog`,
        name: `Catalogo de ${input.displayName}`,
        url: storeUrl,
        itemListElement: products.map((product) => ({
          "@type": "Offer",
          itemOffered: {
            "@type": "Product",
            "@id": `${buildCanonicalUrl(`/loja/${encodeURIComponent(input.storeSlug)}/produto/${encodeURIComponent(product.id)}`)}#product`,
            name: product.title,
            description: truncateSeoText(product.description, 220),
            category: product.category,
            image: toAbsoluteUrl(product.coverUrl) ?? undefined,
          },
        })),
      },
      {
        "@type": "ItemList",
        "@id": `${pageUrl}#products`,
        name: `Produtos da ${input.displayName}`,
        numberOfItems: products.length,
        itemListElement: products.map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: buildCanonicalUrl(`/loja/${encodeURIComponent(input.storeSlug)}/produto/${encodeURIComponent(product.id)}`),
          name: product.title,
        })),
      },
      buildBreadcrumbList([
        { name: "ConnectyHub", url: siteUrl },
        { name: input.displayName, url: storeUrl },
      ]),
    ],
  };
}

export function buildSalesCatalogProductStructuredData(input: ProductStructuredDataInput) {
  const siteUrl = getConnectyhubSiteUrl();
  const productUrl = buildCanonicalUrl(`/loja/${encodeURIComponent(input.storeSlug)}/produto/${encodeURIComponent(input.item.id)}`);
  const storeUrl = buildCanonicalUrl(`/loja/${encodeURIComponent(input.storeSlug)}`);
  const imageUrls = input.item.media
    .filter((media) => media.kind === "image")
    .map((media) => toAbsoluteUrl(media.storageUrl))
    .filter((url): url is string => Boolean(url));
  const price = normalizeCurrencyAmount(input.item.offer.salePrice) ?? normalizeCurrencyAmount(input.item.price);
  const productSchema: Record<string, unknown> = {
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: input.item.title,
    description: truncateSeoText(input.item.description, 240),
    category: input.item.category ?? "Produto",
    image: imageUrls.length ? imageUrls : undefined,
    sku: input.item.platformProductCode ?? input.item.tag,
    brand: {
      "@type": "Brand",
      name: input.organizationName,
    },
    mainEntityOfPage: productUrl,
  };

  if (price !== null) {
    productSchema.offers = {
      "@type": "Offer",
      url: productUrl,
      price,
      priceCurrency: input.item.currency || "BRL",
      availability: resolveProductAvailability(input.item),
      seller: {
        "@type": "Organization",
        name: input.organizationName,
      },
    };
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${productUrl}#webpage`,
        url: productUrl,
        name: input.item.title,
        description: truncateSeoText(input.item.description, 155),
        inLanguage: "pt-BR",
        isPartOf: { "@id": `${siteUrl}/#website` },
        mainEntity: { "@id": `${productUrl}#product` },
      },
      productSchema,
      buildBreadcrumbList([
        { name: "ConnectyHub", url: siteUrl },
        { name: input.organizationName, url: storeUrl },
        { name: input.item.category ?? "Produto", url: `${storeUrl}/produtos` },
        { name: input.item.title, url: productUrl },
      ]),
    ],
  };
}

export function buildFaqPageStructuredData(input: {
  pageUrl: string;
  questions: Array<{ question: string; answer: string }>;
}) {
  return {
    "@type": "FAQPage",
    "@id": `${input.pageUrl}#faq`,
    mainEntity: input.questions.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function buildBreadcrumbList(items: BreadcrumbItem[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function resolveProductAvailability(item: ClientSalesCatalogItem) {
  if (item.inventory.status === "out_of_stock") {
    return item.inventory.allowBackorder ? "https://schema.org/PreOrder" : "https://schema.org/OutOfStock";
  }

  if (item.inventory.status === "on_backorder") {
    return "https://schema.org/BackOrder";
  }

  return "https://schema.org/InStock";
}
