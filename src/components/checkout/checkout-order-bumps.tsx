"use client";

import Image from "next/image";
import { BadgePercent, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type CheckoutOrderBumpOption = {
  productId: string;
  title: string;
  description: string | null;
  badge: string | null;
  price: number;
  priceLabel: string;
  mediaUrl: string | null;
};

export function CheckoutOrderBumps({ items, selectedIds, disabled, onToggle, onView, onNavigate }: {
  items: CheckoutOrderBumpOption[];
  selectedIds: string[];
  disabled: boolean;
  onToggle: (productId: string) => void;
  onView: (productId: string) => void;
  onNavigate: (productId: string, index: number) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const viewed = useRef(new Set<string>());
  const previousIndex = useRef(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const activeIndex = Math.min(currentIndex, Math.max(0, items.length - 1));
  const multiple = items.length > 1;

  useEffect(() => {
    const root = viewport.current;
    if (!root) return;
    // Viewport-rooted observation also respects the horizontal clipping of the carousel.
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const productId = (entry.target as HTMLElement).dataset.productId;
        if (!entry.isIntersecting || entry.intersectionRatio < 0.6 || !productId || viewed.current.has(productId)) continue;
        viewed.current.add(productId);
        onView(productId);
      }
    }, { threshold: 0.6 });
    for (const slide of root.children) observer.observe(slide);
    return () => observer.disconnect();
  }, [items, onView]);

  function navigate(index: number) {
    const root = viewport.current;
    const slide = root?.children[index] as HTMLElement | undefined;
    const first = root?.firstElementChild as HTMLElement | null;
    if (!root || !slide || !first) return;
    root.scrollTo({
      left: slide.offsetLeft - first.offsetLeft,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  function handleScroll() {
    const root = viewport.current;
    if (!root) return;
    const first = root.firstElementChild as HTMLElement | null;
    const next = root.children[1] as HTMLElement | undefined;
    const step = first && next ? next.offsetLeft - first.offsetLeft : root.clientWidth;
    const index = Math.max(0, Math.min(items.length - 1, Math.round(root.scrollLeft / (step || 1))));
    setCurrentIndex(index);
    if (index !== previousIndex.current && items[index]) {
      previousIndex.current = index;
      onNavigate(items[index].productId, index);
    }
  }

  return (
    <section aria-label="Ofertas para seu pedido" aria-roledescription={multiple ? "carrossel" : undefined} className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/70">
      <div className="flex min-h-11 items-center gap-2 pl-3 pr-1 text-xs font-semibold text-slate-900">
        <BadgePercent className="h-4 w-4 shrink-0 text-amber-600" />
        <span className="min-w-0 flex-1">Ofertas para seu pedido</span>
        {multiple ? <div className="flex shrink-0 items-center">
          <button type="button" aria-label="Oferta anterior" disabled={activeIndex === 0} onClick={() => navigate(activeIndex - 1)} className="grid h-11 w-11 place-items-center rounded-lg text-amber-800 hover:bg-amber-100 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <span aria-live="polite" aria-atomic="true" className="min-w-6 text-center text-[11px] tabular-nums text-amber-800">{activeIndex + 1}/{items.length}</span>
          <button type="button" aria-label="Próxima oferta" disabled={activeIndex === items.length - 1} onClick={() => navigate(activeIndex + 1)} className="grid h-11 w-11 place-items-center rounded-lg text-amber-800 hover:bg-amber-100 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        </div> : null}
      </div>
      <div className="px-2 pb-2">
        <div ref={viewport} onScroll={handleScroll} className="relative flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map(item => {
            const selected = selectedIds.includes(item.productId);
            return <button key={item.productId} data-product-id={item.productId} type="button" aria-pressed={selected} aria-label={`${selected ? "Remover" : "Adicionar"} ${item.title}, ${item.priceLabel}`} disabled={disabled} onClick={() => onToggle(item.productId)} className={cn(
              "flex min-w-0 shrink-0 basis-full snap-start items-center gap-2.5 rounded-lg border p-2.5 text-left transition disabled:opacity-60",
              selected ? "border-[#25D366] bg-emerald-50" : "border-blue-100 bg-white hover:border-amber-300",
            )}>
              {item.mediaUrl ? <Image src={item.mediaUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg object-contain" unoptimized /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100"><BadgePercent className="h-5 w-5 text-amber-700" /></span>}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 break-words text-xs font-semibold leading-4 text-slate-950">{item.title}</span>
                <span className="mt-1 block text-xs font-bold text-slate-950">+ {item.priceLabel}</span>
              </span>
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded border", selected ? "border-[#25D366] bg-[#25D366] text-white" : "border-blue-100 text-slate-400")}>{selected ? <Check className="h-4 w-4" /> : null}</span>
            </button>;
          })}
        </div>
      </div>
    </section>
  );
}
