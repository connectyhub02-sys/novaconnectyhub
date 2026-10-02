import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { agentConfig, buildVoiceAgentPrompt, voiceAgentCharge } from "../src/lib/voice-agents/service";

const rate = { connectyPricePerUnit: 192, minimumChargeCredits: 5 };

describe("voice agents", () => {
  it("charges per started second at 192 credits/minute, with the 5-credit minimum", () => {
    expect(voiceAgentCharge(60, null, rate).credits).toBe(192);
    expect(voiceAgentCharge(90, 0, rate).credits).toBe(288);
    expect(voiceAgentCharge(1, null, rate).credits).toBe(5);
  });

  it("uses the provider's total cost at the same 4x when it exceeds the per-minute base", () => {
    // 1 minute, provider reported US$ 0.12 (speech + LLM): 0.12 x 6 x 4 / 0.01 = 288 credits.
    const charge = voiceAgentCharge(60, 0.12, rate);
    expect(charge.credits).toBeCloseTo(288, 6);
    expect(charge.providerCostBrl).toBeCloseTo(0.72, 6);
    expect(voiceAgentCharge(60, 0.02, rate).credits).toBe(192);
  });

  it("keeps the agent identity and adds spoken-channel rules, honest about being AI", () => {
    const prompt = buildVoiceAgentPrompt({ id: "a", name: "Renata", persona_name: "Renata", prompt: "Você é Renata, da Loja X.", organization_id: "o" }, "Loja X");
    expect(prompt.startsWith("Você é Renata, da Loja X.")).toBe(true);
    expect(prompt).toContain("ATENDIMENTO POR VOZ");
    expect(prompt).toContain("inteligência artificial");
  });

  it("configures the provider agent with the chosen voice, language and maximum duration", () => {
    const config = agentConfig({ name: "Renata · voz", voice_id: "v1", first_message: "Olá", language: "pt", max_duration_seconds: 300 }, "p", "gemini-2.5-flash");
    expect(config.conversation_config.tts).toEqual({ voice_id: "v1", model_id: "eleven_flash_v2_5" });
    expect(config.conversation_config.conversation.max_duration_seconds).toBe(300);
    expect(config.conversation_config.agent.prompt.llm).toBe("gemini-2.5-flash");
  });

  it("registers the per-minute rate in the cost center from the provider's public price", () => {
    const sql = readFileSync("supabase/migrations/0187_voice_agents.sql", "utf8");
    expect(sql).toContain("'voice_agent_conversation'");
    expect(sql).toMatch(/'minute', 0\.48, 192, 4, 5/);
  });
});
