import "server-only";

import type { CurrentWorkspace } from "@/lib/supabase/profile";

export class DashboardCompanyScopeError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DashboardCompanyScopeError";
    this.status = status;
  }
}

export function resolveDashboardCompanyId(input: {
  workspace: CurrentWorkspace;
  requestedCompanyId?: string | null;
  missingMessage?: string;
  mismatchMessage?: string;
}) {
  const activeCompanyId = input.workspace.organization?.id ?? null;
  const requestedCompanyId = input.requestedCompanyId?.trim() || null;

  if (!activeCompanyId) {
    throw new DashboardCompanyScopeError(
      input.missingMessage ?? "Cadastre uma empresa antes de continuar.",
      422,
    );
  }

  if (requestedCompanyId && requestedCompanyId !== activeCompanyId) {
    throw new DashboardCompanyScopeError(
      input.mismatchMessage ?? "Empresa fora do workspace atual.",
      403,
    );
  }

  return requestedCompanyId ?? activeCompanyId;
}

export function statusForDashboardCompanyScopeError(error: unknown, fallback: number) {
  return error instanceof DashboardCompanyScopeError ? error.status : fallback;
}
