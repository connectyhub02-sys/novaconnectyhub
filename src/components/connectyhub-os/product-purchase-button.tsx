"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProductPurchaseButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <div><button disabled={busy} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50" onClick={async () => {
    setBusy(true); setError("");
    try {
      const result = await fetch("/api/dashboard/meus-produtos/comprar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }) });
      const data = await result.json();
      if (result.status === 428) { router.push("/dashboard/minha-conta?complete=1"); return; }
      if (!result.ok) throw new Error(data.error);
      router.push(data.checkoutUrl);
    } catch (e) { setError(e instanceof Error ? e.message : "Tente novamente."); setBusy(false); }
  }}>{busy ? "Preparando compra…" : "Continuar para pagamento"}</button><p role="status" className="mt-3 text-sm text-red-600">{error}</p></div>;
}
