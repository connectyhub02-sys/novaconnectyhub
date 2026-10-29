import "server-only";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { getMetaWorkspace, requireMetaCompanyAccess } from "@/lib/meta/company-access";
import { resolveDashboardCompanyId } from "@/lib/client-os/dashboard-route-scope";
import { createServiceClient } from "@/lib/supabase/service";
import { readMetaReviewAccess } from "@/lib/auth/meta-review-access";
import { assertBillableAccess } from "@/lib/billing/trial";
import type { SocialShell } from "./policy";

export class SocialAccessError extends Error {
  constructor(message: string, public status = 403) { super(message); }
}
export async function socialAccess(shell: SocialShell, requestedCompanyId?: string | null, write = false) {
  const workspace = shell === "admin" ? await getMetaWorkspace() : await getCurrentWorkspace();
  if (!workspace) throw new SocialAccessError("Entre na sua conta para continuar.", 401);
  if (shell === "admin" && !workspace.profile.isPlatformAdmin) throw new SocialAccessError("Acesso administrativo necessário.");
  if (readMetaReviewAccess(workspace.user)) throw new SocialAccessError("Esta conta é exclusiva para avaliação Meta.");
  const organizationId = resolveDashboardCompanyId({ workspace, requestedCompanyId });
  const client = createServiceClient();
  const company = await requireMetaCompanyAccess({ client, userId: workspace.user.id, companyId: organizationId });
  const canManage = ["owner", "admin"].includes(company.role);
  if (write) {
    if (!canManage) throw new SocialAccessError("Somente gestores podem alterar as conexões.");
    await assertBillableAccess({ client, organizationId });
  }
  return { workspace, client, company, organizationId, canManage, shell };
}
