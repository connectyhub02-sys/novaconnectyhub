import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductComplianceCategory =
  | "health_controlled"
  | "supplements"
  | "illicit_drugs"
  | "weapons"
  | "adult"
  | "custom";

export type ProductComplianceAction = "block_all" | "block_checkout" | "warn";

export type ProductComplianceRule = {
  id: string;
  name: string;
  slug: string;
  category: ProductComplianceCategory;
  country_code: string;
  keywords: string[];
  intent_keywords: string[];
  action: ProductComplianceAction;
  blocked_message: string;
  is_enabled: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
};

export type SaveProductComplianceRuleInput = {
  id?: string;
  name: string;
  slug?: string;
  category?: ProductComplianceCategory;
  country_code?: string;
  keywords: string[];
  intent_keywords?: string[];
  action?: ProductComplianceAction;
  blocked_message: string;
  is_enabled?: boolean;
  notes?: string | null;
};

export const DEFAULT_COMPLIANCE_SEED_RULE: ProductComplianceRule = {
  id: "default-seed-anabolics-br",
  name: "Anabolizantes e Esteroides Controlados",
  slug: "anabolizantes-esteroides-br",
  category: "health_controlled",
  country_code: "BR",
  keywords: [
    "anabolizante",
    "anabolizantes",
    "testosterona",
    "testo",
    "drostanolona",
    "masteron",
    "oxandrolona",
    "trembolona",
    "nandrolona",
    "metenolona",
    "primobolan",
    "stanozolol",
    "durateston",
  ],
  intent_keywords: [
    "recomenda",
    "indica",
    "preferencia",
    "ganhar massa",
    "massa seca",
    "secar",
    "injetavel",
    "ciclo",
    "kit",
  ],
  action: "block_all",
  blocked_message:
    "Não posso recomendar combinações de anabolizantes para objetivos físicos nem organizar a compra desses medicamentos por aqui. Para avaliar indicação e tratamento, procure um profissional de saúde habilitado. Não vou gerar pedido ou pagamento para esses medicamentos.",
  is_enabled: true,
  notes: "Substâncias sujeitas a controle especial conforme lista da Anvisa (Portaria 344/98).",
};

export function resolveContextComplianceRules(context: { complianceRules?: ProductComplianceRule[] }): ProductComplianceRule[] {
  if (Array.isArray(context.complianceRules)) {
    return context.complianceRules;
  }
  return [DEFAULT_COMPLIANCE_SEED_RULE];
}

// Cache for active rules: country -> { timestamp, rules }
type CachedRules = {
  timestamp: number;
  rules: ProductComplianceRule[];
};

const activeRulesCache = new Map<string, CachedRules>();
const CACHE_TTL_MS = 15000; // 15 seconds cache

export function clearComplianceRulesCache(): void {
  activeRulesCache.clear();
}

export function normalizeComplianceSearch(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve country ISO code (alpha-2) from phone number or country string.
 */
export function resolveComplianceCountryCode(phoneOrCountry?: string | null): string {
  if (!phoneOrCountry) return "BR";
  const trimmed = phoneOrCountry.trim();
  if (/^[a-zA-Z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("55") || digits.length === 10 || digits.length === 11) {
    return "BR";
  }
  if (digits.startsWith("1") && (digits.length === 11 || digits.length === 10)) {
    return "US";
  }
  if (digits.startsWith("351")) return "PT";
  if (digits.startsWith("34")) return "ES";
  if (digits.startsWith("44")) return "GB";
  if (digits.startsWith("52")) return "MX";
  if (digits.startsWith("54")) return "AR";
  if (digits.startsWith("57")) return "CO";
  if (digits.startsWith("56")) return "CL";
  return "BR";
}

/**
 * List all rules for the platform admin console.
 */
export async function listPlatformComplianceRules(
  client: SupabaseClient
): Promise<ProductComplianceRule[]> {
  const { data, error } = await client
    .from("platform_product_compliance_rules")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Erro ao listar regras de compliance: ${error.message}`);
  }

  return (data ?? []).map(formatRuleRow);
}

/**
 * Load active rules for a specific country or global (ALL).
 */
export async function loadActiveProductComplianceRules(
  client: SupabaseClient,
  countryCode?: string | null
): Promise<ProductComplianceRule[]> {
  const normalizedCountry = resolveComplianceCountryCode(countryCode);
  const cacheKey = `country:${normalizedCountry}`;
  const now = Date.now();

  const cached = activeRulesCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.rules;
  }

  const { data, error } = await client
    .from("platform_product_compliance_rules")
    .select("*")
    .eq("is_enabled", true)
    .in("country_code", [normalizedCountry, "ALL"]);

  if (error) {
    // If table read fails or doesn't exist, return empty array safely without breaking the runtime
    return [];
  }

  const rules = (data ?? []).map(formatRuleRow);
  activeRulesCache.set(cacheKey, { timestamp: now, rules });
  return rules;
}

/**
 * Toggle enable/disable status for a rule (instant toggle in admin panel).
 */
export async function toggleProductComplianceRule(
  client: SupabaseClient,
  ruleId: string,
  isEnabled: boolean,
  adminUserId?: string | null
): Promise<ProductComplianceRule> {
  const { data, error } = await client
    .from("platform_product_compliance_rules")
    .update({
      is_enabled: isEnabled,
      updated_at: new Date().toISOString(),
      updated_by: adminUserId ?? null,
    })
    .eq("id", ruleId)
    .select()
    .single();

  if (error) {
    throw new Error(`Erro ao alternar status da regra: ${error.message}`);
  }

  clearComplianceRulesCache();
  return formatRuleRow(data);
}

/**
 * Create or update a compliance rule.
 */
export async function saveProductComplianceRule(
  client: SupabaseClient,
  input: SaveProductComplianceRuleInput,
  adminUserId?: string | null
): Promise<ProductComplianceRule> {
  const slug =
    input.slug?.trim() ||
    input.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const payload = {
    name: input.name.trim(),
    slug,
    category: input.category ?? "custom",
    country_code: (input.country_code ?? "BR").toUpperCase().trim(),
    keywords: (input.keywords ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean),
    intent_keywords: (input.intent_keywords ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean),
    action: input.action ?? "block_all",
    blocked_message: input.blocked_message.trim(),
    is_enabled: input.is_enabled ?? true,
    notes: input.notes?.trim() ?? null,
    updated_at: new Date().toISOString(),
    updated_by: adminUserId ?? null,
  };

  let query;
  if (input.id) {
    query = client
      .from("platform_product_compliance_rules")
      .update(payload)
      .eq("id", input.id)
      .select()
      .single();
  } else {
    query = client
      .from("platform_product_compliance_rules")
      .insert({
        ...payload,
        created_by: adminUserId ?? null,
      })
      .select()
      .single();
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Erro ao salvar regra de compliance: ${error.message}`);
  }

  clearComplianceRulesCache();
  return formatRuleRow(data);
}

/**
 * Delete a compliance rule by ID.
 */
export async function deleteProductComplianceRule(
  client: SupabaseClient,
  ruleId: string
): Promise<boolean> {
  const { error } = await client
    .from("platform_product_compliance_rules")
    .delete()
    .eq("id", ruleId);

  if (error) {
    throw new Error(`Erro ao excluir regra de compliance: ${error.message}`);
  }

  clearComplianceRulesCache();
  return true;
}

/**
 * Evaluates whether an item title violates any active compliance rule.
 */
export function isItemRestrictedByCompliance(
  itemTitle: string,
  rules: ProductComplianceRule[]
): boolean {
  if (!rules.length || !itemTitle) return false;
  const normalizedTitle = normalizeComplianceSearch(itemTitle);
  if (!normalizedTitle) return false;

  for (const rule of rules) {
    if (!rule.is_enabled || !rule.keywords.length) continue;
    for (const rawKw of rule.keywords) {
      const kw = normalizeComplianceSearch(rawKw);
      if (!kw) continue;
      // Exact word boundary match or inclusion for multi-word phrases
      const regex = kw.includes(" ")
        ? new RegExp(`(?:^|\\s)${escapeRegex(kw)}(?:\\s|$)`, "i")
        : new RegExp(`\\b${escapeRegex(kw)}\\b`, "i");
      if (regex.test(normalizedTitle)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Finds the first active rule that an item title violates.
 */
export function findViolatedItemComplianceRule(
  itemTitle: string,
  rules: ProductComplianceRule[]
): ProductComplianceRule | null {
  if (!rules.length || !itemTitle) return null;
  const normalizedTitle = normalizeComplianceSearch(itemTitle);
  if (!normalizedTitle) return null;

  for (const rule of rules) {
    if (!rule.is_enabled || !rule.keywords.length) continue;
    for (const rawKw of rule.keywords) {
      const kw = normalizeComplianceSearch(rawKw);
      if (!kw) continue;
      const regex = kw.includes(" ")
        ? new RegExp(`(?:^|\\s)${escapeRegex(kw)}(?:\\s|$)`, "i")
        : new RegExp(`\\b${escapeRegex(kw)}\\b`, "i");
      if (regex.test(normalizedTitle)) {
        return rule;
      }
    }
  }

  return null;
}

/**
 * Evaluates the full customer inbound interaction against active rules.
 */
export function evaluateComplianceInteraction(params: {
  currentText: string;
  requestedItemTitles: string[];
  mentionedItemTitles: string[];
  recentOutboundItemTitles: string[];
  activeRules: ProductComplianceRule[];
  hasCheckoutIntent?: boolean;
}): {
  shouldBlock: boolean;
  blockedMessage: string | null;
  violatedRule: ProductComplianceRule | null;
} {
  const {
    currentText,
    requestedItemTitles,
    mentionedItemTitles,
    recentOutboundItemTitles,
    activeRules,
    hasCheckoutIntent = false,
  } = params;

  if (!activeRules.length) {
    return { shouldBlock: false, blockedMessage: null, violatedRule: null };
  }

  const normalizedCurrent = normalizeComplianceSearch(currentText);

  // 1. Check if requested items trigger any rule
  for (const title of requestedItemTitles) {
    const rule = findViolatedItemComplianceRule(title, activeRules);
    if (rule && rule.action === "block_all") {
      return {
        shouldBlock: true,
        blockedMessage: rule.blocked_message,
        violatedRule: rule,
      };
    }
  }

  // 2. Check if mentioned items in current response trigger any rule
  for (const title of mentionedItemTitles) {
    const rule = findViolatedItemComplianceRule(title, activeRules);
    if (rule && rule.action === "block_all") {
      return {
        shouldBlock: true,
        blockedMessage: rule.blocked_message,
        violatedRule: rule,
      };
    }
  }

  // 3. Check if user text directly mentions restricted keywords with intent keywords
  for (const rule of activeRules) {
    if (!rule.is_enabled || rule.action !== "block_all") continue;

    // Check if user directly asked for any rule keyword
    const userMentionsKeyword = rule.keywords.some((rawKw) => {
      const kw = normalizeComplianceSearch(rawKw);
      if (!kw) return false;
      const regex = kw.includes(" ")
        ? new RegExp(`(?:^|\\s)${escapeRegex(kw)}(?:\\s|$)`, "i")
        : new RegExp(`\\b${escapeRegex(kw)}\\b`, "i");
      return regex.test(normalizedCurrent);
    });

    if (userMentionsKeyword) {
      return {
        shouldBlock: true,
        blockedMessage: rule.blocked_message,
        violatedRule: rule,
      };
    }

    // Check intent keywords (e.g. "ciclo", "ganhar massa", "kit") when no specific item was requested
    if (rule.intent_keywords.length > 0) {
      const userHasIntent = rule.intent_keywords.some((rawIntent) => {
        const intent = normalizeComplianceSearch(rawIntent);
        if (!intent) return false;
        const regex = new RegExp(`\\b${escapeRegex(intent)}\\b`, "i");
        return regex.test(normalizedCurrent);
      });

      if (userHasIntent && !requestedItemTitles.length) {
        return {
          shouldBlock: true,
          blockedMessage: rule.blocked_message,
          violatedRule: rule,
        };
      }
    }

    // Check continuation / checkout intent after recent outbound mentioned restricted items
    if (hasCheckoutIntent && !requestedItemTitles.length) {
      const recentHadRestricted = recentOutboundItemTitles.some((title) =>
        Boolean(findViolatedItemComplianceRule(title, [rule]))
      );
      if (recentHadRestricted) {
        return {
          shouldBlock: true,
          blockedMessage: rule.blocked_message,
          violatedRule: rule,
        };
      }
    }
  }

  return { shouldBlock: false, blockedMessage: null, violatedRule: null };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatRuleRow(row: Record<string, unknown>): ProductComplianceRule {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    category: (row.category as ProductComplianceCategory) ?? "custom",
    country_code: String(row.country_code ?? "BR").toUpperCase(),
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    intent_keywords: Array.isArray(row.intent_keywords)
      ? row.intent_keywords.map(String)
      : [],
    action: (row.action as ProductComplianceAction) ?? "block_all",
    blocked_message: String(row.blocked_message ?? ""),
    is_enabled: Boolean(row.is_enabled),
    notes: row.notes ? String(row.notes) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    created_by: row.created_by ? String(row.created_by) : null,
    updated_by: row.updated_by ? String(row.updated_by) : null,
  };
}
