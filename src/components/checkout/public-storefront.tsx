"use client";

import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  Gift,
  Headphones,
  Heart,
  Home,
  Loader2,
  MessageCircle,
  Minus,
  Package,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Tag,
  Truck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PublicStorefrontBranding = {
  displayName: string;
  logoUrl: string | null;
  logoAlt: string;
};

export type PublicStorefrontSettings = {
  heroTitle: string | null;
  heroHighlight: string | null;
  heroSubtitle: string | null;
  headerText: string | null;
  footerText: string | null;
  footerContactText: string | null;
  primaryColor: string | null;
  textColor: string | null;
  buttonColor: string | null;
  buttonTextColor: string | null;
  cardTextColor: string | null;
  offerTextColor: string | null;
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
  storefront: PublicStorefrontSettings;
  products: PublicStorefrontProduct[];
  tracking: PublicStorefrontTrackingParams;
};

type StoreCategory = {
  id: string;
  label: string;
  count: number;
};

const ALL_CATEGORY = "todos";
const defaultStorefrontPrimaryColor = "#063f2c";
const storefrontActionColor = "#f97316";
const connectHubPublicUrl = process.env.NEXT_PUBLIC_CONNECTYHUB_SITE_URL ?? "https://connectyhub.com.br";
const genericStoreCategoryDisplayLabel = "Outros produtos";
const genericStoreCategoryLabels = new Set(["produto", "produtos"]);

export function PublicStorefront({ storeSlug, branding, storefront, products, tracking }: PublicStorefrontProps) {
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

  const categories = useMemo<StoreCategory[]>(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      if (isGenericStoreCategory(product.category)) continue;

      counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    }

    return [
      { id: ALL_CATEGORY, label: "Todas", count: products.length },
      ...Array.from(counts.entries())
        .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
        .map(([label, count]) => ({ id: label, label, count })),
    ];
  }, [products]);

  const visibleProducts = useMemo(() => (
    category === ALL_CATEGORY ? products : products.filter((product) => product.category === category)
  ), [category, products]);

  const featuredProducts = useMemo(() => {
    const categoryFeaturedProducts = visibleProducts.filter((product) => product.isFeatured);
    if (categoryFeaturedProducts.length > 0) return categoryFeaturedProducts;

    const categoryFallbackProduct = visibleProducts.find((product) => product.canCheckout)
      ?? visibleProducts[0]
      ?? null;
    if (categoryFallbackProduct) return [categoryFallbackProduct];

    const storeFeaturedProducts = products.filter((product) => product.isFeatured);
    if (storeFeaturedProducts.length > 0) return storeFeaturedProducts;

    const storeFallbackProduct = products.find((product) => product.canCheckout)
      ?? products[0]
      ?? null;

    return storeFallbackProduct ? [storeFallbackProduct] : [];
  }, [products, visibleProducts]);
  const [featuredIndex, setFeaturedIndex] = useState(0);

  useEffect(() => {
    if (featuredProducts.length <= 1) return;

    const timer = window.setInterval(() => {
      setFeaturedIndex((current) => (current + 1) % featuredProducts.length);
    }, 4200);

    return () => window.clearInterval(timer);
  }, [featuredProducts.length]);

  const activeFeaturedIndex = featuredProducts.length > 0 ? featuredIndex % featuredProducts.length : 0;
  const featuredProduct = featuredProducts[activeFeaturedIndex] ?? null;
  const promotionProduct = visibleProducts.find((product) => product.compareAtLabel)
    ?? visibleProducts.find((product) => product.highlightLabel)
    ?? featuredProduct;
  const bestSellerProducts = visibleProducts.slice(0, 4);
  const newArrivalProducts = category === ALL_CATEGORY ? visibleProducts.slice(4, 8) : visibleProducts.slice(4);
  const offerProducts = useMemo(() => (
    visibleProducts.filter((product) => product.compareAtLabel || product.highlightLabel).slice(0, 4)
  ), [visibleProducts]);
  const categoryProductSections = useMemo(() => {
    if (category !== ALL_CATEGORY) return [];

    const groups = new Map<string, PublicStorefrontProduct[]>();
    for (const product of products) {
      const label = getStoreCategoryDisplayLabel(product.category);
      const current = groups.get(label) ?? [];
      current.push(product);
      groups.set(label, current);
    }

    return Array.from(groups.entries())
      .sort(([labelA], [labelB]) => {
        if (labelA === genericStoreCategoryDisplayLabel) return 1;
        if (labelB === genericStoreCategoryDisplayLabel) return -1;
        return labelA.localeCompare(labelB, "pt-BR");
      })
      .map(([label, items]) => ({ label, products: items }));
  }, [category, products]);
  const totalItems = cart.reduce((total, line) => total + line.quantity, 0);
  const totalCents = cart.reduce((total, line) => total + (line.product.priceCents ?? 0) * line.quantity, 0);
  const checkoutReady = cart.length > 0
    && cart.every((line) => line.product.canCheckout && typeof line.product.priceCents === "number");
  const primaryColor = normalizeStorefrontPrimaryColor(storefront.primaryColor) ?? defaultStorefrontPrimaryColor;
  const textColor = normalizeStorefrontTextColor(storefront.textColor) ?? "#111111";
  const accentColor = getReadableAccentColor(primaryColor, textColor);
  const buttonColor = normalizeStorefrontTextColor(storefront.buttonColor) ?? primaryColor;
  const buttonTextColor = normalizeStorefrontTextColor(storefront.buttonTextColor) ?? getReadableTextColor(buttonColor);
  const cardTextColor = normalizeStorefrontTextColor(storefront.cardTextColor) ?? textColor;
  const offerTextColor = normalizeStorefrontTextColor(storefront.offerTextColor) ?? getReadableTextColor(primaryColor);
  const publicLayoutStyle = {
    "--store-primary": primaryColor,
    "--store-action": storefrontActionColor,
    "--store-accent": accentColor,
    "--store-text": textColor,
    "--store-text-muted": `color-mix(in srgb, ${textColor} 72%, white 28%)`,
    "--store-button": buttonColor,
    "--store-button-text": buttonTextColor,
    "--store-button-border": getReadableBorderColor(buttonColor),
    "--store-card-text": cardTextColor,
    "--store-card-text-muted": `color-mix(in srgb, ${cardTextColor} 72%, white 28%)`,
    "--store-offer-text": offerTextColor,
    "--store-offer-text-muted": `color-mix(in srgb, ${offerTextColor} 76%, transparent 24%)`,
    "--store-primary-border": getReadableBorderColor(primaryColor),
  } as CSSProperties;
  const customHeroTitle = storefront.heroTitle?.trim() || storefront.headerText?.trim() || "";
  const heroTitle = customHeroTitle || "Produtos favoritos,";
  const heroHighlight = customHeroTitle ? (storefront.heroHighlight?.trim() || "") : (storefront.heroHighlight || `da ${branding.displayName} ate voce.`);
  const legacyHeaderText = `${heroTitle} ${heroHighlight}`.trim();
  const heroSubtitle = storefront.heroSubtitle
    || `Produtos selecionados pela ${branding.displayName}, atendimento pelo WhatsApp e checkout seguro pela ConnectyHub.`;
  const headerText = storefront.heroSubtitle || storefront.headerText || legacyHeaderText || heroSubtitle;
  const footerText = storefront.footerText
    || `${branding.displayName} atende pelo WhatsApp com catalogo, checkout seguro e acompanhamento do pedido em um so lugar.`;
  const footerContactText = storefront.footerContactText || "Atendimento pelo WhatsApp oficial da loja.";

  function scrollToProducts() {
    document.getElementById("produtos")?.scrollIntoView({ behavior: "smooth" });
  }

  function selectCategory(nextCategory: string) {
    setCategory(nextCategory);
    window.setTimeout(scrollToProducts, 0);
  }

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
    <main className="min-h-screen bg-[#fbfaf6] pb-20 text-[color:var(--store-text)] lg:pb-0" style={publicLayoutStyle}>
      <StorefrontHero
        activeFeaturedIndex={activeFeaturedIndex}
        branding={branding}
        featuredCount={featuredProducts.length}
        featuredProduct={featuredProduct}
        headerText={headerText}
        heroHighlight={heroHighlight}
        heroSubtitle={heroSubtitle}
        heroTitle={heroTitle}
        totalItems={totalItems}
        onCart={() => setCartOpen(true)}
        onFeaturedAction={() => (featuredProduct ? addToCart(featuredProduct) : scrollToProducts())}
      />

      <BenefitStrip />

      <CategoryShowcase categories={categories} category={category} onSelect={selectCategory} />

      <section id="produtos" className="mx-auto w-full max-w-6xl px-5 py-4 sm:px-8 sm:py-7 lg:py-9">
        {bestSellerProducts.length > 0 ? (
          <ProductShowcaseSection
            products={bestSellerProducts}
            title={category === ALL_CATEGORY ? "Mais vendidos" : "Produtos em destaque"}
            onAddToCart={addToCart}
          />
        ) : (
          <EmptyCatalog branding={branding} />
        )}

        {newArrivalProducts.length > 0 ? (
          <ProductShowcaseSection
            className="mt-12"
            products={newArrivalProducts}
            title={category === ALL_CATEGORY ? "Novidades" : "Mais produtos"}
            onAddToCart={addToCart}
          />
        ) : null}

        {offerProducts.length > 0 ? (
          <ProductShowcaseSection
            className="mt-12"
            products={offerProducts}
            title={category === ALL_CATEGORY ? "Ofertas da loja" : "Ofertas da categoria"}
            onAddToCart={addToCart}
          />
        ) : null}

        {categoryProductSections.length > 0 ? (
          <div className="mt-12 grid gap-12">
            {categoryProductSections.map((section) => (
              <ProductShowcaseSection
                key={section.label}
                products={section.products}
                title={section.label}
                onAddToCart={addToCart}
              />
            ))}
          </div>
        ) : null}
      </section>

      <PromoBanner branding={branding} product={promotionProduct} onShopNow={scrollToProducts} />

      <CustomerLove branding={branding} />

      <TrustStrip />

      <StoreFooter branding={branding} footerContactText={footerContactText} footerText={footerText} />

      <MobileBottomNav
        totalItems={totalItems}
        onCart={() => setCartOpen(true)}
        onCategories={() => document.getElementById("categorias")?.scrollIntoView({ behavior: "smooth" })}
        onHome={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      />

      {totalItems > 0 ? (
        <button
          aria-label="Abrir carrinho"
          className="fixed bottom-6 right-6 z-30 hidden h-14 min-w-14 items-center justify-center gap-2 rounded-full border px-5 text-sm font-black shadow-2xl shadow-slate-950/25 transition brightness-100 hover:brightness-110 lg:inline-flex"
          onClick={() => setCartOpen(true)}
          style={{
            backgroundColor: "var(--store-button)",
            borderColor: "var(--store-button-border)",
            color: "var(--store-button-text)",
          }}
          type="button"
        >
          <ShoppingCart className="h-5 w-5" />
          {totalItems}
        </button>
      ) : null}

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

function StorefrontHero({
  activeFeaturedIndex,
  branding,
  featuredCount,
  featuredProduct,
  headerText,
  heroHighlight,
  heroSubtitle,
  heroTitle,
  totalItems,
  onCart,
  onFeaturedAction,
}: {
  activeFeaturedIndex: number;
  branding: PublicStorefrontBranding;
  featuredCount: number;
  featuredProduct: PublicStorefrontProduct | null;
  headerText: string;
  heroHighlight: string;
  heroSubtitle: string;
  heroTitle: string;
  totalItems: number;
  onCart: () => void;
  onFeaturedAction: () => void;
}) {
  const featuredActionLabel = featuredProduct?.canCheckout ? "Adicionar ao carrinho" : featuredProduct ? "Ver produto" : "Ver vitrine";
  const featuredActionMobileLabel = featuredProduct?.canCheckout ? "Adicionar" : featuredActionLabel;

  return (
    <section className="bg-white">
      <div className="mx-auto w-full max-w-6xl px-5 pb-5 pt-6 sm:px-8 lg:pb-10 lg:pt-10">
        <div className="mb-4 flex items-center justify-between gap-4 sm:mb-8">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo branding={branding} />
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-[color:var(--store-accent)]">{branding.displayName}</p>
              <p className="line-clamp-1 text-xs font-semibold text-[color:var(--store-text-muted)]">{headerText}</p>
            </div>
          </div>

          <button
            aria-label={totalItems > 0 ? `Abrir carrinho com ${totalItems} itens` : "Abrir carrinho"}
            className="relative hidden h-11 w-11 shrink-0 place-items-center rounded-[8px] border text-sm font-black shadow-lg shadow-[#063f2c]/20 transition brightness-100 hover:brightness-110 sm:inline-grid"
            onClick={onCart}
            style={{
              backgroundColor: "var(--store-button)",
              borderColor: "var(--store-button-border)",
              color: "var(--store-button-text)",
            }}
            type="button"
          >
            <ShoppingCart className="h-4 w-4" />
            {totalItems > 0 ? (
              <span className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-[#f97316] px-1 text-xs font-black text-white ring-2 ring-white">
                {totalItems}
              </span>
            ) : null}
          </button>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_142px] items-start gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(220px,0.7fr)] sm:gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,1fr)] lg:items-center">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-xs font-black text-[color:var(--store-accent)] sm:gap-2 sm:text-sm">
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Loja oficial. Compra facil.
            </p>
            <h1 className="mt-3 max-w-2xl font-serif text-[34px] font-black leading-[0.98] text-[color:var(--store-text)] sm:mt-4 sm:text-[58px] lg:text-[68px]">
              {heroTitle}
              {heroHighlight ? <span className="block">{heroHighlight}</span> : null}
            </h1>
            <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-[color:var(--store-text-muted)] sm:mt-6 sm:text-lg sm:leading-7">
              {heroSubtitle}
            </p>
            <div className="mt-4 sm:mt-7">
              <button
                className="inline-flex min-h-10 w-full max-w-[260px] items-center justify-center gap-2 rounded-[8px] border px-3 text-[11px] font-black uppercase shadow-xl shadow-[#063f2c]/20 transition brightness-100 hover:brightness-110 sm:min-h-12 sm:w-auto sm:min-w-[290px] sm:max-w-none sm:gap-3 sm:px-8 sm:text-sm [&_span]:whitespace-nowrap"
                onClick={onFeaturedAction}
                style={{
                  backgroundColor: "var(--store-button)",
                  borderColor: "var(--store-button-border)",
                  color: "var(--store-button-text)",
                }}
                type="button"
              >
                <span className="sm:hidden">{featuredActionMobileLabel}</span>
                <span className="hidden sm:inline">{featuredActionLabel}</span>
                {featuredProduct?.canCheckout ? (
                  <ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                )}
              </button>
            </div>
          </div>

          <HeroProductPanel activeIndex={activeFeaturedIndex} product={featuredProduct} total={featuredCount} />
        </div>
      </div>
    </section>
  );
}

function HeroProductPanel({
  activeIndex,
  product,
  total,
}: {
  activeIndex: number;
  product: PublicStorefrontProduct | null;
  total: number;
}) {
  return (
    <div className="relative min-h-[172px] overflow-hidden rounded-[8px] bg-transparent p-0 sm:min-h-[300px] lg:min-h-[360px]">
      <div className="relative flex h-full min-h-[172px] items-center justify-center sm:min-h-[270px] lg:min-h-[250px]">
        {product ? (
          <a
            key={product.id}
            className="relative block aspect-[4/3] w-full max-w-[430px]"
            data-track-event="sales_catalog_store_featured_product_clicked"
            data-track-label={product.title}
            href={product.productUrl}
          >
            <ProductImage product={product} priority sizes="(max-width: 640px) 142px, (max-width: 1024px) 38vw, 430px" variant="hero" />
          </a>
        ) : (
          <div className="grid h-full min-h-[172px] w-full place-items-center rounded-[8px] bg-white/60 text-[color:var(--store-accent)] sm:min-h-64">
            <Package className="h-10 w-10 sm:h-16 sm:w-16" />
          </div>
        )}
      </div>
      {total > 1 ? (
        <div className="absolute bottom-1 left-1/2 hidden -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/80 px-2 py-1 shadow-sm sm:flex">
          {Array.from({ length: Math.min(total, 6) }).map((_, index) => (
            <span
              className={cn(
                "h-1.5 rounded-full transition-all",
                index === activeIndex % Math.min(total, 6)
                  ? "w-5 bg-[color:var(--store-button)]"
                  : "w-1.5 bg-[color:var(--store-button)] opacity-30",
              )}
              key={index}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BenefitStrip() {
  const benefits = [
    {
      icon: <Truck className="h-8 w-8" />,
      title: "Entrega combinada",
      mobileTitle: "Entrega",
      text: "A loja orienta o envio pelo WhatsApp.",
    },
    {
      icon: <ShieldCheck className="h-8 w-8" />,
      title: "Pagamento seguro",
      mobileTitle: "Pagamento",
      text: "Checkout protegido no ecossistema ConnectyHub.",
    },
    {
      icon: <RotateCcw className="h-8 w-8" />,
      title: "Compra acompanhada",
      mobileTitle: "Compra",
      text: "Pedido e atendimento em um so lugar.",
    },
    {
      icon: <Headphones className="h-8 w-8" />,
      title: "Suporte da loja",
      mobileTitle: "Suporte",
      text: "Atendimento direto pelo WhatsApp oficial.",
    },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      <div className="grid grid-cols-4 overflow-hidden rounded-[8px] border border-[#e5e2d8] bg-white shadow-sm shadow-slate-950/5 divide-x divide-[#e5e2d8]">
        {benefits.map((benefit) => (
          <div className="flex min-h-[70px] flex-col items-center justify-center gap-1 px-1.5 py-2 text-center sm:min-h-24 sm:flex-row sm:justify-start sm:gap-4 sm:px-5 sm:py-4 sm:text-left" key={benefit.title}>
            <span className="shrink-0 text-[color:var(--store-text)] [&>svg]:h-5 [&>svg]:w-5 sm:[&>svg]:h-8 sm:[&>svg]:w-8">{benefit.icon}</span>
            <div className="min-w-0">
              <h2 className="text-[9px] font-black uppercase leading-3 text-[color:var(--store-text)] sm:text-sm sm:leading-5">
                <span className="sm:hidden">{benefit.mobileTitle}</span>
                <span className="hidden sm:inline">{benefit.title}</span>
              </h2>
              <p className="mt-1 hidden text-xs font-semibold leading-5 text-[color:var(--store-text-muted)] sm:block">{benefit.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PromoBanner({
  branding,
  product,
  onShopNow,
}: {
  branding: PublicStorefrontBranding;
  product: PublicStorefrontProduct | null;
  onShopNow: () => void;
}) {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-4 sm:px-8 sm:py-7">
      <div
        className="grid min-h-0 grid-cols-[minmax(0,1fr)_108px] items-center gap-3 overflow-hidden rounded-[8px] border p-3 shadow-lg shadow-[#063f2c]/12 sm:p-5 md:min-h-36 md:grid-cols-[180px_minmax(0,1fr)_240px] md:p-7"
        style={{
          backgroundColor: "var(--store-primary)",
          borderColor: "var(--store-primary-border)",
          color: "var(--store-offer-text)",
        }}
      >
        <div className="hidden items-center justify-center md:flex">
          <span className="grid h-24 w-24 rotate-[-10deg] place-items-center rounded-[8px] bg-white text-[color:var(--store-accent)]">
            <Tag className="h-14 w-14" />
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase leading-4 opacity-90 sm:text-sm">Oferta especial da {branding.displayName}</p>
          <h2 className="mt-1 line-clamp-1 font-serif text-[24px] font-black leading-none sm:mt-2 sm:text-[34px] md:text-[44px]">
            {product?.highlightLabel || "Produtos selecionados"}
          </h2>
          <p className="mt-3 hidden max-w-xl text-sm font-semibold leading-6 text-[color:var(--store-offer-text-muted)] sm:block">
            Escolha seus produtos, adicione no carrinho e finalize tudo em um checkout unico.
          </p>
        </div>
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-[8px] border border-dashed px-3 text-[10px] font-black uppercase transition hover:bg-white/10 sm:min-h-12 sm:px-5 sm:text-xs md:min-h-14 md:px-6 md:text-sm"
          onClick={onShopNow}
          style={{ borderColor: "color-mix(in srgb, var(--store-offer-text) 60%, transparent 40%)" }}
          type="button"
        >
          Ver vitrine
        </button>
      </div>
    </section>
  );
}

function ProductShowcaseSection({
  className,
  products,
  title,
  onAddToCart,
}: {
  className?: string;
  products: PublicStorefrontProduct[];
  title: string;
  onAddToCart: (product: PublicStorefrontProduct) => void;
}) {
  return (
    <section className={className}>
      <SectionHeading title={title} />
      <div className="mt-5 grid grid-cols-2 gap-4 md:mt-7 md:grid-cols-4 md:gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} onAddToCart={onAddToCart} />
        ))}
      </div>
    </section>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-3 sm:gap-5">
        <span className="hidden h-px w-24 bg-current opacity-45 sm:block" style={{ color: "var(--store-text)" }} />
        <h2 className="font-serif text-[24px] font-medium leading-[1.05] text-[color:var(--store-text)] sm:text-[42px] sm:font-black sm:leading-none">
          {title}
        </h2>
        <Heart className="h-5 w-5 text-[#d84f66] sm:h-6 sm:w-6" />
        <span className="hidden h-px w-24 bg-current opacity-45 sm:block" style={{ color: "var(--store-text)" }} />
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
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-[8px] border border-[#e5e2d8] bg-white shadow-sm shadow-slate-950/5 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-950/10">
      <a
        className="relative block aspect-[4/3] overflow-hidden bg-[#f4f0ea]"
        data-track-event="sales_catalog_store_product_opened"
        data-track-label={product.title}
        href={product.productUrl}
      >
        {product.highlightLabel ? (
          <span className="absolute left-2 top-2 z-10 rounded-[8px] bg-[#f97316] px-2 py-1 text-[9px] font-black uppercase text-white">
            {product.highlightLabel}
          </span>
        ) : null}
        <ProductImage product={product} sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 230px" />
      </a>

      <div className="flex flex-1 flex-col p-3 text-center sm:p-4">
        <h3 className="line-clamp-2 min-h-10 text-[12px] font-semibold leading-5 text-[color:var(--store-card-text)] sm:text-sm sm:font-black">
          {product.title}
        </h3>
        <div className="mt-2 flex items-center justify-center gap-1 text-[#f5a400]">
          {[0, 1, 2, 3, 4].map((item) => (
            <Star className="h-3.5 w-3.5 fill-current" key={item} />
          ))}
          <span className="ml-1 text-xs font-bold text-[color:var(--store-card-text-muted)]">(4.8)</span>
        </div>
        <div className="mt-2 flex min-h-7 items-center justify-center gap-2">
          <p className="text-base font-black text-[color:var(--store-card-text)]">{product.priceLabel}</p>
          {product.compareAtLabel ? (
            <p className="text-xs font-semibold text-[#8b918c] line-through">{product.compareAtLabel}</p>
          ) : null}
        </div>
        <button
          className={cn(
            "mt-auto inline-flex min-h-10 w-full items-center justify-center rounded-[8px] border px-3 text-xs font-black uppercase transition brightness-100 hover:brightness-110",
            product.canCheckout ? "shadow-lg shadow-[#063f2c]/15" : "border-[#7c8580] bg-[#7c8580] text-white",
          )}
          onClick={() => onAddToCart(product)}
          style={product.canCheckout ? {
            backgroundColor: "var(--store-button)",
            borderColor: "var(--store-button-border)",
            color: "var(--store-button-text)",
          } : undefined}
          type="button"
        >
          {product.canCheckout ? (
            <>
              <ShoppingCart className="h-3.5 w-3.5" />
              <span className="sm:hidden">Adicionar</span>
              <span className="hidden sm:inline">Adicionar ao carrinho</span>
            </>
          ) : (
            "Ver produto"
          )}
        </button>
      </div>
    </article>
  );
}

function ProductImage({
  priority = false,
  product,
  sizes,
  variant = "card",
}: {
  priority?: boolean;
  product: PublicStorefrontProduct;
  sizes: string;
  variant?: "card" | "hero";
}) {
  if (!product.coverUrl) {
    return (
      <div className="grid h-full w-full place-items-center text-[color:var(--store-accent)] opacity-40">
        <Package className={variant === "hero" ? "h-20 w-20" : "h-12 w-12"} />
      </div>
    );
  }

  return (
    <Image
      alt={product.title}
      className={cn(
        "object-contain transition duration-500",
        variant === "hero"
          ? "scale-[1.58] p-0 drop-shadow-[0_22px_24px_rgba(40,24,12,0.2)] group-hover:scale-[1.62] sm:scale-[1.14] sm:p-0 sm:drop-shadow-[0_26px_28px_rgba(40,24,12,0.2)] sm:group-hover:scale-[1.18] lg:scale-[1.08] lg:group-hover:scale-[1.12]"
          : "p-3 group-hover:scale-105",
      )}
      fill
      priority={priority}
      sizes={sizes}
      src={product.coverUrl}
      unoptimized
    />
  );
}

function CategoryShowcase({
  categories,
  category,
  onSelect,
}: {
  categories: StoreCategory[];
  category: string;
  onSelect: (value: string) => void;
}) {
  return (
    <section id="categorias" className="bg-[#f2f6f0] py-6 sm:py-8">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <h2 className="text-center text-xs font-bold uppercase text-[color:var(--store-text)] sm:text-sm sm:font-black">Comprar por categoria</h2>
        <div className="mt-5 flex flex-wrap justify-center gap-x-7 gap-y-5 sm:mt-6 sm:gap-x-12 lg:gap-x-16">
          {categories.map((item, index) => (
            <CategoryButton
              active={category === item.id}
              icon={categoryIcon(index)}
              key={item.id}
              label={item.id === ALL_CATEGORY ? "Tudo" : item.label}
              onClick={() => onSelect(item.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="group w-20 min-w-0 text-center sm:w-24" onClick={onClick} type="button">
      <span
        className={cn(
          "mx-auto grid h-14 w-14 place-items-center rounded-full border transition sm:h-16 sm:w-16",
          active
            ? "shadow-lg shadow-[#063f2c]/15"
            : "border-[#e2e7df] bg-white text-[color:var(--store-accent)]",
        )}
        style={active ? {
          backgroundColor: "var(--store-primary)",
          borderColor: "var(--store-primary-border)",
          color: "var(--store-offer-text)",
        } : undefined}
      >
        {icon}
      </span>
      <span className="mt-2 block truncate text-[11px] font-medium text-[color:var(--store-text)] sm:text-xs sm:font-semibold">{label}</span>
    </button>
  );
}

function CustomerLove({ branding }: { branding: PublicStorefrontBranding }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-5 sm:px-8 sm:py-8">
      <div className="grid grid-cols-[0.86fr_1fr] overflow-hidden rounded-[8px] border border-[#e5e2d8] bg-white md:grid-cols-[300px_minmax(0,1fr)]">
        <div className="border-r border-[#e5e2d8] bg-[#f7f4ee] p-4 sm:p-7">
          <p className="text-[9px] font-bold uppercase text-[color:var(--store-text)] sm:text-xs sm:font-black">Clientes da loja</p>
          <h2 className="mt-1 font-serif text-[20px] font-semibold leading-[1.02] text-[color:var(--store-text)] sm:mt-2 sm:text-[32px] sm:font-black sm:leading-none">
            Compra simples e acompanhada.
          </h2>
          <p className="mt-2 line-clamp-3 text-[11px] font-medium leading-4 text-[color:var(--store-text-muted)] sm:mt-4 sm:text-sm sm:font-semibold sm:leading-6">
            A {branding.displayName} recebe o pedido e continua o atendimento pelo WhatsApp.
          </p>
        </div>
        <div className="grid items-center gap-3 p-4 sm:grid-cols-[1fr_220px] sm:gap-5 sm:p-7">
          <div>
            <div className="flex gap-1 text-[#f5a400]">
              {[0, 1, 2, 3, 4].map((item) => (
                <Star className="h-3.5 w-3.5 fill-current sm:h-5 sm:w-5" key={item} />
              ))}
            </div>
            <p className="mt-2 line-clamp-4 max-w-xl text-[12px] font-medium leading-5 text-[color:var(--store-text)] sm:mt-4 sm:text-base sm:font-semibold sm:leading-7">
              Atendimento rapido, produtos organizados e pagamento em um fluxo claro para o cliente.
            </p>
            <p className="mt-2 text-[11px] font-bold text-[color:var(--store-accent)] sm:mt-4 sm:text-sm sm:font-black">ConnectyHub Checkout</p>
          </div>
          <div className="hidden min-h-44 items-center justify-center rounded-[8px] bg-[#f4f0ea] sm:flex">
            <MessageCircle className="h-20 w-20 text-[color:var(--store-accent)]" />
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  const items = [
    { icon: <BadgeCheck className="h-7 w-7" />, title: "Produtos da loja", text: "Catalogo sempre organizado" },
    { icon: <CreditCard className="h-7 w-7" />, title: "Checkout unico", text: "Carrinho e pagamento juntos" },
    { icon: <Truck className="h-7 w-7" />, title: "Pedido acompanhado", text: "Fluxo integrado ao WhatsApp" },
    { icon: <ShieldCheck className="h-7 w-7" />, title: "Compra segura", text: "Ambiente ConnectyHub" },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-8 sm:px-8">
      <div
        className="grid grid-cols-4 overflow-hidden rounded-[8px] border divide-x divide-white/20"
        style={{
          backgroundColor: "var(--store-primary)",
          borderColor: "var(--store-primary-border)",
          color: "var(--store-offer-text)",
        }}
      >
        {items.map((item) => (
          <div className="flex min-h-[86px] flex-col items-center justify-center gap-2 px-2 py-3 text-center md:min-h-20 md:flex-row md:justify-start md:gap-4 md:px-5 md:py-4 md:text-left" key={item.title}>
            <span className="shrink-0 [&>svg]:h-5 [&>svg]:w-5 md:[&>svg]:h-7 md:[&>svg]:w-7">{item.icon}</span>
            <div className="min-w-0">
              <h2 className="text-[9px] font-black uppercase leading-3 md:text-sm md:leading-5">{item.title}</h2>
              <p className="mt-1 hidden text-xs font-semibold opacity-75 md:block">{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyCatalog({ branding }: { branding: PublicStorefrontBranding }) {
  return (
    <div className="rounded-[8px] border border-dashed border-[#d9ded7] bg-white p-10 text-center">
      <Package className="mx-auto h-10 w-10 text-[color:var(--store-accent)]" />
      <h2 className="mt-4 font-serif text-3xl font-black text-[color:var(--store-text)]">Vitrine em montagem</h2>
      <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-6 text-[color:var(--store-text-muted)]">
        A {branding.displayName} ainda esta preparando os produtos desta categoria.
      </p>
    </div>
  );
}

function StoreFooter({
  branding,
  footerContactText,
  footerText,
}: {
  branding: PublicStorefrontBranding;
  footerContactText: string;
  footerText: string;
}) {
  return (
    <footer className="border-t border-[#e5e2d8] bg-white">
      <div className="mx-auto grid w-full max-w-6xl gap-7 px-5 py-9 sm:px-8 md:grid-cols-[1.35fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <BrandLogo branding={branding} compact />
            <div>
              <h2 className="text-base font-black uppercase text-[color:var(--store-text)]">{branding.displayName}</h2>
              <p className="text-xs font-black uppercase text-[#526057]">Loja oficial</p>
            </div>
          </div>
          <p className="mt-4 text-sm font-semibold leading-6 text-[color:var(--store-text-muted)]">{footerText}</p>
        </div>
        <FooterColumn title="Loja" items={["Produtos", "Categorias", "Carrinho"]} />
        <FooterColumn title="Atendimento" items={["WhatsApp", "Meus pedidos", "Suporte"]} />
        <div>
          <h3 className="text-sm font-black uppercase text-[color:var(--store-text)]">Pagamento</h3>
          <p className="mt-3 text-sm font-semibold leading-6 text-[color:var(--store-text-muted)]">{footerContactText}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["VISA", "PIX", "CARD"].map((item) => (
              <span className="rounded-[8px] border border-[#e5e2d8] bg-[#f8f7f2] px-3 py-2 text-xs font-black text-[color:var(--store-text)]" key={item}>
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="border-t border-[#f0eee8] px-4 py-4 text-center text-xs font-semibold text-[color:var(--store-text-muted)]">
        {branding.displayName} - Desenvolvido por{" "}
        <a className="font-black text-[color:var(--store-accent)] hover:underline" href={connectHubPublicUrl} rel="noreferrer" target="_blank">
          ConnectyHub
        </a>
      </p>
    </footer>
  );
}

function FooterColumn({ items, title }: { items: string[]; title: string }) {
  return (
    <div>
      <h3 className="text-sm font-black uppercase text-[color:var(--store-text)]">{title}</h3>
      <div className="mt-4 grid gap-2">
        {items.map((item) => (
          <span className="text-sm font-semibold text-[color:var(--store-text-muted)]" key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function BrandLogo({ branding, compact = false }: { branding: PublicStorefrontBranding; compact?: boolean }) {
  return (
    <span className={cn(
      "relative grid shrink-0 place-items-center overflow-hidden rounded-[8px] border border-[#e5e2d8] bg-white",
      compact ? "h-10 w-10" : "h-12 w-12",
    )}>
      {branding.logoUrl ? (
        <Image alt={branding.logoAlt} className="object-contain p-1" fill sizes={compact ? "40px" : "48px"} src={branding.logoUrl} unoptimized />
      ) : (
        <Store className="h-5 w-5 text-[color:var(--store-accent)]" />
      )}
    </span>
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
      <button aria-label="Fechar carrinho" className="absolute inset-0 bg-slate-950/45" onClick={onClose} type="button" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl shadow-slate-950/30">
        <div className="flex items-center justify-between gap-3 border-b border-[#e5e2d8] px-4 py-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-[color:var(--store-accent)]">Carrinho</p>
            <h2 className="truncate text-xl font-black text-[color:var(--store-text)]">{branding.displayName}</h2>
          </div>
          <button aria-label="Fechar" className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-[#e5e2d8] bg-white text-[color:var(--store-text-muted)] transition hover:bg-[#f8f7f2]" onClick={onClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {cart.length > 0 ? (
            <div className="grid gap-3">
              {cart.map((line) => (
                <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-[8px] border border-[#e5e2d8] bg-[#fbfaf6] p-3" key={line.product.id}>
                  <div className="relative h-[72px] w-[72px] overflow-hidden rounded-[8px] bg-white">
                    {line.product.coverUrl ? (
                      <Image alt={line.product.title} className="object-contain p-1" fill sizes="72px" src={line.product.coverUrl} unoptimized />
                    ) : (
                      <Package className="m-5 h-8 w-8 text-[color:var(--store-accent)] opacity-40" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-black leading-5 text-[color:var(--store-text)]">{line.product.title}</p>
                    <p className="mt-1 text-sm font-black text-[color:var(--store-card-text)]">{line.product.priceLabel}</p>
                    <div className="mt-3 inline-flex h-9 items-center rounded-[8px] border border-[#e5e2d8] bg-white">
                      <button aria-label="Diminuir" className="grid h-9 w-9 place-items-center text-[color:var(--store-text-muted)] transition hover:text-[color:var(--store-accent)]" onClick={() => onUpdateQuantity(line.product.id, line.quantity - 1)} type="button">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-8 text-center text-sm font-black">{line.quantity}</span>
                      <button aria-label="Aumentar" className="grid h-9 w-9 place-items-center text-[color:var(--store-text-muted)] transition hover:text-[color:var(--store-accent)]" onClick={() => onUpdateQuantity(line.product.id, line.quantity + 1)} type="button">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[8px] border border-dashed border-[#d9ded7] bg-[#fbfaf6] p-6 text-center">
              <ShoppingBag className="mx-auto h-8 w-8 text-[color:var(--store-accent)]" />
              <h3 className="mt-3 text-lg font-black text-[color:var(--store-text)]">Seu carrinho esta vazio</h3>
              <p className="mt-2 text-sm leading-6 text-[color:var(--store-text-muted)]">Adicione produtos para gerar um checkout unico.</p>
            </div>
          )}

          {cart.length > 0 ? (
            <div className="mt-4 rounded-[8px] border border-[#e5e2d8] bg-white p-4">
              <p className="text-xs font-black uppercase text-[color:var(--store-accent)]">Dados para acompanhamento</p>
              <div className="mt-3 grid gap-3">
                <input className={inputClassName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Seu nome" value={customerName} />
                <input className={inputClassName} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="WhatsApp com DDD" value={customerPhone} />
                <input className={inputClassName} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="E-mail opcional" value={customerEmail} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-[#e5e2d8] bg-white px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3 rounded-[8px] border border-[#e5e2d8] bg-[#fbfaf6] px-4 py-3">
            <span className="text-sm font-black uppercase text-[color:var(--store-accent)]">Total</span>
            <span className="text-2xl font-black text-[color:var(--store-text)]">{formatCurrencyCents(totalCents)}</span>
          </div>
          {error ? (
            <p className="mb-3 rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold leading-5 text-rose-700">
              {error}
            </p>
          ) : null}
          <button
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[8px] border px-5 text-sm font-black uppercase shadow-lg shadow-[#063f2c]/20 transition brightness-100 hover:brightness-110 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
            disabled={!checkoutReady || busy}
            onClick={onCheckout}
            style={checkoutReady ? {
              backgroundColor: "var(--store-button)",
              borderColor: "var(--store-button-border)",
              color: "var(--store-button-text)",
            } : undefined}
            type="button"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />}
            {busy ? "Abrindo checkout..." : "Finalizar compra"}
          </button>
          <p className="mt-3 text-center text-xs font-semibold leading-5 text-[color:var(--store-text-muted)]">
            O pedido continua acompanhado pela loja no WhatsApp.
          </p>
        </div>
      </aside>
    </div>
  );
}

function MobileBottomNav({
  totalItems,
  onCart,
  onCategories,
  onHome,
}: {
  totalItems: number;
  onCart: () => void;
  onCategories: () => void;
  onHome: () => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-[#e5e2d8] bg-white px-2 py-2 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] lg:hidden">
      <MobileNavButton active icon={<Home className="h-5 w-5" />} label="Inicio" onClick={onHome} />
      <MobileNavButton icon={<Store className="h-5 w-5" />} label="Categorias" onClick={onCategories} />
      <MobileNavButton badge={totalItems} icon={<ShoppingCart className="h-5 w-5" />} label="Carrinho" onClick={onCart} />
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
      className={cn(
        "relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-[8px] text-[11px] font-bold",
        active ? "text-[color:var(--store-accent)]" : "text-[color:var(--store-text-muted)]",
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
      {badge ? (
        <span className="absolute right-7 top-0 grid h-5 min-w-5 place-items-center rounded-full bg-[#f97316] px-1 text-[10px] font-black text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function categoryIcon(index: number) {
  const icons = [
    <ShoppingBag className="h-6 w-6" key="bag" />,
    <Package className="h-6 w-6" key="package" />,
    <Home className="h-6 w-6" key="home" />,
    <Gift className="h-6 w-6" key="gift" />,
    <Sparkles className="h-6 w-6" key="sparkles" />,
    <Truck className="h-6 w-6" key="truck" />,
    <BadgeCheck className="h-6 w-6" key="badge" />,
    <Tag className="h-6 w-6" key="tag" />,
  ];

  return icons[index % icons.length];
}

function isGenericStoreCategory(category: string) {
  const normalized = category.trim().toLowerCase();
  return !normalized || genericStoreCategoryLabels.has(normalized);
}

function getStoreCategoryDisplayLabel(category: string) {
  const normalized = category.trim();
  return isGenericStoreCategory(normalized) ? genericStoreCategoryDisplayLabel : normalized;
}

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(20, Math.max(1, Math.round(value)));
}

function normalizeStorefrontPrimaryColor(value: string | null) {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function normalizeStorefrontTextColor(value: string | null) {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function getReadableTextColor(hex: string) {
  return getColorLuminance(hex) > 0.66 ? "#111111" : "#ffffff";
}

function getReadableAccentColor(hex: string, fallbackTextColor: string) {
  return getColorLuminance(hex) > 0.82 ? fallbackTextColor : hex;
}

function getReadableBorderColor(hex: string) {
  return getColorLuminance(hex) > 0.82 ? "#d9ded7" : `color-mix(in srgb, ${hex} 78%, black 22%)`;
}

function getColorLuminance(hex: string) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);

  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

function formatCurrencyCents(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

const inputClassName = "min-h-11 w-full rounded-[8px] border border-[#e5e2d8] bg-[#fbfaf6] px-3 text-sm font-semibold text-[color:var(--store-text)] outline-none transition placeholder:text-[#8b918c] focus:border-[color:var(--store-accent)] focus:bg-white focus:ring-4 focus:ring-[#123f2d]/10";
