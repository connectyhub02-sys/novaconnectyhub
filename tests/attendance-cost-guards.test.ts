import { describe, expect, it } from "vitest";
import { isLowSignalLeadText, onlyAcknowledgementsSinceLastReply } from "../src/lib/whatsapp/low-signal";
import { creditsNeededForReply } from "../src/lib/billing/reply-estimate";
import { orderPromptSectionsForCache } from "../src/lib/whatsapp/prompt-sections";

describe("attendance cost guards", () => {
  it("treats only short acknowledgements as low signal", () => {
    for (const text of ["legal", "vou analisar", "Valeu irmão!", "blz 👍", "ok, depois te aviso", "kkkk", "Bom dia"]) expect(isLowSignalLeadText(text)).toBe(true);
    for (const text of ["não", "sim", "quanto custa?", "entrega no MS", "quero 2", "fiquei sem grana", "Rua das Flores 10", "tem algo mais barato ai", ""]) expect(isLowSignalLeadText(text)).toBe(false);
  });

  it("skips analysis only when every new lead message since the reply is an acknowledgement", () => {
    const reply = { direction: "outbound", message_type: "text", text_content: "Analisa com calma." };
    expect(onlyAcknowledgementsSinceLastReply([reply, { direction: "inbound", message_type: "Conversation", text_content: "legal" }, { direction: "inbound", message_type: "Conversation", text_content: "vou analisar" }])).toBe(true);
    expect(onlyAcknowledgementsSinceLastReply([reply, { direction: "inbound", message_type: "Conversation", text_content: "legal" }, { direction: "inbound", message_type: "Conversation", text_content: "fiquei sem grana" }])).toBe(false);
    expect(onlyAcknowledgementsSinceLastReply([reply, { direction: "inbound", message_type: "AudioMessage", text_content: "ok" }])).toBe(false);
    expect(onlyAcknowledgementsSinceLastReply([reply])).toBe(false);
  });

  it("requires a bounded balance before generating a reply", () => {
    expect(creditsNeededForReply(78)).toBe(78);
    expect(creditsNeededForReply(null)).toBe(40);
    expect(creditsNeededForReply(2)).toBe(10);
    expect(creditsNeededForReply(900)).toBe(150);
  });

  it("keeps the clone memory and knowledge after the stable prefix", () => {
    const keys = ["global", "agent_prompt", "clone_style", "channel", "knowledge", "catalog", "lead_memory"];
    const ordered = orderPromptSectionsForCache(keys.map(key => ({ key, lines: [key] }))).map(section => section.key);
    expect(ordered).toEqual(["global", "agent_prompt", "channel", "catalog", "clone_style", "knowledge", "lead_memory"]);
  });
});
