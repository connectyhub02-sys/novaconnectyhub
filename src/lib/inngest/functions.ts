import { inngest } from "./client";
import {
  getWhatsappAgentRunDelaySeconds,
  processQueuedWhatsappAgentRuns,
  processWhatsappAgentRun,
} from "@/lib/whatsapp/agent-runtime";
import { syncUazapiInstances } from "@/lib/whatsapp/uazapi-sync";
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

    return {
      status: "synced",
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
  connectyhubWhatsappAgentResponse,
  connectyhubWhatsappAgentSweep,
  ...connectyhubGrowthAgentFunctions,
];
