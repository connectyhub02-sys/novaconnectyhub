export function accountCreditBalance(balance: number, reserved: number, reference: number) {
  const available = Math.max(0, balance - reserved);
  const baseline = Math.max(0, reference);
  return {
    available,
    reference: baseline,
    remainingPercent: baseline > 0 ? Math.min(100, available / baseline * 100) : null,
    low: baseline > 0 && available <= baseline * 0.2,
  };
}
