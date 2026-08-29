"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { ConnectyLogo } from "@/components/brand/connecty-logo";

type PublicSiteHeaderProps = {
  active?: "home" | "solutions" | "api";
};

const navItems = [
  { href: "/#inicio", label: "Inicio", key: "home" },
  { href: "/#teste-turing", label: "Teste", key: "home" },
  { href: "/#diferencial", label: "Diferenciais", key: "home" },
  { href: "/#como-funciona", label: "Como funciona", key: "home" },
  { href: "/#planos", label: "Planos", key: "home" },
  { href: "/solucoes", label: "Solucoes", key: "solutions" },
  { href: "/docs/api", label: "API", key: "api" },
  { href: "/#faq", label: "FAQ", key: "home" },
] as const;

export function PublicSiteHeader({ active }: PublicSiteHeaderProps) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  return (
    <header className="sticky left-0 right-0 top-0 z-50 border-b border-white/[0.06] bg-black/78 px-4 py-3 backdrop-blur-md md:px-12 lg:px-16">
      <div className="mx-auto flex max-w-[1760px] items-center justify-between gap-3">
        <Link
          aria-label="Voltar para a pagina inicial da ConnectyHub"
          className="inline-flex shrink-0 rounded-full border border-emerald-400/35 px-2.5 py-2 transition hover:border-emerald-300 sm:px-4"
          href="/#inicio"
          onClick={() => setMobileNavOpen(false)}
        >
          <ConnectyLogo className="h-4 w-[104px] sm:w-[132px]" tone="white" type="full" />
        </Link>

        <nav className="hidden min-w-0 items-center justify-center gap-3 font-mono text-[10px] text-zinc-300 lg:flex xl:gap-4 xl:text-[11px]">
          {navItems.map((item) => {
            const isActive = active === item.key;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "whitespace-nowrap text-emerald-300" : "whitespace-nowrap transition-colors hover:text-white"}
                href={item.href}
                key={item.href}
              >
                [ {item.label} ]
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            className="inline-flex rounded-full border border-white/15 px-2.5 py-2 text-[10px] font-bold text-white transition hover:border-white/35 sm:px-3 sm:text-[11px]"
            href="/login"
          >
            Entrar
          </Link>
          <Link
            className="inline-flex rounded-full bg-emerald-300 px-2.5 py-2 text-[10px] font-bold text-black transition-all hover:bg-emerald-200 sm:px-4 sm:text-[11px]"
            href="/iniciar"
          >
            Teste gratis
          </Link>
          <button
            aria-expanded={mobileNavOpen}
            aria-label={mobileNavOpen ? "Fechar menu" : "Abrir menu"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-zinc-200 transition hover:border-white/35 lg:hidden"
            onClick={() => setMobileNavOpen((current) => !current)}
            type="button"
          >
            {mobileNavOpen ? <X size={15} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {mobileNavOpen ? (
        <nav className="mx-auto mt-3 grid max-w-[1760px] gap-2 rounded-[8px] border border-white/10 bg-black/95 p-3 font-mono text-[11px] text-zinc-200 shadow-2xl shadow-black/35 lg:hidden">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {navItems.map((item) => {
              const isActive = active === item.key;

              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "rounded-[8px] border border-emerald-300/50 bg-emerald-300/10 px-3 py-2 text-center text-emerald-200"
                      : "rounded-[8px] border border-white/10 px-3 py-2 text-center transition hover:border-white/30 hover:text-white"
                  }
                  href={item.href}
                  key={item.href}
                  onClick={() => setMobileNavOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
