export type AdminImpersonationReturn = {
  accessToken: string;
  refreshToken: string;
  returnPath: string;
  adminEmail: string | null;
  adminName: string | null;
  targetEmail: string | null;
  targetName: string | null;
  startedAt: string;
};

const STORAGE_KEY = "connectyhub.admin_impersonation_return.v1";

export function saveAdminImpersonationReturn(value: AdminImpersonationReturn) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function readAdminImpersonationReturn(): AdminImpersonationReturn | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AdminImpersonationReturn>;

    if (!parsed.accessToken || !parsed.refreshToken) {
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      returnPath: normalizeReturnPath(parsed.returnPath),
      adminEmail: parsed.adminEmail ?? null,
      adminName: parsed.adminName ?? null,
      targetEmail: parsed.targetEmail ?? null,
      targetName: parsed.targetName ?? null,
      startedAt: parsed.startedAt ?? new Date().toISOString(),
    };
  } catch {
    clearAdminImpersonationReturn();
    return null;
  }
}

export function clearAdminImpersonationReturn() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
}

function normalizeReturnPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/admin/clientes";
  }

  return value;
}
