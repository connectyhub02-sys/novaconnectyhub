import { expect, it } from "vitest";
import { projectStorage, storageScale } from "@/lib/infrastructure/storage";
const now = Date.now();
const sample = () => ({ status: "ok", observedAt: new Date(now).toISOString(), bytes: 100, objects: 2, buckets: 1,
  secret: "PRIVATE_TOKEN", components: [{ id: "images", label: "/private/customer/file.jpg", bytes: 30 }, { id: "audio", label: "SECRET", bytes: 70 }] });
const snapshot = (local = sample(), r2 = sample()) => ({ version: 1, projects: { vision: { local, r2 }, other: { local: { ...sample(), bytes: 999 } } } });
it("exposes only the requested project's aggregates, never paths, credentials or other projects", () => {
  const data = projectStorage("vision", snapshot(), now);
  expect(data.local.bytes).toBe(100); expect(data.r2.objects).toBe(2);
  expect(data.r2.components.map(c => c.label)).toEqual(["Áudios", "Imagens"]);
  const text = JSON.stringify(data); expect(text).not.toMatch(/SECRET|PRIVATE|private|999|other/);
  expect(projectStorage("missing", snapshot(), now).local.bytes).toBeNull();
});
it("expires local and cloud measurements independently", () => {
  const old = { ...sample(), observedAt: new Date(now - 4 * 3600000).toISOString() };
  const data = projectStorage("vision", snapshot(old, old), now);
  expect(data.local.available).toBe(false); expect(data.r2.available).toBe(true);
  expect(projectStorage("vision", snapshot(), now + 13 * 3600000).r2.available).toBe(false);
});
it("rejects partial, invalid, future, duplicate and unbalanced readings without false zeros", () => {
  for (const broken of [{ ...sample(), status: "unavailable" }, { ...sample(), bytes: -1 }, { ...sample(), bytes: 101 }, { ...sample(), observedAt: new Date(now + 60000).toISOString() }, { ...sample(), components: [sample().components[0], sample().components[0]], bytes: 60 }, { ...sample(), components: [{ id: "secret_path", label: "", bytes: 100 }] }]) {
    expect(projectStorage("vision", snapshot(broken), now).local.bytes).toBeNull();
  }
  expect(projectStorage("vision", null, now).r2.available).toBe(false);
});
it("accepts genuine empty storage and uses a visual scale without inventing a quota", () => {
  const empty = { ...sample(), bytes: 0, objects: 0, components: [] };
  expect(projectStorage("vision", snapshot(empty, empty), now).r2.bytes).toBe(0);
  expect(storageScale(0)).toEqual({ value: "0 MB", maximum: "1 MB", percent: 0 });
  expect(storageScale(60 * 1024 ** 3)).toEqual({ value: "60 GB", maximum: "100 GB", percent: 60 });
});
