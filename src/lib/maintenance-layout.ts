import type { CredentialRequirement } from "@/lib/maintenance-vault";

// Organização visual da Sala de Manutenção. Não altera onde nem como as credenciais são lidas.

export type MaintenanceArea = "ia" | "whatsapp" | "redes" | "pagamentos" | "infra";
export type FieldSource = "vault" | "environment" | "missing";
export type IntegrationState = "ready" | "pending" | "standby";

export const maintenanceAreas: { key: MaintenanceArea; label: string }[] = [
  { key: "ia", label: "IA e voz" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "redes", label: "Redes e anúncios" },
  { key: "pagamentos", label: "Pagamentos" },
  { key: "infra", label: "Infraestrutura" },
];

const areaByIntegration: Record<string, MaintenanceArea> = {
  gemini: "ia",
  elevenlabs: "ia",
  uazapi: "whatsapp",
  meta: "redes",
  youtube: "redes",
  tiktok: "redes",
  "google-ads": "redes",
  "google-analytics": "redes",
  asaas: "pagamentos",
  pagbank: "pagamentos",
  "mercado-pago": "pagamentos",
  "pagbank-billing": "pagamentos",
  "mercado-pago-billing": "pagamentos",
  infrastructure: "infra",
  supabase: "infra",
  r2: "infra",
  inngest: "infra",
  push: "infra",
  "google-maps": "infra",
};

// Somente integrações declaradas fora de operação. Não inferir standby por ausência de valores.
const standbyIntegrations = new Set(["mercado-pago"]);

// Integrações cujas contas de operação própria ficam em Redes sociais > Contas conectadas.
const ownAccountIntegrations = new Set(["meta", "youtube", "tiktok"]);

export function integrationArea(integrationId: string): MaintenanceArea {
  return areaByIntegration[integrationId] ?? "infra";
}

export function isStandbyIntegration(integrationId: string) {
  return standbyIntegrations.has(integrationId);
}

export function hasOwnAccountsLink(integrationId: string) {
  return ownAccountIntegrations.has(integrationId);
}

export function resolveFieldSource(savedInVault: boolean, configuredOnServer: boolean): FieldSource {
  if (savedInVault) return "vault";
  if (configuredOnServer) return "environment";
  return "missing";
}

export function summarizeIntegration(
  integrationId: string,
  fields: { requirement: CredentialRequirement; source: FieldSource }[],
) {
  const required = fields.filter((field) => field.requirement === "required");
  const missingRequired = required.filter((field) => field.source === "missing").length;
  const state: IntegrationState = isStandbyIntegration(integrationId)
    ? "standby"
    : missingRequired > 0
      ? "pending"
      : "ready";

  return {
    state,
    requiredTotal: required.length,
    requiredConfigured: required.length - missingRequired,
    missingRequired,
    configured: fields.filter((field) => field.source !== "missing").length,
    total: fields.length,
  };
}
