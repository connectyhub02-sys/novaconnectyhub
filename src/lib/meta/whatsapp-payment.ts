import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { cloudRequest, officialSettings, type OfficialConnection } from "./whatsapp-cloud";
import { META_PAYMENT_MISSING_MESSAGE, metaPaymentStatusFromHealth, metaPaymentUrl, type MetaPaymentStatus } from "./message-billing-policy";

/** Live read of the sender's health on Meta. Failures return "unknown" and never block. */
export async function officialPaymentStatus(client: SupabaseClient, connection: OfficialConnection): Promise<MetaPaymentStatus> {
  try {
    const result = await cloudRequest<{ health_status?: unknown }>(await officialSettings(client), decryptCredentialValue(connection.encrypted_token), connection.phone_number_id, undefined, { fields: "health_status" });
    return metaPaymentStatusFromHealth(connection.waba_id, result.health_status);
  } catch {
    return { status: "unknown", businessId: null, wabaId: connection.waba_id, paymentUrl: metaPaymentUrl(connection.waba_id, null), canSendMessage: null, issues: [] };
  }
}

export class MetaPaymentMissingError extends Error {
  constructor(public paymentUrl: string) {
    super(META_PAYMENT_MISSING_MESSAGE + " Adicione o cartão em Chat Meta → Adicionar cartão na Meta e tente novamente.");
    this.name = "MetaPaymentMissingError";
  }
}

/** Business-initiated sends on customer-paid senders need a card at Meta. */
export async function assertOfficialPaymentReady(client: SupabaseClient, connection: OfficialConnection) {
  if (connection.billing_mode === "connectyhub_credit_line") return;
  const payment = await officialPaymentStatus(client, connection);
  if (payment.status === "missing") throw new MetaPaymentMissingError(payment.paymentUrl);
}
