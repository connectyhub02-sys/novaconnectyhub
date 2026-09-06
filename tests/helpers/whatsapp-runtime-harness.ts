import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";
import * as leadNames from "@/lib/whatsapp/lead-names";
import * as metadataUpdate from "@/lib/leads/metadata-update";
import * as catalogShared from "@/lib/sales-catalog/shared";
import * as shipping from "@/lib/sales-catalog/shipping-calculator";
import * as language from "@/lib/whatsapp/outbound-language";
import * as templates from "@/lib/whatsapp/agent-prompt-templates";
import * as commerceConversation from "@/lib/whatsapp/commerce-conversation";
import * as agentBehavior from "@/lib/whatsapp/agent-behavior";
import * as humanHandoff from "@/lib/whatsapp/human-handoff";
import * as humanization from "@/lib/whatsapp/clone-humanization";
import * as customer from "@/lib/sales-catalog/checkout-customer";

// Execute the real runtime functions with I/O substituted, without making private helpers a public API.
const exposed = [
  "extractRuntimeCustomerNameFromStructuredReply",
  "resolveSalesCatalogOrderSelections", "resolveSalesCatalogMentionQuantity",
  "hasRecentSalesCatalogCheckoutConfirmation", "buildSalesCatalogOrderConfirmationPrompt",
  "persistLeadBillingDetailsSnapshot", "persistLeadCustomerNameSnapshot", "extractLeadMemory",
  "maybePersistSalesCatalogLeadContactDetailsFromMessage", "maybeAttachSalesCatalogCustomerNameToOrder",
  "maybeAttachSalesCatalogCustomerBillingDetailsToOrder", "sendSalesCatalogPaymentDeferredWhatsapp",
  "buildSalesCatalogCheckoutStateLines", "resolveSalesCatalogConfirmedPaymentPreference",
  "recordSalesCatalogOrderIntent", "sendSalesCatalogPaymentLink", "isSalesCatalogPaymentLinkFollowUp",
  "maybeSendExistingSalesCatalogCheckoutLink", "buildConfiguredNicheCareLines",
  "prepareSalesCatalogDeliveryText", "hasSalesCatalogOrderIntent", "hasSalesCatalogCheckoutConfirmationIntent",
  "sendAgentResponse", "resolveOutboundDelivery", "buildCloneProfileLines", "buildSystemInstruction",
  "persistCloneRealTestTurn", "extractCloneMemory", "detectSalesCatalogPreferredPaymentMethod",
  "needsSalesCatalogCheckoutTotalConfirmation", "resolveInitialSalesCatalogOrderShipping", "buildSalesCatalogDeliveryDetailsBeforeCheckoutPrompt",
];
const source = readFileSync("src/lib/whatsapp/agent-runtime.ts", "utf8");
const compiled = transpileModule(`${source}\nexports.audit = {${exposed.join(",")}};`, {
  compilerOptions: { module: ModuleKind.CommonJS, target: 9 },
}).outputText;
const require = createRequire(import.meta.url);

export function runtimeHarness(dependencies: Record<string, unknown> = {}, globals: Record<string, unknown> = {}) {
  const runtimeModule = { exports: {} as Record<string, unknown> };
  const currency = transpileModule(readFileSync("src/lib/sales-catalog/mercado-pago.ts", "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: 9 },
  }).outputText;
  const money = { exports: {} };
  runInNewContext(currency, { module: money, exports: money.exports, require: () => ({}), process, URL });
  const imports: Record<string, unknown> = {
    "@/lib/sales-catalog/checkout-customer": customer,
    "node:crypto": require("node:crypto"),
    "./lead-names": leadNames,
    "@/lib/leads/metadata-update": metadataUpdate,
    "@/lib/sales-catalog/shared": catalogShared,
    "@/lib/sales-catalog/shipping-calculator": shipping,
    "@/lib/sales-catalog/mercado-pago": money.exports,
    "./outbound-language": language,
    "./agent-prompt-templates": templates,
    "./commerce-conversation": commerceConversation,
    "./agent-behavior": agentBehavior,
    "./human-handoff": humanHandoff,
    "./clone-humanization": humanization,
    ...dependencies,
  };
  runInNewContext(compiled, {
    module: runtimeModule, exports: runtimeModule.exports, require: (name: string) => imports[name] ?? {},
    URL, Date, Buffer, process, setTimeout, clearTimeout, AbortController,
    fetch: () => { throw new Error("Unexpected external request in runtime test"); },
    ...globals,
  });
  const api = runtimeModule.exports.audit as Record<string, (...args: unknown[]) => unknown>;
  return <T>(name: string, ...args: unknown[]) => api[name](...args) as T;
}
