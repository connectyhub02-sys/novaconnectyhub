import type { ClientLeadActivity, ClientLeadCrmWorkspace, ClientLeadMessage, ClientLeadRecord } from "./leads-crm";
import { mergeLeadTechnicalTracking } from "./lead-technical-profile";

export function mergeConversationMessages(primary: ClientLeadMessage[], preserved: ClientLeadMessage[]) {
  const seen = new Set<string>();
  return [...primary, ...preserved].filter((message) => {
    const key = message.providerMessageId
      ? `${message.provider}:${message.providerChatId}:${message.providerMessageId}`
      : message.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => timestamp(a.occurredAt) - timestamp(b.occurredAt) || a.id.localeCompare(b.id));
}

export function mergeLeadActivities(primary: ClientLeadActivity[], preserved: ClientLeadActivity[]) {
  const byId = new Map(preserved.map((activity) => [activity.id, activity]));
  for (const activity of primary) byId.set(activity.id, activity);
  return Array.from(byId.values()).sort((a, b) => timestamp(b.occurredAt) - timestamp(a.occurredAt));
}

export function mergeLiveLeadRecord(current: ClientLeadRecord, next: ClientLeadRecord): ClientLeadRecord {
  const currentConversations = new Map(current.leadFile.conversations.map((conversation) => [conversation.id, conversation]));
  const conversations = next.leadFile.conversations.map((conversation) => {
    const previous = currentConversations.get(conversation.id);
    const messages = mergeConversationMessages(conversation.messages, previous?.messages ?? []);
    return { ...conversation, messages, messageCount: messages.length };
  });
  const messages = conversations.find((conversation) => conversation.id === next.conversation.id)?.messages
    ?? mergeConversationMessages(next.conversation.messages, current.conversation.id === next.conversation.id ? current.conversation.messages : []);
  const trackingEvents = mergeLeadActivities(next.leadFile.trackingEvents, current.leadFile.trackingEvents);
  const intelligenceEvents = mergeLeadActivities(next.leadFile.intelligenceEvents, current.leadFile.intelligenceEvents);
  return {
    ...next,
    conversation: { ...next.conversation, messages, messageCount: messages.length },
    activities: mergeLeadActivities(next.activities, current.activities),
    leadFile: {
      ...next.leadFile, conversations,
      firstSeenAt: timelineDate(current.leadFile.firstSeenAt, next.leadFile.firstSeenAt, "first"),
      lastSeenAt: timelineDate(current.leadFile.lastSeenAt, next.leadFile.lastSeenAt, "last"),
      messageCount: conversations.reduce((total, conversation) => total + conversation.messages.length, 0),
      trackingEvents, trackingEventCount: trackingEvents.length,
      intelligenceEvents, intelligenceEventCount: intelligenceEvents.length,
    },
    technical: { ...next.technical, ...mergeLeadTechnicalTracking(next.technical, current.technical) },
  };
}

export function mergeLiveLeadWorkspace(current: ClientLeadCrmWorkspace, next: ClientLeadCrmWorkspace): ClientLeadCrmWorkspace {
  const byId = new Map(current.leads.map((lead) => [lead.id, lead]));
  return { ...next, leads: next.leads.map((lead) => byId.has(lead.id) ? mergeLiveLeadRecord(byId.get(lead.id)!, lead) : lead) };
}

function timestamp(value: string | null) { return value ? Date.parse(value) || 0 : 0; }

function timelineDate(current: string | null, next: string | null, edge: "first" | "last") {
  if (!current) return next;
  if (!next) return current;
  return (edge === "first" ? timestamp(current) < timestamp(next) : timestamp(current) > timestamp(next)) ? current : next;
}
