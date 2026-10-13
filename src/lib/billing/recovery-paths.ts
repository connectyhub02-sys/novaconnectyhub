export function isBillingRecoveryPath(path: string) {
  return isClientBillingRecoveryPage(path) || ["/api/dashboard/billing", "/api/dashboard/meus-produtos"]
    .some((prefix) => path === prefix || path.startsWith(prefix + "/"))
    || ["/api/dashboard/account", "/api/dashboard/account/security", "/api/dashboard/notification-sender", "/api/dashboard/infrastructure"].includes(path);
}

export function isClientBillingRecoveryPage(path: string) {
  return ["/dashboard/planos", "/dashboard/meus-produtos", "/dashboard/minha-conta", "/dashboard/infraestrutura"].some(prefix => path === prefix || path.startsWith(prefix + "/"));
}
