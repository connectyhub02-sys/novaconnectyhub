import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export type ContractAccess = {
  organization_id: string;
  billing_organization_id: string;
  subscription_id: string | null;
  plan_code: string;
  allowed: boolean;
  reason: string;
  period_end: string | null;
  blocked_at: string | null;
};

export class ContractAccessError extends Error {
  readonly status = 402;
  readonly code = "billing_access_required";
  readonly checkoutUrl = "/dashboard/planos";
  constructor(readonly access: ContractAccess) {
    super("Os serviços do plano estão suspensos. Seus produtos avulsos pagos e a regularização continuam disponíveis.");
    this.name = "ContractAccessError";
  }
}

export async function getContractAccess(organizationId: string, client: SupabaseClient = createServiceClient(), now?: Date): Promise<ContractAccess> {
  const { data, error } = await client.rpc("resolve_organization_contract_access", { p_organization: organizationId, ...(now ? { p_now: now.toISOString() } : {}) });
  if (error || !data || typeof data.allowed !== "boolean") throw new Error("Não foi possível conferir o acesso ao contrato. Tente novamente.");
  return data as ContractAccess;
}

export async function assertContractAccess(organizationId: string, client?: SupabaseClient) {
  const access = await getContractAccess(organizationId, client);
  if (!access.allowed) throw new ContractAccessError(access);
  return access;
}
