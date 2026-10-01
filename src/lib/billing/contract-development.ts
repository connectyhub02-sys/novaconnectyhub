export type ContractDevelopmentScope = {
  project_name: string;
  description: string;
  deliverables: string;
  recurring_services: string;
  exclusions: string;
  additional_fields: Array<{ label: string; value: string }>;
};

export const developmentScopeFields = [
  { key: "project_name", label: "Nome do projeto", maxLength: 160, required: true },
  { key: "description", label: "Descrição e objetivo do projeto", maxLength: 6000, required: true },
  { key: "deliverables", label: "Escopo e entregas previstas", maxLength: 6000, required: false },
  { key: "recurring_services", label: "Serviços incluídos na mensalidade", maxLength: 6000, required: false },
  { key: "exclusions", label: "Itens fora do escopo e condições", maxLength: 6000, required: false },
] as const;

export const maxDevelopmentAdditionalFields = 12;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Informe os dados do desenvolvimento contratado.");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number, required = false) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new Error(`${label}: informe um texto.`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`Preencha: ${label}.`);
  if (normalized.length > max) throw new Error(`${label}: use até ${max} caracteres.`);
  return normalized;
}

/** Optional for existing contracts. All content is customer-visible plain text. */
export function parseContractDevelopmentScope(value: unknown): ContractDevelopmentScope | null {
  if (value === undefined || value === null) return null;
  const row = record(value);
  const allowedKeys = new Set<string>([...developmentScopeFields.map(field => field.key), "additional_fields"]);
  if (Object.keys(row).some(key => !allowedKeys.has(key))) throw new Error("Campo de desenvolvimento desconhecido.");
  const fields = Object.fromEntries(developmentScopeFields.map(field => [field.key, text(row[field.key], field.label, field.maxLength, field.required)]));
  const additional = row.additional_fields ?? [];
  if (!Array.isArray(additional) || additional.length > maxDevelopmentAdditionalFields) {
    throw new Error(`Adicione até ${maxDevelopmentAdditionalFields} campos ao projeto.`);
  }
  const labels = new Set<string>();
  const additional_fields = additional.map(item => {
    const entry = record(item);
    if (Object.keys(entry).some(key => key !== "label" && key !== "value")) throw new Error("Campo adicional inválido.");
    const label = text(entry.label, "Nome do campo adicional", 100, true);
    const value = text(entry.value, label, 2000, true);
    const normalizedLabel = label.toLocaleLowerCase("pt-BR");
    if (labels.has(normalizedLabel)) throw new Error("Use nomes diferentes para os campos adicionais.");
    labels.add(normalizedLabel);
    return { label, value };
  });
  return { ...fields, additional_fields } as ContractDevelopmentScope;
}

/** Read only the supplied version/snapshot; never substitute a newer proposal. */
export function readContractDevelopmentScope(terms: unknown): ContractDevelopmentScope | null {
  if (!terms || typeof terms !== "object" || Array.isArray(terms)) return null;
  return parseContractDevelopmentScope((terms as Record<string, unknown>).development_scope);
}
