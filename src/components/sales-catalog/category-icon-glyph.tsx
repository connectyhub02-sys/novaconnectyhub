import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Dumbbell,
  Gift,
  HeartPulse,
  Home,
  MonitorSmartphone,
  Package,
  Pill,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Syringe,
  Tag,
  Utensils,
  Wrench,
} from "lucide-react";
import {
  defaultSalesCatalogCategoryIconId,
  normalizeSalesCatalogCategoryIconId,
  type SalesCatalogCategoryIconId,
} from "@/lib/sales-catalog/category-icons";

const salesCatalogCategoryIconGlyphs: Record<SalesCatalogCategoryIconId, LucideIcon> = {
  "shopping-bag": ShoppingBag,
  package: Package,
  pill: Pill,
  syringe: Syringe,
  dumbbell: Dumbbell,
  shirt: Shirt,
  home: Home,
  gift: Gift,
  sparkles: Sparkles,
  tag: Tag,
  "heart-pulse": HeartPulse,
  monitor: MonitorSmartphone,
  basket: ShoppingBasket,
  utensils: Utensils,
  wrench: Wrench,
  "badge-check": BadgeCheck,
};

export function SalesCatalogCategoryIconGlyph({
  className,
  id,
}: {
  className?: string;
  id: string | null | undefined;
}) {
  const normalizedId = normalizeSalesCatalogCategoryIconId(id) ?? defaultSalesCatalogCategoryIconId;
  const Icon = salesCatalogCategoryIconGlyphs[normalizedId];

  return <Icon className={className} />;
}
