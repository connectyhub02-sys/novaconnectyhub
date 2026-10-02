// Named slices of the agent system instruction. Joining them must produce exactly
// the same text as the former single array, so measuring never changes the prompt.
export type PromptSection = { key: string; lines: string[] };

export function joinPromptSections(sections: PromptSection[]) {
  return sections.flatMap(section => section.lines).join("\n");
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
