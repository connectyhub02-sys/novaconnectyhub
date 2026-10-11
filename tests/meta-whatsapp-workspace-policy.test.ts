import { describe, it, expect } from "vitest";
import {
  campaignPhones,
  templateParameters,
  replyButtons,
  type OfficialTemplate,
} from "../src/lib/meta/whatsapp-workspace-policy";
import { templateInput } from "../src/lib/meta/whatsapp-policy";
const model = {
  id: "1",
  name: "pedido",
  status: "APPROVED",
  language: "pt_BR",
  category: "UTILITY",
  components: [
    { type: "BODY", text: "Olá {{1}}, pedido {{2}}. Obrigado, {{1}}!" },
  ],
} satisfies OfficialTemplate;
describe("official campaign and interactive message policy", () => {
  it("renders repeated positional variables and creates Meta examples", () => {
    const result = templateParameters(model, ["Ana", "123"]);
    expect(result.text).toBe("Olá Ana, pedido 123. Obrigado, Ana!");
    expect(result.components[0].parameters).toHaveLength(2);
    const input = templateInput({
      name: "pedido",
      text: model.components[0].text,
      examples: ["Ana", "123"],
      buttons: ["Ajuda"],
    });
    expect(input.components[0]).toMatchObject({
      example: { body_text: [["Ana", "123"]] },
    });
  });
  it("fails closed on missing values, unsupported components and variable gaps", () => {
    expect(() => templateParameters(model, ["Ana"])).toThrow();
    expect(() =>
      templateParameters(
        { ...model, components: [{ type: "BODY", text: "{{2}}" }] },
        ["x"],
      ),
    ).toThrow();
    expect(() =>
      templateParameters(
        { ...model, components: [{ type: "HEADER", format: "IMAGE" }] },
        [],
      ),
    ).toThrow();
    expect(() =>
      templateParameters(
        {
          ...model,
          components: [
            {
              type: "BUTTONS",
              buttons: [
                { type: "URL", text: "Site", url: "https://example.com" },
              ],
            },
          ],
        },
        [],
      ),
    ).toThrow();
  });
  it("deduplicates formatting only, never inventing Brazilian phone aliases", () => {
    expect(
      campaignPhones("+55 (11) 98765-4321\n5511987654321;551187654321"),
    ).toEqual(["5511987654321", "551187654321"]);
    expect(() => campaignPhones("telefone\n5511987654321")).toThrow();
    expect(() => campaignPhones("5511987654321\n".repeat(10001))).toThrow();
  });
  it("enforces reply button constraints", () => {
    expect(replyButtons(["Quero conhecer", "SAIR"])[1].reply.title).toBe(
      "SAIR",
    );
    expect(() => replyButtons(["Sim", " Sim "])).toThrow();
    expect(() => replyButtons(["1", "2", "3", "4"])).toThrow();
  });
});
