import { billingTermsLabel, readCommercialTerms } from "./commercial-terms";
import { campaignPriceNotice, type CampaignPricing } from "@/lib/commerce/campaigns";

export function parseDiscountPercent(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent >= 100 || Math.abs(Math.round(percent * 100) - percent * 100) > 0.000001) {
    throw new Error("Informe um desconto entre 0 e 99,99%, com até duas casas decimais.");
  }
  return percent;
}

export function discountedPlanAmount(amount: number, percent: number) {
  const cents = Math.round(amount * 100);
  return (cents - Math.round(cents * percent / 100)) / 100;
}

export function previewPlanDiscounts(plan: Record<string, unknown>, firstPurchase = true) {
  const terms = readCommercialTerms(plan);
  const listPrice = Number(plan.monthly_price_brl ?? plan.monthlyPriceBrl ?? 0);
  const firstPercent = parseDiscountPercent(plan.first_purchase_discount_percent ?? plan.firstPurchaseDiscountPercent);
  const annualPercent = terms.billingCycle === "recurring" && terms.billingInterval === "year"
    ? parseDiscountPercent(plan.annual_discount_percent ?? plan.annualDiscountPercent) : 0;
  const effectivePercent = Math.max(annualPercent, firstPurchase ? firstPercent : 0);
  return {
    listPrice,
    firstAmount: discountedPlanAmount(listPrice, effectivePercent),
    renewalAmount: discountedPlanAmount(listPrice, annualPercent),
    annualPercent,
    firstPercent,
  };
}

type PricedIntent = {
  checkoutKind?: string;
  plan: { monthly_price_brl: number | string | null };
  payment: { payload: Record<string, unknown> | null };
};

/** Invoice-specific promotions never leak from a previous cycle into a renewal. */
export function readCheckoutPlanAmounts(intent: PricedIntent) {
  const campaign = intent.payment.payload?.campaign_pricing as CampaignPricing | undefined;
  const renewalAmount = Number(campaign?.next_price_brl ?? intent.plan.monthly_price_brl ?? 0);
  const pricing = campaign ?? (intent.checkoutKind === "initial" ? intent.payment.payload?.plan_pricing as Record<string, unknown> | undefined : undefined);
  const amount = pricing ? Number(pricing.price_brl) : renewalAmount;
  const listAmount = pricing ? Number(pricing.list_price_brl) : amount;
  if (![amount, listAmount, renewalAmount].every(Number.isFinite) || amount < 0 || listAmount < amount) {
    throw new Error("Não foi possível conferir o desconto deste checkout.");
  }
  return { amount, listAmount, renewalAmount, discountAmount: Math.round((listAmount - amount) * 100) / 100,
    firstPurchaseDiscountPercent: Number((pricing as Record<string,unknown> | undefined)?.first_purchase_discount_percent ?? 0) };
}

export function planDiscountNotice(metadata: Record<string, unknown>) {
  if (metadata.campaign_pricing) return campaignPriceNotice(metadata.campaign_pricing as CampaignPricing) + (metadata.checkout_kind === "plan_change" && Date.parse(String(metadata.previous_current_period_end)) > Date.now() ? " O tempo restante já pago no plano anterior será acrescentado ao período do novo plano após a confirmação." : "");
  if (metadata.checkout_kind !== "initial") return "";
  const pricing = metadata.plan_pricing as Record<string, unknown> | undefined;
  if (!pricing || Number(pricing.first_purchase_discount_percent ?? 0) <= 0) return "";
  const terms = readCommercialTerms(metadata.commercial_terms);
  if (terms.billingCycle === "one_time") return "O desconto de primeira compra vale somente para esta compra. Este plano é de pagamento único.";
  const renewal = Number(pricing.renewal_price_brl);
  if (!Number.isFinite(renewal) || renewal <= 0) return "";
  const money = renewal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `O desconto de ${pricing.first_purchase_discount_percent}% vale somente nesta primeira cobrança. A renovação ${billingTermsLabel(terms).toLowerCase()} do plano será de ${money}, mais os adicionais recorrentes escolhidos.`;
}
