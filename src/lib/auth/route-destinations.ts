export const ADMIN_HOME_PATH = "/admin";
export const CLIENT_HOME_PATH = "/dashboard";
export const CLIENT_PLANS_PATH = "/dashboard/planos";

export function normalizeInternalPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

export function resolveAuthenticatedEntryPath(input: {
  isPlatformAdmin: boolean | null | undefined;
  nextPath?: string | null;
  currentPath?: string | null;
  plan?: string | null;
}) {
  const nextPath = normalizeInternalPath(input.nextPath);

  if (input.isPlatformAdmin) {
    return nextPath && isAdminPath(nextPath) ? nextPath : ADMIN_HOME_PATH;
  }

  if (nextPath && !isAdminPath(nextPath)) {
    return nextPath;
  }

  if (input.currentPath === "/iniciar") {
    const plan = normalizePlanCode(input.plan);
    return plan ? `${CLIENT_PLANS_PATH}?plan=${encodeURIComponent(plan)}` : CLIENT_PLANS_PATH;
  }

  return CLIENT_HOME_PATH;
}

export function shouldRedirectPlatformAdminFromClientPage(pathname: string) {
  return pathname === CLIENT_HOME_PATH || pathname.startsWith(`${CLIENT_HOME_PATH}/`);
}

function isAdminPath(pathname: string) {
  return pathname === ADMIN_HOME_PATH || pathname.startsWith(`${ADMIN_HOME_PATH}/`);
}

function normalizePlanCode(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^[a-z0-9_-]{2,60}$/.test(normalized) ? normalized : null;
}
