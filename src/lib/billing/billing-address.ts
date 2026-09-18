import { record, text } from "@/lib/sales-catalog/card-input";

export const brazilStates = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;
export type BillingAddress = { postalCode: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string; country: string };
export const emptyBillingAddress: BillingAddress = { postalCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", country: "BR" };
export function parseBillingAddress(value: unknown): BillingAddress {
  const data = record(value);
  const address = Object.fromEntries(Object.keys(emptyBillingAddress).map(key => [key, text(data[key])])) as BillingAddress;
  address.postalCode = address.postalCode.replace(/\D/g, "");
  address.state = address.state.toUpperCase();
  address.country = address.country.toUpperCase();
  if (!/^\d{8}$/.test(address.postalCode) || /^0+$/.test(address.postalCode)) throw new Error("Informe um CEP com 8 dígitos.");
  if (address.street.length < 2 || address.street.length > 160) throw new Error("Informe o logradouro do endereço.");
  if (!/^\d{1,6}$/.test(address.number)) throw new Error("Informe o número do endereço (até 6 dígitos).");
  if (address.complement.length > 120) throw new Error("O complemento deve ter até 120 caracteres.");
  if (address.neighborhood.length < 2 || address.neighborhood.length > 100) throw new Error("Informe o bairro.");
  if (address.city.length < 2 || address.city.length > 100) throw new Error("Informe a cidade.");
  if (!brazilStates.some(state => state === address.state)) throw new Error("Selecione uma UF válida.");
  if (address.country !== "BR") throw new Error("Este checkout aceita endereços de faturamento no Brasil.");
  return address;
}
