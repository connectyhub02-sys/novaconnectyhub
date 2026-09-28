// Seeds the "Pizzaria Macedo&Dias" test store through the same dashboard route the owner uses.
// Run: SEED_STEP=validate|photos|settings|products npx vitest run --config scripts/seed/vitest.seed.config.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { menu, photoPrompts, storeSettings } from "./menu";

const organizationId = "a90c4ce6-b66c-47c4-a3f3-660af7bb178d";
const ownerUserId = "7f36c42e-6568-4385-bcaf-a4d4ff6f956a";
const photosDir = resolve(process.env.SEED_PHOTOS_DIR ?? join(__dirname, ".photos"));
const step = process.env.SEED_STEP ?? "validate";

for (const line of readFileSync(resolve(__dirname, "../../../.env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/lib/supabase/profile", () => ({
  getCurrentWorkspace: async () => ({
    user: { id: ownerUserId },
    profile: { id: ownerUserId, email: null, fullName: "Seed", isPlatformAdmin: false },
    organization: { id: organizationId, name: "Pizzaria Macedo&Dias", role: "owner" },
  }),
}));

async function callRoute(body: BodyInit, json: boolean) {
  const { POST } = await import("@/app/api/dashboard/sales-catalog/route");
  const { NextRequest } = await import("next/server");
  const request = new NextRequest("http://seed.local/api/dashboard/sales-catalog", {
    method: "POST", body, ...(json ? { headers: { "content-type": "application/json" } } : {}),
  });
  const response = await POST(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(payload).slice(0, 400)}`);
  return payload as Record<string, unknown>;
}

describe(`seed pizzaria macedo&dias (${step})`, () => {
  it.runIf(step === "validate")("every composition passes the dashboard validation", async () => {
    const { validateFoodComposition, readFoodComposition } = await import("@/lib/sales-catalog/food-composition");
    const missingPhotos = [...new Set(menu.flatMap(item => [item.photo, ...(item.gallery ?? [])]))].filter(key => !photoPrompts[key]);
    expect(missingPhotos).toEqual([]);
    for (const item of menu) if (item.food) expect([item.key, validateFoodComposition(readFoodComposition(item.food))]).toEqual([item.key, null]);

    const { quoteFoodComposition } = await import("@/lib/sales-catalog/food-composition");
    const pizza = menu.find(item => item.key === "pizza")!.food!;
    const unit = (flavors: Array<[string, number]>, options: Array<[string, string, number, string | null]> = []) => ({
      sizeId: "grande", note: "", flavors: flavors.map(([flavorId, portions]) => ({ flavorId, portions })),
      options: [["borda", "sem-borda", 1, null] as const, ["massa", "massa-tradicional", 1, null] as const, ...options].map(([groupId, optionId, quantity, flavorId]) => ({ groupId, optionId, quantity, flavorId })),
    });
    // Half calabresa (62,90) + half quatro queijos (74,90) = average 68,90.
    expect(quoteFoodComposition(pizza, [unit([["calabresa", 3], ["quatro-queijos", 3]])], 1)!.totalCents).toBe(6890);
    // Three thirds: calabresa + quatro queijos + camarão (129,90) = 89,23.
    expect(quoteFoodComposition(pizza, [unit([["calabresa", 2], ["quatro-queijos", 2], ["camarao", 2]])], 1)!.totalCents).toBe(8923);
    // Bacon (8,00) on the calabresa half only costs half: 68,90 + 4,00.
    expect(quoteFoodComposition(pizza, [unit([["calabresa", 3], ["quatro-queijos", 3]], [["adicionais", "bacon", 1, "calabresa"]])], 1)!.totalCents).toBe(7290);
  });

  it.runIf(step === "photos")("generates the missing product photos", async () => {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const { loadGeminiCredentials } = await import("@/lib/gemini/credentials");
    const { apiKey } = await loadGeminiCredentials(createServiceClient());
    mkdirSync(photosDir, { recursive: true });
    const failures: string[] = [];
    for (const [key, subject] of Object.entries(photoPrompts)) {
      if (existsSync(join(photosDir, `${key}.png`))) continue;
      const prompt = `Professional food delivery menu photograph: ${subject}. Appetizing, natural light, shallow depth of field, realistic, high detail. No text, no watermark, no brand logos or labels.`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } } }),
      });
      const data = await response.json().catch(() => null) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }> } | null;
      const image = data?.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data)?.inlineData?.data;
      if (!response.ok || !image) { failures.push(`${key}: ${response.status}`); continue; }
      writeFileSync(join(photosDir, `${key}.png`), Buffer.from(image, "base64"));
    }
    expect(failures).toEqual([]);
  }, 1_800_000);

  it.runIf(step === "settings")("saves the store settings and local delivery", async () => {
    const { createDefaultSalesCatalogPaymentMethods } = await import("@/lib/sales-catalog/shared");
    const week = [0, 1, 2, 3, 4, 5, 6].filter(day => day !== 1); // closed on Mondays, like many pizzerias
    const evening = week.map(day => ({ day, start: "18:00", end: "23:30" }));
    await callRoute(JSON.stringify({
      action: "save_catalog_settings", companyId: organizationId,
      businessType: storeSettings.businessType, categories: storeSettings.categories, attributes: [],
      storefront: { heroTitle: storeSettings.heroTitle, heroHighlight: storeSettings.heroHighlight, heroSubtitle: storeSettings.heroSubtitle, footerText: storeSettings.footerText, footerContactText: storeSettings.footerContactText },
      trackInventory: false, variationMedia: false,
      paymentMethods: createDefaultSalesCatalogPaymentMethods().map(method => ({ ...method, enabled: ["pix", "card_link", "cash_on_delivery"].includes(method.id) })),
      orderPolicy: {
        minimumOrderValue: storeSettings.minimumOrderValue, reservationPolicy: "after_payment", allowOrderWithoutPayment: false, requireHumanConfirmation: false, askCepBeforeQuote: false,
        abandonedCartMinutes: 30, followUpDays: null,
        operations: {
          enabled: true, timeZone: "America/Sao_Paulo", closedDates: [], pausedUntil: null,
          preparationMinutes: { min: 25, max: 40 }, deliveryMinutes: { min: 20, max: 35 },
          schedules: { orders: { enabled: true, windows: evening }, preparation: { enabled: true, windows: evening }, delivery: { enabled: true, windows: evening }, pickup: { enabled: true, windows: evening } },
        },
      },
    }), true);
    const zone = (id: string, name: string, fee: string, neighborhoods: string[], freeAbove: string | null = null) => ({
      id, name, active: true, shape: "neighborhoods", baseAddress: null, baseLatitude: null, baseLongitude: null, radiusKm: null, polygon: [],
      neighborhoods, cities: ["Joinville"], price: fee, minDays: 0, maxDays: 0, freeDeliveryThreshold: freeAbove, orderMinimum: storeSettings.minimumOrderValue,
      notes: "Entrega em 30 a 50 minutos.",
    });
    await callRoute(JSON.stringify({
      action: "save_shipping_settings", companyId: organizationId,
      shippingEnabled: false, localDeliveryEnabled: true, localPickup: true, rules: [],
      companyLocations: [{ label: "Pizzaria Macedo&Dias", serviceMode: "public_storefront", address: "Rua XV de Novembro, 1200 - Centro", cep: "89201-600", city: "Joinville", region: "SC", isPrimary: true }],
      localDeliveryZones: [
        zone("centro", "Centro e arredores", "5.00", ["Centro", "América", "Atiradores", "Bucarein", "Anita Garibaldi", "Glória", "Saguaçu"], "120.00"),
        zone("zona-intermediaria", "Bairros próximos", "8.00", ["Boa Vista", "Iririú", "Costa e Silva", "Santo Antônio", "Floresta", "Guanabara", "Itaum", "Bom Retiro"], "150.00"),
        zone("zona-distante", "Bairros mais distantes", "12.00", ["Aventureiro", "Vila Nova", "Pirabeiraba", "Itinga", "Jardim Iririú", "Comasa", "Espinheiros"]),
      ],
    }), true);
  }, 120_000);

  it.runIf(step === "products")("creates every product with its photos", async () => {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const client = createServiceClient();
    const { data: existing } = await client.from("intelligence_memory").select("id, title").eq("organization_id", organizationId).eq("memory_type", "sales_catalog_item");
    const byTitle = new Map((existing ?? []).map(row => [row.title as string, row.id as string]));
    for (const item of menu) {
      const form = new FormData();
      form.set("companyId", organizationId);
      if (byTitle.has(item.title)) form.set("itemId", byTitle.get(item.title)!);
      form.set("title", item.title);
      form.set("description", item.description);
      form.set("category", item.category);
      form.set("price", item.price);
      form.set("currency", "BRL");
      form.set("status", "active");
      form.set("salesDestination", "connectyhub_checkout");
      form.set("fulfillmentMode", "physical");
      form.set("billingCycle", "one_time");
      if (item.highlight) form.set("highlightLabel", item.highlight);
      if (item.featured) { form.set("storeFeatured", "true"); form.set("storeFeaturedRank", String(menu.filter(row => row.featured).indexOf(item) + 1)); }
      if (item.food) form.set("foodComposition", JSON.stringify(item.food));
      if (!byTitle.has(item.title)) {
        for (const key of [item.photo, ...(item.gallery ?? [])]) {
          const bytes = readFileSync(join(photosDir, `${key}.jpg`));
          form.append("files", new File([bytes], `${key}.jpg`, { type: "image/jpeg" }));
        }
      }
      await callRoute(form, false);
    }
  }, 1_800_000);
});
