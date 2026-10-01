/** Display the accepted contract without changing the technical resource plan. */
export type CustomPlanPresentation = {
  id: string; version: number; name: string; label: string;
  priceBrl: number; includedCredits: number; resourceLimits: Record<string, number>;
};

export function readCustomPlan(metadata: unknown): CustomPlanPresentation | null {
  if (!metadata || typeof metadata !== "object") return null;
  const terms = (metadata as Record<string, unknown>).commercial_terms;
  if (!terms || typeof terms !== "object") return null;
  const value = terms as Record<string, unknown>;
  if (typeof value.custom_contract_id !== "string" || !value.custom_contract_id) return null;
  return {
    id: value.custom_contract_id, version: Number(value.custom_contract_version ?? 1),
    name: typeof value.name === "string" ? value.name : "Contrato personalizado",
    label: "Personalizado", priceBrl: Number(value.price_brl ?? 0),
    includedCredits: Number(value.included_credits ?? 0),
    resourceLimits: (value.resource_limits ?? {}) as Record<string, number>,
  };
}
