import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/billing/trial", () => ({
  assertBillableAccess: vi.fn(),
  grantTrialCredits: vi.fn(),
  scheduleTrialConversionMessages: vi.fn(),
}));

import { assertBillableAccess } from "@/lib/billing/trial";
import { deleteClientCompany, listClientCompanies, requireClientCompanyAccess } from "./companies";

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
  error: { message: string } | null;
};

type QueryBuilder = PromiseLike<QueryResponse> & {
  eq(column: string, value: unknown): QueryBuilder;
  maybeSingle(): Promise<QueryResponse>;
  order(column: string, options?: unknown): QueryBuilder;
  select(columns: string): QueryBuilder;
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

    expect(assertBillableAccess).not.toHaveBeenCalled();
    expect(client.organizationUpdates).toEqual([
      {
        filters: { id: "org-auto", owner_id: "user-a" },
        status: "archived",
      },
    ]);
  });
});

function createMembershipClient(rows: MembershipRow[]) {
  const organizationUpdates: Array<{
    filters: Record<string, unknown>;
    status: unknown;
  }> = [];

  return {
    organizationUpdates,
    from(table: string) {
      if (table !== "organization_members" && table !== "organizations") {
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
      builder.maybeSingle = () => {
        if (table === "organizations") {
          const row = rows.find((item) => item.organizations?.id === filters.get("id")) ?? null;

          if (!row?.organizations || filters.get("owner_id") !== "user-a") {
            return Promise.resolve({ data: null, error: null });
          }

          if (updatePayload) {
            row.organizations.status = String(updatePayload.status ?? row.organizations.status);
            organizationUpdates.push({
              filters: Object.fromEntries(filters),
              status: updatePayload.status,
            });
          }

          return Promise.resolve({ data: row.organizations, error: null });
        }

        return Promise.resolve({
          data: rows.find((row) => row.organizations?.id === filters.get("organization_id")) ?? null,
          error: null,
        });
      };
      builder.then = (onfulfilled, onrejected) =>
        Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);

      return builder;
    },
  };
}
