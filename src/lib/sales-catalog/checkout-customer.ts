import type { SupabaseClient } from "@supabase/supabase-js";
import { isLikelyPersonalLeadName, resolveLeadPersonalName } from "@/lib/whatsapp/lead-names";

type RecordValue = Record<string, unknown>;
export type CheckoutCustomerOrder = {
  id: string; lead_id?: string | null;
  customer_name?: string | null; customer_phone?: string | null;
  customer_email?: string | null; customer_document?: string | null;
  destination_cep?: string | null; destination_address?: string | null;
};

export function resolveCheckoutCustomer(order: CheckoutCustomerOrder, lead?: { display_name?: string | null; phone_number?: string | null; metadata?: RecordValue | null } | null) {
  const metadata = lead?.metadata ?? {};
  const memory = record(metadata.lead_memory);
  const pick = (...keys: string[]) => keys.map(key => text(metadata[key]) ?? text(memory[key])).find(Boolean) ?? null;
  return {
    customer_name: isLikelyPersonalLeadName(order.customer_name) ? text(order.customer_name) : resolveLeadPersonalName({ displayName: lead?.display_name, metadata }),
    customer_phone: text(order.customer_phone) ?? text(lead?.phone_number) ?? pick("phone", "phone_number"),
    customer_email: text(order.customer_email) ?? pick("email", "customer_email", "lead_email"),
    customer_document: text(order.customer_document) ?? pick("customer_document", "cpf_cnpj", "cpf", "cnpj", "cpfCnpj"),
    destination_cep: text(order.destination_cep) ?? pick("billing_cep", "delivery_cep", "destination_cep", "cep"),
    destination_address: text(order.destination_address) ?? pick("billing_address", "delivery_address", "destination_address", "address"),
  };
}

/** Order data is authoritative; CRM supplies missing fields and replaces a chat snippet used as a name. */
export async function loadCheckoutCustomer<T extends CheckoutCustomerOrder>(client: SupabaseClient, organizationId: string, order: T, persist = false): Promise<T & ReturnType<typeof resolveCheckoutCustomer>> {
  const { data: lead, error } = order.lead_id
    ? await client.from("leads").select("display_name, phone_number, metadata").eq("organization_id", organizationId).eq("id", order.lead_id).maybeSingle()
    : { data: null, error: null };
  if (error) throw new Error("Não foi possível consultar os dados já informados no WhatsApp.");
  const customer = resolveCheckoutCustomer(order, lead);
  if (persist) {
    const patch = Object.fromEntries(Object.entries(customer).filter(([key, value]) => value && value !== order[key as keyof T]));
    if (Object.keys(patch).length) {
      let update = client.from("sales_catalog_orders").update(patch).eq("organization_id", organizationId).eq("id", order.id);
      // Avoid replacing contact details corrected concurrently in another tab.
      for (const key of Object.keys(patch)) update = order[key as keyof T] == null ? update.is(key, null) : update.eq(key, order[key as keyof T]);
      const { data: saved, error: saveError } = await update.select("id").maybeSingle();
      if (saveError || !saved) throw new Error("Os dados do pedido foram atualizados. Tente continuar novamente.");
    }
  }
  return { ...order, ...customer };
}

export function parseCheckoutAddress(value: string | null | undefined) {
  const address = text(value)?.replace(/\s+/g, " ");
  if (!address) return {};
  // A numbered street (Rua 1131) is not the house number (número 61).
  const explicit = /\b(?:n[úu]mero|num\.?|n[º°o.]?)\s*[:\-]?\s*(\d{1,6})\b/i.exec(address);
  const separated = /,\s*(\d{1,6})\b/.exec(address);
  const trailingNumber = /^(.+?)\s+(\d{1,6})(?=\s*[,;]|$)/.exec(address);
  const unseparated = trailingNumber && !/^(rua|r\.?|avenida|av\.?|travessa|alameda|estrada)$/i.test(trailingNumber[1].trim()) ? trailingNumber : null;
  const number = explicit?.[1] ?? separated?.[1] ?? unseparated?.[2];
  const split = explicit?.index ?? separated?.index ?? (unseparated ? unseparated[1].length : undefined);
  const street = split !== undefined ? address.slice(0, split).replace(/[,;\s]+$/, "") : address;
  const complement = /\b(?:ap(?:to|artamento)?\.?|bloco|sala|casa|fundos)\s*[:\-]?\s*[\w-]+/i.exec(address)?.[0];
  const province = /\bbairro\s*[:\-]?\s*([^,;]+)/i.exec(address)?.[1];
  return { address: street, addressNumber: number, complement, province };
}

export function hasCheckoutBillingAddress(order: Pick<CheckoutCustomerOrder, "destination_cep" | "destination_address">) {
  return (order.destination_cep?.replace(/\D/g, "").length === 8) && Boolean(parseCheckoutAddress(order.destination_address).addressNumber);
}

function record(value: unknown): RecordValue { return value && typeof value === "object" ? value as RecordValue : {}; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
