export type NotificationSenderPreference = { mode: "automatic" | "agent" | "platform"; agent_id: string | null };
export type NotificationAgent = { id: string; name: string; available: boolean };

export function chooseNotificationAgent(preference: NotificationSenderPreference, agents: NotificationAgent[]) {
  if (preference.mode === "platform") return null;
  if (preference.mode === "agent") return agents.find(agent => agent.id === preference.agent_id && agent.available) ?? null;
  return agents.find(agent => agent.available) ?? null;
}

// A second sender is safe only when the first attempt definitely was not delivered.
export async function deliverWithPlatformFallback<T, S extends { kind: "customer" | "platform" }>(input: {
  sender: S;
  send: (sender: S) => Promise<T>;
  fallback: () => Promise<S | null>;
  isDefinitiveFailure: (error: unknown) => boolean;
}) {
  try { return { result: await input.send(input.sender), sender: input.sender, fallbackUsed: false }; }
  catch (error) {
    if (input.sender.kind !== "customer" || !input.isDefinitiveFailure(error)) throw error;
    const fallback = await input.fallback();
    if (!fallback) throw error;
    return { result: await input.send(fallback), sender: fallback, fallbackUsed: true };
  }
}
