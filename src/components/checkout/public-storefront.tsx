"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  Grid2X2,
  Headphones,
  Home,
  ListFilter,
  Loader2,
  Menu,
  MessageCircle,
  Minus,
  Package,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  UserRound,
  X,
  Zap,
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
  isFeatured: boolean;
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

type SortMode = "relevant" | "price_asc" | "price_desc" | "name";

const ALL_CATEGORY = "todos";

const sortOptions: Array<{ label: string; value: SortMode }> = [
  { label: "Mais relevantes", value: "relevant" },
  { label: "Menor preco", value: "price_asc" },
  { label: "Maior preco", value: "price_desc" },
  { label: "Nome A-Z", value: "name" },
];

export function PublicStorefront({ storeSlug, branding, products, tracking }: PublicStorefrontProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [sortMode, setSortMode] = useState<SortMode>("relevant");
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
      { id: ALL_CATEGORY, label: "Todas", count: products.length },
      ...Array.from(counts.entries())
        .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
        .map(([label, count]) => ({ id: label, label, count })),
    ];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    const filtered = products.filter((product) => {
      const matchesCategory = category === ALL_CATEGORY || product.category === category;
      const searchable = normalizeSearch(`${product.title} ${product.description} ${product.category}`);
      return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
    });

    return sortStoreProducts(filtered, sortMode);
  }, [category, products, query, sortMode]);

  const featuredProduct = products.find((product) => product.isFeatured)
    ?? products.find((product) => product.canCheckout)
    ?? products[0]
    ?? null;
  const featuredSecondary = products.find((product) => product.id !== featuredProduct?.id && product.coverUrl)
    ?? products.find((product) => product.id !== featuredProduct?.id)
    ?? null;
  const totalItems = cart.reduce((total, line) => total + line.quantity, 0);
  const totalCents = cart.reduce((total, line) => total + (line.product.priceCents ?? 0) * line.quantity, 0);
  const checkoutReady = cart.length > 0 && cart.every((line) => line.product.canCheckout && line.product.priceCents);
  const activeSortLabel = sortOptions.find((option) => option.value === sortMode)?.label ?? "Mais relevantes";

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
    <main className="min-h-screen bg-[#f4f8ff] pb-24 text-[#08142f]">
      <StoreHeader
        branding={branding}
        query={query}
        setQuery={setQuery}
        totalItems={totalItems}
        onOpenCart={() => setCartOpen(true)}
      />

      <CategoryNav categories={categories} category={category} setCategory={setCategory} />

      <section className="bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-7 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,480px)] lg:px-8 lg:py-12">
          <div className="flex min-w-0 flex-col justify-center">
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.2em] text-blue-700">
              {featuredProduct?.category ?? "Loja oficial"}
            </p>
            <h1 className="mt-3 max-w-2xl text-[34px] font-black leading-[0.98] text-slate-950 sm:text-6xl">
              Qualidade que voce sente. <span className="text-blue-600">Resultados que voce ve.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-slate-600 sm:text-lg">
              Produtos selecionados pela {branding.displayName}, compra segura e atendimento conectado ao WhatsApp.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-[8px] bg-blue-600 px-8 text-sm font-black text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-700"
                onClick={() => document.getElementById("produtos")?.scrollIntoView({ behavior: "smooth" })}
                type="button"
              >
                Ver produtos
              </button>
              <button
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] border border-blue-200 bg-white px-8 text-sm font-black text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
                onClick={() => setCartOpen(true)}
                type="button"
              >
                <MessageCircle className="h-4 w-4" />
                Fale com especialista
              </button>
            </div>

            <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <HeroTrustItem icon={<ShieldCheck className="h-4 w-4" />} label="Compra segura" />
              <HeroTrustItem icon={<Truck className="h-4 w-4" />} label="Entrega rapida" />
              <HeroTrustItem icon={<BadgeCheck className="h-4 w-4" />} label="Originais" />
              <HeroTrustItem icon={<Headphones className="h-4 w-4" />} label="Suporte" />
            </div>
          </div>

          <HeroProductShowcase featuredProduct={featuredProduct} secondaryProduct={featuredSecondary} />
        </div>
      </section>

      <section className="border-y border-blue-100 bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-3 px-4 py-5 sm:px-6 md:grid-cols-4 lg:px-8">
          <BenefitCard icon={<ShieldCheck className="h-5 w-5" />} title="Produtos originais" text="Catalogo organizado, procedencia e compra acompanhada." />
          <BenefitCard icon={<Truck className="h-5 w-5" />} title="Entrega rapida" text="Pedido vai pronto para a loja separar ou combinar entrega." />
          <BenefitCard icon={<UserRound className="h-5 w-5" />} title="Suporte especializado" text="Atendimento continua pelo WhatsApp oficial da loja." />
          <BenefitCard icon={<CheckCircle2 className="h-5 w-5" />} title="Pagamento seguro" text="Checkout unico para todos os itens da sacola." />
        </div>
      </section>

      <section id="produtos" className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8 lg:py-8">
        <aside className="hidden lg:block">
          <div className="sticky top-32 space-y-4">
            <FilterPanel
              categories={categories}
              category={category}
              setCategory={setCategory}
              sortMode={sortMode}
              setSortMode={setSortMode}
            />
            <HelpCard branding={branding} onOpenCart={() => setCartOpen(true)} />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="rounded-[8px] border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">Produtos encontrados ({filteredProducts.length})</h2>
                <p className="mt-1 text-sm text-slate-500">Escolha produtos, adicione na sacola e finalize em um checkout unico.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-blue-100 bg-white px-3 text-sm font-black text-blue-700 transition hover:bg-blue-50 lg:hidden"
                  onClick={() => document.getElementById("categorias-mobile")?.scrollIntoView({ behavior: "smooth" })}
                  type="button"
                >
                  <ListFilter className="h-4 w-4" />
                  Filtros
                </button>
                <label className="relative inline-flex min-h-11 items-center rounded-[8px] border border-blue-100 bg-white px-3 text-sm font-black text-slate-800">
                  <ArrowDownUp className="mr-2 h-4 w-4 text-blue-600" />
                  <select
                    className="w-full appearance-none bg-transparent pr-6 outline-none"
                    onChange={(event) => setSortMode(event.target.value as SortMode)}
                    value={sortMode}
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400" />
                </label>
              </div>
            </div>

            <div id="categorias-mobile" className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {categories.map((item) => (
                <CategoryPill
                  active={category === item.id}
                  count={item.count}
                  key={item.id}
                  label={item.label}
                  onClick={() => setCategory(item.id)}
                />
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StoreChip active icon={<Zap className="h-3.5 w-3.5" />} label="Todos" />
              <StoreChip icon={<BadgeCheck className="h-3.5 w-3.5" />} label="Mais vendidos" />
              <StoreChip icon={<Package className="h-3.5 w-3.5" />} label="Lancamentos" />
              <StoreChip icon={<ShoppingBag className="h-3.5 w-3.5" />} label={activeSortLabel} />
            </div>
          </div>

          {filteredProducts.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} onAddToCart={addToCart} />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[8px] border border-blue-100 bg-white p-8 text-center shadow-sm shadow-blue-950/5">
              <Search className="mx-auto h-8 w-8 text-blue-500" />
              <h3 className="mt-3 text-lg font-black text-slate-950">Nenhum produto encontrado</h3>
              <p className="mt-2 text-sm text-slate-600">Tente buscar por outro nome ou limpar os filtros.</p>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 rounded-[8px] border border-blue-200 bg-white p-5 shadow-sm shadow-blue-950/5 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[8px] bg-blue-50 text-blue-600">
              <Truck className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-xl font-black text-slate-950">Compra facil com checkout unico</h2>
              <p className="mt-1 text-sm text-slate-600">Adicione varios produtos e pague tudo em um unico pedido.</p>
            </div>
          </div>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-[8px] border border-blue-600 px-8 text-sm font-black text-blue-700 transition hover:bg-blue-50"
            onClick={() => setCartOpen(true)}
            type="button"
          >
            Ver sacola
          </button>
        </div>
      </section>

      <StoreFooter branding={branding} />

      <MobileBottomNav
        totalItems={totalItems}
        onCart={() => setCartOpen(true)}
        onCategories={() => document.getElementById("categorias-mobile")?.scrollIntoView({ behavior: "smooth" })}
        onHome={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        onSearch={() => {
          const input = document.getElementById("storefront-search-mobile") ?? document.getElementById("storefront-search");
          if (input instanceof HTMLInputElement) input.focus();
        }}
      />

      <button
        aria-label="Abrir atendimento"
        className="fixed bottom-20 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-2xl shadow-emerald-950/25 transition hover:bg-[#20bf5a] lg:bottom-6"
        onClick={() => setCartOpen(true)}
        type="button"
      >
        <MessageCircle className="h-7 w-7" />
      </button>

      <CartDrawer
        branding={branding}
        busy={busy}
        cart={cart}
        checkoutReady={checkoutReady}
        customerEmail={customerEmail}
        customerName={customerName}
        customerPhone={customerPhone}
        error={error}
        open={cartOpen}
        setCustomerEmail={setCustomerEmail}
        setCustomerName={setCustomerName}
        setCustomerPhone={setCustomerPhone}
        totalCents={totalCents}
        onCheckout={createCheckout}
        onClose={() => setCartOpen(false)}
        onUpdateQuantity={updateQuantity}
      />
    </main>
  );
}

function StoreHeader({
  branding,
  query,
  setQuery,
  totalItems,
  onOpenCart,
}: {
  branding: PublicStorefrontBranding;
  query: string;
  setQuery: (value: string) => void;
  totalItems: number;
  onOpenCart: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-blue-100 bg-white/95 shadow-sm shadow-blue-950/5 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          aria-label="Abrir menu"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 lg:hidden"
          type="button"
        >
          <Menu className="h-6 w-6" />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[8px] border border-blue-100 bg-white shadow-sm">
            {branding.logoUrl ? (
              <Image alt={branding.logoAlt} className="object-contain p-1" fill sizes="44px" src={branding.logoUrl} unoptimized />
            ) : (
              <Store className="h-5 w-5 text-blue-600" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-black text-slate-950">{branding.displayName}</p>
            <p className="text-[11px] font-semibold text-slate-500">by ConnectyHub</p>
          </div>
        </div>

        <label className="relative hidden w-full max-w-xl lg:block">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700" />
          <input
            className="min-h-12 w-full rounded-[8px] border border-blue-100 bg-white pl-12 pr-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            id="storefront-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar produtos..."
            value={query}
          />
        </label>

        <button
          className="hidden min-h-10 items-center gap-2 rounded-[8px] px-3 text-sm font-bold text-slate-700 transition hover:bg-blue-50 lg:inline-flex"
          type="button"
        >
          <Package className="h-4 w-4" />
          Meus pedidos
        </button>

        <button
          aria-label="Abrir sacola"
          className="relative inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-blue-600 px-4 text-sm font-black text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-700"
          onClick={onOpenCart}
          type="button"
        >
          <ShoppingBag className="h-4 w-4" />
          <span className="hidden sm:inline">Sacola</span>
          {totalItems > 0 ? (
            <span className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-blue-700 px-1 text-xs font-black text-white ring-2 ring-white">
              {totalItems}
            </span>
          ) : null}
        </button>
      </div>

      <div className="border-t border-blue-50 px-4 py-3 lg:hidden">
        <label className="relative mx-auto block w-full max-w-7xl">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-700" />
          <input
            className="min-h-12 w-full rounded-full border border-blue-100 bg-white pl-12 pr-4 text-[15px] font-semibold text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            id="storefront-search-mobile"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar produtos..."
            value={query}
          />
        </label>
      </div>
    </header>
  );
}

function CategoryNav({
  categories,
  category,
  setCategory,
}: {
  categories: Array<{ id: string; label: string; count: number }>;
  category: string;
  setCategory: (value: string) => void;
}) {
  return (
    <nav className="hidden border-b border-blue-100 bg-white lg:block">
      <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center gap-7 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {categories.map((item, index) => (
          <button
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-[8px] px-3 text-sm font-bold transition",
              category === item.id ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-blue-50 hover:text-blue-700",
            )}
            key={item.id}
            onClick={() => setCategory(item.id)}
            type="button"
          >
            {index === 0 ? "Todas as categorias" : item.label}
            {index === 0 ? <ChevronDown className="h-4 w-4" /> : null}
          </button>
        ))}
      </div>
    </nav>
  );
}

function HeroProductShowcase({
  featuredProduct,
  secondaryProduct,
}: {
  featuredProduct: PublicStorefrontProduct | null;
  secondaryProduct: PublicStorefrontProduct | null;
}) {
  if (!featuredProduct) {
    return (
      <div className="grid min-h-[280px] place-items-center rounded-[8px] bg-blue-50 text-blue-400">
        <Package className="h-16 w-16" />
      </div>
    );
  }

  return (
    <a
      className="relative isolate flex min-h-[300px] items-center justify-center overflow-hidden rounded-[8px] bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4"
      data-track-event="sales_catalog_store_featured_product_clicked"
      data-track-label={featuredProduct.title}
      href={featuredProduct.productUrl}
    >
      <div className="absolute inset-x-6 bottom-8 h-16 rounded-full border border-blue-200 bg-blue-100/60 blur-xl" />
      <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.16),transparent_55%)]" />
      <div className="relative grid w-full max-w-[440px] grid-cols-2 items-end gap-3">
        <ProductHeroImage product={featuredProduct} large />
        {secondaryProduct ? <ProductHeroImage product={secondaryProduct} /> : null}
      </div>
    </a>
  );
}

function ProductHeroImage({ large = false, product }: { large?: boolean; product: PublicStorefrontProduct }) {
  return (
    <div className={cn("relative overflow-hidden rounded-[8px] bg-white/20", large ? "aspect-[3/4]" : "aspect-[4/5]")}>
      {product.coverUrl ? (
        <Image
          alt={product.title}
          className="object-contain p-2 drop-shadow-[0_24px_22px_rgba(15,23,42,0.2)]"
          fill
          sizes={large ? "(max-width: 1024px) 45vw, 220px" : "(max-width: 1024px) 35vw, 180px"}
          src={product.coverUrl}
          unoptimized
        />
      ) : (
        <Package className="m-auto h-full w-14 text-blue-300" />
      )}
    </div>
  );
}

function FilterPanel({
  categories,
  category,
  setCategory,
  sortMode,
  setSortMode,
}: {
  categories: Array<{ id: string; label: string; count: number }>;
  category: string;
  setCategory: (value: string) => void;
  sortMode: SortMode;
  setSortMode: (value: SortMode) => void;
}) {
  return (
    <div className="rounded-[8px] border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-slate-950">Filtros</h2>
        <button className="text-xs font-black text-blue-600" onClick={() => setCategory(ALL_CATEGORY)} type="button">
          Limpar
        </button>
      </div>

      <div className="mt-5">
        <p className="text-sm font-black text-slate-950">Categorias</p>
        <div className="mt-3 space-y-2">
          {categories.map((item) => (
            <button
              className="flex w-full items-center justify-between gap-3 rounded-[8px] px-2 py-1.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-blue-50"
              key={item.id}
              onClick={() => setCategory(item.id)}
              type="button"
            >
              <span className="inline-flex items-center gap-2">
                <span className={cn("grid h-4 w-4 place-items-center rounded-full border", category === item.id ? "border-blue-600" : "border-slate-300")}>
                  {category === item.id ? <span className="h-2 w-2 rounded-full bg-blue-600" /> : null}
                </span>
                {item.label}
              </span>
              <span className="text-xs text-slate-400">{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm font-black text-slate-950">Ordenar por</p>
        <label className="relative mt-3 block">
          <select
            className="min-h-11 w-full appearance-none rounded-[8px] border border-blue-100 bg-white px-3 pr-8 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            value={sortMode}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </label>
      </div>
    </div>
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
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-[8px] border border-blue-100 bg-white shadow-sm shadow-blue-950/5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-950/10">
      <a className="relative block aspect-square overflow-hidden bg-white" data-track-event="sales_catalog_store_product_opened" data-track-label={product.title} href={product.productUrl}>
        {product.highlightLabel ? (
          <span className="absolute left-2 top-2 z-10 rounded-full bg-blue-600 px-2 py-1 text-[9px] font-black uppercase text-white">
            {product.highlightLabel}
          </span>
        ) : null}
        {product.coverUrl ? (
          <Image
            alt={product.title}
            className="object-contain p-3 transition duration-500 group-hover:scale-105"
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 220px"
            src={product.coverUrl}
            unoptimized
          />
        ) : (
          <Package className="m-auto h-full w-12 text-blue-300" />
        )}
      </a>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <h3 className="line-clamp-2 min-h-10 text-[13px] font-black leading-5 text-slate-950 sm:text-sm">
          {product.title}
        </h3>
        <p className="mt-2 line-clamp-2 min-h-10 text-[12px] leading-5 text-slate-500">
          {product.shortDescription}
        </p>
        <div className="mt-auto pt-3">
          {product.compareAtLabel ? <p className="text-xs font-semibold text-slate-400 line-through">{product.compareAtLabel}</p> : null}
          <p className="text-[17px] font-black text-blue-600 sm:text-xl">{product.priceLabel}</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] font-black text-[#128C4A]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {product.stockLabel}
          </p>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_40px] gap-2">
            <a
              className="inline-flex min-h-10 items-center justify-center rounded-[8px] border border-blue-100 bg-white px-2 text-[11px] font-black text-blue-700 transition hover:bg-blue-50"
              href={product.productUrl}
            >
              Ver produto
            </a>
            <button
              aria-label={product.canCheckout ? "Adicionar a sacola" : "Abrir produto"}
              className={cn(
                "inline-flex min-h-10 items-center justify-center rounded-[8px] text-white shadow-lg transition",
                product.canCheckout ? "bg-blue-600 shadow-blue-950/15 hover:bg-blue-700" : "bg-slate-400 shadow-slate-950/10",
              )}
              onClick={() => onAddToCart(product)}
              type="button"
            >
              <ShoppingBag className="h-4 w-4" />
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
      <button aria-label="Fechar sacola" className="absolute inset-0 bg-slate-950/40" onClick={onClose} type="button" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl shadow-slate-950/30">
        <div className="flex items-center justify-between gap-3 border-b border-blue-100 px-4 py-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-blue-700">Sacola</p>
            <h2 className="truncate text-xl font-black text-slate-950">{branding.displayName}</h2>
          </div>
          <button aria-label="Fechar" className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-blue-100 bg-white text-slate-600 transition hover:bg-blue-50" onClick={onClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {cart.length > 0 ? (
            <div className="grid gap-3">
              {cart.map((line) => (
                <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-[8px] border border-blue-100 bg-slate-50 p-3" key={line.product.id}>
                  <div className="relative h-16 w-16 overflow-hidden rounded-[8px] bg-white">
                    {line.product.coverUrl ? (
                      <Image alt={line.product.title} className="object-contain p-1" fill sizes="64px" src={line.product.coverUrl} unoptimized />
                    ) : (
                      <Package className="m-5 h-6 w-6 text-blue-300" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-black leading-5 text-slate-950">{line.product.title}</p>
                    <p className="mt-1 text-sm font-black text-blue-600">{line.product.priceLabel}</p>
                    <div className="mt-3 inline-flex h-9 items-center rounded-full border border-blue-100 bg-white">
                      <button aria-label="Diminuir" className="grid h-9 w-9 place-items-center text-slate-600 transition hover:text-blue-700" onClick={() => onUpdateQuantity(line.product.id, line.quantity - 1)} type="button">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-8 text-center text-sm font-black">{line.quantity}</span>
                      <button aria-label="Aumentar" className="grid h-9 w-9 place-items-center text-slate-600 transition hover:text-blue-700" onClick={() => onUpdateQuantity(line.product.id, line.quantity + 1)} type="button">
                        <ArrowRight className="h-3.5 w-3.5 -rotate-45" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[8px] border border-dashed border-blue-200 bg-blue-50 p-6 text-center">
              <ShoppingBag className="mx-auto h-8 w-8 text-blue-500" />
              <h3 className="mt-3 text-lg font-black text-slate-950">Sua sacola esta vazia</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">Adicione produtos para gerar um checkout unico.</p>
            </div>
          )}

          {cart.length > 0 ? (
            <div className="mt-4 rounded-[8px] border border-blue-100 bg-white p-4">
              <p className="text-xs font-black uppercase text-blue-700">Dados para acompanhamento</p>
              <div className="mt-3 grid gap-3">
                <input className={inputClassName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Seu nome" value={customerName} />
                <input className={inputClassName} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="WhatsApp com DDD" value={customerPhone} />
                <input className={inputClassName} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="E-mail opcional" value={customerEmail} />
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
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[#25D366] px-5 text-sm font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-[#20bf5a] disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!checkoutReady || busy}
            onClick={onCheckout}
            type="button"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />}
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

function BenefitCard({ icon, text, title }: { icon: ReactNode; text: string; title: string }) {
  return (
    <div className="rounded-[8px] border border-blue-100 bg-white p-5 shadow-sm shadow-blue-950/5">
      <div className="mb-3 text-blue-600">{icon}</div>
      <h3 className="text-sm font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}

function HelpCard({ branding, onOpenCart }: { branding: PublicStorefrontBranding; onOpenCart: () => void }) {
  return (
    <div className="rounded-[8px] border border-emerald-100 bg-gradient-to-br from-white to-emerald-50 p-4 shadow-sm shadow-blue-950/5">
      <h3 className="text-base font-black text-slate-950">Precisa de ajuda?</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">Fale com a {branding.displayName} e finalize sua compra com orientacao.</p>
      <button
        className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-[#25D366] bg-white px-3 text-sm font-black text-[#128C4A] transition hover:bg-[#effff4]"
        onClick={onOpenCart}
        type="button"
      >
        <MessageCircle className="h-4 w-4" />
        Falar no WhatsApp
      </button>
    </div>
  );
}

function StoreFooter({ branding }: { branding: PublicStorefrontBranding }) {
  return (
    <footer className="border-t border-blue-100 bg-white">
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-4 lg:px-8">
        <div>
          <h2 className="text-base font-black text-slate-950">Fique por dentro</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Receba novidades, ofertas e conteudos especiais.</p>
        </div>
        <FooterColumn title="Institucional" items={["Sobre nos", "Como comprar", "Politica de privacidade"]} />
        <FooterColumn title="Minha conta" items={["Meus pedidos", "Dados cadastrais", "Formas de pagamento"]} />
        <div>
          <h3 className="text-sm font-black text-slate-950">Pagamento</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {["VISA", "PIX", "CARD"].map((item) => (
              <span className="rounded-[8px] border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700" key={item}>{item}</span>
            ))}
          </div>
        </div>
      </div>
      <p className="border-t border-blue-100 px-4 py-4 text-center text-xs font-semibold text-slate-500">
        {branding.displayName} by ConnectyHub - Desenvolvido por ConnectyHub
      </p>
    </footer>
  );
}

function FooterColumn({ items, title }: { items: string[]; title: string }) {
  return (
    <div>
      <h3 className="text-sm font-black text-slate-950">{title}</h3>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <span className="text-sm font-semibold text-slate-500" key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function MobileBottomNav({
  totalItems,
  onCart,
  onCategories,
  onHome,
  onSearch,
}: {
  totalItems: number;
  onCart: () => void;
  onCategories: () => void;
  onHome: () => void;
  onSearch: () => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-blue-100 bg-white px-2 py-2 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] lg:hidden">
      <MobileNavButton active icon={<Home className="h-5 w-5" />} label="Inicio" onClick={onHome} />
      <MobileNavButton icon={<Grid2X2 className="h-5 w-5" />} label="Categorias" onClick={onCategories} />
      <MobileNavButton icon={<Search className="h-5 w-5" />} label="Buscar" onClick={onSearch} />
      <MobileNavButton badge={totalItems} icon={<ShoppingBag className="h-5 w-5" />} label="Sacola" onClick={onCart} />
    </nav>
  );
}

function MobileNavButton({
  active = false,
  badge,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  badge?: number;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn("relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-[8px] text-[11px] font-bold", active ? "text-blue-600" : "text-slate-500")}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
      {badge ? (
        <span className="absolute right-4 top-0 grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1 text-[10px] font-black text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function HeroTrustItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-[8px] border border-blue-100 bg-white px-3 text-[12px] font-black text-slate-700 shadow-sm shadow-blue-950/5">
      <span className="text-blue-600">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function CategoryPill({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-black transition",
        active ? "border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-950/15" : "border-blue-100 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
      <span className={cn("rounded-full px-2 py-0.5 text-[10px]", active ? "bg-white/20 text-white" : "bg-blue-50 text-blue-700")}>{count}</span>
    </button>
  );
}

function StoreChip({ active = false, icon, label }: { active?: boolean; icon: ReactNode; label: string }) {
  return (
    <span className={cn("inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-[11px] font-black", active ? "border-blue-600 bg-blue-600 text-white" : "border-blue-100 bg-white text-slate-700")}>
      {icon}
      {label}
    </span>
  );
}

function sortStoreProducts(products: PublicStorefrontProduct[], sortMode: SortMode) {
  const copy = [...products];

  if (sortMode === "price_asc") {
    return copy.sort((a, b) => (a.priceCents ?? Number.MAX_SAFE_INTEGER) - (b.priceCents ?? Number.MAX_SAFE_INTEGER));
  }

  if (sortMode === "price_desc") {
    return copy.sort((a, b) => (b.priceCents ?? 0) - (a.priceCents ?? 0));
  }

  if (sortMode === "name") {
    return copy.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  }

  return copy;
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
