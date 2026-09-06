export type CheckoutCard = { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string };
export type CheckoutCardHolder = { name: string; email: string; cpfCnpj: string; postalCode: string; addressNumber: string; phone: string };

export function parseCheckoutCard(value: unknown, now = new Date()): CheckoutCard {
  const data = record(value);
  const number = digits(data.number);
  const ccv = digits(data.ccv);
  const holderName = text(data.holderName);
  const month = Number(digits(data.expiryMonth));
  const yearText = digits(data.expiryYear);
  const year = Number(yearText.length === 2 ? `20${yearText}` : yearText);
  let sum = 0;
  for (let i = number.length - 1, alternate = false; i >= 0; i--, alternate = !alternate) {
    let digit = Number(number[i]);
    if (alternate) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
  }
  if (!/^\d{13,19}$/.test(number) || /^(\d)\1+$/.test(number) || sum % 10) throw new Error("Confira o número do cartão.");
  if (holderName.length < 2 || holderName.length > 120) throw new Error("Informe o nome impresso no cartão.");
  if (month < 1 || month > 12 || year < now.getFullYear() || year > now.getFullYear() + 30 || (year === now.getFullYear() && month < now.getMonth() + 1)) throw new Error("Confira a validade do cartão.");
  if (!/^\d{3,4}$/.test(ccv)) throw new Error("Confira o código de segurança do cartão.");
  return { number, holderName, expiryMonth: String(month).padStart(2, "0"), expiryYear: String(year), ccv };
}

export function parseCheckoutCardHolder(value: unknown): CheckoutCardHolder {
  const data = record(value);
  const phone = digits(data.phone).replace(/^55(?=\d{10,11}$)/, "");
  const holder = { name: text(data.name), email: text(data.email), cpfCnpj: digits(data.cpfCnpj), postalCode: digits(data.postalCode), addressNumber: text(data.addressNumber), phone };
  if (holder.name.length < 2 || holder.name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(holder.email) || !/^(\d{11}|\d{14})$/.test(holder.cpfCnpj) || !/^\d{8}$/.test(holder.postalCode) || !/^\d{1,6}$/.test(holder.addressNumber) || !/^\d{10,11}$/.test(phone)) throw new Error("Confira nome, e-mail, CPF/CNPJ, telefone, CEP e número do endereço do titular.");
  return holder;
}

export function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function digits(value: unknown) { return text(value).replace(/\D/g, ""); }
