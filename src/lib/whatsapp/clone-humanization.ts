export type CloneHumanizationMetricStatus = "good" | "warning" | "danger";

export type CloneHumanizationMetric = {
  key: string;
  label: string;
  score: number;
  status: CloneHumanizationMetricStatus;
  reason: string;
};

const metricLabels: Record<string, string> = {
  completeness: "Completude",
  naturalness: "Naturalidade",
  variation: "Variacao",
  context: "Contexto",
  linkDelivery: "Links",
  promiseDelivery: "Promessa",
  cloneStyle: "Estilo",
  humanHandoff: "Handoff humano",
};

export function getCloneHumanizationMetricLabel(key: string) {
  return metricLabels[key] ?? key.replace(/_/g, " ");
}

export function normalizeCloneHumanizationMetrics(value: unknown): CloneHumanizationMetric[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = readRecord(item);
      if (!record) return null;

      const key = readString(record.key);
      if (!key) return null;

      const score = clampNumber(readNumber(record.score) ?? 0, 0, 1);
      const status = normalizeMetricStatus(record.status, score);

      return {
        key,
        label: readString(record.label) ?? getCloneHumanizationMetricLabel(key),
        score,
        status,
        reason: readString(record.reason) ?? "",
      };
    })
    .filter((item): item is CloneHumanizationMetric => Boolean(item))
    .slice(0, 12);
}

function normalizeMetricStatus(value: unknown, score: number): CloneHumanizationMetricStatus {
  if (value === "good" || value === "warning" || value === "danger") return value;
  if (score >= 0.82) return "good";
  if (score >= 0.62) return "warning";
  return "danger";
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 180) : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
