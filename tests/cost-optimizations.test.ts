import { describe, expect, it } from "vitest";
import { appliesToAgent, loadAgentCostOptimizations, parseAgentCostOptimizations, resetAgentCostOptimizationsCache } from "../src/lib/billing/cost-optimizations";
import { joinPromptSections, orderPromptSectionsForCache, volatilePromptSectionKeys } from "../src/lib/whatsapp/prompt-sections";
import { buildCostCenterMonth } from "../src/lib/billing/cost-center-report";

const agent = "11111111-1111-4111-8111-111111111111";

describe("cache-friendly prompt order", () => {
  it("keeps every line and moves only volatile sections to the end, in their original order", () => {
    const sections = [
      { key: "global", lines: ["G", ""] }, { key: "company_context", lines: ["Lead: Ana"] }, { key: "agent_prompt", lines: ["P"] },
      { key: "conduct", lines: ["Emoção"] }, { key: "catalog", lines: ["Itens"] }, { key: "output_rules", lines: ["Saída"] },
    ];
    const ordered = orderPromptSectionsForCache(sections);
    expect(ordered.map(section => section.key)).toEqual(["global", "agent_prompt", "catalog", "output_rules", "company_context", "conduct"]);
    expect(joinPromptSections(ordered).split("\n").sort()).toEqual(joinPromptSections(sections).split("\n").sort());
    expect(volatilePromptSectionKeys.has("catalog")).toBe(false);
  });

  it("is reflected in the runtime: same sections, optional order, measured per reply", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/lib/whatsapp/agent-runtime.ts", "utf8");
    expect(source).toContain("cacheFriendlyPrompt: appliesToAgent(costOptimizations.cacheFriendlyPrompt, costOptimizations, agent.id),");
    expect(source).toContain("const promptSections = orderPromptSections(buildSystemInstructionSections(input), input.cacheFriendlyPrompt);");
    expect(source).toContain('promptOrder: input.response.promptOrder ?? "default"');
  });
});

describe("agent cost optimization switches", () => {
  it("accepts only known scopes and valid agent ids", () => {
    expect(parseAgentCostOptimizations({ cacheFriendlyPrompt: "all", pilotAgentIds: [agent, "x", 3] })).toEqual({ cacheFriendlyPrompt: "all", explicitCache: "off", pilotAgentIds: [agent] });
    expect(parseAgentCostOptimizations({ cacheFriendlyPrompt: "maybe" }).cacheFriendlyPrompt).toBe("off");
    expect(parseAgentCostOptimizations({ explicitCache: "pilot" }).explicitCache).toBe("pilot");
    expect(parseAgentCostOptimizations(null)).toEqual({ cacheFriendlyPrompt: "off", explicitCache: "off", pilotAgentIds: [] });
    const pilot = { cacheFriendlyPrompt: "pilot" as const, explicitCache: "off" as const, pilotAgentIds: [agent] };
    expect(appliesToAgent("pilot", pilot, agent)).toBe(true);
    expect(appliesToAgent("pilot", pilot, "other")).toBe(false);
    expect(appliesToAgent("off", pilot, agent)).toBe(false);
    expect(appliesToAgent("all", pilot, null)).toBe(true);
  });

  it("reads once a minute and never breaks the attendance when the settings cannot be read", async () => {
    resetAgentCostOptimizationsCache();
    let reads = 0;
    const client = (value: unknown, fail = false) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { reads++; if (fail) throw new Error("down"); return { data: { value }, error: null }; } }) }) }) });
    expect((await loadAgentCostOptimizations(client({ cacheFriendlyPrompt: "all" }) as never, 0)).cacheFriendlyPrompt).toBe("all");
    expect((await loadAgentCostOptimizations(client({ cacheFriendlyPrompt: "off" }) as never, 30_000)).cacheFriendlyPrompt).toBe("all");
    expect(reads).toBe(1);
    expect((await loadAgentCostOptimizations(client(null, true) as never, 61_000)).cacheFriendlyPrompt).toBe("off");
    resetAgentCostOptimizationsCache();
  });
});

describe("prompt order report", () => {
  it("shows cache share, credits per reply and humanity score per order", () => {
    const month = buildCostCenterMonth("2026-10", {
      from: "", to: "", usage: [], credit_flow: [], settings: {}, fixed_costs: [],
      cash: { invoices_paid_brl: 0, invoices_paid: 0, payments_without_invoice_brl: 0, refunded_brl: 0 },
      snapshot: { wallet_balance_credits: 0, wallet_reserved_credits: 0, connected_instances: 0, paying_organizations: 0 },
      prompt_orders: [
        { prompt_order: "cache", replies: 10, input_tokens: 200000, cached_tokens: 150000, credits: 300, scored_replies: 4, avg_humanity_score: 82.5 },
        { prompt_order: "default", replies: 20, input_tokens: 400000, cached_tokens: 40000, credits: 1400, scored_replies: 0, avg_humanity_score: null },
      ],
    });
    expect(month.promptOrders).toEqual([
      { order: "cache", label: "Organizado para cache", replies: 10, cachedShare: 0.75, creditsPerReply: 30, scoredReplies: 4, avgHumanityScore: 82.5 },
      { order: "default", label: "Ordem atual", replies: 20, cachedShare: 0.1, creditsPerReply: 70, scoredReplies: 0, avgHumanityScore: null },
    ]);
  });
});
