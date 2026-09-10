export type UazapiConfig = {
  baseUrl: string;
  hasAdminToken: boolean;
  hasInstanceToken: boolean;
  hasWebhookSecret: boolean;
  webhookUrl: string | null;
};

export function getUazapiConfig(): UazapiConfig {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return {
    baseUrl: (process.env.UAZAPI_BASE_URL || "https://free.uazapi.com").replace(/\/$/, ""),
    hasAdminToken: Boolean(process.env.UAZAPI_ADMIN_TOKEN),
    hasInstanceToken: Boolean(process.env.UAZAPI_INSTANCE_TOKEN),
    hasWebhookSecret: Boolean(process.env.UAZAPI_WEBHOOK_SECRET),
    webhookUrl: appUrl ? `${appUrl}/api/webhooks/uazapi` : null,
  };
}
