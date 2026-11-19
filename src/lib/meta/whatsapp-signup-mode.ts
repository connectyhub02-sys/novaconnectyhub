// Shared by the browser signup button and the server. No secrets here.
export type OfficialSignupMode = "cloud" | "coexistence";

export function officialSignupMode(value: unknown): OfficialSignupMode {
  return value === "coexistence" ? "coexistence" : "cloud";
}

// Embedded Signup v4. Coexistence uses the WhatsApp Business app onboarding
// variation; the ordinary flow keeps the empty feature type.
export function officialSignupExtras(mode: OfficialSignupMode) {
  return {
    setup: {},
    featureType: mode === "coexistence" ? "whatsapp_business_app_onboarding" : "",
    sessionInfoVersion: "3",
    version: "v4",
  };
}

export const officialSignupFinishEvents = [
  "FINISH",
  "FINISH_ONLY_WABA",
  "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
] as const;

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};

export function officialSignupFinish(value: unknown) {
  const message = rec(value);
  if (message.type !== "WA_EMBEDDED_SIGNUP") return null;
  const event = String(message.event ?? "");
  if (!(officialSignupFinishEvents as readonly string[]).includes(event)) return null;
  const data = rec(message.data);
  const id = (v: unknown) => (/^\d{5,30}$/.test(String(v ?? "")) ? String(v) : undefined);
  return {
    event,
    coexistence: event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    wabaId: id(data.waba_id),
    phoneNumberId: id(data.phone_number_id),
  };
}

export type SignupPhone = {
  id: string;
  display_phone_number: string;
  verified_name: string;
  is_on_biz_app?: boolean;
  platform_type?: string;
};

// Chooses the authorized number and decides coexistence from Meta's own data,
// never from the browser choice alone.
export function selectOfficialSignupPhone(
  phones: SignupPhone[],
  phoneId: string | undefined,
  mode: OfficialSignupMode,
) {
  let phone: SignupPhone | undefined;
  if (phoneId) {
    phone = phones.find((p) => p.id === phoneId);
    if (!phone) throw new Error("Número não pertence à conta WhatsApp autorizada.");
  } else {
    const candidates = phones.filter((p) => (mode === "coexistence" ? p.is_on_biz_app === true : true));
    if (candidates.length !== 1)
      throw new Error(
        candidates.length
          ? "A conta autorizada tem mais de um número. Conclua a conexão escolhendo um único número."
          : "A Meta não retornou o número autorizado. Inicie a conexão novamente.",
      );
    phone = candidates[0];
  }
  const onBizApp = phone.is_on_biz_app === true;
  if (onBizApp && mode !== "coexistence")
    throw new Error(
      "Este número está no app WhatsApp Business. Escolha a opção “número que já uso no app WhatsApp Business”.",
    );
  if (!onBizApp && mode === "coexistence")
    throw new Error(
      "A Meta não confirmou este número no app WhatsApp Business. Para um número novo, use a outra opção.",
    );
  if (onBizApp && phone.platform_type !== "CLOUD_API")
    throw new Error(
      "A Meta ainda não concluiu a ativação na Cloud API. Aguarde alguns minutos e conecte novamente.",
    );
  return { phone, coexistence: onBizApp };
}

// Same national number with or without Brazil's ninth digit.
export function sameBusinessPhone(a: unknown, b: unknown) {
  const norm = (v: unknown) => {
    let phone = String(v ?? "").replace(/\D/g, "");
    if (phone.startsWith("55") && phone.length === 13 && phone[4] === "9") phone = phone.slice(0, 4) + phone.slice(5);
    return /^[1-9]\d{9,14}$/.test(phone) ? phone : "";
  };
  const left = norm(a);
  return Boolean(left) && left === norm(b);
}

// A QR instance of another company still using the number blocks the link.
// Archived instances are history only.
export function coexistenceInstanceConflict(
  instances: Array<{ organization_id: string; phone_number: string | null; status: string | null }>,
  organizationId: string,
  phone: string,
) {
  return instances.some(
    (i) => sameBusinessPhone(i.phone_number, phone) && i.organization_id !== organizationId && i.status !== "archived",
  );
}

export type CoexistenceEcho = { id: string; to: string; type: string; text: string; timestamp: number };

// Messages typed in the WhatsApp Business app (or a companion such as the QR
// session). They are records of something already sent, never AI input.
export function coexistenceEchoes(value: unknown): CoexistenceEcho[] {
  const echoes: CoexistenceEcho[] = [];
  for (const item of Array.isArray(rec(value).message_echoes) ? (rec(value).message_echoes as unknown[]) : []) {
    const echo = rec(item);
    const id = typeof echo.id === "string" ? echo.id : "";
    const to = String(echo.to ?? "").replace(/\D/g, "");
    const timestamp = Number(echo.timestamp) * 1000;
    if (!id || !/^[1-9]\d{7,14}$/.test(to) || !Number.isFinite(timestamp) || timestamp <= 0) continue;
    const type = String(echo.type ?? "unknown");
    const media = rec(echo[type]);
    const text = String(
      rec(echo.text).body ?? (typeof media.caption === "string" ? media.caption : `[${type}: enviado pelo app WhatsApp Business]`),
    ).slice(0, 4096);
    echoes.push({ id, to, type, text, timestamp });
  }
  return echoes;
}

export function historySyncOutcome(value: unknown): "completed" | "declined" | null {
  for (const item of Array.isArray(rec(value).history) ? (rec(value).history as unknown[]) : []) {
    const history = rec(item);
    if ((Array.isArray(history.errors) ? history.errors : []).some((e) => String(rec(e).code) === "2593109")) return "declined";
    if (Number(rec(history.metadata).progress) === 100) return "completed";
  }
  return null;
}

export function coexistenceOffboarded(value: unknown) {
  const v = rec(value);
  return ["PARTNER_REMOVED", "ACCOUNT_OFFBOARDED"].includes(String(v.event ?? ""));
}
