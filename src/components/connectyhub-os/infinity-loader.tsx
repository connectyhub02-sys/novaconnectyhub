import { cn } from "@/lib/utils";

type InfinityLoaderProps = {
  eyebrow?: string;
  label?: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const infinityPath = "M40 40C40 18 62 18 80 40C98 62 120 62 120 40C120 18 98 18 80 40C62 62 40 62 40 40";

export function InfinityMark({ size = "md", className }: Pick<InfinityLoaderProps, "size" | "className">) {
  const sizeClass = size === "sm" ? "h-4 w-8" : size === "lg" ? "h-24 w-48" : "h-16 w-32";

  return (
    <span className={cn("connecty-infinity-mark", sizeClass, className)} aria-hidden="true">
      <svg viewBox="0 0 160 80" className="h-full w-full">
        <path className="connecty-infinity-track" d={infinityPath} pathLength={100} />
        <path className="connecty-infinity-trace" d={infinityPath} pathLength={100} />
        <path className="connecty-infinity-trace connecty-infinity-trace-alt" d={infinityPath} pathLength={100} />
        <circle className="connecty-infinity-core" cx="80" cy="40" r="3.5" />
      </svg>
    </span>
  );
}

export function InfinityLoader({
  eyebrow = "ConnectyHub OS",
  label = "Carregando seu ambiente...",
  description = "Preparando dados, sessoes e integracoes do workspace.",
  size = "lg",
  className,
}: InfinityLoaderProps) {
  return (
    <div className={cn("connecty-infinity-loader text-center sm:text-left", className)} role="status" aria-live="polite">
      <InfinityMark size={size} className="mx-auto sm:mx-0" />
      {eyebrow ? (
        <p className="mt-5 font-mono text-[11px] font-semibold uppercase tracking-widest text-cyan-200">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="mt-2 text-xl font-semibold text-white">
        {label}
      </h1>
      {description ? (
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {description}
        </p>
      ) : null}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function InfinityLoadingScreen({
  label,
  description,
  eyebrow,
}: Pick<InfinityLoaderProps, "label" | "description" | "eyebrow">) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 text-slate-100">
      <InfinityLoader
        eyebrow={eyebrow}
        label={label}
        description={description}
        className="w-full max-w-md"
      />
    </main>
  );
}

export function InfinityLoadingPanel({
  label = "Carregando dados...",
  description = "Preparando informacoes do painel.",
  eyebrow = "ConnectyHub OS",
  className,
}: InfinityLoaderProps) {
  return (
    <section className={cn("grid min-h-[360px] place-items-center rounded-xl border border-white/10 bg-[#0a111d]/95 px-4 py-12", className)}>
      <InfinityLoader
        eyebrow={eyebrow}
        label={label}
        description={description}
        size="md"
        className="w-full max-w-sm"
      />
    </section>
  );
}
