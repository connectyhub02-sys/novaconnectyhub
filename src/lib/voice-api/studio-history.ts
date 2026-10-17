// Presentation of authenticated receipts. Audio stays on the server; never keep
// customer recordings in localStorage or depend on page-lifetime blob URLs.
import type {SpeechScript} from './performance';
export type StudioJob = {
  id: string; kind: "short" | "long"; status: string; credits: number;
  script?: SpeechScript; text?: string; voice: string; model: string; createdAt: string; audioUrl?: string;
};

export type StudioHistoryReceipt = {
  id: string; operation: string; status: string; model_id: string; voice_id?: string;
  created_at: string; usage: { credits: number; reserved_credits: number };
  audio?: unknown; result?: unknown; script?: SpeechScript | null;
};

export function studioHistoryJobs(project: string, receipts: StudioHistoryReceipt[]): StudioJob[] {
  return receipts.filter(row => row.operation === "text_to_speech" || row.operation === "long_tts").map(row => {
    const long = row.operation === "long_tts";
    const playable = row.status === "completed" && (long ? row.result : row.audio);
    return {
      id: row.id, kind: long ? "long" : "short", status: row.status,
      credits: Number(row.status === "completed" ? row.usage.credits : row.usage.reserved_credits || row.usage.credits),
      text:row.script?.text,script:row.script??undefined,voice: row.voice_id ?? row.script?.voice_id ?? "", model: row.model_id, createdAt: row.created_at,
      ...(playable ? { audioUrl: `/api/dashboard/voice/${long ? "operations" : "generations"}/${encodeURIComponent(row.id)}/${long ? "result" : "audio"}?project=${encodeURIComponent(project)}` } : {}),
    };
  });
}

export function mergeStudioHistory(current: StudioJob[], saved: StudioJob[]): StudioJob[] {
  const byId = new Map(current.map(job => [job.id, job]));
  for (const job of saved) {
    const local = byId.get(job.id);
    // Old receipts do not contain the submitted text. Preserve it only when it
    // is still available in this session; do not invent a reusable transcript.
    byId.set(job.id, { ...job, text: job.text ?? local?.text, script:job.script??local?.script, voice: job.voice || local?.voice || "" });
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
