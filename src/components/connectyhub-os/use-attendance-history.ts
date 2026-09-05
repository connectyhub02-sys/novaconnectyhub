"use client";

import { useEffect, useState } from "react";
import type { AttendanceHistoryPage } from "@/lib/client-os/leads-crm";
import type { AttendanceHistoryCursor } from "@/lib/client-os/attendance-history-cursor";
import { mergeConversationMessages, mergeLeadActivities } from "@/lib/client-os/lead-crm-merge";

type HistoryState = AttendanceHistoryPage & { key: string; loading: boolean; error: string | null };

export function useAttendanceHistory(leadId: string | null, conversationId: string | null, kind: "messages" | "events") {
  const key = `${kind}:${leadId}:${conversationId}`;
  const enabled = Boolean(leadId && (kind === "events" || conversationId));
  const empty: HistoryState = { key, messages: [], activities: [], trackingEvents: [], cursor: null, loading: enabled, error: null };
  const [state, setState] = useState<HistoryState>(empty);
  const current = state.key === key ? state : empty;

  useEffect(() => {
    if (!leadId || (kind === "messages" && !conversationId)) return;
    const controller = new AbortController();
    void fetchHistory(leadId, conversationId, kind, null, controller.signal).then((page) => {
      if (!controller.signal.aborted) setState({ ...page, key, loading: false, error: null });
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setState({ key, messages: [], activities: [], trackingEvents: [], cursor: null, loading: false, error: error.message });
    });
    return () => controller.abort();
  }, [conversationId, key, kind, leadId]);

  async function loadMore() {
    if (!leadId || current.loading || (!current.cursor && !current.error)) return;
    setState({ ...current, loading: true, error: null });
    try {
      const page = await fetchHistory(leadId, conversationId, kind, current.cursor);
      setState((latest) => latest.key === key ? {
        ...page, key, loading: false, error: null,
        messages: mergeConversationMessages(page.messages, latest.messages),
        activities: mergeLeadActivities(page.activities, latest.activities),
        trackingEvents: mergeLeadActivities(page.trackingEvents, latest.trackingEvents),
      } : latest);
    } catch (error) {
      setState((latest) => latest.key === key ? { ...latest, loading: false, error: error instanceof Error ? error.message : "Falha ao carregar historico." } : latest);
    }
  }

  return { ...current, enabled, loadMore };
}

async function fetchHistory(leadId: string, conversationId: string | null, kind: string, cursor: AttendanceHistoryCursor | null, signal?: AbortSignal) {
  const params = new URLSearchParams({ leadId, kind });
  if (conversationId) params.set("conversationId", conversationId);
  if (cursor) params.set("cursor", JSON.stringify(cursor));
  const response = await fetch(`/api/dashboard/attendance/history?${params}`, { cache: "no-store", signal });
  const page = await response.json() as AttendanceHistoryPage & { error?: string };
  if (!response.ok) throw new Error(page.error ?? "Nao foi possivel carregar o historico.");
  return page;
}
