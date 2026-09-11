"use client";

import Image from "next/image";
import { useState } from "react";

export function CatalogImportGallery({ imageUrls, title, onChooseCover }: {
  imageUrls: string[];
  title: string;
  onChooseCover: (url: string) => void;
}) {
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-2" aria-label="Fotos do produto para revisao">
      {imageUrls.map((url, index) => (
        <div key={url} className="shrink-0">
          <CatalogImportImagePreview url={url} title={title} index={index} />
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onChooseCover(url)}
            className="mt-1 w-28 rounded border px-1 py-1 text-[10px] font-semibold disabled:opacity-60"
            style={{ borderColor: "var(--ch-border)", color: "var(--ch-text)" }}
            aria-label={`Usar foto ${index + 1} como capa de ${title}`}
          >
            {index === 0 ? "Foto principal" : "Usar como capa"}
          </button>
        </div>
      ))}
    </div>
  );
}

function CatalogImportImagePreview({ url, title, index }: { url: string; title: string; index: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
      style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface)" }}
      aria-label={`Abrir foto ${index + 1} de ${title}${index === 0 ? ", capa" : ""}`}
    >
      {failed ? (
        <span className="px-2 text-center text-[11px]" style={{ color: "var(--ch-text-muted)" }}>Previa indisponivel. Abrir foto.</span>
      ) : (
        <Image src={url} alt={`${title} - foto ${index + 1}`} fill sizes="112px" className="object-contain" unoptimized onError={() => setFailed(true)} />
      )}
      <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
        {index === 0 ? "Capa" : `Foto ${index + 1}`}
      </span>
    </a>
  );
}

