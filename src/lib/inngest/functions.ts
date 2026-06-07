import { inngest } from "./client";
import {
  getWhatsappAgentRunDelaySeconds,
  processQueuedWhatsappAgentRuns,
  processWhatsappAgentRun,
} from "@/lib/whatsapp/agent-runtime";
import { syncUazapiInstances } from "@/lib/whatsapp/uazapi-sync";

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
    retries: 2,
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

export const functions = [
  connectyhubDailyAdminReport,
  connectyhubAdminPing,
  connectyhubWhatsappSync,
  connectyhubWhatsappAgentResponse,
  connectyhubWhatsappAgentSweep,
];
