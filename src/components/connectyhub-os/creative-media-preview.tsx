"use client";
import { useState } from "react";

export function CreativeMediaPreview({ url, contentType, name, text, pending = false }: {
  url: string; contentType: string; name: string; text?: string; pending?: boolean;
}) {
  const [surface, setSurface] = useState("feed");
  const [failed, setFailed] = useState(false);
  const video = contentType.startsWith("video/");
  return <section aria-label={`Prévia de ${name}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-medium">Prévia do criativo</span>
      <select aria-label="Formato da prévia" value={surface} onChange={e => setSurface(e.target.value)} className="rounded-lg border bg-white px-2 py-1 text-xs">
        <option value="feed">Facebook / Instagram · Feed</option><option value="stories">Facebook / Instagram · Stories</option>
        {video && <option value="reels">Facebook / Instagram · Reels</option>}
      </select>
    </div>
    <div className={`mx-auto mt-3 overflow-hidden rounded-xl bg-slate-900 ${surface === "feed" ? "aspect-square max-w-64" : "aspect-[9/16] max-w-48"}`}>
      {failed ? <p role="alert" className="p-4 text-sm text-white">Não foi possível carregar esta mídia. Confira o arquivo antes de aprovar.</p>
        : video ? <video src={url} controls preload="metadata" playsInline onError={() => setFailed(true)} className="h-full w-full object-contain" aria-label={`Vídeo: ${name}`} />
          // Original aspect ratio is preserved: this is not a promise of Meta's final crop.
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={url} alt={name} onError={() => setFailed(true)} className="h-full w-full object-contain" />}
    </div>
    <p className="mt-2 truncate text-xs text-slate-600" title={name}>{name}{pending ? " · Enviando arquivo…" : ""}</p>
    {text && <p className="mt-2 whitespace-pre-wrap text-sm">{text}</p>}
    <p className="mt-2 text-xs text-slate-500">Simulação de formato, sem recortar o original. Os posicionamentos e o corte final serão validados antes da criação na Meta.</p>
  </section>;
}
