export const whatsappReconnectCatchupEventName = "connectyhub/whatsapp.instance.reconnected";

export type WhatsappReconnectCatchupEventData = {
  whatsappInstanceId: string;
  organizationId?: string | null;
  providerInstanceId?: string | null;
  webhookEventId?: string | null;
  previousStatus?: string | null;
  disconnectedAt?: string | null;
  connectedAt?: string | null;
};
