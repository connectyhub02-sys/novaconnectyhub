// A valid account without a company is an onboarding state, not a billing failure.
export function workspaceRequiredBillingAccess() {
  return {
    organizationId: null, planCode: null, organizationStatus: null, state: "inactive" as const,
    canUseBillableFeatures: false, balanceCredits: 0, trialStartsAt: null, trialEndsAt: null,
    trialDaysTotal: 0, trialDaysRemaining: null, includedCredits: 0, usedCredits: 0,
    lowCreditThreshold: 0, bannerTone: "amber" as const,
    bannerTitle: "Crie sua primeira empresa",
    bannerDescription: "Sua conta está criada. Escolha o nome da empresa para organizar sua operação.",
    ctaLabel: "Criar empresa", ctaHref: "/dashboard/empresa",
  };
}

export function isFirstCompanySetupRequest(pathname: string, method: string) {
  return (method === "GET" && ["/dashboard/empresa", "/api/dashboard/companies", "/api/dashboard/agents"].includes(pathname))
    || (method === "POST" && pathname === "/api/dashboard/companies");
}
