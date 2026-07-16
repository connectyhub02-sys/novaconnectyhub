"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import type {
  AdminClientIntegrationAlertSeverity,
  AdminClientIntegrationProviderId,
} from "@/lib/admin/client-integrations";

type AdminIntegrationAction = "admin_alert_acknowledged" | "admin_retest_requested";

const providerIds = new Set<AdminClientIntegrationProviderId>([
  "meta-ads",
  "google-growth",
  "mercado-pago",
  "webhook-universal",
]);

const adminActions = new Set<AdminIntegrationAction>([
  "admin_alert_acknowledged",
  "admin_retest_requested",
]);

const alertSeverities = new Set<AdminClientIntegrationAlertSeverity>(["critical", "warning", "info"]);

export async function registerClientIntegrationAdminAction(formData: FormData) {
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    throw new Error("Acesso negado.");
  }

  const organizationId = readRequiredString(formData, "organizationId");
  const providerId = readProviderId(formData, "providerId");
  const adminAction = readAdminAction(formData, "adminAction");
  const severity = readAlertSeverity(formData, "severity");
  const companyName = readOptionalString(formData, "companyName");
  const providerLabel = readOptionalString(formData, "providerLabel");
  const alertTitle = readOptionalString(formData, "alertTitle");
  const alertDetail = readOptionalString(formData, "alertDetail");
  const note = readOptionalString(formData, "note");
  const now = new Date().toISOString();

  const client = createServiceClient();
  const { error } = await client.from("integration_action_logs").insert({
    organization_id: organizationId,
    provider_id: providerId,
    actor_id: workspace.user.id,
    action: adminAction,
    status: "success",
    metadata: {
      source: "admin-client-integrations",
      severity,
      company_name: companyName,
      provider_label: providerLabel,
      alert_title: alertTitle,
      alert_detail: alertDetail,
      message: note ?? defaultMessage(adminAction, providerLabel, alertTitle),
      admin_profile_id: workspace.profile.id,
      admin_email: workspace.profile.email,
      registered_at: now,
    },
  });

  if (error) {
    throw new Error(`Nao foi possivel registrar a acao administrativa: ${error.message}`);
  }

  revalidatePath("/admin/clientes/integracoes");
}

function defaultMessage(action: AdminIntegrationAction, providerLabel: string | null, alertTitle: string | null) {
  const provider = providerLabel ?? "integracao";

  if (action === "admin_retest_requested") {
    return `Reteste solicitado pelo admin para ${provider}.`;
  }

  return `Alerta acompanhado pelo admin${alertTitle ? `: ${alertTitle}` : ` para ${provider}`}.`;
}

function readRequiredString(formData: FormData, key: string) {
  const value = readOptionalString(formData, key);
  if (!value) throw new Error(`Campo obrigatorio ausente: ${key}.`);
  return value;
}

function readOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readProviderId(formData: FormData, key: string): AdminClientIntegrationProviderId {
  const value = readRequiredString(formData, key);
  if (!providerIds.has(value as AdminClientIntegrationProviderId)) {
    throw new Error("Provedor invalido.");
  }

  return value as AdminClientIntegrationProviderId;
}

function readAdminAction(formData: FormData, key: string): AdminIntegrationAction {
  const value = readRequiredString(formData, key);
  if (!adminActions.has(value as AdminIntegrationAction)) {
    throw new Error("Acao administrativa invalida.");
  }

  return value as AdminIntegrationAction;
}

function readAlertSeverity(formData: FormData, key: string): AdminClientIntegrationAlertSeverity {
  const value = readOptionalString(formData, key);
  if (alertSeverities.has(value as AdminClientIntegrationAlertSeverity)) {
    return value as AdminClientIntegrationAlertSeverity;
  }

  return "info";
}
