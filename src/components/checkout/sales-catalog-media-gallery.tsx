"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageIcon, Package, PlayCircle, Video } from "lucide-react";
import type { SalesCatalogMedia } from "@/lib/sales-catalog/shared";
import { cn } from "@/lib/utils";

type SalesCatalogMediaGalleryProps = {
  title: string;
  media: SalesCatalogMedia[];
};

export function SalesCatalogMediaGallery({ title, media }: SalesCatalogMediaGalleryProps) {
  const galleryMedia = useMemo(
    () => media.filter((item) => item.kind === "image" || item.kind === "video"),
    [media],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedActiveIndex = galleryMedia.length > 0 ? Math.min(activeIndex, galleryMedia.length - 1) : 0;
  const activeMedia = galleryMedia[normalizedActiveIndex] ?? null;

  if (!activeMedia) {
    return (
      <div className="flex aspect-[4/3] min-h-[260px] w-full min-w-0 items-center justify-center bg-gradient-to-br from-blue-50 via-white to-emerald-50 lg:min-h-[520px]">
        <Package className="h-20 w-20 text-blue-200" aria-hidden="true" />
      </div>
    );
  }

  const hasMany = galleryMedia.length > 1;

  function move(direction: -1 | 1) {
    if (!hasMany) return;
    setActiveIndex((normalizedActiveIndex + direction + galleryMedia.length) % galleryMedia.length);
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-gradient-to-br from-blue-50 via-white to-emerald-50">
      <div
        className="relative aspect-[4/3] min-h-[260px] w-full min-w-0 flex-1 lg:min-h-[520px]"
        data-track-event="sales_catalog_product_gallery_viewed"
        data-track-label={activeMedia.fileName}
      >
        {activeMedia.kind === "video" ? (
          <video
            key={activeMedia.id}
            src={activeMedia.storageUrl}
            className="h-full min-h-[260px] w-full object-contain p-4 lg:min-h-[520px]"
            controls
            preload="metadata"
          />
        ) : (
          <Image
            key={activeMedia.id}
            alt={title}
            src={activeMedia.storageUrl}
            fill
            unoptimized
            sizes="(max-width: 1023px) 100vw, 52vw"
            className="object-contain p-6"
            priority
          />
        )}

        <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full border border-white/80 bg-white/90 px-3 py-1 text-[11px] font-bold text-slate-700 shadow-sm">
          {activeMedia.kind === "video" ? <Video className="h-3.5 w-3.5 text-[#25D366]" /> : <ImageIcon className="h-3.5 w-3.5 text-blue-600" />}
          {normalizedActiveIndex + 1}/{galleryMedia.length}
        </span>

        {hasMany ? (
          <>
            <button
              type="button"
              className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/80 bg-white/90 text-slate-700 shadow-lg shadow-blue-950/10 transition hover:border-blue-200 hover:text-blue-700"
              onClick={() => move(-1)}
              aria-label="Midia anterior"
              data-track-event="sales_catalog_product_gallery_previous_clicked"
              data-track-label={activeMedia.fileName}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/80 bg-white/90 text-slate-700 shadow-lg shadow-blue-950/10 transition hover:border-blue-200 hover:text-blue-700"
              onClick={() => move(1)}
              aria-label="Proxima midia"
              data-track-event="sales_catalog_product_gallery_next_clicked"
              data-track-label={activeMedia.fileName}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}
      </div>

      {hasMany ? (
        <div className="flex gap-2 overflow-x-auto border-t border-blue-100 bg-white/70 p-3">
          {galleryMedia.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-[8px] border bg-white transition",
                index === normalizedActiveIndex
                  ? "border-[#25D366] ring-2 ring-[#25D366]/25"
                  : "border-blue-100 hover:border-blue-300",
              )}
              onClick={() => setActiveIndex(index)}
              aria-label={`Abrir midia ${index + 1}`}
              data-track-event={item.kind === "video" ? "sales_catalog_product_video_selected" : "sales_catalog_product_image_selected"}
              data-track-label={item.fileName}
            >
              {item.kind === "image" ? (
                <Image
                  alt={title}
                  src={item.storageUrl}
                  fill
                  unoptimized
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <span className="grid h-full w-full place-items-center bg-emerald-50 text-[#128C4A]">
                  <PlayCircle className="h-6 w-6" />
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
