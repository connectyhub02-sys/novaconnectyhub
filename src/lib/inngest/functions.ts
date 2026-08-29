import { inngest } from "./client";
import {
  getWhatsappAgentRunDelaySeconds,
  processQueuedWhatsappAgentRuns,
  processWhatsappAgentRun,
} from "@/lib/whatsapp/agent-runtime";
import {
  processMetaSocialAgentRun,
  processQueuedMetaSocialAgentRuns,
} from "@/lib/meta/social-agent-queue";
import {
  metaSocialDispatchRequestedEventName,
  processApprovedMetaSocialDispatch,
  processPendingApprovedMetaSocialDispatches,
} from "@/lib/meta/social-dispatcher";
import {
  metaSocialCommentReceivedEventName,
  metaSocialMessageReceivedEventName,
} from "@/lib/meta/social-agent-policy";
import { processScheduledMetaOrganicPosts } from "@/lib/meta/organic-publishing";
import { processScheduledWhatsappOutbounds } from "@/lib/whatsapp/channel-operations";
import {
  processWhatsappHandoffNotification,
  type WhatsappHandoffNotificationEventData,
  whatsappHandoffNotificationEventName,
} from "@/lib/whatsapp/handoff-notifications";
import {
  processWhatsappCloneProfileImport,
  type WhatsappCloneProfileImportEventData,
  whatsappCloneProfileImportEventName,
} from "@/lib/whatsapp/clone-profile-history";
import {
  processWhatsappReconnectCatchup,
} from "@/lib/whatsapp/reconnect-catchup";
import {
  type WhatsappReconnectCatchupEventData,
  whatsappReconnectCatchupEventName,
} from "@/lib/whatsapp/reconnect-catchup-event";
import {
  processWhatsappProactiveFollowUp,
  type WhatsappFollowUpEventData,
  whatsappFollowUpEventName,
} from "@/lib/whatsapp/proactive-followup";
import { processPendingPlatformBillingNotifications } from "@/lib/billing/platform-billing-webhook";
import { processPaidBillingLifecycleNotifications } from "@/lib/billing/paid-lifecycle-notifications";
import { processPendingTrialConversionMessages } from "@/lib/billing/trial-notifications";
import { syncConnectyhubApiAccessGuards } from "@/lib/connectyhub-api/access-sync";
import {
  dispatchGatewayWebhookDeliveries,
  gatewayWebhookDeliveryRequestedEventName,
  runConnectyHubGatewayHealthCheck,
} from "@/lib/connectyhub-api/gateway";
import {
  processQueuedSalesCatalogImportJobs,
  salesCatalogImportProcessRequestedEventName,
} from "@/lib/sales-catalog/importer";
import {
  processQueuedWhatsappCatalogImportReviews,
  type WhatsappCatalogImportProcessRequestedEventData,
  whatsappCatalogImportProcessRequestedEventName,
} from "@/lib/sales-catalog/whatsapp-sync";
import { createServiceClient } from "@/lib/supabase/service";
import { syncUazapiInstances } from "@/lib/whatsapp/uazapi-sync";
import { runScheduledUazapiCostGuard } from "@/lib/whatsapp/uazapi-cost-guard";
import {
  elianeEcosystemSyncEventName,
  syncElianeEcosystemKnowledge,
} from "@/lib/whatsapp/eliane-ecosystem-sync";
import { runGrowthAgentMission, type GrowthAgentCode } from "@/lib/growth/growth-agent-runner";

export const connectyhubDailyAdminReport = inngest.createFunction(
  {
    id: "connectyhub-daily-admin-report",
    name: "ConnectyHub Daily Admin Report",
    triggers: [{ cron: "30 11 * * *" }],
  },
  async ({ step }) => {
    const checkedAt = await step.run("record-report-window", () =>
      new Date().toISOString(),
    );

    return {
      status: "ready",
      checkedAt,
      report: "admin-daily-operations",
    };
  },
);

export const connectyhubAdminPing = inngest.createFunction(
  {
    id: "connectyhub-admin-ping",
    name: "ConnectyHub Admin Ping",
    triggers: [{ event: "connectyhub/admin.ping" }],
  },
  async ({ event, step }) => {
    const checkedAt = await step.run("record-ping", () =>
      new Date().toISOString(),
    );

    return {
      status: "online",
      checkedAt,
      eventName: event.name,
    };
  },
);

export const connectyhubWhatsappSync = inngest.createFunction(
  {
    id: "connectyhub-whatsapp-sync",
    name: "ConnectyHub WhatsApp Instance Sync",
    triggers: [
      { event: "connectyhub/whatsapp.sync.requested" },
      { cron: "*/30 * * * *" },
    ],
  },
  async ({ event, step }) => {
    const data = event.data as { configureWebhooks?: boolean } | undefined;
    const summary = await step.run("sync-uazapi-instances", () =>
      syncUazapiInstances({
        actorId: null,
        configureWebhooks: data?.configureWebhooks !== false,
      }),
    );
    const costGuard = await step.run("run-uazapi-cost-guard-after-sync-if-due", () =>
      runScheduledUazapiCostGuard({
        client: createServiceClient(),
        triggerSource: "whatsapp_sync_cron",
      }),
    );

    return {
      status: "synced",
      summary,
      costGuard,
    };
  },
);

export const connectyhubUazapiCostGuard = inngest.createFunction(
  {
    id: "connectyhub-uazapi-cost-guard",
    name: "ConnectyHub Uazapi Cost Guard",
    retries: 1,
    triggers: [{ cron: "*/10 * * * *" }],
  },
  async ({ step }) => {
    const summary = await step.run("run-uazapi-cost-guard-if-due", () =>
      runScheduledUazapiCostGuard({
        client: createServiceClient(),
        triggerSource: "inngest_cron",
      }),
    );

    return {
      status: summary.status,
      reason: summary.reason,
      summary,
    };
  },
);

export const connectyhubWhatsappAgentResponse = inngest.createFunction(
  {
    id: "connectyhub-whatsapp-agent-response",
    name: "ConnectyHub WhatsApp Agent Response",
    retries: 4,
    triggers: [{ event: "connectyhub/whatsapp.message.received" }],
  },
  async ({ event, step }) => {
    const data = event.data as { runId?: string } | undefined;
    const runId = data?.runId;

    if (!runId) {
      return { status: "skipped", reason: "missing_run_id" };
    }

    const delaySeconds = await step.run("resolve-behavior-delay", () =>
      getWhatsappAgentRunDelaySeconds({ runId }),
    );

    if (delaySeconds > 0) {
      await step.sleep("behavior-delay", `${delaySeconds}s`);
    }

    return step.run("process-whatsapp-agent-run", () =>
      processWhatsappAgentRun({ runId }),
    );
  },
);

export const connectyhubWhatsappAgentSweep = inngest.createFunction(
  {
    id: "connectyhub-whatsapp-agent-sweep",
    name: "ConnectyHub WhatsApp Agent Queue Sweep",
    triggers: [{ cron: "*/2 * * * *" }],
  },
  async ({ step }) => {
    const summary = await step.run("process-queued-whatsapp-agent-runs", () =>
      processQueuedWhatsappAgentRuns({ limit: 5 }),
    );

    return {
      status: "swept",
      summary,
    };
  },
);

export const connectyhubWhatsappReconnectCatchup = inngest.createFunction(
  {
    id: "connectyhub-whatsapp-reconnect-catchup",
    name: "ConnectyHub WhatsApp Reconnect Catch-up",
    retries: 2,
    triggers: [{ event: whatsappReconnectCatchupEventName }],
  },
  async ({ event, step }) => {
    const data = event.data as WhatsappReconnectCatchupEventData | undefined;

    if (!data?.whatsappInstanceId) {
      return { status: "skipped", reason: "missing_whatsapp_instance_id" };
    }

    await step.sleep("wait-for-uazapi-history-sync", "15s");

    return step.run("process-whatsapp-reconnect-catchup", () =>
      processWhatsappReconnectCatchup({
        data,
        client: createServiceClient(),
      }),
    );
  },
);

export const connectyhubMetaSocialMessageQueue = inngest.createFunction(
  {
    id: "connectyhub-meta-social-message-queue",
    name: "ConnectyHub Meta Social Message Queue",
    retries: 3,
    triggers: [{ event: metaSocialMessageReceivedEventName }],
  },
  async ({ event, step }) => {
    const data = event.data as { runId?: string } | undefined;
    const runId = data?.runId;

    if (!runId) {
      return { status: "skipped", reason: "missing_run_id" };
    }

    return step.run("prepare-meta-social-agent-run", () =>
      processMetaSocialAgentRun({ runId }),
    );
  },
);

export const connectyhubMetaSocialCommentQueue = inngest.createFunction(
  {
    id: "connectyhub-meta-social-comment-queue",
    name: "ConnectyHub Meta Social Comment Queue",
    retries: 3,
    triggers: [{ event: metaSocialCommentReceivedEventName }],
  },
  async ({ event, step }) => {
    const data = event.data as { runId?: string } | undefined;
    const runId = data?.runId;

    if (!runId) {
      return { status: "skipped", reason: "missing_run_id" };
    }

    return step.run("prepare-meta-social-agent-run", () =>
      processMetaSocialAgentRun({ runId }),
    );
  },
);

export const connectyhubMetaSocialAgentSweep = inngest.createFunction(
  {
    id: "connectyhub-meta-social-agent-sweep",
    name: "ConnectyHub Meta Social Agent Queue Sweep",
    retries: 1,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    const summary = await step.run("process-queued-meta-social-agent-runs", () =>
      processQueuedMetaSocialAgentRuns({ limit: 10 }),
    );

    return {
      status: "swept",
      summary,
    };
  },
);

export const connectyhubMetaSocialApprovedDispatch = inngest.createFunction(
  {
    id: "connectyhub-meta-social-approved-dispatch",
    name: "ConnectyHub Meta Social Approved Dispatch",
    retries: 3,
    triggers: [{ event: metaSocialDispatchRequestedEventName }],
  },
  async ({ event, step }) => {
    const data = event.data as { runId?: string } | undefined;
    const runId = data?.runId;

    if (!runId) {
      return { status: "skipped", reason: "missing_run_id" };
    }

    return step.run("send-approved-meta-social-reply", () =>
      processApprovedMetaSocialDispatch({ runId }),
    );
  },
);

export const connectyhubMetaSocialDispatchSweep = inngest.createFunction(
  {
    id: "connectyhub-meta-social-dispatch-sweep",
    name: "ConnectyHub Meta Social Dispatch Sweep",
    retries: 1,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    const summary = await step.run("process-pending-meta-social-dispatches", () =>
      processPendingApprovedMetaSocialDispatches({ limit: 10 }),
    );

    return {
      status: "swept",
      summary,
    };
  },
);

export const connectyhubMetaOrganicPublishSweep = inngest.createFunction(
  {
    id: "connectyhub-meta-organic-publish-sweep",
    name: "ConnectyHub Meta Organic Publish Sweep",
    retries: 1,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    const summary = await step.run("process-scheduled-meta-organic-posts", () =>
      processScheduledMetaOrganicPosts({ limit: 10 }),
    );

    return {
      status: "swept",
      summary,
    };
  },
);

export const connectyhubWhatsappOutboundDispatcher = inngest.createFunction(
  {
    id: "connectyhub-whatsapp-outbound-dispatcher",
    name: "ConnectyHub WhatsApp Outbound Dispatcher",
    retries: 3,
    triggers: [{ event: "connectyhub/whatsapp.outbound.requested" }],
  },
  async ({ event, step }) => {
    const data = event.data as { itemId?: string } | undefined;
    const itemId = data?.itemId;

    if (!itemId) {
      return { status: "skipped", reason: "missing_item_id" };
    }

    const summary = await step.run("process-whatsapp-outbound-item", () =>
      processScheduledWhatsappOutbounds({ itemId, limit: 1 }),
    );

    return {
      status: "processed",
      summary,
    };
  },
);

export const connectyhubWhatsappOutboundSweep = inngest.createFunction(
  {
    id: "connectyhub-whatsapp-outbound-sweep",
    name: "ConnectyHub WhatsApp Outbound Sweep",
    retries: 1,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    const summary = await step.run("process-scheduled-whatsapp-outbounds", () =>
      processScheduledWhatsappOutbounds({ limit: 10 }),
    );

    return {
      status: "swept",
      summary,
    };
  },
);

export const connectyhubApiHealthMonitor = inngest.createFunction(
  {
    id: "connectyhub-api-health-monitor",
    name: "ConnectyHub API Health Monitor",
    retries: 1,
    triggers: [
      { event: "connectyhub/api.health.requested" },
      { cron: "*/10 * * * *" },
    ],
  },
  async ({ step }) => {
    const summary = await step.run("run-connectyhub-api-health-check", () =>
      runConnectyHubGatewayHealthCheck({
        instanceLimit: 60,
        webhookLimit: 60,
      }),
    );

    return {
      status: "checked",
      summary,
    };
  },
);

export const connectyhubGatewayWebhookDelivery = inngest.createFunction(
  {
    id: "connectyhub-gateway-webhook-delivery",
    name: "ConnectyHub Gateway Webhook Delivery",
    retries: 3,
    triggers: [{ event: gatewayWebhookDeliveryRequestedEventName }],
  },
  async ({ event, step }) => {
    const data = event.data as {
      whatsappInstanceId?: string | null;
      webhookEventId?: string | null;
      eventType?: string;
      payload?: unknown;
      ingest?: unknown;
    } | undefined;
    const whatsappInstanceId = data?.whatsappInstanceId ?? null;
    const webhookEventId = data?.webhookEventId ?? null;
    const eventType = data?.eventType ?? null;
    const payload = data?.payload;
    const ingest = data?.ingest;

    if (!whatsappInstanceId || !eventType) {
      return {
        status: "skipped",
        reason: "missing_gateway_webhook_delivery_data",
      };
    }

    return step.run("dispatch-gateway-webhook-deliveries", () =>
      dispatchGatewayWebhookDeliveries({
        whatsappInstanceId,
        webhookEventId,
        eventType,
        payload,
        ingest,
      }),
    );
  },
);

export const connectyhubApiAccessGuardSync = inngest.createFunction(
  {
    id: "connectyhub-api-access-guard-sync",
    name: "ConnectyHub API Access Guard Sync",
    retries: 1,
    triggers: [
      { event: "connectyhub/api.access_guard.sync.requested" },
      { cron: "*/15 * * * *" },
    ],
  },
  async ({ step }) => {
    const summary = await step.run("sync-connectyhub-api-access-guards", () =>
      syncConnectyhubApiAccessGuards({
        client: createServiceClient(),
        limit: 250,
      }),
    );

    return {
      status: "synced",
      summary,
    };
  },
);

export const connectyhubWhatsappHandoffNotifier = inngest.createFunction(
  {
    id: "connectyhub-whatsapp-handoff-notifier",
    name: "ConnectyHub WhatsApp Human Handoff Notifier",
    retries: 3,
    triggers: [{ event: whatsappHandoffNotificationEventName }],
  },
  async ({ event, step }) =>
    step.run("send-whatsapp-handoff-notification", () =>
      processWhatsappHandoffNotification({
        data: event.data as WhatsappHandoffNotificationEventData,
      }),
    ),
);

export const connectyhubWhatsappCloneProfileImport = inngest.createFunction(
  {
    id: "connectyhub-whatsapp-clone-profile-import",
    name: "ConnectyHub WhatsApp Clone Profile Import",
    retries: 1,
    triggers: [{ event: whatsappCloneProfileImportEventName }],
  },
  async ({ event, step }) =>
    step.run("generate-whatsapp-clone-profile-from-history", () =>
      processWhatsappCloneProfileImport({
        data: event.data as WhatsappCloneProfileImportEventData,
      }),
    ),
);

export const connectyhubWhatsappFollowUp = inngest.createFunction(
  {
    id: "connectyhub-whatsapp-follow-up",
    name: "ConnectyHub WhatsApp Proactive Follow-Up",
    retries: 2,
    triggers: [{ event: whatsappFollowUpEventName }],
  },
  async ({ event, step }) =>
    step.run("process-whatsapp-proactive-follow-up", () =>
      processWhatsappProactiveFollowUp({
        data: event.data as WhatsappFollowUpEventData,
      }),
    ),
);

export const connectyhubPlatformAutomationSweep = inngest.createFunction(
  {
    id: "connectyhub-platform-automation-sweep",
    name: "ConnectyHub Platform Automation Sweep",
    retries: 1,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    const summary = await step.run("process-pending-platform-automations", async () => {
      const client = createServiceClient();
      const trial = await processPendingTrialConversionMessages(client, { limit: 25 });
      const paidLifecycle = await processPaidBillingLifecycleNotifications(client, { limit: 100 });
      const billing = await processPendingPlatformBillingNotifications(client, { limit: 25 });

      return { trial, paidLifecycle, billing };
    });

    return {
      status: "swept",
      summary,
    };
  },
);

export const connectyhubSalesCatalogImportSweep = inngest.createFunction(
  {
    id: "connectyhub-sales-catalog-import-sweep",
    name: "ConnectyHub Sales Catalog Import Sweep",
    retries: 1,
    triggers: [
      { event: salesCatalogImportProcessRequestedEventName },
      { cron: "* * * * *" },
    ],
  },
  async ({ event, step }) => {
    const data = event.data as {
      jobId?: string;
      companyId?: string;
      whatsappInstanceId?: string;
      sourcePlatform?: string;
    } | undefined;
    const summary = await step.run("process-sales-catalog-import-jobs", () =>
      processQueuedSalesCatalogImportJobs({
        client: createServiceClient(),
        jobId: data?.jobId,
        limit: data?.jobId ? 1 : 3,
      }),
    );
    const shouldSweepWhatsappCatalog = !data?.jobId || data.sourcePlatform === "whatsapp_catalog";
    const whatsappCatalogSummary = await step.run("process-whatsapp-catalog-import-jobs", () =>
      shouldSweepWhatsappCatalog
        ? processQueuedWhatsappCatalogImportReviews({
          client: createServiceClient(),
          jobId: data?.sourcePlatform === "whatsapp_catalog" ? data.jobId : undefined,
          companyId: data?.companyId,
          whatsappInstanceId: data?.whatsappInstanceId,
          limit: data?.jobId ? 1 : 3,
        })
        : Promise.resolve({ processed: 0, skipped: 0, results: [] }),
    );

    return {
      status: "swept",
      summary: {
        salesCatalog: summary,
        whatsappCatalog: whatsappCatalogSummary,
      },
    };
  },
);

export const connectyhubWhatsappCatalogImportSweep = inngest.createFunction(
  {
    id: "connectyhub-whatsapp-catalog-import-sweep",
    name: "ConnectyHub WhatsApp Catalog Import Sweep",
    retries: 2,
    triggers: [
      { event: whatsappCatalogImportProcessRequestedEventName },
      { cron: "*/5 * * * *" },
    ],
  },
  async ({ event, step }) => {
    const data = event.data as WhatsappCatalogImportProcessRequestedEventData | undefined;
    const summary = await step.run("process-whatsapp-catalog-import-jobs", () =>
      processQueuedWhatsappCatalogImportReviews({
        client: createServiceClient(),
        jobId: data?.jobId,
        companyId: data?.companyId,
        whatsappInstanceId: data?.whatsappInstanceId,
        limit: data?.jobId ? 1 : 3,
      }),
    );

    return {
      status: "swept",
      summary,
    };
  },
);

export const connectyhubElianeEcosystemSync = inngest.createFunction(
  {
    id: "connectyhub-eliane-ecosystem-sync",
    name: "ConnectyHub Eliane Ecosystem Sync",
    retries: 1,
    triggers: [
      { event: elianeEcosystemSyncEventName },
      { cron: "0 9 * * *" },
    ],
  },
  async ({ event, step }) =>
    step.run("sync-eliane-ecosystem-knowledge", () =>
      syncElianeEcosystemKnowledge({
        triggerSource: event.name,
      }),
    ),
);

const growthAgentSchedules: Array<{
  id: string;
  name: string;
  eventName: string;
  cron: string;
  agentCode: GrowthAgentCode;
}> = [
  {
    id: "connectyhub-growth-research-agent",
    name: "ConnectyHub Growth Research Agent",
    eventName: "connectyhub/growth.research.scheduled",
    cron: "30 8 * * *",
    agentCode: "agente-pesquisa-web",
  },
  {
    id: "connectyhub-growth-market-radar-agent",
    name: "ConnectyHub Market Radar Agent",
    eventName: "connectyhub/growth.market-radar.scheduled",
    cron: "15 9 * * *",
    agentCode: "agente-radar-mercado",
  },
  {
    id: "connectyhub-growth-news-agent",
    name: "ConnectyHub News Agent",
    eventName: "connectyhub/growth.news.scheduled",
    cron: "0 7,13,18 * * *",
    agentCode: "agente-noticias",
  },
  {
    id: "connectyhub-growth-blog-agent",
    name: "ConnectyHub Blog Agent",
    eventName: "connectyhub/growth.blog.scheduled",
    cron: "0 10 * * 1,3,5",
    agentCode: "agente-blog",
  },
  {
    id: "connectyhub-growth-competitive-intel-agent",
    name: "ConnectyHub Competitive Intelligence Agent",
    eventName: "connectyhub/growth.competitive-intel.scheduled",
    cron: "30 11 * * 1,3,5",
    agentCode: "agente-inteligencia-competitiva",
  },
  {
    id: "connectyhub-growth-seo-agent",
    name: "ConnectyHub SEO Agent",
    eventName: "connectyhub/growth.seo.scheduled",
    cron: "45 9 * * 2,4",
    agentCode: "agente-seo-organico",
  },
  {
    id: "connectyhub-growth-aeo-agent",
    name: "ConnectyHub AEO Agent",
    eventName: "connectyhub/growth.aeo.scheduled",
    cron: "15 12 * * 2,4",
    agentCode: "agente-aeo-respostas",
  },
  {
    id: "connectyhub-growth-geo-ago-agent",
    name: "ConnectyHub GEO AGO Agent",
    eventName: "connectyhub/growth.geo-ago.scheduled",
    cron: "0 14 * * 5",
    agentCode: "agente-geo-ago",
  },
];

export const connectyhubGrowthAgentFunctions = growthAgentSchedules.map((config) =>
  inngest.createFunction(
    {
      id: config.id,
      name: config.name,
      retries: 1,
      triggers: [
        { event: config.eventName },
        { cron: config.cron },
      ],
    },
    async ({ event, step }) =>
      step.run("run-growth-agent-mission", () =>
        runGrowthAgentMission({
          agentCode: config.agentCode,
          triggerSource: event.name,
        }),
      ),
  ),
);

export const functions = [
  connectyhubDailyAdminReport,
  connectyhubAdminPing,
  connectyhubWhatsappSync,
  connectyhubUazapiCostGuard,
  connectyhubWhatsappAgentResponse,
  connectyhubWhatsappAgentSweep,
  connectyhubWhatsappReconnectCatchup,
  connectyhubMetaSocialMessageQueue,
  connectyhubMetaSocialCommentQueue,
  connectyhubMetaSocialAgentSweep,
  connectyhubMetaSocialApprovedDispatch,
  connectyhubMetaSocialDispatchSweep,
  connectyhubMetaOrganicPublishSweep,
  connectyhubWhatsappOutboundDispatcher,
  connectyhubWhatsappOutboundSweep,
  connectyhubApiAccessGuardSync,
  connectyhubApiHealthMonitor,
  connectyhubGatewayWebhookDelivery,
  connectyhubWhatsappHandoffNotifier,
  connectyhubWhatsappCloneProfileImport,
  connectyhubWhatsappFollowUp,
  connectyhubPlatformAutomationSweep,
  connectyhubSalesCatalogImportSweep,
  connectyhubWhatsappCatalogImportSweep,
  connectyhubElianeEcosystemSync,
  ...connectyhubGrowthAgentFunctions,
];
