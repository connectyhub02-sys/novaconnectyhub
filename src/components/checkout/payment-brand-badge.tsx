import { asaasCreditCardBrands, cardBrandNames, type CheckoutCardBrand } from "@/lib/sales-catalog/card-brand";

const tones: Record<CheckoutCardBrand, string> = {
  visa: "font-black italic text-[#1a1f71]",
  mastercard: "text-slate-900",
  elo: "font-black text-black",
  "american-express": "bg-[#1769aa] text-white",
  hipercard: "bg-[#b3131b] italic text-white",
  discover: "text-[#b74900]",
  cabal: "text-[#00649c]",
  banescard: "text-[#155aa0]",
  jcb: "text-[#136a43]",
};

export function PaymentBrandBadge({ brand }: { brand: CheckoutCardBrand | "pix" }) {
  const name = brand === "pix" ? "Pix" : cardBrandNames[brand];
  return <span role="img" aria-label={name} title={name} className={`inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded border border-slate-200 px-1.5 text-[10px] font-bold leading-none ${brand === "pix" ? "text-[#008b80]" : tones[brand]}`}>
    {brand === "pix" ? <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current"><path d="M6.9 4.6 10.6.9a2 2 0 0 1 2.8 0l3.7 3.7h-1.5a2 2 0 0 0-1.4.6L12 7.4 9.8 5.2a2 2 0 0 0-1.4-.6H6.9ZM4.6 6.9.9 10.6a2 2 0 0 0 0 2.8l3.7 3.7h3.8L12 13.5l3.6 3.6h3.8l3.7-3.7a2 2 0 0 0 0-2.8l-3.7-3.7h-3.8L12 10.5 8.4 6.9H4.6Zm2.3 12.5 3.7 3.7a2 2 0 0 0 2.8 0l3.7-3.7h-1.5a2 2 0 0 1-1.4-.6L12 16.6l-2.2 2.2a2 2 0 0 1-1.4.6H6.9Z" /></svg> : null}
    {brand === "mastercard" ? <svg aria-hidden="true" viewBox="0 0 32 20" className="h-3.5 w-6"><circle cx="10" cy="10" r="10" fill="#eb001b" /><circle cx="22" cy="10" r="10" fill="#f79e1b" /><path d="M16 2a10 10 0 0 1 0 16 10 10 0 0 1 0-16Z" fill="#ff5f00" /></svg> : null}
    <span aria-hidden="true">{brand === "american-express" ? "AMEX" : name}</span>
  </span>;
}

export function CheckoutAcceptedPayments({ pix, card }: { pix: boolean; card: boolean }) {
  if (!pix && !card) return null;
  return <div role="group" aria-label="Formas de pagamento aceitas" className="flex w-full flex-wrap items-center justify-center gap-1.5 pb-2 pt-1">
    {pix ? <PaymentBrandBadge brand="pix" /> : null}
    {card ? asaasCreditCardBrands.map(brand => <PaymentBrandBadge key={brand} brand={brand} />) : null}
  </div>;
}
