type RecordValue = Record<string, unknown>;

export class CatalogSettingsConflict extends Error {
  constructor() {
    super("Estas configurações mudaram em outra tela. Recarregue para revisar a versão atual antes de salvar. Seu rascunho foi mantido.");
  }
}

const fields: Record<string, string> = {
  businessType: "business_type", categories: "categories", attributes: "attributes",
  storefront: "storefront", trackInventory: "track_inventory", variationMedia: "variation_media",
  paymentMethods: "payment_methods", pagBank: "pagbank", asaas: "asaas",
  orderPolicy: "order_policy", leadDataPolicy: "lead_data_policy",
  messageTemplates: "message_templates", automationSettings: "automation_settings",
  orderBumps: "order_bumps", commerceAgent: "commerce_agent",
};

/** Missing fields inherit persisted values; explicit false/empty values remain edits. */
export function catalogSettingsInput(body: RecordValue, persisted: RecordValue, automationOnly = false) {
  const result: RecordValue = {};
  for (const [field, stored] of Object.entries(fields)) {
    const permitted = !automationOnly || field === "messageTemplates" || field === "automationSettings";
    result[field] = permitted && Object.hasOwn(body, field) ? body[field] : persisted[stored];
  }
  if (!automationOnly && Object.hasOwn(body, "categoryRenames")) result.categoryRenames = body.categoryRenames;
  return result;
}

/** Keep unknown settings too. An automation edit owns exactly these two domains. */
export function catalogSettingsMetadata(persisted: RecordValue, normalized: RecordValue, automationOnly: boolean, exists: boolean) {
  if (!automationOnly) return { ...persisted, ...normalized };
  if (!exists) return { ...normalized, configured: false, updated_from: "automations" };
  return {
    ...persisted,
    message_templates: normalized.message_templates,
    automation_settings: normalized.automation_settings,
    updated_by: normalized.updated_by,
    updated_from: "automations",
  };
}

export function assertCatalogSettingsRevision(body: RecordValue, current: string | null) {
  if (!Object.hasOwn(body, "expectedUpdatedAt") || body.expectedUpdatedAt !== current) {
    throw new CatalogSettingsConflict();
  }
}
