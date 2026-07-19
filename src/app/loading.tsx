export default function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-md">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-cyan-300" />
        </div>
        <p className="mt-4 font-mono text-xs font-semibold uppercase tracking-widest text-cyan-200">
          ConnectyHub OS
        </p>
        <h1 className="mt-2 text-xl font-semibold text-white">
          Carregando seu ambiente...
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Preparando dados, sessoes e integracoes do workspace.
        </p>
      </div>
    </main>
  );
}
