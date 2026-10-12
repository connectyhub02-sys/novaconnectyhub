import { describe, expect, it } from "vitest";
import {
  mergeResponsibleHumansIntoBehaviorConfig,
  normalizeAgentResponsibleHumans,
  readAgentResponsibleHumans,
  serializeAgentResponsibleHuman,
  serializeAgentResponsibleHumans,
} from "../src/lib/agents/responsible-human";

const first = { name: "Responsável principal", phone: "5511999990001" };
const second = { name: "Segundo responsável", phone: "5511999990002" };
const third = { name: "Terceiro responsável", phone: "5511999990003" };
const oldBehavior = { humanHandoffNotificationNumbers: `${first.phone}\n${second.phone}\n${third.phone}`, humanHandoffNotifications: true, humanHandoffCooldownMinutes: 30 };

describe("agent responsible list persistence", () => {
  it("does not resurrect deleted contacts when saving and reopening, including subsequent behavior saves", () => {
    const saved = normalizeAgentResponsibleHumans([first], { requireAtLeastOne: true, requireName: true });
    const metadata = {
      responsible_humans: serializeAgentResponsibleHumans(saved),
      responsible_human: serializeAgentResponsibleHuman(saved[0]),
      whatsapp_behavior_config: mergeResponsibleHumansIntoBehaviorConfig(oldBehavior, saved),
    };
    const reopened = readAgentResponsibleHumans(JSON.parse(JSON.stringify(metadata)));
    expect(reopened.map(person => person.phone)).toEqual([first.phone]);
    expect(metadata.whatsapp_behavior_config.humanHandoffNotificationNumbers).toBe(first.phone);
    // A previously opened behavior editor may submit the old recipients again.
    expect(mergeResponsibleHumansIntoBehaviorConfig(oldBehavior, reopened)).toEqual({
      ...oldBehavior, humanHandoffNotificationNumbers: first.phone,
    });
  });

  it("uses the saved list ahead of stale singular and behavior fields", () => {
    expect(readAgentResponsibleHumans({
      responsible_humans: [first], responsible_human: second, whatsapp_behavior_config: oldBehavior,
    }).map(person => person.phone)).toEqual([first.phone]);
  });

  it("retains multiple explicitly selected responsibles and supports adding them again", () => {
    const selected = normalizeAgentResponsibleHumans([first, third, third]);
    expect(readAgentResponsibleHumans({ responsible_humans: serializeAgentResponsibleHumans(selected) })
      .map(person => person.phone)).toEqual([first.phone, third.phone]);
    expect(mergeResponsibleHumansIntoBehaviorConfig(oldBehavior, selected).humanHandoffNotificationNumbers)
      .toBe(`${first.phone}\n${third.phone}`);
  });

  it("keeps legacy-only agents readable until they are explicitly edited", () => {
    expect(readAgentResponsibleHumans({ responsible_human: first, whatsapp_behavior_config: oldBehavior })
      .map(person => person.phone)).toEqual([first.phone, second.phone, third.phone]);
  });

  it("honors the camelCase list without adding legacy contacts", () => {
    expect(readAgentResponsibleHumans({ responsibleHumans: [second], responsibleHuman: first })
      .map(person => person.phone)).toEqual([second.phone]);
  });

  it("honors explicit empty lists on reads and clears obsolete notification recipients", () => {
    expect(readAgentResponsibleHumans({ responsible_humans: [], responsible_human: first, whatsapp_behavior_config: oldBehavior })).toEqual([]);
    expect(mergeResponsibleHumansIntoBehaviorConfig(oldBehavior, [])).toEqual({
      ...oldBehavior, humanHandoffNotificationNumbers: "", humanHandoffNotifications: false,
    });
    // The edit form still requires at least one responsible.
    expect(() => normalizeAgentResponsibleHumans([], { requireAtLeastOne: true })).toThrow("pelo menos um");
  });
});
