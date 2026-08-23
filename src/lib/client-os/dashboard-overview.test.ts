import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("./companies", () => ({
  listClientCompanies: vi.fn(),
  requireClientCompanyAccess: vi.fn(),
}));

import {
  buildClientDashboardOverviewFromRows,
  getClientDashboardOverview,
  type ClientDashboardOverviewRows,
} from "./dashboard-overview";
import { listClientCompanies, type ClientCompany } from "./companies";

const companyA: ClientCompany = {
  id: "org-a",
  name: "Empresa A",
  slug: "empresa-cliente-a",
  brandLogoUrl: null,
  brandLogoAlt: "Empresa A",
  planCode: "pro",
  status: "active",
  role: "owner",
  createdAt: "2026-07-01T00:00:00.000Z",
};

const companyB: ClientCompany = {
  id: "org-b",
  name: "Empresa B",
  slug: "empresa-cliente-b",
  brandLogoUrl: null,
  brandLogoAlt: "Empresa B",
  planCode: "scale",
  status: "active",
  role: "owner",
  createdAt: "2026-07-01T00:00:00.000Z",
};

const now = new Date("2026-08-01T15:00:00.000Z");

describe("buildClientDashboardOverviewFromRows", () => {
  it("refuses a trusted company that does not match the selected organization", async () => {
    vi.mocked(listClientCompanies).mockResolvedValue([companyA, companyB]);

    const overview = await getClientDashboardOverview({
      userId: "user-a",
      organizationId: companyB.id,
      company: companyA,
      client: {} as never,
      now,
    });

    expect(overview.company).toBeNull();
    expect(overview.metrics.leads.total).toBe(0);
    expect(overview.warnings).toContain("Empresa selecionada nao corresponde ao workspace atual.");
  });

  it("keeps dashboard metrics scoped to the selected organization", () => {
    const overview = buildClientDashboardOverviewFromRows({
      company: companyA,
      companies: [companyA, companyB],
      now,
      rows: mixedRows(),
    });

    expect(overview.company?.id).toBe("org-a");
    expect(overview.metrics.leads.total).toBe(1);
    expect(overview.metrics.leads.qualified).toBe(1);
    expect(overview.metrics.conversations.total).toBe(1);
    expect(overview.metrics.messages.today).toBe(1);
    expect(overview.metrics.messages.inboundToday).toBe(1);
    expect(overview.metrics.messages.outboundToday).toBe(0);
    expect(overview.metrics.agents.total).toBe(1);
    expect(overview.metrics.whatsapp.connected).toBe(1);
    expect(overview.metrics.credits.available).toBe(900);
    expect(overview.metrics.credits.used30d).toBe(12);
    expect(overview.metrics.sales.revenue30dBrl).toBe(247);
    expect(overview.metrics.sales.approvedPayments30dBrl).toBe(247);
    expect(overview.metrics.sales.rejectedPayments30d).toBe(1);
    expect(overview.metrics.traffic.selectedAssets).toBe(1);
    expect(overview.metrics.traffic.openActions).toBe(1);
    expect(overview.metrics.automation.runs30d).toBe(1);
    expect(overview.metrics.automation.successRate).toBe(100);
    expect(overview.recentLeads.map((lead) => lead.name)).toEqual(["Lead A"]);
    expect(overview.recentConversations.map((conversation) => conversation.leadName)).toEqual(["Lead A"]);
    expect(overview.activeAgents.map((agent) => agent.name)).toEqual(["Agente A"]);
    expect(overview.campaigns.map((campaign) => campaign.name)).toEqual(["Campanha A", "Asset A"]);
    expect(overview.campaigns.map((campaign) => campaign.name)).not.toContain("Campanha B");
    expect(overview.campaigns.map((campaign) => campaign.name)).not.toContain("Asset B");
  });

  it("returns a zero state when no company is selected", () => {
    const overview = buildClientDashboardOverviewFromRows({
      company: null,
      companies: [companyA],
      now,
      rows: mixedRows(),
    });

    expect(overview.metrics.leads.total).toBe(0);
    expect(overview.metrics.conversations.total).toBe(0);
    expect(overview.metrics.messages.today).toBe(0);
    expect(overview.metrics.sales.revenue30dBrl).toBe(0);
    expect(overview.metrics.traffic.openActions).toBe(0);
    expect(overview.recentLeads).toHaveLength(0);
    expect(overview.campaigns).toHaveLength(0);
  });
});

function mixedRows() {
  return {
    leads: [
      {
        id: "lead-a",
        organization_id: "org-a",
        channel: "whatsapp",
        phone_number: "5511999990001",
        display_name: "Lead A",
        status: "qualified",
        score: 91,
        source: "Meta",
        last_event_summary: "Perguntou sobre o plano Pro.",
        last_message_at: "2026-08-01T14:10:00.000Z",
        metadata: {},
        created_at: "2026-08-01T13:00:00.000Z",
        updated_at: "2026-08-01T14:10:00.000Z",
      },
      {
        id: "lead-b",
        organization_id: "org-b",
        channel: "whatsapp",
        phone_number: "5511999990002",
        display_name: "Lead B",
        status: "won",
        score: 99,
        source: "Google",
        last_event_summary: "Dado de outra empresa.",
        last_message_at: "2026-08-01T14:20:00.000Z",
        metadata: {},
        created_at: "2026-08-01T13:05:00.000Z",
        updated_at: "2026-08-01T14:20:00.000Z",
      },
    ],
    conversations: [
      {
        id: "conversation-a",
        organization_id: "org-a",
        lead_id: "lead-a",
        channel: "whatsapp",
        provider: "uazapi",
        status: "open",
        last_message_preview: "Quero contratar.",
        last_message_at: "2026-08-01T14:10:00.000Z",
        metadata: {},
        created_at: "2026-08-01T13:01:00.000Z",
        updated_at: "2026-08-01T14:10:00.000Z",
      },
      {
        id: "conversation-b",
        organization_id: "org-b",
        lead_id: "lead-b",
        channel: "whatsapp",
        provider: "uazapi",
        status: "open",
        last_message_preview: "Nao deve aparecer.",
        last_message_at: "2026-08-01T14:20:00.000Z",
        metadata: {},
        created_at: "2026-08-01T13:06:00.000Z",
        updated_at: "2026-08-01T14:20:00.000Z",
      },
    ],
    messagesToday: [
      {
        id: "message-a",
        organization_id: "org-a",
        conversation_id: "conversation-a",
        lead_id: "lead-a",
        direction: "inbound",
        message_type: "text",
        occurred_at: "2026-08-01T14:10:00.000Z",
        created_at: "2026-08-01T14:10:00.000Z",
      },
      {
        id: "message-b",
        organization_id: "org-b",
        conversation_id: "conversation-b",
        lead_id: "lead-b",
        direction: "outbound",
        message_type: "text",
        occurred_at: "2026-08-01T14:20:00.000Z",
        created_at: "2026-08-01T14:20:00.000Z",
      },
    ],
    agents: [
      {
        id: "agent-a",
        organization_id: "org-a",
        name: "Agente A",
        persona_name: "Agente A",
        role_title: "Atendimento",
        status: "online",
        autonomy_level: 88,
        metadata: {},
        updated_at: "2026-08-01T14:00:00.000Z",
        created_at: "2026-07-10T14:00:00.000Z",
      },
      {
        id: "agent-b",
        organization_id: "org-b",
        name: "Agente B",
        persona_name: "Agente B",
        role_title: "Atendimento",
        status: "online",
        autonomy_level: 99,
        metadata: {},
        updated_at: "2026-08-01T14:00:00.000Z",
        created_at: "2026-07-10T14:00:00.000Z",
      },
    ],
    agentRuns30d: [
      {
        id: "run-a",
        organization_id: "org-a",
        run_status: "completed",
        trigger_source: "connectyhub/whatsapp.message.received",
        cost_credits: 4,
        started_at: "2026-08-01T14:00:00.000Z",
        finished_at: "2026-08-01T14:01:00.000Z",
        created_at: "2026-08-01T14:00:00.000Z",
      },
      {
        id: "run-b",
        organization_id: "org-b",
        run_status: "failed",
        trigger_source: "connectyhub/whatsapp.message.received",
        cost_credits: 900,
        started_at: "2026-08-01T14:00:00.000Z",
        finished_at: "2026-08-01T14:01:00.000Z",
        created_at: "2026-08-01T14:00:00.000Z",
      },
    ],
    whatsappInstances: [
      {
        id: "wa-a",
        organization_id: "org-a",
        status: "connected",
        phone_number: "5511999990001",
        display_name: "WhatsApp A",
        last_message_at: "2026-08-01T14:00:00.000Z",
        connected_at: "2026-07-01T14:00:00.000Z",
        updated_at: "2026-08-01T14:00:00.000Z",
      },
      {
        id: "wa-b",
        organization_id: "org-b",
        status: "connected",
        phone_number: "5511999990002",
        display_name: "WhatsApp B",
        last_message_at: "2026-08-01T14:00:00.000Z",
        connected_at: "2026-07-01T14:00:00.000Z",
        updated_at: "2026-08-01T14:00:00.000Z",
      },
    ],
    wallets: [
      {
        organization_id: "org-a",
        balance_credits: 900,
        reserved_credits: 10,
        lifetime_used_credits: 120,
        updated_at: "2026-08-01T14:00:00.000Z",
      },
      {
        organization_id: "org-b",
        balance_credits: 999999,
        reserved_credits: 0,
        lifetime_used_credits: 999,
        updated_at: "2026-08-01T14:00:00.000Z",
      },
    ],
    usageEvents30d: [
      {
        id: "usage-a",
        organization_id: "org-a",
        feature_code: "whatsapp",
        connecty_charge_credits: 12,
        occurred_at: "2026-08-01T14:00:00.000Z",
        created_at: "2026-08-01T14:00:00.000Z",
      },
      {
        id: "usage-b",
        organization_id: "org-b",
        feature_code: "whatsapp",
        connecty_charge_credits: 999,
        occurred_at: "2026-08-01T14:00:00.000Z",
        created_at: "2026-08-01T14:00:00.000Z",
      },
    ],
    billingPayments30d: [
      {
        id: "payment-a",
        organization_id: "org-a",
        status: "approved",
        amount_brl: 247,
        paid_at: "2026-08-01T14:00:00.000Z",
        created_at: "2026-08-01T14:00:00.000Z",
      },
      {
        id: "payment-a-rejected",
        organization_id: "org-a",
        status: "rejected",
        amount_brl: 97,
        paid_at: null,
        created_at: "2026-08-01T14:30:00.000Z",
      },
      {
        id: "payment-b",
        organization_id: "org-b",
        status: "approved",
        amount_brl: 497,
        paid_at: "2026-08-01T14:00:00.000Z",
        created_at: "2026-08-01T14:00:00.000Z",
      },
    ],
    salesOrders30d: [
      {
        id: "order-a",
        organization_id: "org-a",
        status: "paid",
        payment_status: "confirmed",
        total: "247",
        created_at: "2026-08-01T14:00:00.000Z",
        updated_at: "2026-08-01T14:00:00.000Z",
      },
      {
        id: "order-b",
        organization_id: "org-b",
        status: "paid",
        payment_status: "confirmed",
        total: "497",
        created_at: "2026-08-01T14:00:00.000Z",
        updated_at: "2026-08-01T14:00:00.000Z",
      },
    ],
    integrationAssets: [
      {
        id: "asset-a",
        organization_id: "org-a",
        provider_id: "meta-ads",
        asset_type: "meta_campaign",
        label: "Asset A",
        status: "selected",
        is_selected: true,
        metrics_summary: { spend: 80, conversions: 2 },
        last_synced_at: "2026-08-01T14:00:00.000Z",
        updated_at: "2026-08-01T14:00:00.000Z",
      },
      {
        id: "asset-b",
        organization_id: "org-b",
        provider_id: "meta-ads",
        asset_type: "meta_campaign",
        label: "Asset B",
        status: "selected",
        is_selected: true,
        metrics_summary: { spend: 800, conversions: 20 },
        last_synced_at: "2026-08-01T14:00:00.000Z",
        updated_at: "2026-08-01T14:00:00.000Z",
      },
    ],
    metricSnapshots: [
      {
        id: "snapshot-a",
        organization_id: "org-a",
        provider_id: "meta-ads",
        resource_type: "campaign",
        external_id: "campaign-a",
        label: "Campanha A",
        metrics: { spend: 80, clicks: 40, conversions: 2, roas: 3 },
        dimensions: { status: "ACTIVE" },
        date_start: "2026-08-01",
        date_stop: "2026-08-01",
        collected_at: "2026-08-01T14:00:00.000Z",
      },
      {
        id: "snapshot-b",
        organization_id: "org-b",
        provider_id: "meta-ads",
        resource_type: "campaign",
        external_id: "campaign-b",
        label: "Campanha B",
        metrics: { spend: 800, clicks: 400, conversions: 20, roas: 8 },
        dimensions: { status: "ACTIVE" },
        date_start: "2026-08-01",
        date_stop: "2026-08-01",
        collected_at: "2026-08-01T14:00:00.000Z",
      },
    ],
    trafficActions: [
      {
        id: "traffic-a",
        organization_id: "org-a",
        platform: "meta",
        priority: "high",
        status: "queued",
        title: "Ajustar campanha A",
        created_at: "2026-08-01T14:00:00.000Z",
      },
      {
        id: "traffic-b",
        organization_id: "org-b",
        platform: "meta",
        priority: "high",
        status: "queued",
        title: "Ajustar campanha B",
        created_at: "2026-08-01T14:00:00.000Z",
      },
    ],
  } satisfies ClientDashboardOverviewRows;
}
