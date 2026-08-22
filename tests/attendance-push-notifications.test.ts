import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const attendanceSource = readFileSync("src/components/connectyhub-os/leads-crm-console.tsx", "utf8");

function sourceBetween(start: string, end: string) {
  const startIndex = attendanceSource.indexOf(start);
  const endIndex = attendanceSource.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return attendanceSource.slice(startIndex, endIndex);
}

describe("Attendance push notifications", () => {
  it("persists push subscriptions with the active company and lead context", () => {
    const requestSubscription = sourceBetween("async function requestAttendancePushSubscription", "function getAttendancePushPromptMessage");

    expect(requestSubscription).toContain("organization_id: context.organizationId");
    expect(requestSubscription).toContain("attendance_push_context");
    expect(requestSubscription).toContain("lead_id: context.leadId");
    expect(requestSubscription).toContain("lead_phone: context.leadPhone");
    expect(requestSubscription).toContain("conversation_id: context.conversationId");
  });

  it("shows browser notifications even while the attendance tab is visible", () => {
    const browserNotification = sourceBetween("function showLeadBrowserNotification", "function previewNotificationText");

    expect(browserNotification).toContain("new Notification");
    expect(browserNotification).toContain("Notification.permission !== \"granted\"");
    expect(browserNotification).not.toContain("document.visibilityState === \"visible\"");
  });

  it("requires push permission before using the live attendance chat", () => {
    expect(attendanceSource).toContain("const chatLockedByPush = Boolean(activeThread && shouldRequireAttendancePush(pushPrompt.permission))");
    expect(attendanceSource).toContain("AttendancePushRequiredOverlay");
    expect(attendanceSource).toContain("disabled={handoffBusy || replyBusy || chatLockedByPush}");
    expect(attendanceSource).toContain("disabled={replyBusy || chatLockedByPush}");
  });
});
