"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Loader2,
  Menu,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  X,
} from "lucide-react";
import { StoreNewsletterCard } from "@/components/checkout/store-newsletter-card";
import { cn } from "@/lib/utils";
import {
  resolveSalesCatalogCategoryIconId,
  type SalesCatalogCategoryIconId,
} from "@/lib/sales-catalog/category-icons";
import { SalesCatalogCategoryIconGlyph } from "@/components/sales-catalog/category-icon-glyph";
import {
  resolveSalesCatalogStorefrontFontFamily,
  type SalesCatalogStorefrontFontPreset,
} from "@/lib/sales-catalog/shared";

export type PublicStorefrontBranding = {
  displayName: string;
  logoUrl: string | null;
  logoAlt: string;
  whatsappHref?: string | null;
};

export type PublicStorefrontSettings = {
  publicDisplayName: string | null;
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
  heroTitleColor: string | null;
  heroHighlightColor: string | null;
  categoryStripColor: string | null;
  categoryIconColor: string | null;
  bodyFont: SalesCatalogStorefrontFontPreset | null;
  headingFont: SalesCatalogStorefrontFontPreset | null;
  homeCategoryNames: string[];
  categoryIcons: Record<string, SalesCatalogCategoryIconId>;
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
  mode?: StorefrontMode;
  initialCartOpen?: boolean;
  storeSlug: string;
  branding: PublicStorefrontBranding;
  storefront: PublicStorefrontSettings;
  products: PublicStorefrontProduct[];
  tracking: PublicStorefrontTrackingParams;
};

type StorefrontMode = "home" | "shop";
type StoreSortMode = "featured" | "price-low" | "price-high" | "name";

type StoreCategory = {
  id: string;
  label: string;
  count: number;
  iconId: SalesCatalogCategoryIconId;
};

const ALL_CATEGORY = "todos";
const defaultStorefrontPrimaryColor = "#063f2c";
const storefrontActionColor = "#f97316";
const connectHubPublicUrl = process.env.NEXT_PUBLIC_CONNECTYHUB_SITE_URL ?? "https://connectyhub.com.br";
const genericStoreCategoryLabels = new Set(["produto", "produtos"]);

export function PublicStorefront({
  mode = "home",
  initialCartOpen = false,
  storeSlug,
  branding,
  storefront,
  products,
  tracking,
}: PublicStorefrontProps) {
  const router = useRouter();
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState<StoreSortMode>("featured");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(initialCartOpen);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState(tracking.leadPhone ?? "");
  const [customerEmail, setCustomerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const storageKey = `connecty-store-cart:${tracking.organizationId}`;
  const storePath = `/loja/${encodeURIComponent(storeSlug)}`;
  const shopPath = `${storePath}/produtos`;
  const cartPath = `${storePath}/carrinho`;

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

    const categoryIcons = storefront.categoryIcons ?? {};

    return [
      { id: ALL_CATEGORY, label: "Todas", count: products.length, iconId: "shopping-bag" },
      ...Array.from(counts.entries())
        .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
        .map(([label, count]) => ({
          id: label,
          label,
          count,
          iconId: resolveSalesCatalogCategoryIconId(label, categoryIcons[label]),
        })),
    ];
  }, [products, storefront.categoryIcons]);

  const normalizedSearch = normalizeSearchTerm(searchTerm);
  const visibleProducts = useMemo(() => {
    const byCategory = category === ALL_CATEGORY
      ? products
      : products.filter((product) => product.category === category);

    if (!normalizedSearch) return byCategory;

    return byCategory.filter((product) => productMatchesSearch(product, normalizedSearch));
  }, [category, normalizedSearch, products]);
  const sortedVisibleProducts = useMemo(
    () => sortStorefrontProducts(visibleProducts, sortMode),
    [sortMode, visibleProducts],
  );
  const hasHomeProductSelection = products.some((product) => product.isFeatured);
  const homeVisibleProducts = useMemo(() => {
    if (normalizedSearch || !hasHomeProductSelection) return sortedVisibleProducts;

    return sortedVisibleProducts.filter((product) => product.isFeatured);
  }, [hasHomeProductSelection, normalizedSearch, sortedVisibleProducts]);

  const featuredProducts = useMemo(() => {
    const categoryFeaturedProducts = sortedVisibleProducts.filter((product) => product.isFeatured);
    if (categoryFeaturedProducts.length > 0) return categoryFeaturedProducts;

    const categoryFallbackProduct = sortedVisibleProducts.find((product) => product.canCheckout)
      ?? sortedVisibleProducts[0]
      ?? null;
    if (categoryFallbackProduct) return [categoryFallbackProduct];

    const storeFeaturedProducts = products.filter((product) => product.isFeatured);
    if (storeFeaturedProducts.length > 0) return storeFeaturedProducts;

    const storeFallbackProduct = products.find((product) => product.canCheckout)
      ?? products[0]
      ?? null;

    return storeFallbackProduct ? [storeFallbackProduct] : [];
  }, [products, sortedVisibleProducts]);
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
  const homeProductIds = new Set(homeVisibleProducts.map((product) => product.id));
  const newArrivalProducts = homeVisibleProducts.slice(0, 4);
  const bestSellerProducts = (
    category === ALL_CATEGORY && homeVisibleProducts.length <= 4
      ? sortedVisibleProducts.filter((product) => !homeProductIds.has(product.id)).slice(0, 4)
      : homeVisibleProducts.slice(4, 8)
  );
  const homeCategories = useMemo(() => {
    const availableCategories = categories.filter((item) => item.id !== ALL_CATEGORY);
    const selectedCategoryKeys = new Set(
      (storefront.homeCategoryNames ?? []).map((item) => normalizeCategorySelectionKey(item)),
    );
    if (selectedCategoryKeys.size === 0) return availableCategories;

    const selectedCategories = availableCategories.filter((item) => selectedCategoryKeys.has(normalizeCategorySelectionKey(item.label)));
    return selectedCategories.length > 0 ? selectedCategories : availableCategories;
  }, [categories, storefront.homeCategoryNames]);
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
  const heroTitleColor = normalizeStorefrontTextColor(storefront.heroTitleColor) ?? textColor;
  const heroHighlightColor = normalizeStorefrontTextColor(storefront.heroHighlightColor) ?? heroTitleColor;
  const categoryStripColor = normalizeStorefrontPrimaryColor(storefront.categoryStripColor) ?? primaryColor;
  const categoryIconColor = normalizeStorefrontTextColor(storefront.categoryIconColor) ?? getReadableTextColor(categoryStripColor);
  const categoryTextColor = getReadableTextColor(categoryStripColor);
  const bodyFontFamily = resolveSalesCatalogStorefrontFontFamily(storefront.bodyFont);
  const headingFontFamily = storefront.headingFont
    ? resolveSalesCatalogStorefrontFontFamily(storefront.headingFont)
    : bodyFontFamily;
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
    "--store-hero-title": heroTitleColor,
    "--store-hero-highlight": heroHighlightColor,
    "--store-offer-text-muted": `color-mix(in srgb, ${offerTextColor} 76%, transparent 24%)`,
    "--store-category-bg": categoryStripColor,
    "--store-category-icon": categoryIconColor,
    "--store-category-text": categoryTextColor,
    "--store-category-text-muted": `color-mix(in srgb, ${categoryTextColor} 78%, transparent 22%)`,
    "--store-font-body": bodyFontFamily,
    "--store-font-heading": headingFontFamily,
    "--store-primary-border": getReadableBorderColor(primaryColor),
  } as CSSProperties;
  const heroTitleLines = splitStorefrontHeroTitle(storefront.heroTitle);
  const customHeroTitle = heroTitleLines[0] ?? "";
  const customHeroHighlight = storefront.heroHighlight?.trim() || heroTitleLines.slice(1).join(" ");
  const heroTitle = customHeroTitle || "Encontre produtos";
  const heroHighlight = customHeroTitle ? customHeroHighlight : (storefront.heroHighlight || "que combinam com seu objetivo");
  const heroSubtitle = storefront.heroSubtitle
    || `Produtos selecionados pela ${branding.displayName}, atendimento pelo WhatsApp e checkout seguro pela ConnectyHub.`;
  const footerText = storefront.footerText
    || `${branding.displayName} atende pelo WhatsApp com catálogo, checkout seguro e acompanhamento do pedido em um só lugar.`;
  const footerContactText = storefront.footerContactText || "Atendimento pelo WhatsApp oficial da loja.";

  function scrollToProducts() {
    document.getElementById("produtos")?.scrollIntoView({ behavior: "smooth" });
  }

  function selectCategory(nextCategory: string) {
    setCategory(nextCategory);
    window.setTimeout(scrollToProducts, 0);
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
        throw new Error(payload.error ?? "Não foi possível abrir o checkout.");
      }

      window.localStorage.removeItem(storageKey);
      window.location.href = payload.trackingUrl ?? payload.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="storefront-public min-h-screen bg-white pb-20 text-[color:var(--store-text)] lg:pb-0" style={publicLayoutStyle}>
      <StoreAnnouncement branding={branding} />
      <StoreNavbar
        branding={branding}
        cartPath={cartPath}
        mode={mode}
        searchTerm={searchTerm}
        shopPath={shopPath}
        storePath={storePath}
        totalItems={totalItems}
        onCart={() => setCartOpen(true)}
        onCloseMobileMenu={() => setMobileMenuOpen(false)}
        onSearchTermChange={setSearchTerm}
        onToggleMobileMenu={() => setMobileMenuOpen((current) => !current)}
        mobileMenuOpen={mobileMenuOpen}
      />
      {mode === "home" ? (
        <>
          <StorefrontHero
            activeFeaturedIndex={activeFeaturedIndex}
            branding={branding}
            featuredCount={featuredProducts.length}
            featuredProduct={featuredProduct}
            heroHighlight={heroHighlight}
            heroSubtitle={heroSubtitle}
            heroTitle={heroTitle}
            shopPath={shopPath}
          />

          <StoreBrandStrip categories={homeCategories} onSelect={selectCategory} />

          <section id="produtos" className="mx-auto w-full max-w-[1240px] px-4 py-10 sm:py-14 lg:py-16">
            {newArrivalProducts.length > 0 ? (
              <ProductShowcaseSection
                products={newArrivalProducts}
                title={normalizedSearch ? "Resultado da busca" : "Novidades"}
                viewAllHref={shopPath}
              />
            ) : (
              <EmptyCatalog branding={branding} />
            )}

            {bestSellerProducts.length > 0 ? (
              <ProductShowcaseSection
                className="mt-12 border-t border-black/10 pt-12 sm:mt-16 sm:pt-16"
                products={bestSellerProducts}
                title={category === ALL_CATEGORY ? "Mais vendidos" : "Produtos em destaque"}
                viewAllHref={shopPath}
              />
            ) : null}

            <StoreReviews branding={branding} />
          </section>
        </>
      ) : (
        <ShopCatalog
          branding={branding}
          categories={categories}
          category={category}
          products={sortedVisibleProducts}
          searchTerm={searchTerm}
          shopPath={shopPath}
          sortMode={sortMode}
          totalProducts={products.length}
          onSearchTermChange={setSearchTerm}
          onSelectCategory={selectCategory}
          onSortModeChange={setSortMode}
        />
      )}

      <StoreFooter
        branding={branding}
        cartPath={cartPath}
        footerContactText={footerContactText}
        footerText={footerText}
        shopPath={shopPath}
        storeSlug={storeSlug}
        storePath={storePath}
        tracking={tracking}
      />

      <MobileBottomNav
        totalItems={totalItems}
        onCart={() => setCartOpen(true)}
        onCategories={() => document.getElementById(mode === "home" ? "categorias" : "produtos")?.scrollIntoView({ behavior: "smooth" })}
        onHome={() => {
          if (mode === "home") {
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
          }

          router.push(storePath);
        }}
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

function StoreAnnouncement({ branding }: { branding: PublicStorefrontBranding }) {
  return (
    <div className="px-4 py-2 text-center text-xs font-medium text-[color:var(--store-offer-text)] sm:text-sm" style={{ backgroundColor: "var(--store-primary)" }}>
      <span>Receba ofertas e novidades da {branding.displayName} direto pelo WhatsApp.</span>
      <a className="ml-1 font-bold underline underline-offset-2" href="#produtos">
        Ver produtos
      </a>
    </div>
  );
}

function StoreNavbar({
  branding,
  cartPath,
  mobileMenuOpen,
  mode,
  searchTerm,
  shopPath,
  storePath,
  totalItems,
  onCart,
  onCloseMobileMenu,
  onSearchTermChange,
  onToggleMobileMenu,
}: {
  branding: PublicStorefrontBranding;
  cartPath: string;
  mobileMenuOpen: boolean;
  mode: StorefrontMode;
  searchTerm: string;
  shopPath: string;
  storePath: string;
  totalItems: number;
  onCart: () => void;
  onCloseMobileMenu: () => void;
  onSearchTermChange: (value: string) => void;
  onToggleMobileMenu: () => void;
}) {
  return (
    <nav className="sticky top-0 z-30 bg-white">
      <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-4 py-5 lg:py-6">
        <div className="flex min-w-0 items-center gap-4">
          <button
            className="grid h-9 w-9 place-items-center rounded-full text-[color:var(--store-text)] transition hover:bg-black/5 md:hidden"
            type="button"
            aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileMenuOpen}
            onClick={onToggleMobileMenu}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <a className="flex min-w-0 items-center gap-2" href={storePath}>
            <BrandLogo branding={branding} compact />
            <span className="truncate text-lg font-semibold leading-none text-[color:var(--store-text)] lg:text-2xl">
              {branding.displayName}
            </span>
          </a>
        </div>

        <div className="hidden items-center gap-6 text-sm text-[color:var(--store-text)] md:flex">
          <a className={cn("font-medium hover:opacity-70", mode === "shop" && "font-semibold")} href={shopPath}>Produtos</a>
          <a className="font-medium hover:opacity-70" href={`${shopPath}#ofertas`}>Ofertas</a>
          <a className="font-medium hover:opacity-70" href={`${storePath}#produtos`}>Novidades</a>
          <a className="font-medium hover:opacity-70" href={`${storePath}#categorias`}>Categorias</a>
        </div>

        <label className="relative hidden min-h-12 flex-1 md:block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-black/40" aria-hidden="true" />
          <input
            className="h-12 w-full rounded-full border-0 bg-[#f0f0f0] px-12 text-sm font-medium text-black outline-none placeholder:text-black/40 focus:ring-2 focus:ring-black/10"
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Buscar produtos..."
            type="search"
            value={searchTerm}
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            aria-label={totalItems > 0 ? `Abrir carrinho com ${totalItems} itens` : "Abrir carrinho"}
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-[color:var(--store-text)] transition hover:bg-black/5"
            onClick={onCart}
            type="button"
          >
            <ShoppingCart className="h-4 w-4" />
            {totalItems > 0 ? (
              <span className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-semibold text-[color:var(--store-button-text)] ring-2 ring-white" style={{ backgroundColor: "var(--store-button)" }}>
                {totalItems}
              </span>
            ) : null}
          </button>
        </div>
      </div>
      {mobileMenuOpen ? (
        <div className="border-t border-black/10 bg-white px-4 pb-4 shadow-lg shadow-black/5 md:hidden">
          <div className="mx-auto grid w-full max-w-[1240px] gap-2 pt-3">
            <MobileMenuLink href={storePath} label="Início" onClick={onCloseMobileMenu} />
            <MobileMenuLink href={shopPath} label="Produtos" onClick={onCloseMobileMenu} />
            <MobileMenuLink href={`${shopPath}#ofertas`} label="Ofertas" onClick={onCloseMobileMenu} />
            <MobileMenuLink href={`${storePath}#produtos`} label="Novidades" onClick={onCloseMobileMenu} />
            <MobileMenuLink href={`${storePath}#categorias`} label="Categorias" onClick={onCloseMobileMenu} />
            <MobileMenuLink href={cartPath} label="Carrinho" onClick={onCloseMobileMenu} />
            <label className="relative mt-2 block min-h-11">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" aria-hidden="true" />
              <input
                className="h-11 w-full rounded-full border-0 bg-[#f0f0f0] px-11 text-sm font-medium text-black outline-none placeholder:text-black/40"
                onChange={(event) => onSearchTermChange(event.target.value)}
                placeholder="Buscar produtos..."
                type="search"
                value={searchTerm}
              />
            </label>
          </div>
        </div>
      ) : null}
    </nav>
  );
}

function MobileMenuLink({ href, label, onClick }: { href: string; label: string; onClick: () => void }) {
  return (
    <a className="rounded-[8px] px-3 py-2 text-sm font-semibold text-[color:var(--store-text)] transition hover:bg-black/5" href={href} onClick={onClick}>
      {label}
    </a>
  );
}

function StorefrontHero({
  activeFeaturedIndex,
  branding,
  featuredCount,
  featuredProduct,
  heroHighlight,
  heroSubtitle,
  heroTitle,
  shopPath,
}: {
  activeFeaturedIndex: number;
  branding: PublicStorefrontBranding;
  featuredCount: number;
  featuredProduct: PublicStorefrontProduct | null;
  heroHighlight: string;
  heroSubtitle: string;
  heroTitle: string;
  shopPath: string;
}) {
  return (
    <header className="overflow-hidden bg-[#f2f0f1]">
      <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 md:grid-cols-2">
        <section className="px-4 pb-8 pt-10 md:pb-0 md:pt-24">
          <h1 className="mb-5 max-w-[580px] text-[30px] font-semibold leading-[34px] text-[color:var(--store-text)] md:mb-8 md:text-[42px] md:leading-[46px] xl:text-[46px] xl:leading-[50px]">
            <span className="block text-[color:var(--store-hero-title)]">{heroTitle}</span>
            {heroHighlight ? <span className="block text-[color:var(--store-hero-highlight)]">{heroHighlight}</span> : null}
          </h1>
          <p className="mb-6 max-w-[545px] text-sm leading-6 text-[color:var(--store-text-muted)] lg:mb-8 lg:text-base">
            {heroSubtitle}
          </p>
          <a
            href={shopPath}
            className="inline-flex min-h-11 w-auto min-w-[150px] items-center justify-center whitespace-nowrap rounded-full border px-7 text-center text-sm font-semibold transition brightness-100 hover:brightness-110"
            style={{
              backgroundColor: "var(--store-button)",
              borderColor: "var(--store-button-border)",
              color: "var(--store-button-text)",
            }}
          >
            Ver produtos
          </a>
        </section>
        <section className="relative min-h-[448px] px-4">
          <Sparkles className="absolute right-10 top-12 h-20 w-20 animate-spin text-[color:var(--store-accent)] md:right-0 md:h-24 md:w-24" />
          <Sparkles className="absolute left-6 top-44 h-11 w-11 animate-spin text-[color:var(--store-accent)] opacity-80 md:left-0 md:top-56 md:h-14 md:w-14" />
          <HeroProductPanel activeIndex={activeFeaturedIndex} branding={branding} product={featuredProduct} total={featuredCount} />
        </section>
      </div>
    </header>
  );
}

function HeroProductPanel({
  activeIndex,
  branding,
  product,
  total,
}: {
  activeIndex: number;
  branding: PublicStorefrontBranding;
  product: PublicStorefrontProduct | null;
  total: number;
}) {
  return (
    <div className="relative flex h-full min-h-[448px] items-end justify-center">
      <div className="absolute bottom-0 left-1/2 h-[310px] w-[310px] -translate-x-1/2 rounded-full bg-white/60 blur-3xl md:h-[430px] md:w-[430px]" />
      <div className="relative flex h-full min-h-[448px] w-full items-end justify-center">
        {product ? (
          <a
            key={product.id}
            className="relative block h-[410px] w-full max-w-[520px] md:h-[520px]"
            data-track-event="sales_catalog_store_featured_product_clicked"
            data-track-label={product.title}
            href={toRelativeStorefrontHref(product.productUrl)}
          >
            <ProductImage product={product} priority sizes="(max-width: 768px) 90vw, 520px" variant="hero" />
            <span className="absolute bottom-6 left-1/2 max-w-[78%] -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-center text-xs font-semibold text-[color:var(--store-card-text)] shadow-lg shadow-black/10">
              {product.title}
            </span>
          </a>
        ) : (
          <div className="grid h-[360px] w-full max-w-[520px] place-items-center text-black/25">
            <div className="text-center">
              <Package className="mx-auto h-16 w-16" />
              <p className="mt-3 text-sm font-semibold text-[color:var(--store-text-muted)]">{branding.displayName}</p>
            </div>
          </div>
        )}
      </div>
      {total > 1 ? (
        <div className="absolute bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/80 px-2 py-1 shadow-sm sm:flex">
          {Array.from({ length: Math.min(total, 6) }).map((_, index) => (
            <span
              className={cn(
                "h-1.5 rounded-full transition-all",
                index === activeIndex % Math.min(total, 6)
                  ? "w-5 bg-black"
                  : "w-1.5 bg-black opacity-30",
              )}
              key={index}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StoreBrandStrip({
  categories,
  onSelect,
}: {
  categories: StoreCategory[];
  onSelect: (value: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0);

  useEffect(() => {
    if (categories.length < 4) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      setActiveCategoryIndex((current) => (current + 1) % categories.length);
    }, 3200);

    return () => window.clearInterval(timer);
  }, [categories.length]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const firstItem = scroller?.querySelector<HTMLElement>("[data-store-category-button]");

    if (!scroller || !firstItem) return;

    const styles = window.getComputedStyle(scroller);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
    scroller.scrollTo({
      behavior: "smooth",
      left: activeCategoryIndex * (firstItem.offsetWidth + gap),
    });
  }, [activeCategoryIndex]);

  if (categories.length === 0) return null;

  const alignmentClass = categories.length <= 3
    ? "justify-center"
    : categories.length <= 6
      ? "justify-start sm:justify-center"
      : "justify-start";

  return (
    <section id="categorias" style={{ backgroundColor: "var(--store-category-bg)" }}>
      <div className="relative mx-auto flex h-[126px] w-full max-w-[1240px] items-center justify-center overflow-hidden px-4">
        <p className="absolute inset-x-4 top-3 text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--store-category-text-muted)] sm:text-xs">
          Compre por categoria
        </p>
        <div
          className={cn(
            "flex w-full snap-x snap-mandatory items-center gap-6 overflow-x-auto scroll-smooth pt-6 [scrollbar-width:none] sm:gap-8 [&::-webkit-scrollbar]:hidden",
            alignmentClass,
          )}
          data-store-category-strip
          ref={scrollerRef}
        >
          {categories.map((item) => (
            <button
              className="group flex h-[78px] w-[88px] shrink-0 snap-start flex-col items-center justify-center gap-2 text-center text-[color:var(--store-category-text)] transition hover:-translate-y-0.5 sm:w-[104px]"
              data-store-category-button
              key={item.id}
              onClick={() => onSelect(item.id)}
              type="button"
            >
              <span className="line-clamp-1 w-full text-[11px] font-semibold leading-4 sm:text-xs">{item.label}</span>
              <span className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/10 text-[color:var(--store-category-icon)] transition group-hover:bg-white/15 sm:h-11 sm:w-11">
                <SalesCatalogCategoryIconGlyph className="h-5 w-5 sm:h-6 sm:w-6" id={item.iconId} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function ShopCatalog({
  branding,
  categories,
  category,
  products,
  searchTerm,
  shopPath,
  sortMode,
  totalProducts,
  onSearchTermChange,
  onSelectCategory,
  onSortModeChange,
}: {
  branding: PublicStorefrontBranding;
  categories: StoreCategory[];
  category: string;
  products: PublicStorefrontProduct[];
  searchTerm: string;
  shopPath: string;
  sortMode: StoreSortMode;
  totalProducts: number;
  onSearchTermChange: (value: string) => void;
  onSelectCategory: (value: string) => void;
  onSortModeChange: (value: StoreSortMode) => void;
}) {
  return (
    <section id="produtos" className="mx-auto grid w-full max-w-[1240px] gap-5 px-4 py-8 sm:px-6 lg:grid-cols-[295px_minmax(0,1fr)] lg:py-12">
      <aside className="self-start rounded-[20px] border border-black/10 bg-white p-5 shadow-sm shadow-slate-950/5 lg:sticky lg:top-28">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-[color:var(--store-accent)]">Filtros</p>
            <h2 className="mt-1 text-lg font-extrabold text-[color:var(--store-text)]">Categorias</h2>
          </div>
          <SlidersHorizontal className="h-5 w-5 text-[color:var(--store-accent)]" />
        </div>

        <div className="mt-4 grid gap-2">
          {categories.map((item) => (
            <button
              className={cn(
                "flex min-h-11 items-center justify-between gap-3 rounded-full border px-4 text-left text-sm font-bold transition",
                category === item.id
                  ? "border-[color:var(--store-button-border)] text-[color:var(--store-button-text)]"
                  : "border-black/10 bg-white text-[color:var(--store-card-text)] hover:border-black/30",
              )}
              style={category === item.id ? { backgroundColor: "var(--store-button)" } : undefined}
              key={item.id}
              onClick={() => onSelectCategory(item.id)}
              type="button"
            >
              <span className="truncate">{item.id === ALL_CATEGORY ? "Todos" : item.label}</span>
              <span className="text-xs opacity-70">{item.count}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="min-w-0">
        <div className="rounded-[20px] border border-black/10 bg-white p-5 shadow-sm shadow-slate-950/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold text-[color:var(--store-accent)]">{branding.displayName}</p>
              <h1 className="mt-1 text-[28px] font-semibold leading-tight text-[color:var(--store-text)] sm:text-[34px]">
                Todos os produtos
              </h1>
              <p className="mt-2 text-sm font-semibold text-[color:var(--store-text-muted)]">
                {products.length} de {totalProducts} produto(s) em exibição.
              </p>
            </div>
            <a
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border px-4 text-xs font-bold uppercase transition hover:bg-[#f8f7f2]"
              href={shopPath}
              style={{ borderColor: "var(--store-button-border)", color: "var(--store-accent)" }}
            >
              Limpar filtros
            </a>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative min-h-11 w-full">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737a75]" aria-hidden="true" />
              <input
                className="h-12 w-full rounded-full border-0 bg-[#f0f0f0] px-11 text-sm font-medium text-black outline-none transition placeholder:text-black/40 focus:ring-2 focus:ring-black/10"
                onChange={(event) => onSearchTermChange(event.target.value)}
                placeholder="Buscar por produto, categoria ou preço..."
                type="search"
                value={searchTerm}
              />
            </label>
            <select
              className="h-12 rounded-full border border-black/10 bg-white px-4 text-sm font-bold text-black outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10"
              onChange={(event) => onSortModeChange(event.target.value as StoreSortMode)}
              value={sortMode}
            >
              <option value="featured">Destaques primeiro</option>
              <option value="price-low">Menor preço</option>
              <option value="price-high">Maior preço</option>
              <option value="name">Nome A-Z</option>
            </select>
          </div>
        </div>

        {products.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <EmptyCatalog branding={branding} />
          </div>
        )}
      </div>
    </section>
  );
}

function ProductShowcaseSection({
  className,
  products,
  title,
  viewAllHref,
}: {
  className?: string;
  products: PublicStorefrontProduct[];
  title: string;
  viewAllHref?: string;
}) {
  return (
    <section className={cn("text-center", className)}>
      <SectionHeading title={title} />
      <div className="mt-8 grid grid-cols-2 gap-4 md:mt-14 md:grid-cols-4 md:gap-5">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {viewAllHref ? (
        <div className="mt-6 text-center md:mt-9">
          <a
            className="inline-block w-full rounded-full border border-black/10 px-[54px] py-4 text-sm font-medium text-[color:var(--store-text)] transition hover:bg-black hover:text-white sm:w-[218px] sm:text-base"
            href={viewAllHref}
          >
            Ver todos
          </a>
        </div>
      ) : null}
    </section>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-[24px] font-semibold leading-[29px] text-[color:var(--store-text)] md:text-[32px] md:leading-[38px]">
      {title}
    </h2>
  );
}

function ProductCard({ product }: { product: PublicStorefrontProduct }) {
  return (
    <a
      className="group flex min-w-0 flex-col items-start text-left"
      href={toRelativeStorefrontHref(product.productUrl)}
    >
      <span
        className="relative mb-2.5 block aspect-square w-full overflow-hidden rounded-[13px] bg-[#f0eeed] lg:mb-4 lg:rounded-[20px]"
        data-track-event="sales_catalog_store_product_opened"
        data-track-label={product.title}
      >
        {product.highlightLabel ? (
          <span className="absolute left-3 top-3 z-10 rounded-full bg-[#ff3333]/10 px-3.5 py-1.5 text-[10px] font-medium text-[#ff3333] xl:text-xs">
            {product.highlightLabel}
          </span>
        ) : null}
        <ProductImage product={product} sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 230px" />
      </span>
      <strong className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-[color:var(--store-card-text)] xl:text-lg">
        {product.title}
      </strong>
      <span className="mt-1 flex items-end">
        <span className="flex items-center gap-0.5 text-[#ffc633]">
          {[0, 1, 2, 3, 4].map((item) => (
            <Star className="h-4 w-4 fill-current" key={item} />
          ))}
        </span>
        <span className="ml-[11px] pb-0.5 text-xs text-black xl:ml-[13px] xl:text-sm">
          4.8<span className="text-black/60">/5</span>
        </span>
      </span>
      <span className="mt-1 flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-xl font-semibold text-[color:var(--store-card-text)] xl:text-2xl">{product.priceLabel}</span>
        {product.compareAtLabel ? (
          <>
            <span className="text-xl font-bold text-black/40 line-through xl:text-2xl">{product.compareAtLabel}</span>
            <span className="rounded-full bg-[#ff3333]/10 px-3.5 py-1.5 text-[10px] font-medium text-[#ff3333] xl:text-xs">
              Oferta
            </span>
          </>
        ) : null}
      </span>
    </a>
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

function StoreReviews({ branding }: { branding: PublicStorefrontBranding }) {
  const reviews = useMemo(() => [
    {
      name: "Cliente verificado",
      text: `Atendimento rápido da ${branding.displayName}, produto bem apresentado e compra fácil pelo WhatsApp.`,
    },
    {
      name: "Compra acompanhada",
      text: "Gostei de conseguir tirar dúvidas antes de finalizar. O checkout ficou simples e direto.",
    },
    {
      name: "Pedido concluído",
      text: "A vitrine mostra as informações principais sem confundir. Ajuda muito na decisão de compra.",
    },
  ], [branding.displayName]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeReviewIndex, setActiveReviewIndex] = useState(0);

  useEffect(() => {
    if (reviews.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      setActiveReviewIndex((current) => (current + 1) % reviews.length);
    }, 4200);

    return () => window.clearInterval(timer);
  }, [reviews.length]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const firstCard = scroller?.querySelector<HTMLElement>("[data-store-review-card]");

    if (!scroller || !firstCard) return;

    const styles = window.getComputedStyle(scroller);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
    scroller.scrollTo({
      behavior: "smooth",
      left: activeReviewIndex * (firstCard.offsetWidth + gap),
    });
  }, [activeReviewIndex]);

  function selectReview(index: number) {
    setActiveReviewIndex((index + reviews.length) % reviews.length);
  }

  return (
    <section className="mt-16">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="text-[24px] font-semibold leading-[29px] text-[color:var(--store-text)] md:text-[32px] md:leading-[38px]">
          Clientes satisfeitos
        </h2>
        <div className="hidden items-center gap-4 text-[color:var(--store-text)] sm:flex">
          <ArrowGlyph direction="left" onClick={() => selectReview(activeReviewIndex - 1)} />
          <ArrowGlyph direction="right" onClick={() => selectReview(activeReviewIndex + 1)} />
        </div>
      </div>
      <div
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
        ref={scrollerRef}
      >
        {reviews.map((review) => (
          <StoreReviewCard key={review.name} review={review} />
        ))}
      </div>
      <div className="mt-4 flex justify-center gap-2">
        {reviews.map((review, index) => (
          <button
            aria-label={`Mostrar depoimento: ${review.name}`}
            className={cn(
              "h-2 rounded-full transition-all",
              index === activeReviewIndex
                ? "w-6 bg-[color:var(--store-button)]"
                : "w-2 bg-black/20",
            )}
            key={review.name}
            onClick={() => selectReview(index)}
            type="button"
          />
        ))}
      </div>
    </section>
  );
}

function StoreReviewCard({ review }: { review: { name: string; text: string } }) {
  return (
    <article className="min-h-[196px] w-[calc(100vw-2rem)] max-w-[370px] shrink-0 snap-start rounded-[8px] border border-black/10 bg-white p-6 text-left sm:w-[360px] lg:w-[420px]" data-store-review-card>
      <div className="flex text-[#ffc633]">
        {[0, 1, 2, 3, 4].map((item) => (
          <Star className="h-5 w-5 fill-current" key={item} />
        ))}
      </div>
      <h3 className="mt-4 text-base font-semibold text-[color:var(--store-card-text)]">{review.name}</h3>
      <p className="mt-3 text-sm leading-6 text-[color:var(--store-card-text-muted)]">{review.text}</p>
    </article>
  );
}

function ArrowGlyph({ direction, onClick }: { direction: "left" | "right"; onClick: () => void }) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;

  return (
    <button
      aria-label={direction === "left" ? "Depoimento anterior" : "Próximo depoimento"}
      className="grid h-9 w-9 place-items-center rounded-full border border-black/10 transition hover:bg-black/5"
      onClick={onClick}
      type="button"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function EmptyCatalog({ branding }: { branding: PublicStorefrontBranding }) {
  return (
    <div className="rounded-[8px] border border-dashed border-[#d9ded7] bg-white p-10 text-center">
      <Package className="mx-auto h-10 w-10 text-[color:var(--store-accent)]" />
      <h2 className="mt-4 font-serif text-3xl font-bold text-[color:var(--store-text)]">Vitrine em montagem</h2>
      <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-6 text-[color:var(--store-text-muted)]">
        A {branding.displayName} ainda está preparando os produtos desta categoria.
      </p>
    </div>
  );
}

function StoreFooter({
  branding,
  cartPath,
  footerContactText,
  footerText,
  shopPath,
  storeSlug,
  storePath,
  tracking,
}: {
  branding: PublicStorefrontBranding;
  cartPath: string;
  footerContactText: string;
  footerText: string;
  shopPath: string;
  storeSlug: string;
  storePath: string;
  tracking: PublicStorefrontTrackingParams;
}) {
  const supportHref = branding.whatsappHref ?? storePath;
  const supportIsExternal = Boolean(branding.whatsappHref);

  return (
    <footer className="mt-16 bg-[#f0f0f0]">
      <div className="mx-auto w-full max-w-[1240px] px-4">
        <StoreNewsletterCard branding={branding} storeSlug={storeSlug} tracking={tracking} />

        <div className="grid gap-8 px-0 pb-10 pt-12 md:grid-cols-[1.35fr_1fr_1fr_1fr] md:pt-14">
          <div>
            <div className="flex items-center gap-3">
              <BrandLogo branding={branding} compact />
              <h2 className="text-[22px] font-semibold leading-none text-[color:var(--store-text)]">{branding.displayName}</h2>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-6 text-[color:var(--store-text-muted)]">{footerText}</p>
            <div className="mt-7 flex gap-3">
              {["W", "I", "F", "C"].map((item) => (
                <span className="grid h-8 w-8 place-items-center rounded-full border border-black/20 bg-white text-xs font-bold text-black" key={item}>
                  {item}
                </span>
              ))}
            </div>
          </div>
          <FooterColumn
            title="Empresa"
            items={[
              { label: "Sobre", href: storePath },
              { label: "Produtos", href: shopPath },
              { label: "Carrinho", href: cartPath },
              { label: "Atendimento", href: supportHref, external: supportIsExternal },
            ]}
          />
          <FooterColumn
            title="Ajuda"
            items={[
              { label: "Suporte", href: supportHref, external: supportIsExternal },
              { label: "Entrega", href: supportHref, external: supportIsExternal },
              { label: "Pedidos", href: supportHref, external: supportIsExternal },
              { label: "Pagamentos", href: supportHref, external: supportIsExternal },
            ]}
          />
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[3px] text-[color:var(--store-text)]">Pagamento</h3>
              <p className="mt-4 text-sm leading-6 text-[color:var(--store-text-muted)]">
                Checkout seguro pela ConnectyHub. {footerContactText}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {paymentBadges.map((item) => (
                  <PaymentBadge key={item.label} label={item.label} tone={item.tone} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mx-auto w-full max-w-[1240px] border-t border-black/10 px-4 py-5 text-xs text-[color:var(--store-text-muted)]">
        {branding.displayName} - Checkout seguro pela{" "}
        <a className="font-bold text-[color:var(--store-text)] hover:underline" href={connectHubPublicUrl} rel="noreferrer" target="_blank">
          ConnectyHub
        </a>
      </p>
    </footer>
  );
}

type PaymentBadgeTone = "visa" | "mastercard" | "pix" | "paypal" | "gpay";

const paymentBadges: Array<{ label: string; tone: PaymentBadgeTone }> = [
  { label: "Visa", tone: "visa" },
  { label: "Mastercard", tone: "mastercard" },
  { label: "Pix", tone: "pix" },
  { label: "PayPal", tone: "paypal" },
  { label: "G Pay", tone: "gpay" },
];

function PaymentBadge({ label, tone }: { label: string; tone: PaymentBadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center rounded-[6px] border px-3 text-xs font-bold shadow-sm",
        tone === "visa" && "border-[#1a1f71]/20 bg-[#1a1f71] text-white",
        tone === "mastercard" && "border-[#eb001b]/20 bg-gradient-to-r from-[#eb001b] to-[#f79e1b] text-white",
        tone === "pix" && "border-[#32bcad]/20 bg-[#32bcad] text-white",
        tone === "paypal" && "border-[#003087]/20 bg-[#003087] text-white",
        tone === "gpay" && "border-black/10 bg-white text-black",
      )}
    >
      {label}
    </span>
  );
}

function FooterColumn({
  items,
  title,
}: {
  items: Array<{ label: string; href: string; external?: boolean }>;
  title: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-[3px] text-[color:var(--store-text)]">{title}</h3>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <a
            className="text-sm text-[color:var(--store-text-muted)] transition hover:text-[color:var(--store-text)]"
            href={item.href}
            key={item.label}
            rel={item.external ? "noreferrer" : undefined}
            target={item.external ? "_blank" : undefined}
          >
            {item.label}
          </a>
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
            <p className="text-xs font-semibold uppercase text-[color:var(--store-accent)]">Carrinho</p>
            <h2 className="truncate text-xl font-semibold text-[color:var(--store-text)]">{branding.displayName}</h2>
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
                    <p className="line-clamp-2 text-sm font-semibold leading-5 text-[color:var(--store-text)]">{line.product.title}</p>
                    <p className="mt-1 text-sm font-semibold text-[color:var(--store-card-text)]">{line.product.priceLabel}</p>
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
              <h3 className="mt-3 text-lg font-semibold text-[color:var(--store-text)]">Seu carrinho está vazio</h3>
              <p className="mt-2 text-sm leading-6 text-[color:var(--store-text-muted)]">Adicione produtos para gerar um checkout único.</p>
            </div>
          )}

          {cart.length > 0 ? (
            <div className="mt-4 rounded-[8px] border border-[#e5e2d8] bg-white p-4">
              <p className="text-xs font-semibold uppercase text-[color:var(--store-accent)]">Dados para acompanhamento</p>
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
            <span className="text-sm font-semibold uppercase text-[color:var(--store-accent)]">Total</span>
            <span className="text-2xl font-semibold text-[color:var(--store-text)]">{formatCurrencyCents(totalCents)}</span>
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
      <MobileNavButton active icon={<Home className="h-5 w-5" />} label="Início" onClick={onHome} />
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

function isGenericStoreCategory(category: string) {
  const normalized = category.trim().toLowerCase();
  return !normalized || genericStoreCategoryLabels.has(normalized);
}

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(20, Math.max(1, Math.round(value)));
}

function productMatchesSearch(product: PublicStorefrontProduct, normalizedSearch: string) {
  return [
    product.title,
    product.description,
    product.shortDescription,
    product.category,
    product.priceLabel,
    product.stockLabel,
  ].some((value) => normalizeSearchTerm(value).includes(normalizedSearch));
}

function sortStorefrontProducts(products: PublicStorefrontProduct[], sortMode: StoreSortMode) {
  const output = [...products];

  if (sortMode === "name") {
    return output.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  }

  if (sortMode === "price-low") {
    return output.sort((a, b) => getSortablePrice(a) - getSortablePrice(b));
  }

  if (sortMode === "price-high") {
    return output.sort((a, b) => getSortablePrice(b) - getSortablePrice(a));
  }

  return output.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
}

function toRelativeStorefrontHref(href: string) {
  try {
    const url = new URL(href);
    if (url.pathname.startsWith("/loja/") || url.pathname.startsWith("/produto/")) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return href;
  }

  return href;
}

function getSortablePrice(product: PublicStorefrontProduct) {
  return product.priceCents ?? Number.MAX_SAFE_INTEGER;
}

function normalizeSearchTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeCategorySelectionKey(value: string) {
  return normalizeSearchTerm(value).replace(/\s+/g, " ");
}

function splitStorefrontHeroTitle(value: string | null) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
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
