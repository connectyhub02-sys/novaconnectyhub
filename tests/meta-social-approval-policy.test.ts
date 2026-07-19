import { describe, expect, it } from "vitest";
import {
  buildMetaSocialSuggestedReply,
  normalizeMetaSocialApprovalText,
} from "../src/lib/meta/social-approval-policy";

describe("Meta social approval policy", () => {
  it("builds a private-message draft for direct channels", () => {
    const reply = buildMetaSocialSuggestedReply({
      channel: "instagram_direct",
      leadName: "Maria Cliente",
      messageText: "Qual o valor?",
    });

    expect(reply).toContain("Maria");
    expect(reply).toContain("valores certos");
  });

  it("keeps public comment drafts focused on private continuation", () => {
    const reply = buildMetaSocialSuggestedReply({
      channel: "facebook_comments",
      messageText: "Tenho interesse",
    });

    expect(reply).toContain("mensagem privada");
    expect(reply).not.toContain("valores certos");
  });

  it("requires reviewed response text before approval", () => {
    expect(() => normalizeMetaSocialApprovalText("   ")).toThrow("Informe a resposta aprovada.");
    expect(normalizeMetaSocialApprovalText("  Obrigado pelo contato.  ")).toBe("Obrigado pelo contato.");
  });
});
