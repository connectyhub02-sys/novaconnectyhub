import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { updateLeadMetadata } from "@/lib/leads/metadata-update";

function database(initial: Record<string, unknown>, concurrentPatch?: Record<string, unknown>) {
  let metadata = structuredClone(initial);
  let attempts = 0;
  let version = 1;
  const filters: Record<string, unknown>[] = [];
  const client = {
    from: () => {
      let patch: { metadata: Record<string, unknown> } | undefined;
      const conditions: Record<string, unknown> = {};
      const query = {
        select: () => query,
        update: (value: typeof patch) => { patch = value; return query; },
        eq: (key: string, value: unknown) => { conditions[key] = value; return query; },
        is: (key: string, value: unknown) => { conditions[key] = value; return query; },
        maybeSingle: async () => {
          if (!patch) return { data: { metadata: structuredClone(metadata), updated_at: `version-${version}` }, error: null };
          attempts++;
          filters.push(conditions);
          if (concurrentPatch && attempts === 1) { metadata = { ...metadata, ...concurrentPatch }; version++; }
          if (conditions.updated_at !== `version-${version}`) return { data: null, error: null };
          metadata = structuredClone(patch.metadata);
          version++;
          return { data: { metadata }, error: null };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, read: () => metadata, attempts: () => attempts, filters };
}

describe("lead metadata writes", () => {
  it("preserves captured billing details when a delayed memory write completes", async () => {
    const db = database({ email: "cliente@example.com", customer_document: "12345678901", lead_memory: { email: "cliente@example.com" } });
    await updateLeadMetadata({ client: db.client, organizationId: "store", leadId: "lead", buildUpdate: current => ({
      metadata: { ...current, lead_memory: { ...(current.lead_memory as object), summary: "Pedido confirmado" } },
    }) });
    expect(db.read()).toMatchObject({ email: "cliente@example.com", customer_document: "12345678901", lead_memory: { email: "cliente@example.com", summary: "Pedido confirmado" } });
    expect(db.filters[0]).toMatchObject({ id: "lead", organization_id: "store" });
  });

  it("retries against new data when another turn saves an address between read and write", async () => {
    const db = database({ email: "cliente@example.com" }, { delivery_address: "Rua A, 42, Centro" });
    await updateLeadMetadata({ client: db.client, organizationId: "store", leadId: "lead", buildUpdate: current => ({ metadata: { ...current, qualification_score: 90 } }) });
    expect(db.attempts()).toBe(2);
    expect(db.read()).toEqual({ email: "cliente@example.com", delivery_address: "Rua A, 42, Centro", qualification_score: 90 });
  });
});
