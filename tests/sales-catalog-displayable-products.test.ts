import { describe, expect, it } from "vitest";
import {
  isSalesCatalogCheckoutTrackingProduct,
  isSalesCatalogDisplayableProduct,
  type ClientSalesCatalogItem,
} from "@/lib/sales-catalog/shared";

const baseItem: ClientSalesCatalogItem = {
  id: "product-1",
  companyId: "company-1",
  title: "Pizza Pepperoni",
  description: "Pizza artesanal com pepperoni.",
  category: "Pizzas",
  price: "49.90",
  currency: "BRL",
  status: "active",
  tag: "PIZZA_PEPPERONI",
  highlightLabel: null,
  media: [],
  attributes: [],
  inventory: {
    status: "in_stock",
    quantity: null,
    lowStockThreshold: null,
    allowBackorder: false,
    notes: null,
  },
  skus: [],
  offer: {
    salePrice: null,
    saleStartsAt: null,
    saleEndsAt: null,
    couponCode: null,
    couponDescription: null,
    callToAction: null,
    notes: null,
  },
  fulfillment: {
    mode: "physical",
    schedulingRequired: false,
    serviceDuration: null,
    deliveryInstructions: null,
    accessInstructions: null,
  },
  shipping: {
    weightGrams: null,
    dimensions: {
      lengthCm: null,
      widthCm: null,
      heightCm: null,
    },
    profile: "default",
    notes: null,
  },
  productOriginType: "client",
  commercialFlowType: "client_direct",
  revenueOwnerType: "client",
  commissionPolicyType: "none",
  commissionEligible: false,
  platformProductId: null,
  platformProductCode: null,
  platformProductCommissionPercentage: null,
  platformProductCommissionReleaseDays: null,
  platformProductAgentPrompt: null,
  salesDestination: "connectyhub_checkout",
  productUrl: null,
  externalLinkButtonId: null,
  externalLinkButtonLabel: null,
  externalLinkButtonTag: null,
  externalLinkButtonTrackingUrl: null,
  assignedAgentIds: [],
  assignedWhatsappInstanceIds: [],
  sourceAgentId: null,
  sourceWhatsappInstanceId: null,
  whatsappExportTargets: [],
  source: "manual",
  whatsappCatalogId: null,
  whatsappCatalogJid: null,
  whatsappCatalogHidden: false,
  whatsappCatalogStatus: null,
  whatsappCatalogSyncedAt: null,
  readiness: "ready",
  createdAt: null,
  updatedAt: null,
};

describe("sales catalog displayable products", () => {
  it("keeps normal checkout products visible", () => {
    expect(isSalesCatalogDisplayableProduct(baseItem)).toBe(true);
  });

  it("hides payment checkout links imported as catalog products", () => {
    const ghostItem: ClientSalesCatalogItem = {
      ...baseItem,
      title: "Pagamento pedido 5e9c8826",
      description: "Produto importado dos botoes antigos do agente.",
      category: "Links importados",
      salesDestination: "external_site",
      productUrl: "https://www.connectyhub.com.br/checkout/a40afc36-9b73-4dbe-a30b-69df68fe8474",
      externalLinkButtonId: "40f7f1e0-2e2f-44a1-9477-ba206e6d4ccd",
    };

    expect(isSalesCatalogCheckoutTrackingProduct(ghostItem)).toBe(true);
    expect(isSalesCatalogDisplayableProduct(ghostItem)).toBe(false);
  });
});
