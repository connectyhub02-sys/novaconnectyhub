import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import * as activation from "../src/lib/automations/agenda-activation";
import * as policy from "../src/lib/sales-catalog/appointment-policy";
import * as scope from "../src/lib/client-os/dashboard-route-scope";
import * as calendar from "../src/lib/automations/calendar-view";
import * as shared from "../src/lib/sales-catalog/shared";
import type * as Agent from "../src/lib/automations/agenda-agent";
import type * as Route from "../src/app/api/dashboard/agenda/route";
import type * as Importer from "../src/lib/sales-catalog/importer";

const resourceId = "11111111-1111-4111-8111-111111111111";
function fixture(enabled = false) {
  return commerceDatabase({ customer_agenda_settings: [{ organization_id: "company", enabled, timezone: "America/Manaus" }, { organization_id: "other", enabled: true }],
    customer_agenda_resources: [{ id: resourceId, organization_id: "company", enabled: true, kind: "service" }] });
}

describe("explicit company activation", () => {
  it("rejects a forged product form before uploading media or saving the product", async () => {
    const f = fixture();
    const route = serverModuleHarness<{ POST: (request: unknown) => Promise<Response> }>("src/app/api/dashboard/sales-catalog/route.ts", {
      "@/lib/sales-catalog/appointment-policy": policy,
      "@/lib/sales-catalog/shared": shared,
      "@/lib/supabase/profile": { getCurrentWorkspace: async () => ({ user: { id: "owner" }, profile: { isPlatformAdmin: false }, organization: { id: "company", role: "owner" } }) },
      "@/lib/supabase/service": { createServiceClient: () => f.client },
      "@/lib/client-os/companies": { requireClientCompanyAccess: async () => ({ id: "company" }) },
      "@/lib/billing/trial": { assertBillableAccess: async () => {}, BillingAccessError: class extends Error {} },
      "@/lib/client-os/dashboard-route-scope": scope,
      "next/server": { NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } },
      "node:crypto": { randomUUID },
    }, [], { Error });
    const form = new FormData();
    for (const [key, value] of Object.entries({ companyId: "company", title: "Imóvel de teste", description: "Imóvel fictício", salesDestination: "appointment" })) form.set(key, value);
    const response = await route.POST({ headers: new Headers(), formData: async () => form });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Ative a agenda") });
    expect(f.tables.intelligence_memory ?? []).toHaveLength(0);
  });
  it("blocks a new appointment destination, even without a resource or with another company's active agenda", async () => {
    const f = fixture();
    for (const id of [null, resourceId]) await expect(policy.validateProductAgenda(f.client as never, "company", id, "appointment")).rejects.toThrow("Ative a agenda");
    expect(await activation.readAgendaActivation(f.client as never, "missing")).toMatchObject({ enabled: false });
    expect(f.tables.customer_agenda_settings[0].enabled).toBe(false);
  });
  it("preserves existing configuration and unrelated edits while paused, but rejects a new link", async () => {
    const f = fixture();
    const previous = { salesDestination: "appointment", fulfillment: { agendaResourceId: resourceId } };
    f.tables.customer_agenda_resources[0].enabled = false;
    await expect(policy.validateProductAgenda(f.client as never, "company", resourceId, "appointment", previous)).resolves.toBeUndefined();
    await expect(policy.validateProductAgenda(f.client as never, "company", "new", "appointment", previous)).rejects.toThrow("Ative a agenda");
    await expect(policy.validateProductAgenda(f.client as never, "company", null, "external_site", previous)).resolves.toBeUndefined();
  });
  it("releases selection after activation and still enforces resource scope and status", async () => {
    const f = fixture(true);
    await expect(policy.validateProductAgenda(f.client as never, "company", resourceId, "appointment")).resolves.toBeUndefined();
    await expect(policy.validateProductAgenda(f.client as never, "other", resourceId, "appointment")).rejects.toThrow("desta empresa");
    f.tables.customer_agenda_resources[0].enabled = false;
    await expect(policy.validateProductAgenda(f.client as never, "company", resourceId, "appointment")).rejects.toThrow("ativa");
  });
  it("allows the responsible user to explicitly activate an empty agenda, without creating resources", async () => {
    const f = fixture(); f.tables.customer_agenda_resources = [];
    const rpc = vi.fn();
    const route = serverModuleHarness<typeof Route>("src/app/api/dashboard/agenda/route.ts", {
      "next/server": { NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } },
      "@/lib/supabase/profile": { getCurrentWorkspace: async () => ({ user: { id: "owner" }, profile: { isPlatformAdmin: false }, organization: { id: "company", role: "owner" } }) },
      "@/lib/supabase/service": { createServiceClient: () => ({ ...f.client, rpc }) },
      "@/lib/client-os/dashboard-route-scope": scope,
      "@/lib/automations/calendar-view": calendar,
      "@/lib/automations/agenda-activation": activation,
      "@/lib/automations/agenda": { getAgenda: async () => ({ settings: await activation.readAgendaActivation(f.client as never, "company"), resources: [], bookings: [] }) },
    }, [], { Error });
    const request = (body: unknown) => ({ json: async () => body }) as never;
    const result = await route.POST(request({ companyId: "company", action: "set_enabled", enabled: true }));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ settings: { enabled: true }, resources: [] });
    expect(f.tables.customer_agenda_resources).toEqual([]);
    await route.POST(request({ companyId: "company", action: "set_enabled", enabled: false }));
    for (const action of ["availability", "book", "reschedule"]) {
      const blocked = await route.POST(request({ companyId: "company", action }));
      expect(blocked.status).toBe(400);
      expect(await blocked.json()).toMatchObject({ error: expect.stringContaining("desativado") });
    }
    expect(rpc).not.toHaveBeenCalled();
    expect(f.tables.customer_agenda_settings[1].enabled).toBe(true);
  });
  it("rejects alternate import patch, draft and publication paths before writing a destination", async () => {
    const f = fixture(), id = randomUUID();
    f.tables.sales_catalog_import_items = [{ id, import_job_id: "job", organization_id: "company", sales_destination: "connectyhub_checkout", fulfillment: {} }];
    const importer = serverModuleHarness<typeof Importer & { publishImportItemAsCatalogItem: (input: unknown) => Promise<unknown> }>("src/lib/sales-catalog/importer.ts", {
      "./appointment-policy": policy, "@/lib/sales-catalog/shared": shared, "node:crypto": { randomUUID },
    }, ["publishImportItemAsCatalogItem"]);
    await expect(importer.updateSalesCatalogImportItems({ client: f.client as never, companyId: "company", jobId: "job", patches: [{ id, salesDestination: "appointment" }] })).rejects.toThrow("Ative a agenda");
    const item = { title: "Visita", salesDestination: "appointment", fulfillment: { agendaResourceId: resourceId } };
    await expect(importer.createSalesCatalogImportReviewJob({ client: f.client, companyId: "company", drafts: [item] } as never)).rejects.toThrow("Ative a agenda");
    await expect(importer.publishImportItemAsCatalogItem({ client: f.client, companyId: "company", item })).rejects.toThrow("Ative a agenda");
    expect(f.tables.sales_catalog_import_items[0].sales_destination).toBe("connectyhub_checkout");
    expect(f.tables.intelligence_memory ?? []).toHaveLength(0);
  });
  it("does not infer activation from the agent's activity", async () => {
    const f = fixture(); f.tables.agent_registry = [{ organization_id: "company", metadata: { builder: {} } }];
    const defaults = serverModuleHarness<typeof import("../src/lib/sales-catalog/activity-defaults")>("src/lib/sales-catalog/activity-defaults.ts", {
      "@/lib/automations/agenda-activation": activation,
      "@/lib/whatsapp/activity-profile": { activityDefaultDestination: () => "appointment" },
      "@/lib/whatsapp/agent-prompt-templates": { promptBuilderMetadataKey: "builder", normalizeAgentPromptBuilderConfig: () => ({ templateId: "real_estate" }) },
    });
    expect(await defaults.loadCatalogActivityDefaults(f.client as never, "company")).toMatchObject({ destination: "manual_handoff" });
    f.tables.customer_agenda_settings[0].enabled = true;
    expect(await defaults.loadCatalogActivityDefaults(f.client as never, "company")).toMatchObject({ destination: "appointment" });
  });
  it("returns a disabled instruction before reading old offers, cached confirmations or calling the model", async () => {
    const f = fixture();
    f.tables.customer_agenda_turns = [{ organization_id: "company", run_id: "run", result: { booked: true, fallback: "Agendei" } }];
    const fetch = vi.fn(), rpc = vi.fn();
    const agent = serverModuleHarness<typeof Agent>("src/lib/automations/agenda-agent.ts", {}, [], { fetch });
    const result = await agent.processAgendaTurn({ client: { ...f.client, rpc }, organizationId: "company", runId: "run", userText: "Quero agendar" } as never);
    expect(result).toMatchObject({ disabled: true, booked: false, context: expect.stringContaining("AGENDA DESATIVADA") });
    expect(fetch).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
    const runtime = runtimeHarness();
    for (const text of ["Posso agendar para você", "Agendei sua visita", "Seu agendamento está confirmado", "Escolha um horário na página", "Vou reservar amanhã", "Sua visita foi marcada"]) {
      expect(runtime("enforceAgendaResponse", text, "Sim", result)).toBe(result?.fallback);
    }
    expect(runtime("enforceAgendaResponse", "O imóvel tem três quartos.", "Quantos quartos?", result)).toBe("O imóvel tem três quartos.");
  });
  it("guards the storefront assistant against offers while paused and confirmations it cannot execute", () => {
    const store = serverModuleHarness<{ guardCommerceAgendaReply: (text: string, userText: string, enabled: boolean) => string }>("src/lib/commerce-agent/server.ts", {
      "@/lib/automations/agenda-activation": activation,
    }, ["guardCommerceAgendaReply"]);
    expect(store.guardCommerceAgendaReply("Abra Agendar na página", "Quero visitar", false)).toBe(activation.agendaDisabledMessage);
    expect(store.guardCommerceAgendaReply("Sua visita foi agendada", "Sim", true)).toContain("use a agenda na página");
    expect(store.guardCommerceAgendaReply("O imóvel tem três quartos.", "Quantos quartos?", false)).toBe("O imóvel tem três quartos.");
  });
});
