// Promises about shipping in the agent's text are checked by the system, never trusted to the model's arithmetic.

const freeShippingClaim = /\b(?:frete\s+(?:(?:[ée]|fica|sai|vai\s+ser|ser[áa])\s+)?(?:gr[áa]tis|gratuito|por\s+nossa\s+conta|zerado|free)|sem\s+(?:custo\s+de\s+)?frete|isen[çc][ãa]o\s+(?:de|do)\s+frete|n[ãa]o\s+paga\s+(?:o\s+)?frete)/i;
const brl = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseBrl = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));

/** The order total written in a message ("Total ... R$ 503,80"), when there is one. */
export function readWrittenOrderTotal(text: string) {
  const match = text.match(/total[^\n]*?R\$\s*([\d.]+,\d{2})/i);
  return match ? parseBrl(match[1]) : null;
}

/** Free-shipping thresholds of the active shipping rules (e.g. "800" or "800,00"). */
export function readFreeShippingThresholds(rules: Array<{ active: boolean; freeShippingThreshold: string | null }> | null | undefined) {
  return (rules ?? []).filter(rule => rule.active && rule.freeShippingThreshold)
    .map(rule => Number(String(rule.freeShippingThreshold).replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")))
    .filter(value => Number.isFinite(value) && value > 0);
}

/**
 * A free-shipping promise stays only when the written total reaches the configured threshold. Otherwise the
 * sentence becomes what is true (how much is missing, and that shipping comes from the ZIP code). The order
 * and payment always use the real quote; this keeps the conversation from promising what checkout won't honor.
 */
export function correctFreeShippingClaim(text: string, thresholds: number[], recentTexts: string[] = []) {
  if (!freeShippingClaim.test(text)) return text;
  const minimum = thresholds.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b)[0] ?? null;
  const total = readWrittenOrderTotal(text) ?? recentTexts.map(readWrittenOrderTotal).find((value): value is number => value !== null) ?? null;
  if (minimum !== null && total !== null && total >= minimum) return text;
  const truth = minimum === null
    ? "O frete eu calculo certinho com o seu CEP."
    : total === null
      ? `O frete fica grátis a partir de R$ ${brl(minimum)} em algumas regiões; o seu eu confirmo certinho com o CEP.`
      : `O frete fica grátis a partir de R$ ${brl(minimum)} em algumas regiões; neste pedido faltam R$ ${brl(minimum - total)}. O frete eu calculo certinho com o seu CEP.`;
  let replaced = false;
  return text.split("\n").map(line => line.split(/(?<=[.!?])\s+/).map(sentence => {
    if (!freeShippingClaim.test(sentence)) return sentence;
    if (replaced) return "";
    replaced = true;
    return truth;
  }).filter(Boolean).join(" ")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
