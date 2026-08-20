"use client";

import { useId, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type HighlightLabelInputProps = {
  inputClassName?: string;
  inputStyle?: CSSProperties;
  maxLength?: number;
  onChange: (value: string) => void;
  placeholder?: string;
  suggestions: readonly string[];
  value: string;
};

export function HighlightLabelInput({
  inputClassName,
  inputStyle,
  maxLength = 32,
  onChange,
  placeholder,
  suggestions,
  value,
}: HighlightLabelInputProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedValue = value.trim().toLowerCase();
  const visibleSuggestions = useMemo(() => (
    normalizedValue
      ? suggestions.filter((label) => label.toLowerCase().includes(normalizedValue))
      : [...suggestions]
  ), [normalizedValue, suggestions]);
  const selectedLabel = suggestions.find((label) => label.toLowerCase() === normalizedValue) ?? null;

  function updateValue(nextValue: string) {
    onChange(nextValue.slice(0, maxLength));
  }

  function selectSuggestion(label: string) {
    updateValue(label);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(visibleSuggestions.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" && open && visibleSuggestions[activeIndex]) {
      event.preventDefault();
      selectSuggestion(visibleSuggestions[activeIndex]);
    }
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <input
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "h-11 w-full rounded-lg border bg-white px-3 text-[12px] text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100",
          inputClassName,
          "pr-10",
        )}
        onChange={(event) => {
          updateValue(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => {
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        style={inputStyle}
        value={value}
      />
      <button
        aria-label="Abrir sugestoes de selo"
        className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-blue-50 hover:text-blue-600"
        onClick={() => setOpen((current) => !current)}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      >
        <ChevronDown className={cn("h-4 w-4 transition", open ? "rotate-180" : "")} />
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-blue-100 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.16)]"
          id={listboxId}
          role="listbox"
        >
          {visibleSuggestions.length ? (
            <div className="max-h-56 overflow-y-auto p-1.5">
              {visibleSuggestions.map((label, index) => {
                const active = activeIndex === index;
                const selected = selectedLabel === label;

                return (
                  <button
                    aria-selected={selected}
                    className={cn(
                      "flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-[12px] font-semibold transition",
                      selected
                        ? "bg-blue-600 text-white"
                        : active
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-700 hover:bg-blue-50 hover:text-blue-700",
                    )}
                    key={label}
                    onClick={() => selectSuggestion(label)}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                    type="button"
                  >
                    <span className="truncate">{label}</span>
                    {selected ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-3 text-[12px] font-semibold text-slate-500">
              Selo personalizado
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
