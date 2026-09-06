import { describe, expect, it, vi } from "vitest";
import * as customer from "@/lib/sales-catalog/checkout-customer";
import { resolveLeadTechnicalTracking, mergeLeadTechnicalTracking } from "@/lib/client-os/lead-technical-profile";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type * as Asaas from "@/lib/sales-catalog/asaas";
import { parseCheckoutCardHolder } from "@/lib/sales-catalog/card-input";

describe("WhatsApp details carried into checkout", () => {
  it("repairs a question used as customer name and fills missing contact details from the same lead", async () => {
    const order = { id: "order", organization_id: "store", lead_id: "lead", customer_name: "Qual o valor", customer_email: null, customer_phone: null, customer_document: null, destination_cep: "88000000", destination_address: "Rua 1131, número 61, Centro, Cidade Teste" };
    const db = commerceDatabase({ sales_catalog_orders: [order], leads: [{ id: "lead", organization_id: "store", display_name: "Maria Exemplo", phone_number: "554899990000", metadata: { person_name: "Maria Exemplo", email: "cliente@example.test", customer_document: "12345678909", destination_address: "Outro endereço que não pertence a este pedido" } }] });
    const loaded = await customer.loadCheckoutCustomer(db.client as never, "store", order, true);
    expect(loaded).toMatchObject({ customer_name: "Maria Exemplo", customer_email: "cliente@example.test", customer_phone: "554899990000", customer_document: "12345678909", destination_address: order.destination_address });
    expect(db.tables.sales_catalog_orders[0]).toMatchObject({ customer_name: "Maria Exemplo", customer_email: "cliente@example.test" });
    const unrelated = await customer.loadCheckoutCustomer(db.client as never, "other-store", order);
    expect(unrelated.customer_name).toBeNull();
  });
  it.each([
    ["Rua 1131, número 61, CEP 88000000, apartamento 903", "Rua 1131", "61", "apartamento 903"],
    ["Rua 1131, 61, Apto 903", "Rua 1131", "61", "Apto 903"],
    ["Avenida Brasil, nº 150, bairro Centro", "Avenida Brasil", "150", undefined],
  ])("separates the house number correctly in %s", (address, street, number, complement) => {
    expect(customer.parseCheckoutAddress(address)).toMatchObject({ address: street, addressNumber: number, complement });
  });
  it("requires the billing postal code and house number before a card checkout", () => {
    expect(customer.hasCheckoutBillingAddress({ destination_cep: "88000-000", destination_address: "Rua Exemplo, número 61" })).toBe(true);
    expect(customer.hasCheckoutBillingAddress({ destination_cep: "88000000", destination_address: "Rua 1131" })).toBe(false);
    expect(customer.hasCheckoutBillingAddress({ destination_address: "Rua Exemplo, 61" })).toBe(false);
  });

  const completeOrder = { id: "qa-order", customer_name: "Maria Exemplo", customer_email: "maria@example.test", customer_phone: "+55 (48) 99999-0000", customer_document: "123.456.789-09", destination_cep: "88000-000", destination_address: "Rua 1131, número 61, apartamento 903" };
  it("keeps complete WhatsApp data collapsed even with formatted contact fields", () => {
    expect(customer.getCheckoutCustomerMissingFields(completeOrder)).toEqual([]);
  });
  it.each([
    ["customer_name", "", "Nome completo"], ["customer_email", "sem-email", "E-mail"],
    ["customer_phone", "999", "Telefone"], ["customer_document", "123", "CPF/CNPJ"],
    ["destination_cep", "880", "CEP"], ["destination_address", "Rua 1131", "Número do endereço"],
  ])("flags incomplete %s so the details open before paying", (field, value, label) => {
    expect(customer.getCheckoutCustomerMissingFields({ ...completeOrder, [field]: value })).toEqual([label]);
  });
  it("does not require a delivery address for a digital purchase without card billing", () => {
    const digital = { ...completeOrder, destination_cep: null, destination_address: null };
    expect(customer.getCheckoutCustomerMissingFields(digital, false)).toEqual([]);
    expect(customer.getCheckoutCustomerMissingFields(digital, true)).toEqual(["CEP", "Endereço"]);
  });
  it("uses the same validation as the actual card holder submission", () => {
    for (const email of ["maria@example.test", "invalid", ""]) {
      const data = { ...completeOrder, customer_email: email };
      const holder = { name: data.customer_name, email, cpfCnpj: data.customer_document, phone: data.customer_phone, postalCode: data.destination_cep, addressNumber: "61" };
      if (customer.getCheckoutCustomerMissingFields(data).length) expect(() => parseCheckoutCardHolder(holder)).toThrow();
      else expect(() => parseCheckoutCardHolder(holder)).not.toThrow();
    }
  });
});

describe("Asaas hosted checkout request contract", () => {
  it.each([true, false])("sends all existing customer details and respects 30-character item names (shipping included: %s)", async includeShipping => {
    const requests: Record<string, unknown>[] = [];
    const fetch = vi.fn(async (url: string, init: { body?: string }) => {
      if (url.startsWith("https://viacep.com.br/")) return { ok: true, json: async () => ({ bairro: "Centro", ibge: "4205407" }) };
      expect(url).toBe("https://api-sandbox.asaas.com/v3/checkouts");
      const body = JSON.parse(init.body ?? "{}");
      requests.push(body);
      // Provider contract: unlike the person's name, items[].name has maxLength 30.
      for (const item of body.items) expect(item.name.length).toBeLessThanOrEqual(30);
      return { ok: true, json: async () => ({ id: "hosted", link: "https://sandbox.asaas.com/checkoutSession/show/hosted" }) };
    });
    const api = serverModuleHarness<typeof Asaas>("src/lib/sales-catalog/asaas.ts", { "./checkout-customer": customer }, [], { fetch });
    const name = "Maria de Oliveira Pereira dos Santos";
    const total = includeShipping ? 573.8 : 503.8;
    await api.createAsaasCheckout({ accessToken: "fake-sandbox", mode: "sandbox", amount: total, description: "Pedido com produtos de nomes extensos e frete de entrega", externalReference: "test-order", payerName: name, payerEmail: "cliente@example.test", payerDocument: "12345678909", payerPhone: "554899990000", payerZipCode: "88000-000", payerAddress: "Rua 1131, número 61, apartamento 903", items: [{ title: "Produto de teste com nome maior do que trinta caracteres", quantity: 2, unitPrice: "251,90", total: "503,80" }] });
    expect(requests).toHaveLength(1);
    expect(requests[0].customerData).toMatchObject({ name, email: "cliente@example.test", cpfCnpj: "12345678909", phone: "4899990000", postalCode: "88000000", address: "Rua 1131", addressNumber: 61, complement: "apartamento 903", province: "Centro", city: 4205407 });
    const items = requests[0].items as Array<{ quantity: number; value: number }>;
    expect(items.reduce((sum, item) => sum + item.quantity * item.value, 0)).toBeCloseTo(total, 2);
  });
});

describe("CRM technical profile", () => {
  it("keeps latest valid observations when later commerce events have no device data", () => {
    const tracking = resolveLeadTechnicalTracking({}, [
      { event_type: "commerce.payment_failed", occurred_at: "2026-09-05T16:00:00Z", payload: { device_type: null, ip_address: null } },
      { event_type: "button_clicked", occurred_at: "2026-09-05T15:00:00Z", payload: { device_type: "mobile", browser: "chrome", os: "android", ip_address: "203.0.113.1", city: "Cidade Teste", region: "SC", country: "BR" } },
    ]);
    expect(tracking).toEqual({ device: "mobile", browser: "chrome", os: "android", ipAddress: "203.0.113.1", location: "Cidade Teste / SC / BR", lastClick: "2026-09-05T15:00:00Z" });
    expect(mergeLeadTechnicalTracking({ device: null, ipAddress: null }, tracking)).toMatchObject(tracking);
  });
});
