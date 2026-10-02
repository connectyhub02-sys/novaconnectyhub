export const CONNECTY_CREDIT_UNIT_BRL = 0.01;
export const INCLUDED_CREDIT_TARGET_MARKUP = 4;
/** R$/US$ used when tariff costs were registered; the live rate is an admin setting. */
export const TARIFF_REFERENCE_USD_BRL = 6;
/** Gemini bills input reused from its implicit cache at 10% of the input price (official table, 2026). */
export const GEMINI_CACHED_INPUT_PRICE_RATIO = 0.1;

export type PlanCreditEconomicsInput = {
  monthlyPriceBrl: number;
  includedCredits: number;
  creditUnitBrl?: number;
  targetMarkup?: number;
};

export type PlanCreditEconomics = {
  creditUnitBrl: number;
  targetMarkup: number;
  includedCreditValueBrl: number;
  includedCreditTargetCostBrl: number;
  planGrossMarginBeforeFixedCostsBrl: number;
  planGrossMarginBeforeFixedCostsPercent: number;
};

export function calculatePlanCreditEconomics({
  monthlyPriceBrl,
  includedCredits,
  creditUnitBrl = CONNECTY_CREDIT_UNIT_BRL,
  targetMarkup = INCLUDED_CREDIT_TARGET_MARKUP,
}: PlanCreditEconomicsInput): PlanCreditEconomics {
  const includedCreditValueBrl = includedCredits * creditUnitBrl;
  const includedCreditTargetCostBrl = targetMarkup > 0 ? includedCreditValueBrl / targetMarkup : includedCreditValueBrl;
  const planGrossMarginBeforeFixedCostsBrl = monthlyPriceBrl - includedCreditTargetCostBrl;
  const planGrossMarginBeforeFixedCostsPercent =
    monthlyPriceBrl > 0 ? planGrossMarginBeforeFixedCostsBrl / monthlyPriceBrl : 0;

  return {
    creditUnitBrl,
    targetMarkup,
    includedCreditValueBrl,
    includedCreditTargetCostBrl,
    planGrossMarginBeforeFixedCostsBrl,
    planGrossMarginBeforeFixedCostsPercent,
  };
}
