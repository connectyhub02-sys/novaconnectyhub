import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/billing/trial", () => ({
  grantTrialCredits: vi.fn(),
  scheduleTrialConversionMessages: vi.fn(),
}));

import { deleteClientCompany, listClientCompanies, requireClientCompanyAccess, updateClientCompany } from "./companies";

type MembershipRow = {
  role: string;
  organizations: {
    id: string;
    name: string;
    slug: string | null;
    plan_code: string;
    status: string;
    created_at: string | null;
  } | null;
};

type QueryResponse = {
  data?: unknown;
  count?: number | null;
  error: { message: string } | null;
};

type QueryBuilder = PromiseLike<QueryResponse> & {
  eq(column: string, value: unknown): QueryBuilder;
  maybeSingle(): Promise<QueryResponse>;
  neq(column: string, value: unknown): QueryBuilder;
  order(column: string, options?: unknown): QueryBuilder;
  select(columns: string, options?: unknown): QueryBuilder;
  update(payload: Record<string, unknown>): QueryBuilder;
};

const autoGoogleCompany: MembershipRow = {
  role: "owner",
  organizations: {
    id: "org-auto",
    name: "Connectyhub20",
    slug: "connectyhub20-mabc123",
    plan_code: "trial",
    status: "trial",
    created_at: "2026-08-15T12:00:00.000Z",
  },
};

const prefixedCompany: MembershipRow = {
  role: "owner",
  organizations: {
    id: "org-prefixed",
    name: "Empresa Cliente",
    slug: "empresa-cliente-empresa-cliente-mabc123",
    plan_code: "trial",
    status: "trial",
    created_at: "2026-08-15T12:05:00.000Z",
  },
};

const internalCompany: MembershipRow = {
  role: "owner",
  organizations: {
    id: "org-internal",
    name: "ConnectyHub Interno",
    slug: "connectyhub-interno",
    plan_code: "internal",
    status: "active",
    created_at: "2026-08-15T12:10:00.000Z",
  },
};

describe("client companies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists automatic Google-created client workspaces without the legacy client slug prefix", async () => {
    const client = createMembershipClient([autoGoogleCompany, internalCompany]);

    const companies = await listClientCompanies("user-a", client as never);

    expect(companies).toEqual([
      {
        id: "org-auto",
        name: "Connectyhub20",
        slug: "connectyhub20-mabc123",
        planCode: "trial",
        status: "trial",
        role: "owner",
        createdAt: "2026-08-15T12:00:00.000Z",
      },
    ]);
  });

  it("keeps legacy prefixed client companies visible", async () => {
    const client = createMembershipClient([prefixedCompany]);

    const companies = await listClientCompanies("user-a", client as never);

    expect(companies.map((company) => company.id)).toEqual(["org-prefixed"]);
  });

  it("allows access to an automatic non-internal workspace linked to the user", async () => {
    const client = createMembershipClient([autoGoogleCompany]);

    await expect(requireClientCompanyAccess({
      userId: "user-a",
      companyId: "org-auto",
      client: client as never,
    })).resolves.toMatchObject({
      id: "org-auto",
      name: "Connectyhub20",
      planCode: "trial",
    });
  });

  it("does not expose internal platform workspaces as client companies", async () => {
    const client = createMembershipClient([internalCompany]);

    await expect(requireClientCompanyAccess({
      userId: "user-a",
      companyId: "org-internal",
      client: client as never,
    })).rejects.toThrow("Escolha uma empresa vinculada a sua conta.");
  });

  it("does not expose archived workspaces as client companies", async () => {
    const archivedCompany: MembershipRow = {
      ...autoGoogleCompany,
      organizations: {
        ...autoGoogleCompany.organizations!,
        status: "archived",
      },
    };
    const client = createMembershipClient([archivedCompany]);

    await expect(listClientCompanies("user-a", client as never)).resolves.toEqual([]);
    await expect(requireClientCompanyAccess({
      userId: "user-a",
      companyId: "org-auto",
      client: client as never,
    })).rejects.toThrow("Escolha uma empresa vinculada a sua conta.");
  });

  it("archives a client company instead of deleting the organization row", async () => {
    const client = createMembershipClient([autoGoogleCompany]);

    await expect(deleteClientCompany({
      userId: "user-a",
      companyId: "org-auto",
      client: client as never,
    })).resolves.toMatchObject({ id: "org-auto" });

    expect(client.organizationUpdates).toEqual([
      {
        filters: { id: "org-auto", owner_id: "user-a" },
        payload: expect.objectContaining({
          status: "archived",
          updated_at: expect.any(String),
        }),
      },
    ]);
  });

  it("blocks deleting a client company while agents are linked", async () => {
    const client = createMembershipClient([autoGoogleCompany], {
      linkedAgentCountByCompanyId: { "org-auto": 1 },
    });

    await expect(deleteClientCompany({
      userId: "user-a",
      companyId: "org-auto",
      client: client as never,
    })).rejects.toThrow("Esta empresa possui 1 agente vinculado.");

    expect(client.organizationUpdates).toEqual([]);
  });

  it("updates automatic Google-created client companies", async () => {
    const client = createMembershipClient([autoGoogleCompany]);

    await expect(updateClientCompany({
      userId: "user-a",
      companyId: "org-auto",
      name: "Vision Business Group",
      client: client as never,
    })).resolves.toMatchObject({
      id: "org-auto",
      name: "Vision Business Group",
    });

    expect(client.organizationUpdates).toEqual([
      {
        filters: { id: "org-auto", owner_id: "user-a" },
        payload: expect.objectContaining({
          name: "Vision Business Group",
          updated_at: expect.any(String),
        }),
      },
    ]);
  });
});

function createMembershipClient(
  rows: MembershipRow[],
  options: { linkedAgentCountByCompanyId?: Record<string, number> } = {},
) {
  const mutableRows = rows.map((row) => ({
    ...row,
    organizations: row.organizations ? { ...row.organizations } : null,
  }));
  const organizationUpdates: Array<{
    filters: Record<string, unknown>;
    payload: Record<string, unknown>;
  }> = [];

  return {
    organizationUpdates,
    from(table: string) {
      if (table !== "organization_members" && table !== "organizations" && table !== "agent_registry") {
        throw new Error(`Unexpected table ${table}`);
      }

      const filters = new Map<string, unknown>();
      let updatePayload: Record<string, unknown> | null = null;
      const builder = {} as QueryBuilder;
      const chain = () => builder;

      builder.select = () => chain();
      builder.order = () => chain();
      builder.update = (payload) => {
        updatePayload = payload;
        return chain();
      };
      builder.eq = (column, value) => {
        filters.set(column, value);
        return chain();
      };
      builder.neq = () => chain();
      builder.maybeSingle = () => {
        if (table === "organizations") {
          const row = mutableRows.find((item) => item.organizations?.id === filters.get("id")) ?? null;

          if (!row?.organizations || filters.get("owner_id") !== "user-a") {
            return Promise.resolve({ data: null, error: null });
          }

          if (updatePayload) {
            row.organizations.status = String(updatePayload.status ?? row.organizations.status);
            row.organizations.name = String(updatePayload.name ?? row.organizations.name);
            organizationUpdates.push({
              filters: Object.fromEntries(filters),
              payload: updatePayload,
            });
          }

          return Promise.resolve({ data: row.organizations, error: null });
        }

        return Promise.resolve({
          data: mutableRows.find((row) => row.organizations?.id === filters.get("organization_id")) ?? null,
          error: null,
        });
      };
      builder.then = (onfulfilled, onrejected) => {
        if (table === "agent_registry") {
          const organizationId = String(filters.get("organization_id") ?? "");
          const count = options.linkedAgentCountByCompanyId?.[organizationId] ?? 0;

          return Promise.resolve({ data: [], count, error: null }).then(onfulfilled, onrejected);
        }

        return Promise.resolve({ data: mutableRows, error: null }).then(onfulfilled, onrejected);
      };

      return builder;
    },
  };
}
