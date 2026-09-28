// Checks whether the test store accepts delivery and pickup orders right now.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";

for (const line of readFileSync(resolve(__dirname, "../../../.env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}
vi.mock("server-only", () => ({}));

it.runIf(process.env.SEED_STEP === "hours")("store accepts orders now", async () => {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const { evaluateOrderOperation } = await import("@/lib/sales-catalog/operation-hours");
  const { data } = await createServiceClient().from("intelligence_memory").select("metadata")
    .eq("organization_id", "a90c4ce6-b66c-47c4-a3f3-660af7bb178d").eq("memory_type", "sales_catalog_settings").single();
  const operations = (data?.metadata as { order_policy?: { operations?: unknown } }).order_policy?.operations;
  const snake = operations as Record<string, unknown>;
  const policy = { ...snake, timeZone: snake.timeZone ?? snake.time_zone, closedDates: snake.closedDates ?? snake.closed_dates ?? [], pausedUntil: snake.pausedUntil ?? snake.paused_until ?? null,
    preparationMinutes: snake.preparationMinutes ?? snake.preparation_minutes ?? null, deliveryMinutes: snake.deliveryMinutes ?? snake.delivery_minutes ?? null };
  console.log(JSON.stringify(evaluateOrderOperation(policy, "delivery")), JSON.stringify(evaluateOrderOperation(policy, "pickup")));
  expect(evaluateOrderOperation(policy, "delivery").allowed).toBe(true);
  expect(evaluateOrderOperation(policy, "pickup").allowed).toBe(true);
});
