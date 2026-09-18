import { record, text } from "@/lib/sales-catalog/card-input";
import { validateReplacementCardField } from "./replacement-card-input";

export type BillingContact = { name: string; email: string; phone: string; cpfCnpj: string; documentPreview?: string };
export const emptyBillingContact: BillingContact = { name: "", email: "", phone: "", cpfCnpj: "" };
export function parseBillingContact(value: unknown): BillingContact {
  const data = record(value);
  const result: BillingContact = { name: text(data.name), email: text(data.email), phone: text(data.phone).replace(/\D/g, ""), cpfCnpj: text(data.cpfCnpj).replace(/\D/g, "") };
  for (const key of ["name", "email", "phone", "cpfCnpj"] as const) {
    if (result[key]) { const error = validateReplacementCardField(key, result[key]); if (error) throw new Error(error); }
  }
  if (/^\*{3}\d{4}$/.test(text(data.documentPreview))) result.documentPreview = text(data.documentPreview);
  return result;
}
