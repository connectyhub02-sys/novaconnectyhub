import { describe, expect, it } from "vitest";
import {
  resolveSalesCatalogCheckoutStatus,
  type ClientSalesCatalogOrder,
  type ClientSalesCatalogPaymentSession,
} from "@/lib/sales-catalog/shared";

const baseOrder: ClientSalesCatalogOrder = {
  id: "order-1",
  companyId: "company-1",
  leadId: "lead-1",
  conversationId: "conversation-1",
  source: "whatsapp",
  status: "pending_payment",
  paymentStatus: "pending",
  fulfillmentStatus: "pending",
  customerName: "Magno",
  customerPhone: "5511999999999",
  customerDocument: null,
  customerEmail: null,
  destinationCep: null,
  destinationAddress: null,
  subtotal: "100.00",
  discountTotal: "0",
  shippingTotal: "0",
  total: "100.00",
  paymentMethod: "pix",
  shippingMethod: null,
  agentNotes: null,
  internalNotes: null,
  latestPaymentSessionId: "session-1",
  commercialFlowType: "client_direct",
  revenueOwnerType: "client",
  containsPlatformProducts: false,
  commissionEligible: false,
  inventoryDeductedAt: null,
  inventoryRestoredAt: null,
  paymentWhatsappNotifiedAt: null,
  inventoryDeductedItems: 0,
  inventoryRestoredItems: 0,
  items: [],
  createdBy: null,
  createdAt: "2026-08-23T12:00:00.000Z",
  updatedAt: "2026-08-23T12:00:00.000Z",
};

const baseSession: ClientSalesCatalogPaymentSession = {
  id: "session-1",
  companyId: "company-1",
  orderId: "order-1",
  integrationId: null,
  provider: "mercado_pago",
  method: "pix",
  status: "created",
  amount: "100.00",
  currency: "BRL",
  payerEmail: null,
  providerPaymentId: null,
  providerStatus: null,
  providerStatusDetail: null,
  checkoutUrl: "https://connectyhub.com.br/checkout/order-1",
  pixQrCode: null,
  pixQrCodeBase64: null,
  pixTicketUrl: null,
  externalReference: "order-1",
  expiresAt: "2026-08-23T18:00:00.000Z",
  paidAt: null,
  failureReason: null,
  paymentOwnerType: "client",
  commercialFlowType: "client_direct",
  revenueOwnerType: "client",
  commissionEligible: false,
  createdAt: "2026-08-23T12:00:00.000Z",
  updatedAt: "2026-08-23T12:00:00.000Z",
};

describe("sales catalog checkout status", () => {
  it("marks stale pending checkouts as abandoned", () => {
    const status = resolveSalesCatalogCheckoutStatus({
      abandonedAfterMinutes: 30,
      now: "2026-08-23T12:45:00.000Z",
      order: baseOrder,
      paymentSession: baseSession,
    });

    expect(status.stage).toBe("abandoned");
    expect(status.isAbandoned).toBe(true);
  });

  it("marks approved sessions as paid", () => {
    const status = resolveSalesCatalogCheckoutStatus({
      order: baseOrder,
      paymentSession: { ...baseSession, paidAt: "2026-08-23T12:03:00.000Z", status: "approved" },
    });

    expect(status.stage).toBe("paid");
    expect(status.isTerminal).toBe(true);
  });

  it("marks provider errors as failed", () => {
    const status = resolveSalesCatalogCheckoutStatus({
      order: baseOrder,
      paymentSession: { ...baseSession, failureReason: "collector error", status: "error" },
    });

    expect(status.stage).toBe("failed");
    expect(status.isTerminal).toBe(false);
  });
});
