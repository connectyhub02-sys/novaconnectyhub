const labels: Record<string, string> = {
  database: "Banco de dados", automation: "Históricos das automações", applications: "Aplicações e versões publicadas",
  files: "Arquivos locais", backups: "Backups locais", configuration: "Configurações e outros arquivos",
  logs: "Logs e registros dos serviços", writable: "Gravações internas dos serviços",
  images: "Imagens", videos: "Vídeos", audio: "Áudios", documents: "Documentos", archives: "Arquivos compactados", other: "Outros arquivos",
};
export type StorageMeasurement = { available: boolean; observedAt: string | null; bytes: number | null; objects: number | null; buckets: number | null; components: { id: string; label: string; bytes: number }[] };
export type ProjectStorage = { local: StorageMeasurement; r2: StorageMeasurement };
const empty = (): StorageMeasurement => ({ available: false, observedAt: null, bytes: null, objects: null, buckets: null, components: [] });
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const validBytes = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function measurement(raw: unknown, kind: "local" | "r2", now: number): StorageMeasurement {
  const value = record(raw), at = typeof value.observedAt === "string" ? Date.parse(value.observedAt) : NaN;
  if (value.status !== "ok" || !Number.isFinite(at) || now - at > (kind === "local" ? 3 * 3600000 : 12 * 3600000) || at - now > 30000 || !validBytes(value.bytes) || !Array.isArray(value.components) || value.components.length > 16) return empty();
  const seen = new Set<string>();
  const components: StorageMeasurement["components"] = [];
  for (const rawPart of value.components) {
    const part = record(rawPart), id = part.id;
    if (typeof id !== "string" || !Object.hasOwn(labels, id) || seen.has(id) || !validBytes(part.bytes)) return empty();
    seen.add(id); components.push({ id, label: labels[id], bytes: part.bytes });
  }
  if (components.reduce((sum, c) => sum + c.bytes, 0) !== value.bytes) return empty();
  if (kind === "r2" && (!validBytes(value.objects) || !validBytes(value.buckets) || value.buckets < 1)) return empty();
  return { available: true, observedAt: new Date(at).toISOString(), bytes: value.bytes,
    objects: kind === "r2" ? value.objects as number : null, buckets: kind === "r2" ? value.buckets as number : null,
    components: components.sort((a, b) => b.bytes - a.bytes) };
}

// Only the requested project's sanitized totals cross the API boundary. Never return the raw file.
export function projectStorage(project: string, raw: unknown, now = Date.now()): ProjectStorage {
  const snapshot = record(raw), projects = record(snapshot.projects);
  const scope = snapshot.version === 1 && Object.hasOwn(projects, project) ? record(projects[project]) : {};
  return { local: measurement(scope.local, "local", now), r2: measurement(scope.r2, "r2", now) };
}

export function storageScale(bytes: number) {
  const unit = bytes < 1024 ** 3 ? 1024 ** 2 : 1024 ** 3, suffix = unit === 1024 ** 2 ? "MB" : "GB";
  const amount = bytes / unit, magnitude = 10 ** Math.floor(Math.log10(Math.max(amount, 1)));
  const maximum = [1, 2, 5, 10].map(n => n * magnitude).find(n => n >= amount) ?? magnitude * 10;
  const format = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return { percent: amount / maximum * 100, value: `${format(amount)} ${suffix}`, maximum: `${format(maximum)} ${suffix}` };
}
