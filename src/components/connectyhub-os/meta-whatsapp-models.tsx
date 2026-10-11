"use client";
import { useState } from "react";
import { LayoutTemplate, Plus, Send, ChevronRight } from "lucide-react";
import {
  officialTemplatePresets,
  variableCount,
  type OfficialTemplate,
} from "@/lib/meta/whatsapp-workspace-policy";
import {
  officialField as field,
  officialPrimary as primary,
  officialSecondary as secondary,
  officialStatus,
} from "./meta-whatsapp-types";
export function OfficialTemplatePreview({
  template,
  values = [],
}: {
  template: OfficialTemplate;
  values?: string[];
}) {
  return (
    <div className="rounded-2xl rounded-tr-sm border border-emerald-100 bg-emerald-50 p-4 text-sm text-slate-800">
      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
        {officialStatus[template.status] || template.status} ·{" "}
        {template.category === "MARKETING" ? "Marketing" : "Utilidade"}
      </span>
      {template.components
        .filter((c) => c.text)
        .map((c, i) => (
          <p key={i} className="mt-2 whitespace-pre-wrap break-words">
            {c.text?.replace(
              /\{\{(\d+)\}\}/g,
              (v, n) => values[Number(n) - 1] || v,
            )}
          </p>
        ))}
      {template.components
        .flatMap((c) => c.buttons ?? [])
        .map((b, i) => (
          <div
            key={i}
            className="mt-2 rounded-lg border border-emerald-200 bg-white p-2 text-center text-blue-600"
          >
            {b.text}
          </div>
        ))}
    </div>
  );
}
export function OfficialVariables({
  text,
  values,
  onChange,
  examples = false,
}: {
  text: string;
  values: string[];
  onChange: (values: string[]) => void;
  examples?: boolean;
}) {
  let count = 0;
  try {
    count = variableCount(text);
  } catch {
    return (
      <p className="text-xs text-amber-700">
        Use variáveis consecutivas, como {"{{1}}"} e {"{{2}}"}.
      </p>
    );
  }
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <label key={i} className="block text-xs text-slate-500">
          {examples ? "Exemplo para aprovação" : "Valor que será enviado"}{" "}
          {"{{" + (i + 1) + "}}"}
          <input
            required
            className={`${field} mt-1`}
            value={values[i] ?? ""}
            maxLength={500}
            onChange={(e) => {
              const next = Array.from(
                { length: count },
                (_, j) => values[j] ?? "",
              );
              next[i] = e.target.value;
              onChange(next);
            }}
          />
        </label>
      ))}
    </>
  );
}
export function OfficialModels({
  templates,
  connected,
  busy,
  onCreate,
  onError,
}: {
  templates: OfficialTemplate[];
  connected: boolean;
  busy: boolean;
  onCreate: (body: Record<string, unknown>) => Promise<void>;
  onError: string | null;
}) {
  const [draft, setDraft] = useState<{
      name: string;
      text: string;
      category: string;
      buttons: readonly string[];
    } | null>(null),
    [language, setLanguage] = useState("pt_BR"),
    [examples, setExamples] = useState<string[]>([]);
  const draftTemplate: OfficialTemplate | null = draft
    ? {
        id: "draft",
        name: draft.name,
        status: "Rascunho",
        category: draft.category,
        language,
        components: [
          { type: "BODY", text: draft.text },
          ...(draft.buttons.length
            ? [
                {
                  type: "BUTTONS",
                  buttons: draft.buttons.map((text) => ({
                    type: "QUICK_REPLY",
                    text,
                  })),
                },
              ]
            : []),
        ],
      }
    : null;
  return (
    <div className="space-y-6 p-5 lg:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Modelos de mensagem
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Comece com uma sugestão, personalize e envie para análise da Meta.
          </p>
        </div>
        <button
          className={secondary}
          onClick={() => {
            setDraft({
              name: "",
              text: "",
              category: "MARKETING",
              buttons: [],
            });
            setExamples([]);
          }}
        >
          <Plus size={16} /> Criar meu modelo
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {officialTemplatePresets.map((p) => (
          <button
            key={p.name}
            className="group rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-blue-400 hover:shadow-sm"
            onClick={() => {
              setDraft({ ...p });
              setExamples([]);
            }}
          >
            <LayoutTemplate className="mb-4 text-blue-600" size={22} />
            <strong className="text-sm text-slate-900">{p.title}</strong>
            <p className="mt-1 text-xs text-slate-500">
              {p.category === "MARKETING" ? "Marketing" : "Utilidade"} ·
              Personalizável
            </p>
            <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-blue-600">
              Usar modelo <ChevronRight size={14} />
            </p>
          </button>
        ))}
      </div>
      {draft && draftTemplate && (
        <div className="grid gap-6 rounded-2xl border border-blue-100 bg-blue-50/30 p-5 lg:grid-cols-2">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void onCreate({
                ...draft,
                buttons: draft.buttons.map((b) => b.trim()).filter(Boolean),
                language,
                examples,
              })
                .then(() => setDraft(null))
                .catch(() => {});
            }}
          >
            <h3 className="font-semibold text-slate-900">
              Personalizar modelo
            </h3>
            <label className="block text-xs text-slate-600">
              Nome do modelo
              <input
                className={`${field} mt-1`}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="novidades_outubro"
                required
                pattern="[a-z][a-z0-9_]{2,511}"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-600">
                Categoria
                <select
                  className={`${field} mt-1`}
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                >
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utilidade</option>
                </select>
              </label>
              <label className="text-xs text-slate-600">
                Idioma
                <select
                  className={`${field} mt-1`}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="pt_BR">Português BR</option>
                  <option value="en_US">English US</option>
                  <option value="es">Español</option>
                </select>
              </label>
            </div>
            <label className="block text-xs text-slate-600">
              Mensagem
              <textarea
                className={`${field} mt-1`}
                rows={5}
                value={draft.text}
                maxLength={1024}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                required
              />
            </label>
            <p className="text-xs text-slate-500">
              Variáveis opcionais: {"{{1}}, {{2}}"}. A categoria final e a
              aprovação são decididas pela Meta.
            </p>
            <OfficialVariables
              text={draft.text}
              values={examples}
              onChange={setExamples}
              examples
            />
            <label className="block text-xs text-slate-600">
              Respostas rápidas · uma por linha, até 3
              <textarea
                className={`${field} mt-1`}
                rows={3}
                value={draft.buttons.join("\n")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    buttons: e.target.value.split("\n").slice(0, 3),
                  })
                }
                placeholder={"Quero conhecer\nFalar com atendente\nSAIR"}
              />
            </label>
            <div className="flex gap-2">
              <button className={primary} disabled={busy || !connected}>
                <Send size={15} /> Enviar para aprovação
              </button>
              <button
                type="button"
                className={secondary}
                onClick={() => setDraft(null)}
              >
                Cancelar
              </button>
            </div>
            {!connected && (
              <p className="text-xs text-amber-700">
                Conecte e selecione um número para enviar o modelo à sua conta
                WhatsApp.
              </p>
            )}
          </form>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
              Prévia da mensagem
            </p>
            <OfficialTemplatePreview
              template={draftTemplate}
              values={examples}
            />
            <p className="mt-3 text-xs text-slate-500">
              Esta prévia não representa aprovação. Nenhuma mensagem é enviada
              ao criar o modelo.
            </p>
          </div>
        </div>
      )}
      {onError && <p className="text-sm text-amber-700">{onError}</p>}
      <h3 className="font-semibold text-slate-900">
        Modelos da conta selecionada
      </h3>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <article
            key={t.id}
            className="rounded-2xl border border-slate-200 bg-white p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <strong className="break-all text-sm text-slate-800">
                {t.name}
              </strong>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${t.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
              >
                {officialStatus[t.status] || t.status}
              </span>
            </div>
            <OfficialTemplatePreview template={t} />
            <p className="mt-2 text-xs text-slate-400">{t.language}</p>
          </article>
        ))}
      </div>
      {!templates.length && (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
          Os modelos da sua conta aparecerão aqui após conectar o número.
        </p>
      )}
    </div>
  );
}
