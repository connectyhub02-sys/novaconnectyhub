"use client";

import { useMemo, useState, useTransition } from "react";
import type {
  ProductComplianceAction,
  ProductComplianceCategory,
  ProductComplianceRule,
  SaveProductComplianceRuleInput,
} from "@/lib/compliance/product-compliance";
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  Globe2,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { DialogFrame } from "@/components/ui/dialog-frame";

type Props = {
  initialRules: ProductComplianceRule[];
  userLabel: string;
};

const CATEGORY_LABELS: Record<ProductComplianceCategory, { label: string; color: string }> = {
  health_controlled: { label: "Controle Especial / Saúde", color: "bg-amber-50 text-amber-700 border-amber-200" },
  illicit_drugs: { label: "Drogas Ilícitas / Tóxicos", color: "bg-red-50 text-red-700 border-red-200" },
  weapons: { label: "Armas e Munições", color: "bg-rose-50 text-rose-700 border-rose-200" },
  supplements: { label: "Suplementos Restritos", color: "bg-orange-50 text-orange-700 border-orange-200" },
  adult: { label: "Conteúdo Adulto", color: "bg-purple-50 text-purple-700 border-purple-200" },
  custom: { label: "Regra Personalizada", color: "bg-slate-50 text-slate-700 border-slate-200" },
};

const COUNTRY_OPTIONS = [
  { code: "ALL", label: "🌐 Global (Todos os Países)" },
  { code: "BR", label: "🇧🇷 Brasil (BR)" },
  { code: "US", label: "🇺🇸 Estados Unidos (US)" },
  { code: "PT", label: "🇵🇹 Portugal (PT)" },
  { code: "ES", label: "🇪🇸 Espanha (ES)" },
  { code: "MX", label: "🇲🇽 México (MX)" },
  { code: "GB", label: "🇬🇧 Reino Unido (GB)" },
];

export function AdminProductComplianceConsole({ initialRules }: Props) {
  const [rules, setRules] = useState<ProductComplianceRule[]>(initialRules);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string>("ALL_FILTER");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL_FILTER");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [isPending, startTransition] = useTransition();

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ProductComplianceRule | null>(null);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<ProductComplianceCategory>("health_controlled");
  const [formCountry, setFormCountry] = useState("BR");
  const [formKeywords, setFormKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [formIntentKeywords, setFormIntentKeywords] = useState<string[]>([]);
  const [intentInput, setIntentInput] = useState("");
  const [formAction, setFormAction] = useState<ProductComplianceAction>("block_all");
  const [formBlockedMessage, setFormBlockedMessage] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirm modal
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filtered rules
  const filteredRules = useMemo(() => {
    return rules.filter((rule) => {
      const matchesSearch =
        searchTerm === "" ||
        rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rule.keywords.some((k) => k.toLowerCase().includes(searchTerm.toLowerCase())) ||
        rule.notes?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCountry =
        selectedCountry === "ALL_FILTER" || rule.country_code === selectedCountry;

      const matchesCategory =
        selectedCategory === "ALL_FILTER" || rule.category === selectedCategory;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && rule.is_enabled) ||
        (statusFilter === "inactive" && !rule.is_enabled);

      return matchesSearch && matchesCountry && matchesCategory && matchesStatus;
    });
  }, [rules, searchTerm, selectedCountry, selectedCategory, statusFilter]);

  // Metrics
  const stats = useMemo(() => {
    const total = rules.length;
    const active = rules.filter((r) => r.is_enabled).length;
    const countries = new Set(rules.map((r) => r.country_code)).size;
    const totalKeywords = rules.reduce((acc, r) => acc + r.keywords.length, 0);
    return { total, active, countries, totalKeywords };
  }, [rules]);

  const handleToggle = (rule: ProductComplianceRule) => {
    const nextState = !rule.is_enabled;
    // Optimistic UI update
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, is_enabled: nextState } : r))
    );

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/compliance-produtos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: rule.id, is_enabled: nextState }),
        });
        const data = await res.json();
        if (!data.ok) {
          // Revert on error
          setRules((prev) =>
            prev.map((r) => (r.id === rule.id ? { ...r, is_enabled: rule.is_enabled } : r))
          );
          alert(`Erro ao alterar regra: ${data.error}`);
        }
      } catch (err) {
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, is_enabled: rule.is_enabled } : r))
        );
        alert("Erro de conexão ao alterar regra.");
      }
    });
  };

  const openCreateModal = () => {
    setEditingRule(null);
    setFormName("");
    setFormCategory("health_controlled");
    setFormCountry("BR");
    setFormKeywords([]);
    setKeywordInput("");
    setFormIntentKeywords([]);
    setIntentInput("");
    setFormAction("block_all");
    setFormBlockedMessage(
      "Não posso recomendar combinações deste produto nem organizar a compra ou pagamento por aqui. Não vou gerar pedido ou link de pagamento para esse item."
    );
    setFormEnabled(true);
    setFormNotes("");
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (rule: ProductComplianceRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormCategory(rule.category);
    setFormCountry(rule.country_code);
    setFormKeywords([...rule.keywords]);
    setKeywordInput("");
    setFormIntentKeywords([...rule.intent_keywords]);
    setIntentInput("");
    setFormAction(rule.action);
    setFormBlockedMessage(rule.blocked_message);
    setFormEnabled(rule.is_enabled);
    setFormNotes(rule.notes ?? "");
    setFormError(null);
    setModalOpen(true);
  };

  const addKeyword = () => {
    const trimmed = keywordInput.trim().toLowerCase();
    if (trimmed && !formKeywords.includes(trimmed)) {
      setFormKeywords([...formKeywords, trimmed]);
      setKeywordInput("");
    }
  };

  const removeKeyword = (index: number) => {
    setFormKeywords(formKeywords.filter((_, i) => i !== index));
  };

  const addIntentKeyword = () => {
    const trimmed = intentInput.trim().toLowerCase();
    if (trimmed && !formIntentKeywords.includes(trimmed)) {
      setFormIntentKeywords([...formIntentKeywords, trimmed]);
      setIntentInput("");
    }
  };

  const removeIntentKeyword = (index: number) => {
    setFormIntentKeywords(formIntentKeywords.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError("Informe o nome da regra.");
      return;
    }
    if (formKeywords.length === 0) {
      setFormError("Adicione ao menos uma palavra-chave ou termo restrito.");
      return;
    }
    if (!formBlockedMessage.trim()) {
      setFormError("Informe a mensagem de recusa.");
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const payload: SaveProductComplianceRuleInput = {
      id: editingRule?.id,
      name: formName.trim(),
      category: formCategory,
      country_code: formCountry,
      keywords: formKeywords,
      intent_keywords: formIntentKeywords,
      action: formAction,
      blocked_message: formBlockedMessage.trim(),
      is_enabled: formEnabled,
      notes: formNotes.trim() || null,
    };

    try {
      const res = await fetch("/api/admin/compliance-produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        setFormError(data.error || "Erro ao salvar regra.");
        setIsSaving(false);
        return;
      }

      const savedRule: ProductComplianceRule = data.rule;
      if (editingRule) {
        setRules((prev) => prev.map((r) => (r.id === savedRule.id ? savedRule : r)));
      } else {
        setRules((prev) => [savedRule, ...prev]);
      }
      setModalOpen(false);
    } catch (err) {
      setFormError("Erro de comunicação ao salvar regra.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/admin/compliance-produtos?id=${deleteConfirmId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        setRules((prev) => prev.filter((r) => r.id !== deleteConfirmId));
        setDeleteConfirmId(null);
      } else {
        alert(`Erro ao excluir: ${data.error}`);
      }
    } catch (err) {
      alert("Erro ao excluir regra.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
              Compliance e Restrição de Produtos
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Controle soberano do administrador sobre substâncias e itens restritos ou permitidos por país e globalmente.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
        >
          <Plus className="h-4 w-4" />
          <span>Nova Regra de Restrição</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Regras Cadastradas</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Regras Ativas</p>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              On
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Países Cobertos</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{stats.countries}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Termos Monitorados</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{stats.totalKeywords}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome, termo ou substância..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Country filter */}
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-slate-400" />
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="ALL_FILTER">Todos os Países</option>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="ALL_FILTER">Todas as Categorias</option>
              {Object.entries(CATEGORY_LABELS).map(([cat, info]) => (
                <option key={cat} value={cat}>
                  {info.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="flex rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
            <button
              onClick={() => setStatusFilter("all")}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                statusFilter === "all"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setStatusFilter("active")}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                statusFilter === "active"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              Ativas
            </button>
            <button
              onClick={() => setStatusFilter("inactive")}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                statusFilter === "inactive"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              Inativas
            </button>
          </div>
        </div>
      </div>

      {/* Rules List / Cards */}
      {filteredRules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
          <ShieldAlert className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
            Nenhuma regra encontrada
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {searchTerm || selectedCountry !== "ALL_FILTER" || statusFilter !== "all"
              ? "Tente ajustar os filtros acima."
              : "Cadastre a primeira regra de restrição de produtos para a plataforma."}
          </p>
          <div className="mt-6">
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500"
            >
              <Plus className="h-4 w-4" />
              Nova Regra
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredRules.map((rule) => {
            const categoryInfo = CATEGORY_LABELS[rule.category] ?? CATEGORY_LABELS.custom;
            return (
              <div
                key={rule.id}
                className={`relative flex flex-col justify-between rounded-2xl border p-5 shadow-sm transition ${
                  rule.is_enabled
                    ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                    : "border-slate-200/60 bg-slate-50/50 opacity-75 dark:border-slate-800/60 dark:bg-slate-900/40"
                }`}
              >
                {/* Card Top: Title, Badges and Actions */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white sm:text-lg">
                        {rule.name}
                      </h3>
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${categoryInfo.color}`}>
                        {categoryInfo.label}
                      </span>
                      <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {rule.country_code === "ALL" ? "🌐 Global (Todos)" : `País: ${rule.country_code}`}
                      </span>
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                        rule.action === "block_all"
                          ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      }`}>
                        {rule.action === "block_all" ? "Bloqueio Total (IA + Checkout)" : "Apenas Checkout"}
                      </span>
                    </div>

                    {rule.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {rule.notes}
                      </p>
                    )}
                  </div>

                  {/* Toggle and Actions */}
                  <div className="flex items-center gap-3">
                    {/* Switch */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {rule.is_enabled ? "Ativo" : "Inativo"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggle(rule)}
                        disabled={isPending}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          rule.is_enabled ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            rule.is_enabled ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Edit button */}
                    <button
                      onClick={() => openEditModal(rule)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                      title="Editar regra"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={() => setDeleteConfirmId(rule.id)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      title="Excluir regra"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Keywords Chips */}
                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Termos e Substâncias Bloqueados ({rule.keywords.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {rule.keywords.map((kw, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Intent Keywords (if any) */}
                {rule.intent_keywords.length > 0 && (
                  <div className="mt-2.5">
                    <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Gatilhos de Intenção:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {rule.intent_keywords.map((ik, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center rounded bg-slate-50 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400"
                        >
                          {ik}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Agent Response Preview */}
                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Resposta enviada pelo Agente ao cliente:
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    &ldquo;{rule.blocked_message}&rdquo;
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create / Edit Rule */}
      {modalOpen && <DialogFrame
        onClose={() => !isSaving && setModalOpen(false)}
        aria-label={editingRule ? "Editar Regra de Restrição" : "Nova Regra de Restrição de Produtos"}
        className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-3 py-6 backdrop-blur-sm"
      >
        <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">{editingRule ? "Editar Regra de Restrição" : "Nova Regra de Restrição de Produtos"}</h2>
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nome da Regra *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Anabolizantes e Esteroides, Drogas Ilícitas, etc."
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                País de Aplicação *
              </label>
              <select
                value={formCountry}
                onChange={(e) => setFormCountry(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Categoria *
              </label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as ProductComplianceCategory)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {Object.entries(CATEGORY_LABELS).map(([cat, info]) => (
                  <option key={cat} value={cat}>
                    {info.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Keywords / Termos Restritos */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Termos e Substâncias Proibidas * (digite e aperte Enter ou botão +)
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                placeholder="Ex: testosterona, durateston, cocaina, etc."
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <button
                type="button"
                onClick={addKeyword}
                className="rounded-xl bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-white"
              >
                Adicionar
              </button>
            </div>

            {/* Chip list */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {formKeywords.map((kw, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={() => removeKeyword(i)}
                    className="rounded p-0.5 hover:bg-rose-200/60 dark:hover:bg-rose-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Intent Keywords */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Termos de Intenção (opcional — ex: &quot;ganhar massa&quot;, &quot;ciclo&quot;, &quot;secar&quot;, &quot;kit&quot;)
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                placeholder="Ex: ciclo, injetavel"
                value={intentInput}
                onChange={(e) => setIntentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addIntentKeyword();
                  }
                }}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <button
                type="button"
                onClick={addIntentKeyword}
                className="rounded-xl bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-white"
              >
                +
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {formIntentKeywords.map((ik, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {ik}
                  <button
                    type="button"
                    onClick={() => removeIntentKeyword(i)}
                    className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Action */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Ação Aplicada *
            </label>
            <select
              value={formAction}
              onChange={(e) => setFormAction(e.target.value as ProductComplianceAction)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="block_all">Bloqueio Total (Recusa recomendação e impede checkout)</option>
              <option value="block_checkout">Apenas Checkout (Permite diálogo mas bloqueia link de pagamento)</option>
            </select>
          </div>

          {/* Blocked message */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Mensagem de Recusa do Agente *
            </label>
            <textarea
              required
              rows={3}
              value={formBlockedMessage}
              onChange={(e) => setFormBlockedMessage(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Observações / Justificativa Regulatória (opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Lei 11.343 / Portaria 344/98 Anvisa"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Active switch */}
          <div className="flex items-center gap-3 pt-1">
            <input
              type="checkbox"
              id="formEnabled"
              checked={formEnabled}
              onChange={(e) => setFormEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
            />
            <label htmlFor="formEnabled" className="text-sm font-medium text-slate-900 dark:text-white">
              Regra Ativa Imediatamente
            </label>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500 disabled:opacity-50"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingRule ? "Salvar Alterações" : "Criar Regra"}
            </button>
          </div>
        </form>
        </div>
      </DialogFrame>}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && <DialogFrame
        onClose={() => !isDeleting && setDeleteConfirmId(null)}
        aria-label="Confirmar Exclusão de Regra"
        className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-3 py-6 backdrop-blur-sm"
      >
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Confirmar Exclusão de Regra</h2>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Tem certeza de que deseja excluir permanentemente esta regra de compliance? O produto deixará de ter qualquer restrição configurada nesta regra.
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setDeleteConfirmId(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDelete}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50"
            >
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Exclusão
            </button>
          </div>
        </div>
        </div>
      </DialogFrame>}
    </div>
  );
}
