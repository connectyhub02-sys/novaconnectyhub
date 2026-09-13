import { describe, expect, it, vi } from "vitest";
import * as diagnostics from "../src/lib/sales-catalog/payment-diagnostics";
import * as cardInput from "../src/lib/sales-catalog/card-input";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Row = Record<string, unknown>;
const orderId = "10000000-0000-4000-8000-000000000001";
const sessionId = "10000000-0000-4000-8000-000000000002";
const order = { id: orderId, organization_id: "store", lead_id: "lead", conversation_id: "luna-chat", customer_name: "Cliente de teste", customer_phone: "5500000000000", total: "100,00", metadata: {} };
const items = [{ id: "item", organization_id: "store", order_id: orderId, title: "Camiseta de teste", quantity: 2, metadata: {} }];

describe("failed payment recovery notifications", () => {
  it.each([
    [{ category: "validation", stage: "customer_create", code: "invalid_cpfCnpj", httpStatus: 400 }, /CPF\/CNPJ do pagador precisa ser corrigido/],
    [{ category: "validation", stage: "customer_create", code: "invalid_object", httpStatus: 400 }, /dados do pagador precisam ser conferidos/],
    [null, /O motivo não foi confirmado/],
  ])("preserves the recorded diagnostic through payment effects and WhatsApp delivery: %j", async (diagnostic, expected) => {
    const attempt = { id: "attempt", organization_id: "store", order_id: orderId, payment_session_id: sessionId, state: "error", diagnostic, effects_claimed_at: "claimed" };
    const db = commerceDatabase({
      sales_catalog_orders: [order], sales_catalog_order_items: items,
      sales_catalog_payment_sessions: [{ id: sessionId, provider_payment_id: null }],
      sales_catalog_card_attempts: [attempt],
      whatsapp_instances: [{ id: "luna-phone", organization_id: "store", instance_token_encrypted: "fake-token" }],
      leads: [{ id: "lead", organization_id: "store", phone_number: "5500000000000" }],
      conversations: [{ id: "luna-chat", organization_id: "store" }],
    });
    const fetch = vi.fn(async () => new Response(JSON.stringify({ messageId: "sent-fixture" })));
    const postPayment = serverModuleHarness<typeof import("../src/lib/sales-catalog/post-payment")>("src/lib/sales-catalog/post-payment.ts", {
      "./payment-diagnostics": diagnostics,
      "@/lib/billing/contract-access": { getContractAccess: async () => ({ allowed: true }), assertContractAccess: vi.fn() },
      "@/lib/client-os/sales-catalog": { getOrganizationSalesCatalogSettings: async () => ({ automationSettings: { paymentStatusNotifications: true }, messageTemplates: {} }) },
      "@/lib/whatsapp/conversation-sender": { resolveConversationSender: async () => ({ conversation: { id: "luna-chat", provider_chat_id: "test-chat" }, whatsappInstanceId: "luna-phone" }) },
      "@/lib/security/credentials-crypto": { decryptCredentialValue: () => "fake-token" },
      "@/lib/whatsapp/uazapi-credentials": { loadUazapiCredentials: async () => ({ baseUrl: "https://whatsapp.example" }) },
    }, [], { fetch });
    const service = serverModuleHarness<{ processTransparentPaymentEffects: (client: unknown, id: string) => Promise<void> }>("src/lib/sales-catalog/transparent-checkout.ts", {
      "./post-payment": postPayment,
    }, ["processTransparentPaymentEffects"]);
    const client = { ...db.client, rpc: vi.fn(async () => ({ data: attempt, error: null })) };
    await service.processTransparentPaymentEffects(client, "attempt");
    expect(fetch).toHaveBeenCalledOnce();
    const saved = db.tables.conversation_messages[0];
    expect(saved.text_content).toMatch(expected as RegExp);
    expect(saved.text_content).not.toMatch(/sem saldo|saldo insuficiente|não foi autorizad/);
    expect(saved.conversation_id).toBe("luna-chat");
    expect(db.tables.sales_catalog_card_attempts[0].effects_completed_state).toBe("error");
    expect(db.tables.sales_catalog_orders).toHaveLength(1);
  });

  it("loads a failed attempt's safe diagnostic and fails closed when that lookup fails", async () => {
    const diagnostic = { category: "validation", stage: "customer_create", code: "invalid_object", httpStatus: 400 };
    const tables = {
      sales_catalog_payment_sessions: [{ id: sessionId, organization_id: "store", order_id: orderId, provider: "asaas" }],
      sales_catalog_orders: [order], sales_catalog_order_items: items,
      sales_catalog_card_attempts: [{ id: "attempt", organization_id: "store", order_id: orderId, state: "error", diagnostic }],
    };
    const service = serverModuleHarness<{ loadTransparentCheckout: (client: unknown, id: string) => Promise<Row> }>("src/lib/sales-catalog/transparent-checkout.ts", {
      "./card-input": cardInput,
      "./public-commerce-access": { assertPublicCommerceAccess: vi.fn() },
      "./checkout-customer": { loadCheckoutCustomer: async (_client: unknown, _org: string, saved: Row) => saved, parseCheckoutAddress: () => ({ addressNumber: "10" }) },
      "./mercado-pago": { normalizeCurrencyAmount: () => 100 },
      "@/lib/client-os/sales-catalog": { getOrganizationSalesCatalogSettings: async () => ({}) },
    });
    const snapshot = await service.loadTransparentCheckout(commerceDatabase(tables).client, sessionId);
    expect(snapshot.attempt).toMatchObject({ state: "error", diagnostic });
    await expect(service.loadTransparentCheckout(commerceDatabase(tables, { table: "sales_catalog_card_attempts", operation: "select" }).client, sessionId)).rejects.toThrow("tentativa anterior");
  });
});
