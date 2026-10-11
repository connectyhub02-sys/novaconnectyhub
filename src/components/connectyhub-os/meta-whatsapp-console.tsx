"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  Plus,
  Search,
  Send,
  Paperclip,
  LayoutTemplate,
  MousePointerClick,
  RefreshCw,
  Phone,
  CheckCheck,
  UserRound,
  StickyNote,
  ChevronRight,
  X,
  ShieldCheck,
  ArrowLeft,
  ChevronLeft,
} from "lucide-react";
import { officialTemplatePresets } from "@/lib/meta/whatsapp-workspace-policy";
import { serviceWindowOpen } from "@/lib/meta/whatsapp-policy";
import { OfficialSignup } from "./meta-whatsapp-signup";
import {
  OfficialModels,
  OfficialTemplatePreview,
  OfficialVariables,
} from "./meta-whatsapp-models";
import {
  OfficialCampaignPanel,
  OfficialReports,
} from "./meta-whatsapp-campaigns";
import {
  type OfficialSnapshot,
  type ChatMessage,
  type Campaign,
  type Thread,
  officialField as field,
  officialPrimary as primary,
  officialSecondary as secondary,
  officialStatus,
} from "./meta-whatsapp-types";
const stamp = (value: string) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
export function MetaWhatsAppConsole({ admin = false }: { admin?: boolean }) {
  const [older, setOlder] = useState<{
    key: string;
    messages: ChatMessage[];
    more: boolean;
  } | null>(null);
  const endpoint = `/api/dashboard/integrations/meta/whatsapp${admin ? "?admin=1" : ""}`;
  const [data, setData] = useState<OfficialSnapshot | null>(null),
    [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [tab, setTab] = useState("conversations");
  const [sender, setSender] = useState(""),
    [phone, setPhone] = useState(""),
    [offset, setOffset] = useState(0),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [createCampaign, setCreateCampaign] = useState(false);
  const [text, setText] = useState(""),
    [noteMode, setNoteMode] = useState(false),
    [buttons, setButtons] = useState(""),
    [showButtons, setShowButtons] = useState(false),
    [showTemplate, setShowTemplate] = useState(false);
  const [templateId, setTemplateId] = useState(""),
    [parameters, setParameters] = useState<string[]>([]),
    [consent, setConsent] = useState(false),
    [consentNote, setConsentNote] = useState("");
  const [newChat, setNewChat] = useState(false),
    [newPhone, setNewPhone] = useState(""),
    [label, setLabel] = useState(""),
    [pin, setPin] = useState(""),
    [disconnect, setDisconnect] = useState(false),
    [contactName, setContactName] = useState("");
  const [media, setMedia] = useState<{
    id: string;
    type: string;
    filename: string;
  } | null>(null);
  const intent = useRef<string | null>(null),
    attachment = useRef<HTMLInputElement>(null);
  const selectedSender = sender || data?.selectedSender || "";
  const connection = data?.connections.find(
    (s) => s.phone_number_id === selectedSender,
  );
  const connected =
    connection?.status === "connected" && connection.webhook_subscribed;
  const conversationReady =
    data?.selectedSender === selectedSender && data.requestedPhone === phone;
  const thread =
    (conversationReady ? data?.selectedThread : null) ??
    data?.threads.find(
      (t) => t.phone === phone && t.phone_number_id === selectedSender,
    );
  const currentTemplates =
    data?.selectedSender === selectedSender ? data.templates : [];
  const historyKey = selectedSender + ":" + phone;
  const currentOlder = older?.key === historyKey ? older : null;
  const messages = conversationReady
    ? [
        ...new Map(
          [...(currentOlder?.messages ?? []), ...(data?.messages ?? [])].map(
            (m) => [m.id, m],
          ),
        ).values(),
      ].sort(
        (a, b) =>
          a.occurred_at.localeCompare(b.occurred_at) ||
          a.id.localeCompare(b.id),
      )
    : [];
  const selectedTemplate = currentTemplates.find((t) => t.id === templateId);
  const makeUrl = useCallback(
    (values: Record<string, string>) => {
      const q = new URLSearchParams(admin ? { admin: "1" } : {});
      Object.entries(values).forEach(([k, v]) => {
        if (v) q.set(k, v);
      });
      return "/api/dashboard/integrations/meta/whatsapp?" + q;
    },
    [admin],
  );
  const generation = useRef(0);
  const latestLoad = useRef<() => Promise<void>>(async () => {});
  const load = useCallback(async () => {
    const own = ++generation.current;
    const response = await fetch(
      makeUrl({ sender, phone, offset: String(offset) }),
      { cache: "no-store" },
    );
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "Falha ao carregar chat.");
    if (own === generation.current) setData(value);
  }, [makeUrl, sender, phone, offset]);
  useEffect(() => {
    latestLoad.current = load;
  }, [load]);
  const loadCampaigns = useCallback(async () => {
    const r = await fetch(makeUrl({ view: "campaigns" }), {
      cache: "no-store",
    });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error || "Falha ao carregar campanhas.");
    setCampaigns(v.campaigns);
  }, [makeUrl]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void load().catch((e) => setError(e.message));
    }, 30000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (!["campaigns", "reports"].includes(tab)) return;
    void Promise.resolve()
      .then(loadCampaigns)
      .catch((e) => setError(e.message));
    const timer = setInterval(
      () => void loadCampaigns().catch((e) => setError(e.message)),
      30000,
    );
    return () => clearInterval(timer);
  }, [tab, loadCampaigns]);
  const perform = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sender: selectedSender, ...body }),
        });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error || "Falha na operação.");
        await latestLoad.current();
        if (String(body.action).startsWith("campaign")) await loadCampaigns();
        setNotice(
          result.warning || officialStatus[result.status] || "Alteração salva.",
        );
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível concluir.");
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [endpoint, selectedSender, loadCampaigns],
  );
  const onConnected = useCallback(async () => {
    await load();
    setNotice("Número conectado. Se necessário, finalize a ativação abaixo.");
  }, [load]);
  const changeSender = (value: string) => {
    setSender(value);
    setPhone("");
    setOffset(0);
    setTemplateId("");
    setParameters([]);
    setMedia(null);
    intent.current = null;
    setDisconnect(false);
  };
  const choose = (t: Thread) => {
    setSender(t.phone_number_id);
    setPhone(t.phone);
    setText("");
    setMedia(null);
    setConsent(false);
    setConsentNote("");
    setContactName(t.display_name || "");
    setShowTemplate(false);
    setShowButtons(false);
    setNoteMode(false);
    intent.current = null;
    void perform({
      action: "read",
      sender: t.phone_number_id,
      phone: t.phone,
    }).catch(() => {});
  };
  const send = async () => {
    intent.current ??= crypto.randomUUID();
    const result = await perform({
      action: noteMode ? "note" : "send",
      sender: selectedSender,
      phone,
      text,
      type: showTemplate
        ? "template"
        : media?.type || (showButtons ? "interactive" : "text"),
      requestKey: intent.current,
      templateName: selectedTemplate?.name,
      language: selectedTemplate?.language,
      parameters,
      buttons: buttons.split("\n").filter((v) => v.trim()),
      mediaId: media?.id,
      consent,
      consentNote,
    });
    if (
      noteMode ||
      ["accepted", "sent", "delivered", "read"].includes(result.status)
    ) {
      setText("");
      setMedia(null);
      intent.current = null;
      setShowTemplate(false);
      setShowButtons(false);
    }
  };
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("sender", selectedSender);
      form.append("file", file);
      const r = await fetch(endpoint, { method: "POST", body: form });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error || "Falha ao anexar.");
      setMedia(v);
      intent.current = null;
      setShowTemplate(false);
      setShowButtons(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no arquivo.");
    } finally {
      setBusy(false);
    }
  }
  async function exportCampaign(id: string) {
    try {
      const r = await fetch(makeUrl({ export: id }));
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      const cell = (s: unknown) =>
        '"' +
        String(s ?? "")
          .replace(/^[=+@-]/, "'")
          .replaceAll('"', '""') +
        '"';
      const csv =
        "Telefone;Status;Detalhe;Atualização\n" +
        v.recipients
          .map(
            (row: {
              phone: string;
              status: string;
              detail: string;
              updated_at: string;
              meta_whatsapp_messages?: { status: string };
            }) =>
              [
                row.phone,
                officialStatus[
                  row.meta_whatsapp_messages?.status || row.status
                ] || row.status,
                row.detail,
                row.updated_at,
              ]
                .map(cell)
                .join(";"),
          )
          .join("\n");
      const url = URL.createObjectURL(
        new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "campanha-meta-" + id + ".csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao exportar.");
    }
  }
  async function loadOlder() {
    if (!messages[0]) return;
    setBusy(true);
    try {
      const r = await fetch(
        makeUrl({ sender: selectedSender, phone, before: messages[0].id }),
      );
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setOlder({
        key: historyKey,
        messages: [...v.messages, ...messages],
        more: v.messages.length === 100,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar histórico.");
    } finally {
      setBusy(false);
    }
  }
  const visibleThreads = (data?.threads ?? []).filter(
    (t) =>
      (filter !== "unread" || t.unread_count > 0) &&
      (filter !== "mine" || t.assigned_to === data?.actorId) &&
      (filter !== "open" || t.status === "open") &&
      `${t.display_name || ""} ${t.phone} ${t.last_message_preview}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const openWindow = serviceWindowOpen(thread?.last_inbound_at ?? null);
  const newCampaign = () => {
    setTab("campaigns");
    setCreateCampaign(true);
  };
  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm"
      aria-label="Chat Meta oficial"
    >
      <header className="border-b border-slate-100 px-5 py-5 lg:px-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Chat Meta oficial
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Atendimento e campanhas em um só lugar
            </p>
          </div>
          <div className="flex gap-2">
            <button className={secondary} onClick={() => setTab("numbers")}>
              <Phone size={16} /> Meus números{" "}
              <span className="rounded-full bg-blue-50 px-2 text-blue-600">
                {data?.connections.filter((c) => c.status === "connected")
                  .length ?? 0}
              </span>
            </button>
            <button className={primary} onClick={newCampaign}>
              <Plus size={17} /> Nova campanha
            </button>
          </div>
        </div>
        <nav
          className="-mb-5 mt-5 flex gap-5 overflow-auto"
          aria-label="Áreas do WhatsApp oficial"
        >
          {[
            ["conversations", "Conversas"],
            ["campaigns", "Campanhas"],
            ["models", "Modelos"],
            ["reports", "Relatórios"],
          ].map(([id, title]) => (
            <button
              key={id}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-blue-600"}`}
              onClick={() => setTab(id)}
            >
              {title}
            </button>
          ))}
        </nav>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-5 py-3">
        <button
          className={`${secondary} ${!sender ? "border-blue-300 bg-blue-50 text-blue-600" : ""}`}
          onClick={() => changeSender("")}
        >
          Todos os números
        </button>
        {data?.connections
          .filter((c) => c.status === "connected")
          .map((c) => (
            <button
              key={c.phone_number_id}
              className={`${secondary} ${sender === c.phone_number_id ? "border-blue-300 bg-blue-50 text-blue-600" : ""}`}
              onClick={() => changeSender(c.phone_number_id)}
            >
              <span
                className={`h-2 w-2 rounded-full ${c.webhook_subscribed ? "bg-emerald-500" : "bg-amber-400"}`}
              />
              {c.label || c.verified_name || "WhatsApp"} ·{" "}
              {c.display_phone.slice(-4)}
            </button>
          ))}
        <button className={secondary} onClick={() => setTab("numbers")}>
          <Plus size={14} /> Conectar número
        </button>
        <button
          aria-label="Atualizar diagnóstico"
          className={`${secondary} ml-auto`}
          disabled={busy}
          onClick={() =>
            void load()
              .then(() => setNotice("Dados atualizados."))
              .catch((e) => setError(e.message))
          }
        >
          <RefreshCw size={15} />
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="mx-5 mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mx-5 mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800"
        >
          {notice}
          <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </p>
      )}
      {!data && !error && (
        <p className="p-12 text-center text-sm text-slate-400">
          Abrindo suas conversas…
        </p>
      )}
      {tab === "numbers" && (
        <div className="space-y-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Meus números</h2>
              <p className="mt-1 text-sm text-slate-500">
                Conecte números oficiais e dê um nome a cada operação.
              </p>
            </div>
            <OfficialSignup
              admin={admin}
              ready={Boolean(data?.signupReady)}
              onConnected={onConnected}
              onError={setError}
            />
          </div>
          <p className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
            Use números separados do atendimento conectado por QR. Cada conversa
            e campanha mantém o seu remetente. A conexão de empresas externas
            depende das permissões aprovadas pela Meta.
          </p>
          {data?.connections.map((c) => (
            <button
              key={c.phone_number_id}
              className={`flex w-full items-center justify-between rounded-xl border p-4 text-left ${selectedSender === c.phone_number_id ? "border-blue-400 bg-blue-50/40" : "border-slate-200"}`}
              onClick={() => {
                changeSender(c.phone_number_id);
                setLabel(c.label || c.verified_name || "");
              }}
            >
              <span>
                <strong className="block text-sm">
                  {c.label || c.verified_name || "WhatsApp"}
                </strong>
                <span className="text-xs text-slate-500">
                  {c.display_phone}
                </span>
              </span>
              <span className="text-xs text-slate-500">
                {c.status === "connected" ? "Conectado" : "Desconectado"}
                <ChevronRight className="ml-2 inline" size={15} />
              </span>
            </button>
          ))}
          {connection?.status === "connected" && (
            <div className="max-w-xl space-y-4 rounded-2xl border p-5">
              <h3 className="font-semibold">
                Configurar {connection.display_phone}
              </h3>
              <label className="block text-xs text-slate-500">
                Nome do número
                <div className="mt-1 flex gap-2">
                  <input
                    className={field}
                    maxLength={60}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Vendas, Suporte, Loja 2…"
                  />
                  <button
                    className={secondary}
                    disabled={busy || !label.trim()}
                    onClick={() =>
                      void perform({ action: "rename_sender", label }).catch(
                        () => {},
                      )
                    }
                  >
                    Salvar
                  </button>
                </div>
              </label>
              <p className="text-xs text-slate-500">
                Eventos:{" "}
                {connection.webhook_subscribed
                  ? "conectados"
                  : "assinatura pendente"}{" "}
                · Último recebimento:{" "}
                {connection.webhook_at
                  ? new Date(connection.webhook_at).toLocaleString("pt-BR")
                  : "nenhum"}
              </p>
              <details className="rounded-xl border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Finalizar ativação de um número novo
                </summary>
                <p className="my-3 text-xs text-slate-500">
                  Após verificar o número na Meta, informe seu PIN de duas
                  etapas para registrá-lo. Não é necessário para um número já
                  ativo. O PIN não fica salvo na ConnectyHub.
                </p>
                <input
                  aria-label="PIN de duas etapas"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  className={field}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
                <button
                  className={`${secondary} mt-3`}
                  disabled={busy || !/^\d{6}$/.test(pin)}
                  onClick={() =>
                    void perform({ action: "register", pin })
                      .finally(() => setPin(""))
                      .catch(() => {})
                  }
                >
                  Registrar número na Cloud API
                </button>
              </details>
              {!disconnect ? (
                <button
                  className="text-xs text-red-600 underline"
                  onClick={() => setDisconnect(true)}
                >
                  Desconectar número
                </button>
              ) : (
                <div className="rounded-xl bg-red-50 p-3">
                  <p className="text-xs text-red-800">
                    Desconectar pausa as campanhas deste número. O histórico
                    será preservado.
                  </p>
                  <button
                    className={`${secondary} mt-2`}
                    disabled={busy}
                    onClick={() =>
                      void perform({ action: "disconnect" })
                        .then(() => setDisconnect(false))
                        .catch(() => {})
                    }
                  >
                    Confirmar desconexão
                  </button>
                </div>
              )}
            </div>
          )}
          {admin && (
            <details className="rounded-xl border border-dashed p-4">
              <summary className="cursor-pointer text-sm text-slate-500">
                Configuração administrativa
              </summary>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  className={secondary}
                  disabled={busy || !data?.pilotReady}
                  onClick={() =>
                    void perform({ action: "import_pilot" }).catch(() => {})
                  }
                >
                  Conectar número de teste do cofre
                </button>
                <Link
                  className={secondary}
                  href="/admin/maintenance#credenciais-do-sistema"
                >
                  Manutenção e credenciais
                </Link>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Um número já vinculado a outra empresa não será transferido por
                esta ação.
              </p>
            </details>
          )}
        </div>
      )}
      {tab === "models" && (
        <OfficialModels
          templates={currentTemplates}
          connected={Boolean(connected)}
          busy={busy}
          onError={data?.templateError ?? null}
          onCreate={async (body) => {
            await perform({ action: "create_template", ...body });
          }}
        />
      )}
      {tab === "campaigns" && (
        <OfficialCampaignPanel
          campaigns={campaigns}
          senders={data?.connections ?? []}
          sender={selectedSender}
          templates={currentTemplates}
          busy={busy}
          createOpen={createCampaign}
          setCreateOpen={setCreateCampaign}
          onSender={changeSender}
          onPrepare={async (body) => {
            await perform({ action: "campaign_prepare", ...body });
          }}
          onAction={async (id, operation, costAccepted = false) => {
            await perform({
              action: "campaign_action",
              id,
              operation,
              costAccepted,
            });
          }}
          onExport={exportCampaign}
        />
      )}
      {tab === "reports" && <OfficialReports campaigns={campaigns} />}
      {tab === "conversations" && data && (
        <div className="grid min-h-[650px] lg:h-[calc(100dvh-295px)] lg:min-h-[650px] lg:grid-cols-[260px_minmax(340px,1fr)] xl:grid-cols-[230px_minmax(280px,1fr)_250px] 2xl:grid-cols-[280px_minmax(360px,1fr)_290px]">
          <aside
            className={`flex min-h-0 flex-col border-r border-slate-100 ${phone ? "hidden lg:flex" : ""}`}
          >
            <div className="space-y-3 border-b border-slate-100 p-4">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search
                    size={15}
                    className="absolute left-3 top-3 text-slate-400"
                  />
                  <input
                    aria-label="Buscar conversa nesta página"
                    className={`${field} pl-9`}
                    placeholder="Buscar conversa"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button
                  aria-label="Nova conversa"
                  className={secondary}
                  onClick={() => setNewChat((v) => !v)}
                >
                  <Plus size={17} />
                </button>
              </div>
              <div className="flex gap-3 text-xs">
                {[
                  ["all", "Todas"],
                  ["unread", "Não lidas"],
                  ["mine", "Minhas"],
                  ["open", "Abertas"],
                ].map(([id, title]) => (
                  <button
                    key={id}
                    className={
                      filter === id
                        ? "font-semibold text-blue-600"
                        : "text-slate-500"
                    }
                    onClick={() => setFilter(id)}
                  >
                    {title}
                  </button>
                ))}
              </div>
              {newChat && (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSender(selectedSender);
                    setPhone(newPhone.replace(/[^0-9]/g, ""));
                    setNewChat(false);
                    setShowTemplate(true);
                    setConsent(false);
                    setConsentNote("");
                    setText("");
                    intent.current = null;
                  }}
                >
                  <input
                    aria-label="Telefone para nova conversa"
                    className={field}
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Telefone com DDI e DDD"
                    required
                  />
                  <button className={`${primary} w-full`} disabled={!connected}>
                    Abrir conversa
                  </button>
                </form>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-2">
              {visibleThreads.map((t) => (
                <button
                  key={t.phone_number_id + ":" + t.phone}
                  className={`mb-1 flex w-full gap-3 rounded-xl p-3 text-left ${phone === t.phone && selectedSender === t.phone_number_id ? "bg-blue-50" : "hover:bg-slate-50"}`}
                  onClick={() => choose(t)}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                    {t.display_name ? (
                      t.display_name.slice(0, 2).toUpperCase()
                    ) : (
                      <UserRound size={18} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2">
                      <strong className="truncate text-sm">
                        {t.display_name || t.phone}
                      </strong>
                      <span className="text-[10px] text-slate-400">
                        {stamp(t.last_message_at)}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {t.last_message_preview}
                    </span>
                    <span className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                      <span>
                        {data.connections.find(
                          (c) => c.phone_number_id === t.phone_number_id,
                        )?.label || "WhatsApp"}{" "}
                        · {t.status === "resolved" ? "Resolvida" : "Aberta"}
                      </span>
                      {t.unread_count > 0 && (
                        <b className="rounded-full bg-blue-600 px-1.5 text-white">
                          {t.unread_count}
                        </b>
                      )}
                    </span>
                  </span>
                </button>
              ))}
              {!visibleThreads.length && (
                <p className="px-4 py-10 text-center text-xs text-slate-400">
                  {search
                    ? "Nenhuma conversa nesta página."
                    : "As conversas recebidas e enviadas aparecerão aqui."}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between border-t p-3 text-xs text-slate-400">
              <button
                aria-label="Conversas anteriores"
                disabled={!offset}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                <ChevronLeft size={17} />
              </button>
              <span>Página {offset / 50 + 1}</span>
              <button
                aria-label="Próximas conversas"
                disabled={!data.hasMore}
                onClick={() => setOffset(offset + 50)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </aside>
          <div
            className={`flex min-h-0 flex-col ${!phone ? "min-h-[550px]" : ""}`}
          >
            {!phone ? (
              <div className="flex flex-1 flex-col items-center justify-center px-8 py-14 text-center">
                <span className="mb-6 rounded-3xl bg-blue-50 p-5 text-blue-600">
                  <MessageCircle size={40} />
                </span>
                <h2 className="text-xl font-bold">
                  {data.connections.some((c) => c.status === "connected")
                    ? "Seu atendimento oficial, organizado"
                    : "Conecte seu WhatsApp para começar"}
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
                  {data.connections.some((c) => c.status === "connected")
                    ? "Selecione uma conversa ou inicie um contato com um modelo aprovado. Campanhas e atendimento compartilham o mesmo histórico."
                    : "Converse com seus leads, personalize modelos e prepare campanhas com seus números oficiais."}
                </p>
                <div className="mt-6">
                  <button
                    className={primary}
                    onClick={() =>
                      connected ? setNewChat(true) : setTab("numbers")
                    }
                  >
                    <Plus size={17} />
                    {connected ? "Nova conversa" : "Conectar WhatsApp"}
                  </button>
                </div>
                <p className="mt-5 max-w-sm text-xs text-slate-400">
                  Números, mensagens e campanhas pertencem somente à sua
                  empresa.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      className="lg:hidden"
                      aria-label="Voltar às conversas"
                      onClick={() => setPhone("")}
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <span className="rounded-full bg-blue-100 p-3 text-blue-600">
                      <UserRound size={20} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">
                        {thread?.display_name || phone}
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        {connection?.label || connection?.verified_name} ·{" "}
                        {connection?.display_phone}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`hidden rounded-full px-3 py-1 text-[10px] sm:block ${openWindow ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                    >
                      {openWindow
                        ? "Janela de atendimento aberta"
                        : "Usar modelo aprovado"}
                    </span>
                    {thread && (
                      <button
                        className={secondary}
                        title={
                          thread.status === "resolved"
                            ? "Reabrir conversa"
                            : "Resolver conversa"
                        }
                        disabled={busy}
                        onClick={() =>
                          void perform({
                            action: "resolve",
                            phone,
                            resolved: thread.status !== "resolved",
                          }).catch(() => {})
                        }
                      >
                        <CheckCheck size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-slate-50/40 p-4 lg:p-6">
                  {messages.map((m) => (
                    <article
                      key={m.id}
                      className={`max-w-[88%] rounded-2xl border p-3.5 text-sm ${m.direction === "outbound" ? "ml-auto rounded-tr-sm border-blue-100 bg-blue-50" : "mr-auto rounded-tl-sm border-slate-200 bg-white"}`}
                    >
                      <p className="whitespace-pre-wrap break-words leading-6">
                        {m.text_content}
                      </p>
                      {m.content?.templatePreview
                        ?.flatMap((c) => c.buttons ?? [])
                        .map((b, i) => (
                          <div
                            key={i}
                            className="mt-2 rounded-lg border border-blue-100 bg-white p-2 text-center text-xs text-blue-600"
                          >
                            {b.text}
                          </div>
                        ))}
                      {m.content?.interactive?.action?.buttons?.map((b, i) => (
                        <div
                          key={i}
                          className="mt-2 rounded-lg border border-blue-100 bg-white p-2 text-center text-xs text-blue-600"
                        >
                          {b.reply.title}
                        </div>
                      ))}
                      {["image", "video", "audio", "document"].includes(
                        m.message_type,
                      ) &&
                        m.content?.[m.message_type] !== undefined && (
                          <a
                            className="mt-2 inline-flex items-center gap-2 text-xs text-blue-600 underline"
                            href={makeUrl({
                              sender: m.phone_number_id,
                              download: m.id,
                            })}
                          >
                            <Paperclip size={13} /> Baixar arquivo
                          </a>
                        )}
                      <p className="mt-2 text-right text-[10px] text-slate-400">
                        {new Date(m.occurred_at).toLocaleDateString("pt-BR")} ·{" "}
                        {stamp(m.occurred_at)} ·{" "}
                        {officialStatus[m.status] || m.status}
                        {m.error_code ? " · " + m.error_code : ""}
                      </p>
                    </article>
                  ))}
                  {!messages.length && (
                    <p className="py-10 text-center text-xs text-slate-400">
                      Inicie esta conversa com um modelo aprovado e autorização
                      do destinatário.
                    </p>
                  )}
                  {(currentOlder
                    ? currentOlder.more
                    : data.messages.length === 100) && (
                    <button
                      className={secondary}
                      disabled={busy}
                      onClick={() => void loadOlder()}
                    >
                      Carregar mensagens anteriores
                    </button>
                  )}
                </div>
                <div className="border-t border-slate-100 bg-white p-4">
                  <div className="mb-3 flex gap-4 text-xs">
                    <button
                      className={
                        !noteMode
                          ? "font-semibold text-blue-600"
                          : "text-slate-400"
                      }
                      onClick={() => setNoteMode(false)}
                    >
                      Mensagem
                    </button>
                    <button
                      className={
                        noteMode
                          ? "font-semibold text-blue-600"
                          : "text-slate-400"
                      }
                      onClick={() => {
                        setNoteMode(true);
                        setShowTemplate(false);
                        setMedia(null);
                      }}
                    >
                      Nota interna
                    </button>
                    {thread && (
                      <button
                        className="ml-auto text-slate-500"
                        disabled={busy}
                        onClick={() =>
                          void perform({
                            action: "assign",
                            phone,
                            assign: thread.assigned_to !== data.actorId,
                          }).catch(() => {})
                        }
                      >
                        {thread.assigned_to === data.actorId
                          ? "Liberar atendimento"
                          : "Assumir atendimento"}
                      </button>
                    )}
                  </div>
                  {showTemplate && !noteMode && (
                    <div className="mb-3 max-h-72 space-y-2 overflow-auto rounded-xl bg-slate-50 p-3">
                      <label className="block text-xs text-slate-500">
                        Modelo aprovado
                        <select
                          className={`${field} mt-1`}
                          value={templateId}
                          onChange={(e) => {
                            setTemplateId(e.target.value);
                            setParameters([]);
                            intent.current = null;
                          }}
                        >
                          <option value="">Selecione um modelo</option>
                          {currentTemplates
                            .filter((t) => t.status === "APPROVED")
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} · {t.language}
                              </option>
                            ))}
                        </select>
                      </label>
                      {selectedTemplate && (
                        <>
                          <OfficialVariables
                            text={
                              selectedTemplate.components.find(
                                (c) => c.type === "BODY",
                              )?.text ?? ""
                            }
                            values={parameters}
                            onChange={(v) => {
                              setParameters(v);
                              intent.current = null;
                            }}
                          />
                          <OfficialTemplatePreview
                            template={selectedTemplate}
                            values={parameters}
                          />
                        </>
                      )}
                      <label className="flex gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={(e) => setConsent(e.target.checked)}
                        />{" "}
                        O destinatário autorizou receber esta mensagem.
                      </label>
                      <input
                        className={field}
                        aria-label="Registro da autorização"
                        placeholder="Como o destinatário autorizou o contato?"
                        maxLength={500}
                        value={consentNote}
                        onChange={(e) => setConsentNote(e.target.value)}
                      />
                    </div>
                  )}
                  {showButtons && !showTemplate && !noteMode && (
                    <textarea
                      aria-label="Respostas rápidas"
                      className={`${field} mb-2`}
                      rows={2}
                      value={buttons}
                      onChange={(e) => {
                        setButtons(e.target.value);
                        intent.current = null;
                      }}
                      placeholder={
                        "Até 3 botões, um por linha (20 caracteres cada)\nQuero conhecer\nFalar com atendente"
                      }
                    />
                  )}
                  {media && (
                    <p className="mb-2 flex items-center justify-between rounded-lg bg-blue-50 p-2 text-xs text-blue-700">
                      {media.filename}
                      <button
                        aria-label="Remover anexo"
                        onClick={() => {
                          setMedia(null);
                          intent.current = null;
                        }}
                      >
                        <X size={13} />
                      </button>
                    </p>
                  )}
                  {!showTemplate && (
                    <textarea
                      className={`${field} resize-none border-slate-100`}
                      rows={2}
                      value={text}
                      maxLength={noteMode ? 4000 : showButtons ? 1024 : 4096}
                      onChange={(e) => {
                        setText(e.target.value);
                        intent.current = null;
                      }}
                      placeholder={
                        noteMode
                          ? "Escreva uma nota visível somente para sua equipe…"
                          : "Digite sua resposta…"
                      }
                    />
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      ref={attachment}
                      type="file"
                      className="hidden"
                      accept="image/jpeg,image/png,application/pdf,video/mp4,audio/mpeg,audio/ogg,audio/mp4"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void upload(f);
                        e.target.value = "";
                      }}
                    />
                    {!noteMode && (
                      <>
                        <button
                          aria-label="Anexar arquivo"
                          className={secondary}
                          disabled={busy || !connected || !openWindow}
                          onClick={() => attachment.current?.click()}
                        >
                          <Paperclip size={17} />
                        </button>
                        <button
                          className={`${secondary} ml-auto`}
                          onClick={() => {
                            setShowTemplate((v) => !v);
                            setMedia(null);
                            setShowButtons(false);
                            intent.current = null;
                          }}
                        >
                          <LayoutTemplate size={15} />
                          <span className="hidden sm:inline">Modelos</span>
                        </button>
                        <button
                          className={secondary}
                          onClick={() => {
                            setShowButtons((v) => !v);
                            setShowTemplate(false);
                            setMedia(null);
                            intent.current = null;
                          }}
                        >
                          <MousePointerClick size={15} />
                          <span className="hidden sm:inline">Botões</span>
                        </button>
                      </>
                    )}
                    <button
                      aria-label={
                        noteMode
                          ? "Salvar nota interna"
                          : "Enviar mensagem oficial"
                      }
                      className={`${primary} ${noteMode ? "ml-auto" : ""}`}
                      disabled={
                        busy ||
                        !connected ||
                        !phone ||
                        (noteMode
                          ? !thread || !text.trim()
                          : showTemplate
                            ? !selectedTemplate ||
                              !consent ||
                              consentNote.trim().length < 5
                            : !openWindow || (!text.trim() && !media)) ||
                        Boolean(data.contact?.opted_out && !noteMode)
                      }
                      onClick={() => void send().catch(() => {})}
                    >
                      {noteMode ? <StickyNote size={17} /> : <Send size={17} />}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">
                    {noteMode
                      ? "Notas não são enviadas ao WhatsApp."
                      : data.contact?.opted_out
                        ? "Este contato pediu para não receber mensagens."
                        : openWindow
                          ? "Respostas livres disponíveis dentro da janela de 24 horas."
                          : "Fora da janela de 24 horas, envie um modelo aprovado com autorização."}
                  </p>
                </div>
              </>
            )}
          </div>
          <aside className="min-h-0 space-y-4 overflow-auto border-l border-slate-100 bg-slate-50/30 p-4 max-h-[400px] lg:col-span-2 xl:col-span-1 xl:max-h-none">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold">Detalhes do lead</h3>
              {phone ? (
                <>
                  <p className="mt-3 break-all text-sm font-semibold">
                    {thread?.display_name || phone}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{phone}</p>
                  <p
                    className={`mt-3 flex items-center gap-2 text-xs ${data.contact?.opted_out ? "text-red-600" : "text-emerald-700"}`}
                  >
                    <ShieldCheck size={15} />
                    {data.contact?.opted_out
                      ? "Contato bloqueado"
                      : data.contact?.consent_note
                        ? "Consentimento registrado"
                        : "Consentimento não registrado"}
                  </p>
                  {thread && (
                    <>
                      <input
                        className={`${field} mt-3`}
                        aria-label="Nome do contato"
                        placeholder="Nome do contato"
                        value={contactName}
                        maxLength={120}
                        onChange={(e) => setContactName(e.target.value)}
                      />
                      <button
                        className="mt-2 text-xs text-blue-600"
                        disabled={busy || !contactName.trim()}
                        onClick={() =>
                          void perform({
                            action: "rename_contact",
                            phone,
                            name: contactName,
                          }).catch(() => {})
                        }
                      >
                        Salvar nome
                      </button>
                    </>
                  )}
                </>
              ) : (
                <p className="mt-3 text-xs text-slate-400">
                  Selecione uma conversa para ver os detalhes.
                </p>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold">Modelos prontos</h3>
              <p className="mt-1 text-xs text-slate-400">
                Personalize e envie para aprovação
              </p>
              <div className="mt-3 space-y-2">
                {officialTemplatePresets.slice(0, 3).map((p) => (
                  <button
                    key={p.name}
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-100 p-3 text-left hover:border-blue-300"
                    onClick={() => setTab("models")}
                  >
                    <LayoutTemplate
                      className="shrink-0 text-blue-500"
                      size={17}
                    />
                    <span className="flex-1 text-xs font-medium">
                      {p.title}
                    </span>
                    <ChevronRight size={13} />
                  </button>
                ))}
              </div>
              <button
                className={`${secondary} mt-3 w-full`}
                onClick={() => setTab("models")}
              >
                Criar meu modelo
              </button>
            </div>
            <div className="rounded-xl border border-blue-100 bg-white p-4">
              <h3 className="text-sm font-bold">Preparar campanha</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Escolha o remetente e um público com autorização. Revise o
                modelo antes de iniciar.
              </p>
              <button
                className={`${primary} mt-4 w-full`}
                onClick={newCampaign}
              >
                Nova campanha
              </button>
            </div>
            {data.notes.length > 0 && (
              <div className="rounded-xl border bg-white p-4">
                <h3 className="text-sm font-bold">Notas da equipe</h3>
                {data.notes.map((n) => (
                  <div key={n.id} className="mt-3 border-t pt-3">
                    <p className="whitespace-pre-wrap text-xs text-slate-600">
                      {n.body}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {new Date(n.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
