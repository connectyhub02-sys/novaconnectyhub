import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AdminAdsPlatformDashboard } from "@/components/connectyhub-os/admin-ads-platform-dashboard";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { getAdminTrafficOverview } from "@/lib/traffic/admin-traffic";
import { getMetaWorkspace } from "@/lib/meta/company-access";
import { GoogleAccountPicker } from "@/components/connectyhub-os/google-account-picker";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Google Ads | Trafego IA",
  description: "Dashboard administrativo de campanhas, rastreamento e leads Google Ads.",
};

export default async function AdminGoogleAdsPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  // ConnectyHub's internal company (same one the admin Meta connection uses).
  const ownOrganizationId = await getMetaWorkspace().then(w => w?.organization?.id ?? null, () => null);
  const overview = await getAdminTrafficOverview(ownOrganizationId);
  const googleConnection = ownOrganizationId
    ? (await createServiceClient().from("organization_integrations").select("metadata")
      .eq("organization_id", ownOrganizationId).eq("provider_id", "google-growth").maybeSingle()).data
    : null;
  const googleMetadata = (googleConnection?.metadata ?? {}) as Record<string, unknown>;
  const accessibleCustomers = Array.isArray(googleMetadata.accessible_customers)
    ? googleMetadata.accessible_customers.filter((id): id is string => typeof id === "string")
    : [];
  const selectedCustomer = typeof googleMetadata.selected_customer_id === "string" ? googleMetadata.selected_customer_id : null;

  return (
    <AdminAdsPlatformDashboard
      overview={overview}
      platform="google"
      accountPicker={ownOrganizationId ? <GoogleAccountPicker companyId={ownOrganizationId} accessible={accessibleCustomers} selected={selectedCustomer} /> : null}
      {...(ownOrganizationId ? {
        credentialHref: `/api/dashboard/integrations/google/connect?companyId=${ownOrganizationId}`,
        credentialPrimaryLabel: "Conectar Google",
        credentialSecondaryHref: "/admin/maintenance#credenciais-do-sistema",
      } : {})}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    />
  );
}
