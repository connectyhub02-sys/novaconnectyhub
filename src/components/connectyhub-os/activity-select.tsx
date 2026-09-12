"use client";

import { useRef, useState } from "react";
import { Popover } from "radix-ui";
import { Check, ChevronDown, Search } from "lucide-react";
import { agentPromptTemplates, type AgentPromptTemplateId } from "@/lib/whatsapp/agent-prompt-templates";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function ActivitySelect({ value, onChange }: { value: AgentPromptTemplateId; onChange: (value: AgentPromptTemplateId) => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const matches = agentPromptTemplates.filter((item) => normalize(`${item.label} ${item.sectorName}`).includes(normalize(search.trim())));
  const selected = agentPromptTemplates.find((item) => item.id === value) ?? agentPromptTemplates[0];
  const choose = (id: AgentPromptTemplateId) => { onChange(id); setOpen(false); setSearch(""); };
  return (
    <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); setSearch(""); }}>
      <Popover.Trigger asChild>
        <button type="button" aria-label="Atividade e forma de atuação" className="flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-transparent px-3 text-left text-[13px]">
          <span className="truncate">{selected.label}</span><ChevronDown className="h-4 w-4 shrink-0" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={5} collisionPadding={12} aria-label="Escolher profissão ou empresa"
          className="z-[1000] flex w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border shadow-xl"
          style={{ background: "var(--ch-panel, white)", color: "var(--ch-text, #0f172a)", borderColor: "var(--ch-border)" }}
          onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus(); }}>
          <div className="flex shrink-0 items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-slate-500" />
            <input ref={inputRef} aria-label="Buscar profissão ou empresa" className="h-11 min-w-0 flex-1 bg-transparent text-[13px] outline-none" placeholder="Buscar profissão ou empresa…" value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") { event.preventDefault(); listRef.current?.querySelector<HTMLButtonElement>("button")?.focus(); }
                if (event.key === "Enter" && matches.length === 1) { event.preventDefault(); choose(matches[0].id); }
              }} />
          </div>
          <div ref={listRef} className="max-h-[min(320px,55dvh)] overflow-y-auto p-1"
            onKeyDown={(event) => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
              const index = buttons.indexOf(event.target as HTMLButtonElement);
              if (index < 0) return;
              event.preventDefault();
              if (event.key === "ArrowUp" && index === 0) { inputRef.current?.focus(); return; }
              const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
              buttons[next]?.focus();
            }}>
            {([ ["professional", "Profissionais"], ["company", "Empresas"], ["general", "Outras atividades"] ] as const).map(([kind, label]) => {
              const items = matches.filter((item) => item.kind === kind);
              return items.length ? <div key={kind} role="group" aria-label={label}>
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold text-slate-500">{label}</p>
                {items.map((item) => <button type="button" key={item.id} aria-pressed={item.id === value}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[13px] hover:bg-blue-500/10 focus:bg-blue-500/10 focus:outline-none"
                  onClick={() => choose(item.id)}>{item.label}{item.id === value ? <Check className="h-4 w-4 shrink-0 text-blue-500" /> : null}</button>)}
              </div> : null;
            })}
            {matches.length === 0 ? <div className="p-3 text-xs"><p className="text-slate-500" role="status">Nenhum resultado. Tente outra palavra.</p><button type="button" className="mt-2 text-blue-600" onClick={() => choose("generic_sales")}>Escolher outra atividade</button></div> : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
