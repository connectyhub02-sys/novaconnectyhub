import { inngest } from "./client";

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

export const functions = [
  connectyhubDailyAdminReport,
  connectyhubAdminPing,
];
