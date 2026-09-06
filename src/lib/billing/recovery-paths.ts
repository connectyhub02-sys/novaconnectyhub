export function isBillingRecoveryPath(path: string) {
  return ["/dashboard/planos", "/dashboard/meus-produtos", "/api/dashboard/billing", "/api/dashboard/meus-produtos"]
    .some((prefix) => path === prefix || path.startsWith(prefix + "/"))
    || ["/api/dashboard/account", "/api/dashboard/account/security"].includes(path);
}
