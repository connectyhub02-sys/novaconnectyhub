import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import {
  parseGoogleStoreTag,
  publicGoogleStoreTag,
  safeStoreLocation,
  googleStoreTagFromRow,
} from "../src/lib/google/store-tag-policy";

describe("Google store tag policy", () => {
  it("normalizes the IDs a client pastes and keeps labels as typed", () => {
    expect(parseGoogleStoreTag({ measurementId: " g-abc123xyz ", adsConversionId: "123456789", leadLabel: "AbC_d-12", enabled: true }))
      .toEqual({ measurementId: "G-ABC123XYZ", adsConversionId: "AW-123456789", leadLabel: "AbC_d-12", enabled: true });
    expect(parseGoogleStoreTag({ measurementId: "", adsConversionId: " ", enabled: false }))
      .toEqual({ measurementId: null, adsConversionId: null, leadLabel: null, enabled: false });
  });
  it("rejects malformed IDs, a label without Ads, and an active tag without IDs", () => {
    expect(() => parseGoogleStoreTag({ measurementId: "UA-1234-1" })).toThrow(/G-/);
    expect(() => parseGoogleStoreTag({ adsConversionId: "AW-12ab" })).toThrow(/AW-/);
    expect(() => parseGoogleStoreTag({ leadLabel: "abcd1234" })).toThrow(/Google Ads/);
    expect(() => parseGoogleStoreTag({ adsConversionId: "AW-123456", leadLabel: "bad label!" })).toThrow(/Rótulo/);
    expect(() => parseGoogleStoreTag({ enabled: true })).toThrow(/ao menos um ID/);
  });
  it("tells the store page only what is active", () => {
    expect(publicGoogleStoreTag(null)).toEqual({ active: false });
    expect(publicGoogleStoreTag({ measurementId: "G-ABCD", adsConversionId: null, leadLabel: null, enabled: false })).toEqual({ active: false });
    expect(publicGoogleStoreTag(googleStoreTagFromRow({ measurement_id: "G-ABCD", ads_conversion_id: "AW-1234567", lead_label: "lbl_1", enabled: true })))
      .toEqual({ active: true, measurementId: "G-ABCD", adsConversionId: "AW-1234567", leadSendTo: "AW-1234567/lbl_1" });
  });
  it("never exposes checkout bearer paths to Google", () => {
    expect(safeStoreLocation("https://www.connectyhub.com.br", "/checkout/secret-token")).toBe("https://www.connectyhub.com.br/checkout");
    expect(safeStoreLocation("https://www.connectyhub.com.br", "/loja/padaria/produto/1")).toBe("https://www.connectyhub.com.br/loja/padaria/produto/1");
  });
});

describe("migration 0225", () => {
  it("creates a private, validated table", async () => {
    const db = new PGlite();
    try {
      await db.exec("create role anon;create role authenticated;create role service_role;create table organizations(id uuid primary key);");
      await db.exec(readFileSync("supabase/migrations/0225_google_store_tags.sql", "utf8"));
      await db.exec("insert into organizations values('00000000-0000-0000-0000-000000000001')");
      await db.exec("insert into google_store_tags(organization_id,measurement_id,enabled) values('00000000-0000-0000-0000-000000000001','G-ABCD1',true)");
      await expect(db.exec("update google_store_tags set measurement_id='UA-1'")).rejects.toThrow();
      await expect(db.exec("update google_store_tags set measurement_id=null")).rejects.toThrow();
      await expect(db.exec("update google_store_tags set lead_label='abcd'")).rejects.toThrow();
      expect((await db.query<{ allowed: boolean }>("select has_table_privilege('anon','google_store_tags','SELECT') allowed")).rows[0].allowed).toBe(false);
      expect((await db.query<{ allowed: boolean }>("select has_table_privilege('authenticated','google_store_tags','SELECT') allowed")).rows[0].allowed).toBe(false);
    } finally {
      await db.close();
    }
  });
});
