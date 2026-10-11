import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrganizationBillingAccess } from "@/lib/billing/trial";
import { resolveMetaSocialChannelsEntitlement } from "@/lib/billing/plan-entitlements";
import {
  assertAgentChannelsAvailable,
  evaluateAgentChannelAvailability,
} from "./channel-availability";
import {
  metaAgentChannelIds,
  normalizeAgentChannelConfig,
} from "./multichannel";

export async function loadAgentChannelAvailability(
  client: SupabaseClient,
  organizationId: string,
) {
  const [integration, credentials, billing] = await Promise.all([
    client
      .from("organization_integrations")
      .select("status,scopes,metadata")
      .eq("organization_id", organizationId)
      .eq("provider_id", "meta-ads")
      .maybeSingle(),
    client
      .from("integration_credentials")
      .select("env_name")
      .eq("scope", "organization")
      .eq("organization_id", organizationId)
      .eq("integration_id", "meta")
      .in("env_name", ["META_ACCESS_TOKEN", "FACEBOOK_PAGE_ACCESS_TOKEN"]),
    getOrganizationBillingAccess({ client, organizationId }),
  ]);
  if (integration.error || credentials.error)
    throw new Error(
      "Não foi possível verificar a conexão Meta. Tente novamente.",
    );
  const allowed = resolveMetaSocialChannelsEntitlement({
    planCode: billing.planCode,
    organizationStatus: billing.organizationStatus,
    billingState: billing.state,
    featureOverrides: billing.featureOverrides,
  }).allowed;
  return evaluateAgentChannelAvailability({
    allowed,
    connected: integration.data?.status === "connected",
    hasToken: Boolean(credentials.data?.length),
    metadata: integration.data?.metadata,
    scopes: integration.data?.scopes,
  });
}

export async function validateAgentChannelSelection(
  client: SupabaseClient,
  organizationId: string | null,
  value: unknown,
  previous?: unknown,
) {
  const next = normalizeAgentChannelConfig(value);
  const before = normalizeAgentChannelConfig(previous);
  if (
    !metaAgentChannelIds.some(
      (channel) =>
        next.channels[channel].enabled &&
        JSON.stringify(next.channels[channel]) !==
          JSON.stringify(before.channels[channel]),
    )
  )
    return next;
  // Platform agents are not selected by the organization-scoped social dispatcher.
  if (!organizationId)
    throw new Error(
      "Atendimento Meta requer um agente da empresa. Configure-o no painel da empresa.",
    );
  assertAgentChannelsAvailable(
    next,
    previous,
    await loadAgentChannelAvailability(client, organizationId),
  );
  return next;
}
