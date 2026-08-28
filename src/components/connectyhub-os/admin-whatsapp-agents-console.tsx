"use client";

import { adminWhatsappConsoleVariant, WhatsAppConsole } from "./whatsapp-console";

export function AdminWhatsappAgentsConsole({
  initialTab = "connection",
}: {
  initialTab?: Parameters<typeof WhatsAppConsole>[0]["initialTab"];
}) {
  return <WhatsAppConsole initialTab={initialTab} variant={adminWhatsappConsoleVariant} />;
}
