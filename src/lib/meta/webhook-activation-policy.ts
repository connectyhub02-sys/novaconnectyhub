export const metaPageWebhookFields = [
  "feed",
  "mention",
  "messages",
  "messaging_postbacks",
] as const;

export type MetaPageWebhookField = typeof metaPageWebhookFields[number];

export function isMetaPageWebhookField(value: unknown): value is MetaPageWebhookField {
  return typeof value === "string" && metaPageWebhookFields.includes(value as MetaPageWebhookField);
}

export function normalizeMetaPageWebhookFields(value: unknown): MetaPageWebhookField[] {
  const raw = Array.isArray(value) ? value : metaPageWebhookFields;
  const fields = Array.from(new Set(raw.filter(isMetaPageWebhookField)));

  return fields.length ? fields : [...metaPageWebhookFields];
}

export function summarizeMetaPageSubscription(input: {
  requestedFields: readonly MetaPageWebhookField[];
  subscribedFields: Iterable<string>;
}) {
  const subscribed = new Set(Array.from(input.subscribedFields).map((field) => field.trim()).filter(Boolean));
  const missingFields = input.requestedFields.filter((field) => !subscribed.has(field));

  return {
    ok: missingFields.length === 0,
    missingFields,
    subscribedFields: Array.from(subscribed).sort(),
  };
}
