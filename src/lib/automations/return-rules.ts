/** Returns and birthday rules shared by the planner, the agent and the dashboard. No I/O. */

export type ReturnRule = { days: number; repeat: boolean };

/**
 * What the business usually needs when the owner configured nothing on the product. Activities whose
 * next contact depends on each client (lawyer, accountant, real estate...) have no default.
 */
const activityDefaults: Record<string, ReturnRule> = {
  pizzaria_delivery: { days: 7, repeat: true },
  restaurante_lanchonete: { days: 7, repeat: true },
  esteticista: { days: 30, repeat: true },
  estetica_clinica: { days: 30, repeat: true },
  dentista: { days: 180, repeat: false },
  clinica_odontologica: { days: 180, repeat: false },
  loja_suplementos: { days: 30, repeat: true },
  academia_suplementos: { days: 30, repeat: true },
  farmacia: { days: 30, repeat: false },
  oficina_mecanica: { days: 180, repeat: false },
  tecnico_ar_condicionado: { days: 180, repeat: false },
};

/** Repetitions without a new purchase, so a customer who stopped buying is not called forever. */
export const returnRepeatLimit = 2;

export function activityReturnDefault(activityId: string | null | undefined): ReturnRule | null {
  return activityId ? activityDefaults[activityId] ?? null : null;
}

/**
 * The product's own setting wins: a number of days (0 turns returns off for the product). Without
 * one, the product's activity or else the store's activity supplies the default.
 */
export function resolveProductReturnRule(metadata: Record<string, unknown> | null | undefined, storeActivityId?: string | null): ReturnRule | null {
  const days = metadata?.return_after_days;
  if (typeof days === "number" && Number.isInteger(days)) {
    return days >= 1 && days <= 365 ? { days, repeat: metadata?.return_repeat === true } : null;
  }
  const productActivity = (metadata?.activity_profile as Record<string, unknown> | undefined)?.templateId;
  return activityReturnDefault(typeof productActivity === "string" ? productActivity : null) ?? activityReturnDefault(storeActivityId);
}

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const numberWords: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30 };

/**
 * A lead explicitly asking to be contacted later ("me chama mês que vem", "me liga daqui a 15 dias").
 * Only explicit requests count; vague answers ("vou pensar") never schedule anything.
 */
export function detectRequestedReturn(text: string, now = new Date()): { returnAt: Date; note: string } | null {
  const value = normalize(text);
  const ask = /\b(me chama|me chame|me liga|me ligue|me procura|me procure|me lembra|me lembre|fala comigo|falamos|conversamos|me manda mensagem|me mande mensagem|entra em contato|entre em contato|me da um toque|me de um toque|retoma comigo)\b/;
  if (!ask.test(value)) return null;
  let days: number | null = null;
  if (/\bamanha\b/.test(value)) days = 1;
  else if (/\bsemana que vem\b|\bproxima semana\b/.test(value)) days = 7;
  else if (/\bmes que vem\b|\bproximo mes\b/.test(value)) days = 30;
  else {
    const match = value.match(/\b(?:daqui a|daqui|em|dentro de|depois de)\s+(\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta)\s+(dia|dias|semana|semanas|mes|meses)\b/);
    if (match) {
      const amount = /^\d+$/.test(match[1]) ? Number(match[1]) : numberWords[match[1]];
      days = amount * (match[2].startsWith("semana") ? 7 : match[2].startsWith("mes") ? 30 : 1);
    }
  }
  if (!days || days < 1 || days > 365) return null;
  return { returnAt: new Date(now.getTime() + days * 86400000), note: text.trim().slice(0, 300) };
}

export const birthdayQuestion = "Ah, e se quiser, me passa o dia do seu aniversário (dia e mês) que eu te mando uma mensagem especial nesse dia 🎉";

/** A present is promised only when the store configured one; otherwise a special message. */
export function birthdayQuestionFor(gift: unknown) {
  return gift ? "Ah, e se quiser, me passa o dia do seu aniversário (dia e mês) que eu te mando um presente nesse dia 🎁" : birthdayQuestion;
}

const months = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Day and month from an answer such as "15/03", "15-3", "dia 15 de março". The year is never kept. */
export function parseBirthday(text: string): { day: number; month: number } | null {
  const value = normalize(text);
  let day: number | null = null;
  let month: number | null = null;
  const numeric = value.match(/\b(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*\d{2,4})?\b/);
  if (numeric) { day = Number(numeric[1]); month = Number(numeric[2]); }
  else {
    const written = value.match(/\b(?:dia\s+)?(\d{1,2})\s*(?:de\s+)?(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/);
    if (written) { day = Number(written[1]); month = months.indexOf(written[2]) + 1; }
  }
  if (!day || !month || month < 1 || month > 12) return null;
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day >= 1 && day <= daysInMonth ? { day, month } : null;
}
