export default function LoadingInvoicePage() {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="h-3 w-44 animate-pulse rounded bg-cyan-300/20" />
          <div className="mt-3 h-9 w-64 animate-pulse rounded bg-white/10" />
          <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-white/10" />
        </div>
        <div className="h-11 w-32 animate-pulse rounded-xl bg-white/10" />
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0c1422]/88 p-5 shadow-[0_22px_80px_rgba(0,0,0,0.24)]">
        <div className="flex flex-col gap-5 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
            <div className="mt-3 h-6 w-52 animate-pulse rounded bg-white/10" />
            <div className="mt-2 h-4 w-60 animate-pulse rounded bg-white/10" />
          </div>
          <div className="space-y-3 sm:text-right">
            <div className="h-8 w-24 animate-pulse rounded-full bg-cyan-300/15" />
            <div className="h-7 w-32 animate-pulse rounded bg-white/10" />
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="h-24 animate-pulse rounded-2xl bg-white/[0.045]" />
          <div className="h-24 animate-pulse rounded-2xl bg-white/[0.045]" />
          <div className="h-24 animate-pulse rounded-2xl bg-white/[0.045]" />
        </div>
        <div className="mt-6 h-52 animate-pulse rounded-2xl bg-white/[0.045]" />
      </div>
    </section>
  );
}
