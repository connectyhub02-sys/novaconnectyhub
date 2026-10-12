import { NextResponse } from "next/server";
import { metaAnalyticsAccess, AnalyticsAccessError } from "@/lib/meta/analytics-access";
import { getMetaAdsAnalytics } from "@/lib/meta/ads-analytics";
import { statusForDashboardCompanyScopeError } from "@/lib/client-os/dashboard-route-scope";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { client, organizationId, selectedAccountOnly } = await metaAnalyticsAccess(request);
    const p = new URL(request.url).searchParams;
    const report = await getMetaAdsAnalytics(client, organizationId, { accountId: p.get("accountId"), days: p.get("days"), since: p.get("since"), until: p.get("until"), ...(selectedAccountOnly ? { selectedAccountOnly: true } : {}) });
    return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Relatório indisponível." }, {
      status: statusForDashboardCompanyScopeError(error, error instanceof AnalyticsAccessError ? error.status : 400), headers: { "Cache-Control": "private, no-store" },
    });
  }
}
