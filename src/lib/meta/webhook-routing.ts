type Integration = {
  id: string;
  organization_id: string;
  metadata: Record<string, unknown> | null;
};

/** Discovery inventories do not authorize delivery of customer data. */
export function findMetaWebhookIntegration<T extends Integration>(rows: T[], assetId: string): T | null {
  const matches = rows.filter(({ metadata }) => {
    if (!metadata) return false;
    return ["facebook_page_id", "instagram_business_id", "ad_account_id"].some((key) => {
      const selectedKey = `selected_${key}`;
      // An explicit deselection must not resurrect a legacy selection.
      const value = Object.hasOwn(metadata, selectedKey) ? metadata[selectedKey] : metadata[key];
      return typeof value === "string" && value.trim() === assetId;
    });
  });
  // Never resolve cross-workspace ownership by database row order.
  return matches.length === 1 ? matches[0] : null;
}
