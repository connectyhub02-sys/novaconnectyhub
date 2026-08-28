"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ImageIcon, Maximize2, Package, PlayCircle, Video } from "lucide-react";
import type { SalesCatalogMedia } from "@/lib/sales-catalog/shared";
import { cn } from "@/lib/utils";

type SalesCatalogMediaGalleryProps = {
  title: string;
  media: SalesCatalogMedia[];
};

const visibleThumbs = 4;

export function SalesCatalogMediaGallery({ title, media }: SalesCatalogMediaGalleryProps) {
  const galleryMedia = useMemo(
    () => media.filter((item) => item.kind === "image" || item.kind === "video"),
    [media],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedActiveIndex = galleryMedia.length > 0 ? Math.min(activeIndex, galleryMedia.length - 1) : 0;
  const activeMedia = galleryMedia[normalizedActiveIndex] ?? null;
  const hiddenThumbs = Math.max(galleryMedia.length - visibleThumbs, 0);

  if (!activeMedia) {
    return (
      <div className="grid min-h-[320px] w-full place-items-center rounded-[20px] border border-black/10 bg-[#f0f0f0] sm:min-h-[520px]">
        <Package className="h-20 w-20 text-black/25" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="grid w-full min-w-0 grid-cols-[54px_minmax(0,1fr)] gap-3 rounded-[20px] border border-black/10 bg-white p-3 shadow-lg shadow-black/5 sm:grid-cols-[72px_minmax(0,1fr)] sm:gap-4 sm:p-4">
      <div className="flex flex-col gap-2">
        {galleryMedia.slice(0, visibleThumbs).map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "relative aspect-square w-full overflow-hidden rounded-[13px] border bg-white transition",
              index === normalizedActiveIndex
                ? "border-black ring-2 ring-black/10"
                : "border-black/10 hover:border-black/30",
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
                sizes="72px"
                className="object-contain p-1"
              />
            ) : (
              <span className="grid h-full w-full place-items-center bg-emerald-50 text-[#128C4A]">
                <PlayCircle className="h-5 w-5" />
              </span>
            )}
          </button>
        ))}

        {hiddenThumbs > 0 ? (
          <button
            type="button"
            onClick={() => setActiveIndex(visibleThumbs)}
            className="grid aspect-square w-full place-items-center rounded-[13px] border border-black/10 bg-[#f0f0f0] text-sm font-black text-black/70 transition hover:border-black/30"
            aria-label={`Ver mais ${hiddenThumbs} midias`}
          >
            +{hiddenThumbs}
          </button>
        ) : null}
      </div>

      <div
        className="relative min-h-[280px] overflow-hidden rounded-[20px] bg-[#f0f0f0] sm:min-h-[520px]"
        data-track-event="sales_catalog_product_gallery_viewed"
        data-track-label={activeMedia.fileName}
      >
        {activeMedia.kind === "video" ? (
          <video
            key={activeMedia.id}
            src={activeMedia.storageUrl}
            className="h-full min-h-[280px] w-full object-contain p-4 sm:min-h-[520px]"
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
            sizes="(max-width: 767px) 78vw, (max-width: 1279px) 48vw, 520px"
            className="object-contain p-5 sm:p-8"
            priority
          />
        )}

        <button
          type="button"
          className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full border border-black/10 bg-white/95 text-slate-950 shadow-lg shadow-black/10"
          aria-label="Ampliar midia"
        >
          <Maximize2 className="h-4 w-4" />
        </button>

        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/80 bg-white/95 px-3 py-1 text-[11px] font-bold text-slate-700 shadow-sm">
          {activeMedia.kind === "video" ? <Video className="h-3.5 w-3.5 text-[#25D366]" /> : <ImageIcon className="h-3.5 w-3.5 text-black" />}
          {normalizedActiveIndex + 1}/{galleryMedia.length}
        </span>

        {galleryMedia.length > 1 ? (
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
            {galleryMedia.map((item, index) => (
              <button
                key={`${item.id}-dot`}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={cn(
                  "h-2.5 w-2.5 rounded-full border border-white transition",
                  index === normalizedActiveIndex ? "bg-black" : "bg-white/85",
                )}
                aria-label={`Ir para midia ${index + 1}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
