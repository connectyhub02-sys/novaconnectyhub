"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { officialPrimary } from "./meta-whatsapp-types";
import {
  officialSignupExtras,
  officialSignupFinish,
  type OfficialSignupMode,
} from "@/lib/meta/whatsapp-signup-mode";
type Signup = {
  state: string;
  mode: OfficialSignupMode;
  appId: string;
  configId: string;
  version: string;
};
export type OfficialSignupResult = {
  coexistence?: boolean;
  sync?: { contacts?: string; history?: string };
};
type FacebookSdk = {
  init: (options: Record<string, unknown>) => void;
  login: (
    callback: (response: { authResponse?: { code?: string } }) => void,
    options: Record<string, unknown>,
  ) => void;
};
declare global {
  interface Window {
    FB?: FacebookSdk;
  }
}
async function sdk() {
  if (window.FB) return window.FB;
  await new Promise<void>((resolve, reject) => {
    document.getElementById("meta-whatsapp-sdk")?.remove();
    const s = document.createElement("script");
    s.id = "meta-whatsapp-sdk";
    s.src = "https://connect.facebook.net/pt_BR/sdk.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Não foi possível abrir a Meta."));
    document.head.appendChild(s);
  });
  if (!window.FB) throw new Error("Conexão Meta indisponível.");
  return window.FB;
}
const modes: Array<{ value: OfficialSignupMode; title: string; hint: string }> =
  [
    {
      value: "cloud",
      title: "Número novo",
      hint: "Sem WhatsApp no celular. Fica só na API oficial.",
    },
    {
      value: "coexistence",
      title: "Número que já uso no app WhatsApp Business",
      hint: "Continua funcionando no celular. A Meta pede para escanear um QR no app.",
    },
  ];
export function OfficialSignup({
  admin,
  ready,
  onConnected,
  onError,
}: {
  admin: boolean;
  ready: boolean;
  onConnected: (result: OfficialSignupResult) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [signup, setSignup] = useState<Signup | null>(null),
    [mode, setMode] = useState<OfficialSignupMode>("cloud"),
    [busy, setBusy] = useState(false);
  const pending = useRef<{
    code?: string;
    wabaId?: string;
    phoneNumberId?: string;
    coexistence?: boolean;
    finishing?: boolean;
  }>({});
  const endpoint = `/api/dashboard/integrations/meta/whatsapp/signup${admin ? "?admin=1" : ""}`;
  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error || "Conexão não concluída.");
      return v;
    },
    [endpoint],
  );
  const finish = useCallback(async () => {
    const p = pending.current;
    // Coexistence onboarding may return only the WABA; the server finds the
    // number that Meta marks as being on the WhatsApp Business app.
    const phoneReady =
      Boolean(p.phoneNumberId) ||
      (signup?.mode === "coexistence" && p.coexistence === true);
    if (!signup || !p.code || !p.wabaId || !phoneReady || p.finishing) return;
    p.finishing = true;
    setBusy(true);
    try {
      const result = await post({
        action: "finish",
        state: signup.state,
        code: p.code,
        wabaId: p.wabaId,
        ...(p.phoneNumberId ? { phoneNumberId: p.phoneNumberId } : {}),
      });
      await onConnected(result);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Não foi possível conectar.");
    } finally {
      setSignup(null);
      setBusy(false);
      pending.current = {};
    }
  }, [signup, post, onConnected, onError]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        !signup ||
        !["https://www.facebook.com", "https://web.facebook.com"].includes(
          event.origin,
        )
      )
        return;
      let v;
      try {
        v =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (v?.type !== "WA_EMBEDDED_SIGNUP") return;
      const done = officialSignupFinish(v);
      if (done) {
        pending.current = {
          ...pending.current,
          wabaId: done.wabaId,
          phoneNumberId: done.phoneNumberId,
          coexistence: done.coexistence,
        };
        void finish();
        return;
      }
      if (["CANCEL", "ERROR"].includes(v.event)) {
        setBusy(false);
        setSignup(null);
        onError("Conexão cancelada na Meta. Você pode iniciar novamente.");
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [signup, finish, onError]);
  async function start() {
    setBusy(true);
    try {
      const config = await post({ action: "start", mode });
      const fb = await sdk();
      fb.init({
        appId: config.appId,
        version: config.version,
        cookie: false,
        xfbml: false,
      });
      setSignup({ ...config, mode: config.mode === "coexistence" ? "coexistence" : "cloud" });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Falha na conexão.");
    } finally {
      setBusy(false);
    }
  }
  function authorize() {
    if (!signup || !window.FB) return;
    pending.current = {};
    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          pending.current.code = response.authResponse.code;
          void finish();
        } else {
          setSignup(null);
          onError("Autorização não concluída.");
        }
      },
      {
        config_id: signup.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: officialSignupExtras(signup.mode),
      },
    );
  }
  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      {!signup && (
        <fieldset
          className="grid gap-2 sm:max-w-md"
          disabled={!ready || busy}
          aria-label="Tipo de número"
        >
          {modes.map((m) => (
            <label
              key={m.value}
              className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-left text-sm ${mode === m.value ? "border-blue-400 bg-blue-50/50" : "border-slate-200"}`}
            >
              <input
                type="radio"
                name="official-signup-mode"
                className="mt-1"
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
              />
              <span>
                <strong className="block">{m.title}</strong>
                <span className="text-xs text-slate-500">{m.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {!signup && mode === "coexistence" && (
        <ul className="max-w-md list-disc space-y-1 rounded-xl bg-amber-50 p-3 pl-7 text-left text-xs text-amber-900">
          <li>Atualize o app WhatsApp Business para a versão 2.24.17 ou mais recente.</li>
          <li>
            Ao concluir, a Meta desconecta todos os aparelhos vinculados: reconecte
            o WhatsApp Web e o atendimento por QR da ConnectyHub. Depois são
            permitidos até 4 aparelhos, exceto WhatsApp para Windows e WearOS.
          </li>
          <li>
            Permita compartilhar o histórico no celular: contatos e conversas
            individuais dos últimos 6 meses são sincronizados uma única vez, nas
            primeiras 24 horas. Grupos não são sincronizados.
          </li>
          <li>
            Pela API oficial não passam grupos, listas de transmissão, mensagens
            temporárias, visualização única nem chamadas. Envio limitado a 20
            mensagens por segundo.
          </li>
          <li>Abra o app no celular com frequência: após cerca de 14 dias sem uso, a Meta pode desconectar.</li>
        </ul>
      )}
      {signup?.mode === "coexistence" && (
        <p className="max-w-md text-xs text-slate-500">
          Na janela da Meta, escolha conectar o WhatsApp Business existente.
          Escaneie o QR e confirme no celular; os códigos aparecem só no seu
          aparelho. Depois, os aparelhos conectados (WhatsApp Web e o
          atendimento por QR) precisam ser conectados de novo.
        </p>
      )}
      <button
        className={officialPrimary}
        disabled={!ready || busy}
        onClick={() => (signup ? authorize() : void start())}
      >
        {busy
          ? "Preparando…"
          : signup
            ? "Autorizar na Meta"
            : "+ Conectar WhatsApp"}
      </button>
    </div>
  );
}
