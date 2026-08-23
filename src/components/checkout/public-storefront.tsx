"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Minus,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PublicStorefrontBranding = {
  displayName: string;
  logoUrl: string | null;
  logoAlt: string;
};

export type PublicStorefrontTrackingParams = {
  organizationId: string;
  leadId: string | null;
  leadPhone: string | null;
  conversationId: string | null;
  trackingLinkId: string | null;
};

export type PublicStorefrontProduct = {
  id: string;
  title: string;
  description: string;
  shortDescription: string;
  category: string;
  priceLabel: string;
  priceCents: number | null;
  compareAtLabel: string | null;
  coverUrl: string | null;
  stockLabel: string;
  fulfillmentLabel: string;
  highlightLabel: string | null;
  canCheckout: boolean;
  productUrl: string;
};

type CartLine = {
  product: PublicStorefrontProduct;
  quantity: number;
};

type PublicStorefrontProps = {
  storeSlug: string;
  branding: PublicStorefrontBranding;
  products: PublicStorefrontProduct[];
  tracking: PublicStorefrontTrackingParams;
};

const ALL_CATEGORY = "todos";

export function PublicStorefront({ storeSlug, branding, products, tracking }: PublicStorefrontProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState(tracking.leadPhone ?? "");
  const [customerEmail, setCustomerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cartLoaded, setCartLoaded] = useState(false);

  const storageKey = `connecty-store-cart:${tracking.organizationId}`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) {
        setCartLoaded(true);
        return;
      }

      try {
        const parsed = JSON.parse(stored) as Array<{ productId: string; quantity: number }>;
        const byId = new Map(products.map((product) => [product.id, product]));
        const nextCart = parsed
          .map((line) => {
            const product = byId.get(line.productId);
            const quantity = clampQuantity(line.quantity);
            return product && product.canCheckout ? { product, quantity } : null;
          })
          .filter((line): line is CartLine => Boolean(line));

        setCart(nextCart);
      } catch {
        window.localStorage.removeItem(storageKey);
      } finally {
        setCartLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [products, storageKey]);

  useEffect(() => {
    if (!cartLoaded) return;

    window.localStorage.setItem(
      storageKey,
      JSON.stringify(cart.map((line) => ({ productId: line.product.id, quantity: line.quantity }))),
    );
  }, [cart, cartLoaded, storageKey]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    }

    return [
      { id: ALL_CATEGORY, label: "Todos", count: products.length },
      ...Array.from(counts.entries())
        .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
        .map(([label, count]) => ({ id: label, label, count })),
    ];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    return products.filter((product) => {
      const matchesCategory = category === ALL_CATEGORY || product.category === category;
      const searchable = normalizeSearch(`${product.title} ${product.description} ${product.category}`);
      return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [category, products, query]);

  const featuredProduct = products.find((product) => product.canCheckout) ?? products[0] ?? null;
  const totalItems = cart.reduce((total, line) => total + line.quantity, 0);
  const totalCents = cart.reduce((total, line) => total + (line.product.priceCents ?? 0) * line.quantity, 0);
  const checkoutReady = cart.length > 0 && cart.every((line) => line.product.canCheckout && line.product.priceCents);

  function addToCart(product: PublicStorefrontProduct) {
    if (!product.canCheckout) {
      window.location.href = product.productUrl;
      return;
    }

    setCart((current) => {
      const exists = current.find((line) => line.product.id === product.id);
      if (exists) {
        return current.map((line) => (
          line.product.id === product.id ? { ...line, quantity: clampQuantity(line.quantity + 1) } : line
        ));
      }

      return [...current, { product, quantity: 1 }];
    });
    setCartOpen(true);
    setError(null);
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((current) => current.filter((line) => line.product.id !== productId));
      return;
    }

    setCart((current) => current.map((line) => (
      line.product.id === productId ? { ...line, quantity: clampQuantity(quantity) } : line
    )));
  }

  async function createCheckout() {
    if (busy || !checkoutReady) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/public/sales-catalog/stores/${encodeURIComponent(storeSlug)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerEmail,
          leadId: tracking.leadId,
          leadPhone: tracking.leadPhone,
          conversationId: tracking.conversationId,
          trackingLinkId: tracking.trackingLinkId,
          items: cart.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity,
          })),
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        checkoutUrl?: string;
        trackingUrl?: string;
        error?: string;
      };

      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.error ?? "Nao foi possivel abrir o checkout.");
      }

      window.localStorage.removeItem(storageKey);
      window.location.href = payload.trackingUrl ?? payload.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel abrir o checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f9ff] pb-24 text-slate-950">
      <StoreHeader
        branding={branding}
        totalItems={totalItems}
        query={query}
        setQuery={setQuery}
        onOpenCart={() => setCartOpen(true)}
      />

      <section className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
          <section className="overflow-hidden rounded-[8px] border border-blue-100 bg-white shadow-xl shadow-blue-950/10">
            <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 p-5 sm:p-8 lg:p-10">
                <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 text-xs font-black uppercase text-blue-700">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Loja oficial no WhatsApp
                </span>
                <h1 className="mt-5 max-w-3xl text-3xl font-black leading-tight text-slate-950 sm:text-5xl">
                  Escolha seus produtos e finalize com seguranca.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
                  A vitrine da {branding.displayName} fica conectada ao atendimento no WhatsApp. Veja produtos,
                  monte sua sacola e conclua tudo no checkout seguro.
                </p>

                <div className="mt-6 grid gap-2 sm:grid-cols-3">
                  <TrustItem icon={<ShieldCheck className="h-4 w-4" />} label="Checkout seguro" />
                  <TrustItem icon={<MessageCircle className="h-4 w-4" />} label="Atendimento WhatsApp" />
                  <TrustItem icon={<CheckCircle2 className="h-4 w-4" />} label={`${products.length} produtos`} />
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => document.getElementById("produtos")?.scrollIntoView({ behavior: "smooth" })}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-700"
                  >
                    Ver produtos
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCartOpen(true)}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] border border-[#25D366]/40 bg-[#25D366] px-5 text-sm font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-[#20bf5a]"
                  >
                    Abrir sacola
                    <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {featuredProduct ? (
                <button
                  type="button"
                  onClick={() => { window.location.href = featuredProduct.productUrl; }}
                  className="group min-w-0 border-t border-blue-100 bg-gradient-to-br from-blue-50 to-emerald-50 p-5 text-left lg:border-l lg:border-t-0"
                  data-track-event="sales_catalog_store_featured_product_clicked"
                  data-track-label={featuredProduct.title}
                >
                  <div className="rounded-[8px] border border-white bg-white/85 p-3 shadow-lg shadow-blue-950/10">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-[8px] bg-slate-100">
                      {featuredProduct.coverUrl ? (
                        <Image
                          alt={featuredProduct.title}
                          src={featuredProduct.coverUrl}
                          fill
                          unoptimized
                          sizes="(max-width: 1024px) 100vw, 360px"
                          className="object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <Package className="m-auto h-full w-14 text-blue-300" aria-hidden="true" />
                      )}
                    </div>
                    <p className="mt-4 text-xs font-black uppercase text-blue-700">{featuredProduct.category}</p>
                    <h2 className="mt-1 line-clamp-2 text-xl font-black text-slate-950">{featuredProduct.title}</h2>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{featuredProduct.shortDescription}</p>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-blue-100 pt-4">
                      <span className="text-2xl font-black text-blue-600">{featuredProduct.priceLabel}</span>
                      <span className="inline-flex min-h-10 items-center rounded-[8px] bg-[#25D366] px-4 text-sm font-black text-white">
                        Ver produto
                      </span>
                    </div>
                  </div>
                </button>
              ) : null}
            </div>
          </section>

          <section className="rounded-[8px] border border-blue-100 bg-white p-4 shadow-xl shadow-blue-950/10 lg:sticky lg:top-4 lg:self-start">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-blue-700">Sacola rapida</p>
                <h2 className="mt-1 text-lg font-black text-slate-950">{totalItems} item(ns)</h2>
              </div>
              <ShoppingBag className="h-5 w-5 text-[#25D366]" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Adicione produtos da loja e gere um checkout unico, como se o atendimento tivesse montado o pedido.
            </p>
            <div className="mt-4 rounded-[8px] border border-blue-100 bg-blue-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black uppercase text-blue-700">Total</span>
                <span className="text-xl font-black text-slate-950">{formatCurrencyCents(totalCents)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700"
            >
              Revisar sacola
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </section>
        </div>

        <section id="produtos" className="mt-5">
          <div className="flex flex-col gap-4 rounded-[8px] border border-blue-100 bg-white p-4 shadow-lg shadow-blue-950/10 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-[#128C4A]">Catalogo da loja</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Produtos cadastrados</h2>
              </div>
              <label className="relative block w-full lg:max-w-md">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar produto..."
                  className="min-h-12 w-full rounded-[8px] border border-blue-100 bg-blue-50/70 pl-11 pr-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </label>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.id)}
                  className={cn(
                    "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-black transition",
                    category === item.id
                      ? "border-[#25D366] bg-[#25D366] text-white shadow-lg shadow-emerald-950/15"
                      : "border-blue-100 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700",
                  )}
                >
                  {item.label}
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px]",
                    category === item.id ? "bg-white/20 text-white" : "bg-blue-50 text-blue-700",
                  )}>
                    {item.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {filteredProducts.length > 0 ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={addToCart}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[8px] border border-blue-100 bg-white p-8 text-center shadow-lg shadow-blue-950/10">
              <Search className="mx-auto h-8 w-8 text-blue-500" aria-hidden="true" />
              <h3 className="mt-3 text-lg font-black text-slate-950">Nenhum produto encontrado</h3>
              <p className="mt-2 text-sm text-slate-600">Tente buscar por outro nome ou limpar os filtros.</p>
            </div>
          )}
        </section>
      </section>

      <CartDrawer
        open={cartOpen}
        branding={branding}
        cart={cart}
        totalCents={totalCents}
        checkoutReady={checkoutReady}
        busy={busy}
        error={error}
        customerName={customerName}
        customerPhone={customerPhone}
        customerEmail={customerEmail}
        setCustomerName={setCustomerName}
        setCustomerPhone={setCustomerPhone}
        setCustomerEmail={setCustomerEmail}
        onClose={() => setCartOpen(false)}
        onUpdateQuantity={updateQuantity}
        onCheckout={createCheckout}
      />

      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className="fixed bottom-4 right-4 z-30 inline-flex min-h-14 min-w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl shadow-emerald-950/30 transition hover:bg-[#20bf5a] sm:hidden"
        aria-label="Abrir sacola"
      >
        <ShoppingBag className="h-5 w-5" aria-hidden="true" />
        {totalItems > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-blue-600 px-1 text-xs font-black text-white">
            {totalItems}
          </span>
        ) : null}
      </button>

      <footer className="mx-auto w-full max-w-7xl px-4 pb-8 text-center text-xs font-semibold text-slate-500 sm:px-6 lg:px-8">
        Desenvolvido por ConnectyHub
      </footer>
    </main>
  );
}

function StoreHeader({
  branding,
  totalItems,
  query,
  setQuery,
  onOpenCart,
}: {
  branding: PublicStorefrontBranding;
  totalItems: number;
  query: string;
  setQuery: (value: string) => void;
  onOpenCart: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-blue-100 bg-white/95 shadow-sm shadow-blue-950/5 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[8px] border border-blue-100 bg-white shadow-sm">
            {branding.logoUrl ? (
              <Image
                alt={branding.logoAlt}
                src={branding.logoUrl}
                fill
                unoptimized
                sizes="44px"
                className="object-contain p-1"
              />
            ) : (
              <Store className="h-5 w-5 text-blue-600" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wide text-[#128C4A]">Loja oficial</p>
            <p className="truncate text-sm font-black text-slate-950 sm:text-base">{branding.displayName}</p>
          </div>
        </div>

        <label className="relative hidden w-full max-w-md lg:block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar produtos..."
            className="min-h-11 w-full rounded-full border border-blue-100 bg-blue-50 pl-11 pr-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
          />
        </label>

        <button
          type="button"
          onClick={onOpenCart}
          className="relative inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-blue-600 px-4 text-sm font-black text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-700"
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Sacola</span>
          {totalItems > 0 ? (
            <span className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-[#25D366] px-1 text-xs font-black text-white">
              {totalItems}
            </span>
          ) : null}
        </button>
      </div>
    </header>
  );
}

function ProductCard({
  product,
  onAddToCart,
}: {
  product: PublicStorefrontProduct;
  onAddToCart: (product: PublicStorefrontProduct) => void;
}) {
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-[8px] border border-blue-100 bg-white shadow-lg shadow-blue-950/8 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-950/12">
      <a
        href={product.productUrl}
        className="relative block aspect-[4/3] overflow-hidden bg-gradient-to-br from-blue-50 to-slate-50"
        data-track-event="sales_catalog_store_product_opened"
        data-track-label={product.title}
      >
        {product.highlightLabel ? (
          <span className="absolute left-3 top-3 z-10 rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-black uppercase text-white">
            {product.highlightLabel}
          </span>
        ) : null}
        {product.coverUrl ? (
          <Image
            alt={product.title}
            src={product.coverUrl}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <Package className="m-auto h-full w-12 text-blue-300" aria-hidden="true" />
        )}
      </a>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase text-blue-700">
            {product.category}
          </span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-[#128C4A]">
            {product.stockLabel}
          </span>
        </div>

        <h3 className="mt-3 line-clamp-2 min-h-11 text-base font-black leading-5 text-slate-950">
          {product.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
          {product.shortDescription}
        </p>

        <div className="mt-auto border-t border-blue-50 pt-4">
          {product.compareAtLabel ? (
            <p className="text-xs font-semibold text-slate-400 line-through">{product.compareAtLabel}</p>
          ) : null}
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="text-xl font-black text-blue-600">{product.priceLabel}</p>
            <p className="hidden text-right text-[11px] font-semibold text-slate-500 sm:block">{product.fulfillmentLabel}</p>
          </div>
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_44px] gap-2">
            <a
              href={product.productUrl}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-blue-50 px-3 text-xs font-black text-blue-700 transition hover:bg-blue-100"
            >
              Ver produto
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <button
              type="button"
              onClick={() => onAddToCart(product)}
              className={cn(
                "inline-flex min-h-11 items-center justify-center rounded-[8px] text-white shadow-lg transition",
                product.canCheckout
                  ? "bg-blue-600 shadow-blue-950/20 hover:bg-blue-700"
                  : "bg-slate-400 shadow-slate-950/10",
              )}
              aria-label={product.canCheckout ? "Adicionar produto" : "Produto sem checkout"}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function CartDrawer({
  open,
  branding,
  cart,
  totalCents,
  checkoutReady,
  busy,
  error,
  customerName,
  customerPhone,
  customerEmail,
  setCustomerName,
  setCustomerPhone,
  setCustomerEmail,
  onClose,
  onUpdateQuantity,
  onCheckout,
}: {
  open: boolean;
  branding: PublicStorefrontBranding;
  cart: CartLine[];
  totalCents: number;
  checkoutReady: boolean;
  busy: boolean;
  error: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  setCustomerName: (value: string) => void;
  setCustomerPhone: (value: string) => void;
  setCustomerEmail: (value: string) => void;
  onClose: () => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onCheckout: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/40"
        aria-label="Fechar sacola"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl shadow-slate-950/30">
        <div className="flex items-center justify-between gap-3 border-b border-blue-100 px-4 py-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-blue-700">Sacola do pedido</p>
            <h2 className="truncate text-xl font-black text-slate-950">{branding.displayName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-blue-100 bg-white text-slate-600 transition hover:bg-blue-50"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {cart.length > 0 ? (
            <div className="grid gap-3">
              {cart.map((line) => (
                <div key={line.product.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-[8px] border border-blue-100 bg-slate-50 p-3">
                  <div className="relative h-16 w-16 overflow-hidden rounded-[8px] bg-white">
                    {line.product.coverUrl ? (
                      <Image
                        alt={line.product.title}
                        src={line.product.coverUrl}
                        fill
                        unoptimized
                        sizes="64px"
                        className="object-cover"
                      />
                    ) : (
                      <Package className="m-5 h-6 w-6 text-blue-300" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-black leading-5 text-slate-950">{line.product.title}</p>
                    <p className="mt-1 text-sm font-black text-blue-600">{line.product.priceLabel}</p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="inline-flex h-9 items-center rounded-full border border-blue-100 bg-white">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(line.product.id, line.quantity - 1)}
                          className="grid h-9 w-9 place-items-center text-slate-600 transition hover:text-blue-700"
                          aria-label="Diminuir"
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <span className="min-w-8 text-center text-sm font-black">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(line.product.id, line.quantity + 1)}
                          className="grid h-9 w-9 place-items-center text-slate-600 transition hover:text-blue-700"
                          aria-label="Aumentar"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(line.product.id, 0)}
                        className="grid h-9 w-9 place-items-center rounded-full border border-rose-100 bg-white text-rose-500 transition hover:bg-rose-50"
                        aria-label="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[8px] border border-dashed border-blue-200 bg-blue-50 p-6 text-center">
              <ShoppingBag className="mx-auto h-8 w-8 text-blue-500" aria-hidden="true" />
              <h3 className="mt-3 text-lg font-black text-slate-950">Sua sacola esta vazia</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">Adicione produtos para gerar um checkout unico.</p>
            </div>
          )}

          {cart.length > 0 ? (
            <div className="mt-4 rounded-[8px] border border-blue-100 bg-white p-4">
              <p className="text-xs font-black uppercase text-blue-700">Dados para acompanhamento</p>
              <div className="mt-3 grid gap-3">
                <input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Seu nome"
                  className={inputClassName}
                />
                <input
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="WhatsApp com DDD"
                  className={inputClassName}
                />
                <input
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  placeholder="E-mail opcional"
                  className={inputClassName}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-blue-100 bg-white px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3 rounded-[8px] border border-blue-100 bg-blue-50 px-4 py-3">
            <span className="text-sm font-black uppercase text-blue-700">Total</span>
            <span className="text-2xl font-black text-slate-950">{formatCurrencyCents(totalCents)}</span>
          </div>
          {error ? (
            <p className="mb-3 rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold leading-5 text-rose-700">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onCheckout}
            disabled={!checkoutReady || busy}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[#25D366] px-5 text-sm font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-[#20bf5a] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShoppingBag className="h-4 w-4" aria-hidden="true" />}
            {busy ? "Abrindo checkout..." : "Finalizar compra"}
          </button>
          <p className="mt-3 text-center text-xs font-semibold leading-5 text-slate-500">
            O pedido continua acompanhado pela loja no WhatsApp.
          </p>
        </div>
      </aside>
    </div>
  );
}

function TrustItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-[8px] border border-emerald-100 bg-emerald-50 px-3 text-xs font-black text-[#128C4A]">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(20, Math.max(1, Math.round(value)));
}

function formatCurrencyCents(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

const inputClassName = "min-h-11 w-full rounded-[8px] border border-blue-100 bg-blue-50/70 px-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100";
