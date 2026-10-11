"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { officialPrimary } from "./meta-whatsapp-types";
type Signup = {
  state: string;
  appId: string;
  configId: string;
  version: string;
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
export function OfficialSignup({
  admin,
  ready,
  onConnected,
  onError,
}: {
  admin: boolean;
  ready: boolean;
  onConnected: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [signup, setSignup] = useState<Signup | null>(null),
    [busy, setBusy] = useState(false);
  const pending = useRef<{
    code?: string;
    wabaId?: string;
    phoneNumberId?: string;
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
    if (!signup || !p.code || !p.wabaId || !p.phoneNumberId || p.finishing)
      return;
    p.finishing = true;
    setBusy(true);
    try {
      await post({
        action: "finish",
        state: signup.state,
        code: p.code,
        wabaId: p.wabaId,
        phoneNumberId: p.phoneNumberId,
      });
      await onConnected();
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
      if (v.event === "FINISH") {
        pending.current = {
          ...pending.current,
          wabaId: v.data?.waba_id,
          phoneNumberId: v.data?.phone_number_id,
        };
        void finish();
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
      const config = await post({ action: "start" });
      const fb = await sdk();
      fb.init({
        appId: config.appId,
        version: config.version,
        cookie: false,
        xfbml: false,
      });
      setSignup(config);
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
        extras: {
          setup: {},
          featureType: "",
          sessionInfoVersion: "3",
          version: "v4",
        },
      },
    );
  }
  return (
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
  );
}
