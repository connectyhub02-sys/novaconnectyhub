import { expect, it } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
const message = (id: string, direction: string, text_content: string) => ({ id, direction, text_content, message_type: "text", payload: {}, occurred_at: "2026-09-13T12:00:00Z" });
it("ends generation at the active inbound even when later checkout messages were already stored", () => {
  const history = [message("before","outbound","Como posso ajudar?"),message("active","inbound","Quero trocar para cartão"),message("late","outbound","Acesse o pagamento abaixo")];
  const contents = runtimeHarness()("buildGeminiContents", history, "Quero trocar para cartão", "active", "Quero trocar para cartão");
  expect(contents).toEqual([
    { role: "model", parts: [{ text: "Como posso ajudar?" }] },
    { role: "user", parts: [{ text: "Quero trocar para cartão" }] },
  ]);
  expect(JSON.stringify(contents)).not.toContain("Acesse o pagamento abaixo");
});
it("appends the current input when the retained history ends with a model turn", () => {
  const contents = runtimeHarness()("buildGeminiContents", [message("old","outbound","Pedido preparado")], "Quero outro produto", "missing", "Quero outro produto");
  expect(contents).toEqual([
    { role: "model", parts: [{ text: "Pedido preparado" }] },
    { role: "user", parts: [{ text: "Quero outro produto" }] },
  ]);
});
it("preserves enriched quoted input once without duplicating an existing user turn", () => {
  const contents = runtimeHarness()("buildGeminiContents", [message("active","inbound","esse")], "esse", "active", "Resposta à oferta: esse");
  expect(contents).toEqual([{role:"user",parts:[{text:"Resposta à oferta: esse"}]}]);
});
