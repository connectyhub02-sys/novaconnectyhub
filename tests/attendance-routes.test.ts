import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as cursors from "@/lib/client-os/attendance-history-cursor";

const leadId = "00000000-0000-4000-8000-000000000001";
const conversationId = "00000000-0000-4000-8000-000000000002";
const workspace = { user: { id: "user" }, organization: { id: "company" }, profile: { isPlatformAdmin: false } };
const server = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
type Route = { GET(request: { nextUrl: URL }): Promise<Response> };

describe("attendance endpoints", () => {
  it("requires authentication before reading history", async () => {
    const getHistory = vi.fn();
    const route = serverModuleHarness<Route>("src/app/api/dashboard/attendance/history/route.ts", {
      "next/server": server, "@/lib/supabase/profile": { getCurrentWorkspace: async () => null },
      "@/lib/client-os/leads-crm": { getAttendanceHistory: getHistory }, "@/lib/client-os/attendance-history-cursor": cursors,
    });
    expect((await route.GET({ nextUrl: new URL("https://example.test/history") })).status).toBe(401);
    expect(getHistory).not.toHaveBeenCalled();
  });

  it("binds history access to the authenticated workspace and rejects invalid cursors", async () => {
    const getHistory = vi.fn(async () => ({ messages: [], activities: [], trackingEvents: [], cursor: null }));
    const route = serverModuleHarness<Route>("src/app/api/dashboard/attendance/history/route.ts", {
      "next/server": server, "@/lib/supabase/profile": { getCurrentWorkspace: async () => workspace },
      "@/lib/client-os/leads-crm": { getAttendanceHistory: getHistory }, "@/lib/client-os/attendance-history-cursor": cursors,
    });
    const nextUrl = new URL(`https://example.test/history?leadId=${leadId}&conversationId=${conversationId}&organizationId=other-company`);
    const response = await route.GET({ nextUrl });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getHistory).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "company", isPlatformAdmin: false }));
    nextUrl.searchParams.set("cursor", "invalid-json");
    expect((await route.GET({ nextUrl })).status).toBe(400);
    expect(getHistory).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("preserves checkout cards when commerce refresh is %s", async (includeCommerce) => {
    const listOrders = vi.fn(async () => [{ id: "order" }]);
    const listSessions = vi.fn(async () => [{ id: "session" }]);
    const route = serverModuleHarness<Route>("src/app/api/dashboard/attendance/live/route.ts", {
      "next/server": server, "@/lib/supabase/profile": { getCurrentWorkspace: async () => workspace },
      "@/lib/client-os/current-company": { currentOrganizationToClientCompany: (company: unknown) => company },
      "@/lib/client-os/leads-crm": { getClientLeadCrmWorkspace: async () => ({ leads: [] }) },
      "@/lib/client-os/sales-catalog": { listClientSalesCatalogOrders: listOrders, listClientSalesCatalogPaymentSessions: listSessions },
    });
    const response = await route.GET({ nextUrl: new URL(`https://example.test/live?commerce=${includeCommerce ? 1 : 0}`) });
    const body = await response.json();
    expect(response.status).toBe(200);
    if (includeCommerce) {
      expect(body.salesCatalogOrders).toEqual([{ id: "order" }]);
      expect(body.salesCatalogPaymentSessions).toEqual([{ id: "session" }]);
    } else {
      expect(body).not.toHaveProperty("salesCatalogOrders");
      expect(body).not.toHaveProperty("salesCatalogPaymentSessions");
      expect(listOrders).not.toHaveBeenCalled();
      expect(listSessions).not.toHaveBeenCalled();
    }
  });
});
