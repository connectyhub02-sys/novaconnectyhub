import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/billing/trial", () => ({
  assertBillableAccess: vi.fn(),
  grantTrialCredits: vi.fn(),
  scheduleTrialConversionMessages: vi.fn(),
}));

import { listClientCompanies, requireClientCompanyAccess } from "./companies";

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
});

function createMembershipClient(rows: MembershipRow[]) {
  return {
    from(table: string) {
      if (table !== "organization_members") {
        throw new Error(`Unexpected table ${table}`);
      }

      const filters = new Map<string, unknown>();
      const builder = {} as QueryBuilder;
      const chain = () => builder;

      builder.select = () => chain();
      builder.order = () => chain();
      builder.eq = (column, value) => {
        filters.set(column, value);
        return chain();
      };
      builder.maybeSingle = () => Promise.resolve({
        data: rows.find((row) => row.organizations?.id === filters.get("organization_id")) ?? null,
        error: null,
      });
      builder.then = (onfulfilled, onrejected) =>
        Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);

      return builder;
    },
  };
}
