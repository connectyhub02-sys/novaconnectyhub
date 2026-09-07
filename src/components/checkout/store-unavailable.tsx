import { Store } from "lucide-react";
import { ConnectyLogo } from "@/components/brand/connecty-logo";
import { PublicTrackingContextBridge } from "@/components/tracking/public-tracking-context-bridge";

export const storeUnavailableMetadata = {
  title: "Loja temporariamente indisponível | ConnectyHub",
  description: "Esta loja está temporariamente indisponível. Tente novamente mais tarde.",
  robots: { index: false, follow: false },
};

export function StoreUnavailable() {
  return <main data-commerce-unavailable="true" className="flex min-h-svh items-center justify-center bg-slate-50 px-5 py-12 text-slate-950">
    <PublicTrackingContextBridge context={null} />
    <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white px-7 py-10 text-center shadow-sm">
      <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-slate-100"><Store className="size-8 text-slate-500" aria-hidden="true" /></div>
      <h1 className="text-2xl font-semibold tracking-tight">Loja temporariamente indisponível</h1>
      <p className="mt-4 text-sm leading-6 text-slate-600">No momento, não é possível acessar os produtos ou finalizar pedidos nesta loja. Por favor, tente novamente mais tarde.</p>
      <div className="mt-8 flex items-center justify-center gap-2 border-t border-slate-100 pt-6 text-xs text-slate-500"><ConnectyLogo type="mark" className="size-6" />ConnectyHub</div>
    </section>
  </main>;
}
