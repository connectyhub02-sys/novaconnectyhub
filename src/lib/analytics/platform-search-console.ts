import "server-only";
import { platformGoogleReaderAccount, platformGoogleReadToken } from "./platform-analytics";

type SearchRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };
export type SearchReport = {
  status: "connected" | "pending" | "error"; detail: string; siteUrl: string;
  startDate: string; endDate: string; total: SearchRow | null; pages: SearchRow[]; queries: SearchRow[];
};

export async function getPlatformSearchConsole(): Promise<SearchReport> {
  // Search Console dates use Pacific Time. Final data avoids presenting partial days as complete.
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const end = new Date(`${date}T12:00:00Z`); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 27);
  const report: SearchReport = { status: "pending", detail: "Conceda leitura à conta de serviço na propriedade canônica do Search Console.",
    siteUrl: "https://www.connectyhub.com.br/", startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), total: null, pages: [], queries: [] };
  try {
    const account = await platformGoogleReaderAccount();
    if (!account) return report;
    const token = await platformGoogleReadToken(account, "webmasters.readonly");
    const query = async (dimensions: string[]) => {
      const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(report.siteUrl)}/searchAnalytics/query`, {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: report.startDate, endDate: report.endDate, dimensions, type: "web", dataState: "final", rowLimit: 10 }),
      });
      if (!response.ok) throw new Error(response.status === 403
        ? "O Google negou a leitura: confira a Search Console API e o acesso restrito da conta de serviço a esta propriedade."
        : `Search Console temporariamente indisponível (HTTP ${response.status}).`);
      return await response.json() as { rows?: SearchRow[] };
    };
    const [total, pages, queries] = await Promise.all([query([]), query(["page"]), query(["query"])]);
    report.total = total.rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    report.pages = pages.rows ?? []; report.queries = queries.rows ?? [];
    report.status = "connected";
    report.detail = "Relatório real do Search Console, com dados consolidados da pesquisa Web. O Google pode levar alguns dias para consolidar o período e omite consultas por privacidade.";
  } catch (error) {
    report.status = "error";
    report.detail = error instanceof Error && /^(O Google|Search Console)/.test(error.message) ? error.message : "Não foi possível consultar o Search Console. Confira a conexão de leitura.";
  }
  return report;
}
