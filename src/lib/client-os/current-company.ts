import "server-only";

import type { ClientCompany } from "./companies";
import type { CurrentOrganization } from "@/lib/supabase/profile";

export function currentOrganizationToClientCompany(
  organization: CurrentOrganization | null | undefined,
): ClientCompany | null {
  if (!organization) {
    return null;
  }

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    brandLogoUrl: null,
    brandLogoAlt: organization.name,
    planCode: organization.planCode,
    status: organization.status,
    role: organization.role,
    createdAt: null,
  };
}
