import { describe, expect, it } from 'vitest';
import { serverModuleHarness } from './helpers/server-module-harness';
import type { AiPriceCard } from '../src/lib/ai-api/operation-pricing';

const { priceAiUnits } = serverModuleHarness<typeof import('../src/lib/ai-api/operation-pricing')>('src/lib/ai-api/operation-pricing.ts');
const card: AiPriceCard = {
  input: { id: 'input', cost: 0.000009, credits: 0.0036 },
  output: { id: 'output', cost: 0.000054, credits: 0.0216 },
};

describe('Decimal credit settlement', () => {
  it('prices the observed reasoning-only response without a phantom microcredit', () => {
    const quote = priceAiUnits(card, { input: 16, output: 61 });
    expect(quote.credits).toBe(1.3752);
    expect(quote.breakdown.map(row => row.credits)).toEqual([0.0576, 1.3176]);
    expect(priceAiUnits(card, { output: 61, input: 16 }).credits).toBe(quote.credits);
  });

  it.each([
    [1.0000009999999999, 1.000001],
    [1.000001, 1.000001],
    [1.0000010000000001, 1.000002],
    [1e-7, 0.000001],
    [0.000001, 0.000001],
    [0.0000010000000001, 0.000002],
  ])('rounds %s upward without discarding a legitimate fraction', (rate, expected) => {
    expect(priceAiUnits({ input: { ...card.input, credits: rate } }, { input: 1 }, false).credits).toBe(expected);
  });

  it('sums exact decimal products before rounding, including fractional units and exponent notation', () => {
    const rates = { a: { ...card.input, credits: 4e-7 }, b: { ...card.input, credits: 0.000004 } };
    expect(priceAiUnits(rates, { a: 1, b: 0.1 }, false).credits).toBe(0.000001);
    expect(priceAiUnits({ a: { ...card.input, credits: 1e-7 } }, { a: 1e7 }, false).credits).toBe(1);
    expect(priceAiUnits({ a: { ...card.input, credits: 0.1 } }, { a: 0.2 }, false).breakdown[0].credits).toBe(0.02);
  });

  it('preserves the one-credit minimum, optional unminimumed quote and zero usage', () => {
    expect(priceAiUnits(card, { input: 16, output: 1 }).credits).toBe(1);
    expect(priceAiUnits(card, { input: 16, output: 1 }, false).credits).toBe(0.0792);
    expect(priceAiUnits(card, { input: 0, output: 0 }).credits).toBe(0);
  });
});
