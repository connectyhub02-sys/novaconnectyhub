import { createHash } from "node:crypto";

// Named slices of the agent system instruction. Joining them must produce exactly
// the same text as the former single array, so measuring never changes the prompt.
export type PromptSection = { key: string; lines: string[] };

export function joinPromptSections(sections: PromptSection[]) {
  return sections.flatMap(section => section.lines).join("\n");
}

// Sections that change from one message to the next (lead state, cart, emotion,
// agenda result). Everything else is stable for an agent and conversation.
// clone_style and knowledge are rewritten by the learning tasks after each reply:
// kept early, they broke the cached prefix below the provider's 4,096-token minimum.
export const volatilePromptSectionKeys = new Set([
  "company_context", "lead_memory", "cross_agent", "registered_client", "checkout_rules",
  "store_context", "conduct", "conversation_dynamics", "commerce_conversation",
  "clone_style", "knowledge",
]);

/**
 * Same sections and text, stable ones first: the provider's implicit cache reuses
 * an identical prefix at a tenth of the input price.
 */
export function orderPromptSectionsForCache(sections: PromptSection[]) {
  return [
    ...sections.filter(section => !volatilePromptSectionKeys.has(section.key)),
    ...sections.filter(section => volatilePromptSectionKeys.has(section.key)),
  ];
}

/** Character counts only: no prompt text leaves this function. */
export function measurePromptSections(sections: PromptSection[]) {
  const sizes: Record<string, number> = {};
  for (const section of sections) {
    const chars = section.lines.reduce((total, line) => total + line.length + 1, 0);
    sizes[section.key] = (sizes[section.key] ?? 0) + chars;
  }
  return sizes;
}

/**
 * Short fingerprint per section, so consecutive replies show which section changed
 * and broke the provider's cached prefix. One-way: no prompt text is recoverable.
 */
export function hashPromptSections(sections: PromptSection[]) {
  const hashes: Record<string, string> = {};
  for (const section of sections) hashes[section.key] = createHash("sha256").update(JSON.stringify(section.lines)).digest("hex").slice(0, 10);
  return hashes;
}
