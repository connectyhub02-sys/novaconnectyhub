"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
import { ConnectyLogo } from "@/components/brand/connecty-logo";
import { publicSiteNavItems, solutionNavItems } from "./public-site-nav";
import styles from "./public-site-header.module.css";

type PublicSiteHeaderProps = { active?: "home" | "solutions" | "custom" | "api" | "video"; fixed?: boolean };
export function PublicSiteHeader({ active, fixed = false }: PublicSiteHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const solutionsButton = useRef<HTMLButtonElement>(null);
  const mobileButton = useRef<HTMLButtonElement>(null);
  const items = publicSiteNavItems;
  function closeMenus() { setMobileOpen(false); setSolutionsOpen(false); }
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) { setMobileOpen(false); setSolutionsOpen(false); }
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (solutionsOpen) { setSolutionsOpen(false); solutionsButton.current?.focus(); }
      else if (mobileOpen) { setMobileOpen(false); mobileButton.current?.focus(); }
    }
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [mobileOpen, solutionsOpen]);
  const toggleSolutions = (event: React.MouseEvent<HTMLButtonElement>) => {
    solutionsButton.current = event.currentTarget;
    setSolutionsOpen(value => !value);
  };
  const solutionLinks = solutionNavItems.map(solution => <Link key={solution.key} href={solution.href} onClick={closeMenus} aria-current={active === solution.key ? "page" : undefined}>
    <strong>{solution.label}</strong><span>{solution.description}</span>
  </Link>);
  return <header ref={root} className={`${styles.header} ${fixed ? "fixed" : "sticky"} left-0 right-0 top-0 z-50 border-b border-white/[0.05] bg-black/70 px-4 py-3 backdrop-blur-md md:px-12 lg:px-16`}>
    <div className="mx-auto flex max-w-[1760px] items-center justify-between gap-3">
      <Link href="/#inicio" aria-label="ConnectyHub, página inicial" onClick={closeMenus} className="inline-flex shrink-0 rounded-full border px-2.5 py-2 transition-colors sm:px-4" style={{ borderColor: "#00ff8850" }}>
        <ConnectyLogo className="h-4 w-[104px] sm:w-[132px]" tone="white" type="full" />
      </Link>
      <nav className="hidden min-w-0 items-center gap-2 font-mono text-[10px] text-zinc-300 min-[1440px]:flex 2xl:gap-3 2xl:text-[11px]" aria-label="Navegação principal">
        {items.map(item => item.key === "solutions" ? <div key={item.href} className={styles.dropdown} onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setSolutionsOpen(false);
        }}>
          <button type="button" aria-expanded={solutionsOpen} aria-controls="public-solutions-menu" onClick={toggleSolutions} className={styles.navButton}>[ Soluções ] <ChevronDown size={11} /></button>
          {solutionsOpen && <div id="public-solutions-menu" className={styles.dropdownPanel}>{solutionLinks}</div>}
        </div> : <Link key={item.href} className="whitespace-nowrap transition-colors hover:text-white" href={item.href} onClick={closeMenus}>[ {item.label} ]</Link>)}
      </nav>
      <div className="flex shrink-0 items-center gap-2">
        <Link href="/login" className="inline-flex rounded-full border border-white/15 px-2.5 py-2 text-[10px] font-bold text-white transition hover:border-white/35 sm:px-3 sm:text-[11px]">Entrar</Link>
        <Link href="/iniciar" className="inline-flex rounded-full px-2.5 py-2 text-[10px] font-bold text-black transition-all hover:opacity-90 sm:px-4 sm:text-[11px]" style={{ background: "#00ff88" }}>Teste grátis</Link>
        <button ref={mobileButton} type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-zinc-200 transition hover:border-white/35 min-[1440px]:hidden" aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"} aria-controls="public-mobile-menu" aria-expanded={mobileOpen} onClick={() => { setMobileOpen(value => !value); setSolutionsOpen(false); }}>
          {mobileOpen ? <X size={15}/> : <Menu size={16}/>}
        </button>
      </div>
    </div>
    {mobileOpen && <nav id="public-mobile-menu" className="mx-auto mt-3 grid max-h-[calc(100dvh-100px)] max-w-[1760px] gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/95 p-3 font-mono text-[11px] text-zinc-200 shadow-2xl shadow-black/35 min-[1440px]:hidden" aria-label="Navegação no celular">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{items.map(item => item.key === "solutions" ? <button key={item.href} type="button" aria-expanded={solutionsOpen} aria-controls="public-mobile-solutions" onClick={toggleSolutions} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-center transition hover:border-white/30 hover:text-white">Soluções <ChevronDown size={12}/></button> : <Link key={item.href} className="flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-3 py-2 text-center transition hover:border-white/30 hover:text-white" href={item.href} onClick={closeMenus}>{item.label}</Link>)}</div>
      {solutionsOpen && <div id="public-mobile-solutions" className={styles.mobileSolutions}>{solutionLinks}</div>}
    </nav>}
  </header>;
}
