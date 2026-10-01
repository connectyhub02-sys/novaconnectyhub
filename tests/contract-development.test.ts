import { describe, expect, it } from "vitest";
import { parseContractDevelopmentScope, readContractDevelopmentScope } from "@/lib/billing/contract-development";
import { snapshotPlanCommercialTerms } from "@/lib/billing/commercial-terms";

const scope = { project_name: " Plataforma Vision ", description: "Vendas e atendimento de barcos, aviões, carros importados e imóveis.", additional_fields: [{ label: "Critérios de aceite", value: "Validar cada entrega com o cliente." }] };

describe("development terms", () => {
  it("keeps legacy contracts optional and normalizes customer-visible scope", () => {
    expect(parseContractDevelopmentScope(undefined)).toBeNull();
    expect(readContractDevelopmentScope({ name: "Antigo" })).toBeNull();
    expect(parseContractDevelopmentScope(scope)).toMatchObject({ project_name: "Plataforma Vision", deliverables: "", additional_fields: scope.additional_fields });
  });
  it.each([
    { ...scope, project_name: " " },
    { ...scope, description: "" },
    { ...scope, description: "a".repeat(6001) },
    { ...scope, recurring_services: { price: 10 } },
    { ...scope, additional_fields: Array.from({ length: 13 }, (_, index) => ({ label: String(index), value: "Texto" })) },
    { ...scope, additional_fields: [{ label: "Prazo", value: "" }] },
    { ...scope, additional_fields: [{ label: "Prazo", value: "A" }, { label: " prazo ", value: "B" }] },
    { ...scope, private_notes: "Não exibir" },
  ])("rejects incomplete, ambiguous or oversized scope: %j", value => {
    expect(() => parseContractDevelopmentScope(value)).toThrow();
  });
  it("snapshots scope without changing the negotiated price or credits", () => {
    const development_scope = parseContractDevelopmentScope(scope);
    const snapshot = snapshotPlanCommercialTerms({ custom_contract_id: "contract", custom_contract_version: 2, name: "Contrato", monthly_price_brl: 10000, included_credits: 5000, development_scope });
    expect(snapshot).toMatchObject({ price_brl: 10000, included_credits: 5000, development_scope });
    expect(readContractDevelopmentScope(snapshot)).toEqual(development_scope);
    expect(snapshotPlanCommercialTerms({ monthly_price_brl: 497 })).not.toHaveProperty("development_scope");
  });
});
