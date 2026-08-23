import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/whatsapp/lead-avatar-sync", () => ({
  readLeadProfileImageUrl: vi.fn(() => null),
  syncLeadAvatarFromUazapi: vi.fn(),
}));
vi.mock("@/lib/whatsapp/lead-names", () => ({
  resolveLeadPersonalName: vi.fn(() => null),
}));
vi.mock("@/lib/meta/social-approval-policy", () => ({
  buildMetaSocialSuggestedReply: vi.fn(() => "Resposta sugerida."),
  normalizeMetaSocialApprovalText: vi.fn((value) => String(value ?? "")),
}));
vi.mock("@/lib/meta/social-dispatch-audit", () => ({
  appendMetaDispatchAudit: vi.fn((metadata) => metadata),
  readMetaDispatchAudit: vi.fn(() => []),
}));
vi.mock("@/lib/meta/social-dispatcher", () => ({
  enqueueApprovedMetaSocialDispatch: vi.fn(),
}));
vi.mock("@/lib/meta/social-agent-policy", () => ({
  isMetaCommentChannel: vi.fn(() => false),
  isMetaSocialChannel: vi.fn((value) => typeof value === "string"),
  metaSocialCommentReceivedEventName: "connectyhub/meta.comment.received",
  metaSocialMessageReceivedEventName: "connectyhub/meta.message.received",
}));
vi.mock("./companies", () => ({
  listClientCompanies: vi.fn(),
  requireClientCompanyAccess: vi.fn(),
}));

import type { ClientCompany } from "./companies";
import { listClientCompanies } from "./companies";
import { getClientLeadCrmWorkspace } from "./leads-crm";
import { listClientSocialApprovals } from "./social-approvals";

type RecordedFilter = {
  column: string;
  table: string;
  value: unknown;
};

type QueryResponse = {
  data: unknown[];
  error: null;
};

type QueryBuilder = PromiseLike<QueryResponse> & {
  contains(column: string, value: unknown): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  in(column: string, value: unknown): QueryBuilder;
  limit(value: number): QueryBuilder;
  neq(column: string, value: unknown): QueryBuilder;
  not(column: string, operator: string, value: unknown): QueryBuilder;
  order(column: string, options?: unknown): QueryBuilder;
  select(columns: string): QueryBuilder;
};

const companyA: ClientCompany = {
  id: "org-a",
  name: "Empresa A",
  slug: "empresa-a",
  brandLogoUrl: null,
  brandLogoAlt: "Empresa A",
  planCode: "pro",
  status: "active",
  role: "owner",
  createdAt: null,
};

const companyB: ClientCompany = {
  id: "org-b",
  name: "Empresa B",
  slug: "empresa-b",
  brandLogoUrl: null,
  brandLogoAlt: "Empresa B",
  planCode: "scale",
  status: "active",
  role: "owner",
  createdAt: null,
};

describe("client dashboard scoped loaders", () => {
  beforeEach(() => {
    vi.mocked(listClientCompanies).mockReset();
    vi.mocked(listClientCompanies).mockResolvedValue([companyA, companyB]);
  });

  it("loads lead CRM data only for the current organization", async () => {
    const recorder = createQueryRecorder();

    const workspace = await getClientLeadCrmWorkspace({
      userId: "user-a",
      organizationId: companyA.id,
      company: companyA,
      client: recorder.client as never,
    });

    expect(workspace.companies.map((company) => company.id)).toEqual([companyA.id]);
    expect(recorder.organizationFilters("leads")).toEqual([[companyA.id]]);
    expect(recorder.organizationFilters("agent_registry")).toEqual([[companyA.id]]);
    expect(recorder.organizationFilters("intelligence_events")).toEqual([[companyA.id]]);
  });

  it("loads social approvals only for the current organization", async () => {
    const recorder = createQueryRecorder();

    const approvals = await listClientSocialApprovals({
      userId: "user-a",
      organizationId: companyA.id,
      company: companyA,
      client: recorder.client as never,
    });

    expect(approvals).toEqual([]);
    expect(recorder.organizationFilters("agent_runs")).toEqual([[companyA.id]]);
  });
});

function createQueryRecorder() {
  const filters: RecordedFilter[] = [];
  const tableRows: Record<string, unknown[]> = {
    whatsapp_instances: [{
      id: "wa-a",
      organization_id: companyA.id,
      connectyhub_api_client_id: null,
      connectyhub_api_visibility: null,
      phone_number: "5511999999999",
      display_name: "WhatsApp A",
      status: "connected",
      metadata: { client_agent: true },
    }],
    conversations: [{
      id: "conversation-a",
      organization_id: companyA.id,
      lead_id: "lead-a",
      whatsapp_instance_id: "wa-a",
      channel: "whatsapp",
      provider: "uazapi",
      provider_chat_id: "5511999999999@s.whatsapp.net",
      status: "open",
      last_message_preview: "Oi",
      last_message_at: "2026-08-22T12:00:00.000Z",
      metadata: {},
      created_at: "2026-08-22T12:00:00.000Z",
      updated_at: "2026-08-22T12:00:00.000Z",
    }],
    leads: [{
      id: "lead-a",
      organization_id: companyA.id,
      channel: "whatsapp",
      phone_number: "5511999999999",
      display_name: "Lead A",
      status: "active",
      score: 10,
      source: "whatsapp",
      last_event_summary: "Oi",
      last_message_at: "2026-08-22T12:00:00.000Z",
      metadata: {},
      created_at: "2026-08-22T12:00:00.000Z",
      updated_at: "2026-08-22T12:00:00.000Z",
    }],
  };

  return {
    client: {
      from(table: string) {
        const builder = {} as QueryBuilder;
        const chain = () => builder;

        builder.select = () => chain();
        builder.order = () => chain();
        builder.limit = () => chain();
        builder.eq = (column, value) => {
          filters.push({ column, table, value });
          return chain();
        };
        builder.in = (column, value) => {
          filters.push({ column, table, value });
          return chain();
        };
        builder.neq = (column, value) => {
          filters.push({ column, table, value });
          return chain();
        };
        builder.not = (column, operator, value) => {
          filters.push({ column, table, value: [operator, value] });
          return chain();
        };
        builder.contains = (column, value) => {
          filters.push({ column, table, value });
          return chain();
        };
        builder.then = (onfulfilled, onrejected) =>
          Promise.resolve({ data: tableRows[table] ?? [], error: null }).then(onfulfilled, onrejected);

        return builder;
      },
    },
    organizationFilters(table: string) {
      return filters
        .filter((filter) => filter.table === table && filter.column === "organization_id")
        .map((filter) => filter.value);
    },
  };
}
