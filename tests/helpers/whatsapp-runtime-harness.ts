import * as activityProfile from "@/lib/whatsapp/activity-profile";
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
import * as activitySetup from "@/lib/whatsapp/activity-setup";
import * as conversationStyle from "@/lib/whatsapp/conversation-style";
import * as conversationEnding from "@/lib/whatsapp/conversation-ending";
import * as commerceConversation from "@/lib/whatsapp/commerce-conversation";
import * as agentBehavior from "@/lib/whatsapp/agent-behavior";
import * as humanHandoff from "@/lib/whatsapp/human-handoff";
import * as humanization from "@/lib/whatsapp/clone-humanization";
import * as customer from "@/lib/sales-catalog/checkout-customer";
import * as paymentEvidence from "@/lib/sales-catalog/payment-evidence";
import * as orderRevisionIntent from "@/lib/whatsapp/order-revision-intent";
import * as orderLifecycle from "@/lib/whatsapp/order-lifecycle";
import { serverModuleHarness } from "./server-module-harness";

// Execute the real runtime functions with I/O substituted, without making private helpers a public API.
const exposed = [
  "loadOrganizationSalesCatalogOrders", "handleLeadFinancialEvidence",
  "extractRuntimeCustomerNameFromStructuredReply",
  "resolveSalesCatalogOrderSelections", "resolveSalesCatalogMentionQuantity",
  "hasRecentSalesCatalogCheckoutConfirmation", "buildSalesCatalogOrderConfirmationPrompt",
  "persistLeadBillingDetailsSnapshot", "persistLeadCustomerNameSnapshot", "extractLeadMemory", "buildLeadNameContext", "buildLeadMemoryLines",
  "maybePersistSalesCatalogLeadContactDetailsFromMessage", "maybeAttachSalesCatalogCustomerNameToOrder",
  "maybeAttachSalesCatalogCustomerBillingDetailsToOrder", "sendSalesCatalogPaymentDeferredWhatsapp",
  "buildSalesCatalogCheckoutStateLines", "resolveSalesCatalogConfirmedPaymentPreference",
  "recordSalesCatalogOrderIntent", "sendSalesCatalogPaymentLink", "isSalesCatalogPaymentLinkFollowUp",
  "maybeSendExistingSalesCatalogCheckoutLink", "buildConfiguredNicheCareLines",
  "prepareSalesCatalogDeliveryText", "hasSalesCatalogOrderIntent", "hasSalesCatalogCheckoutConfirmationIntent",
  "sendAgentResponse", "resolveOutboundDelivery", "buildCloneProfileLines", "buildSystemInstruction",
  "resolveRuntimeAgentPrompt", "sendEmojiReaction",
  "buildSalesCatalogOrderIntentText",
  "persistCloneRealTestTurn", "extractCloneMemory", "detectSalesCatalogPreferredPaymentMethod",
  "needsSalesCatalogCheckoutTotalConfirmation", "resolveInitialSalesCatalogOrderShipping", "buildSalesCatalogDeliveryDetailsBeforeCheckoutPrompt",
  "sendSalesCatalogPixDirectWhatsapp",
  "maybeCreateSalesCatalogPaymentLink", "guardUnexecutedCheckoutClaim", "persistRuntimeSavedDeliveryConsent", "maybeAttachSavedSalesCatalogDeliveryToOrder",
  "scheduleProactiveFollowUp",
  "handleConversationEnding",
  "findRecentPendingSalesCatalogCheckoutOrder", "findRecentSalesCatalogOrderForSelections",
  "resolveSalesCatalogCartBoundaryMs", "buildSalesCatalogShippingIntentText",
  "maybeAttachSalesCatalogShippingQuoteToOrder", "maybeAttachSalesCatalogDeliveryAddressToOrder",
  "maybeAttachSalesCatalogLocalDeliveryToOrder", "maybeAttachSalesCatalogPickupToOrder",
  "buildSalesCatalogLines", "formatSalesCatalogCustomerMention", "runtimeAllowsCheckout", "effectiveRuntimeDestination", "resolveCatalogAgendaFocus",
];
const source = readFileSync("src/lib/whatsapp/agent-runtime.ts", "utf8");
const compiled = transpileModule(`${source}\nexports.audit = {${exposed.join(",")}, maybeHandleSalesCatalogOrderRevision: typeof maybeHandleSalesCatalogOrderRevision === "function" ? maybeHandleSalesCatalogOrderRevision : undefined};`, {
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
    "@/lib/whatsapp/outbound-delivery": { fetchWhatsappOutbound: (url: unknown, init: unknown) => {
      if (typeof globals.fetch !== "function") throw new Error("HTTP mock required for outbound transport");
      return globals.fetch(url, init);
    } },
    "@/lib/sales-catalog/payment-evidence": paymentEvidence,
    "@/lib/sales-catalog/payment-reviews": serverModuleHarness("src/lib/sales-catalog/payment-reviews.ts"),
    "@/lib/sales-catalog/checkout-customer": customer,
    "node:crypto": require("node:crypto"),
    "node:async_hooks": require("node:async_hooks"),
    "./lead-names": leadNames,
    "@/lib/leads/metadata-update": metadataUpdate,
    "@/lib/sales-catalog/shared": catalogShared,
    "@/lib/sales-catalog/shipping-calculator": shipping,
    "@/lib/sales-catalog/mercado-pago": money.exports,
    "@/lib/sales-catalog/order-shipping": serverModuleHarness("src/lib/sales-catalog/order-shipping.ts", {
      "./shipping-calculator": shipping, "./mercado-pago": money.exports,
    }),
    "./order-revision-intent": orderRevisionIntent,
    "./order-lifecycle": orderLifecycle,
    "./outbound-language": language,
    "./agent-prompt-templates": templates,
    "./activity-setup": activitySetup,
    "./activity-profile": activityProfile,
    "./conversation-style": conversationStyle,
    "./conversation-ending": conversationEnding,
    "./commerce-conversation": commerceConversation,
    "./agent-behavior": agentBehavior,
    "./human-handoff": humanHandoff,
    "./clone-humanization": humanization,
    ...dependencies,
  };
  runInNewContext(compiled, {
    module: runtimeModule, exports: runtimeModule.exports, require: (name: string) => imports[name] ?? {},
    URL, Date, Buffer, process, setTimeout, clearTimeout, AbortController, AbortSignal,
    fetch: () => { throw new Error("Unexpected external request in runtime test"); },
    ...globals,
  });
  const api = runtimeModule.exports.audit as Record<string, (...args: unknown[]) => unknown>;
  return <T>(name: string, ...args: unknown[]) => api[name](...args) as T;
}
