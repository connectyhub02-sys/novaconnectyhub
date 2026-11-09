"use client";
/* Native publisher thumbnails are intentionally used without proxying/copying third-party media. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Play, X } from "lucide-react";
import { videoExamples } from "./video-examples";
import { videoContactPath } from "@/lib/marketing/video-service";
import styles from "./video-services.module.css";

export function VslPlayer({ mediaBase }: { mediaBase: string }) {
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  return <div className={styles.vslFrame} id="filme">
    <div className={styles.playerTop}><span><i/> CONNECTYHUB ORIGINAL</span><span>01:30 · PRODUÇÃO & EDIÇÃO</span></div>
    <div className={styles.vslScreen}>
      {started ? <video controls autoPlay playsInline preload="none" poster={`${mediaBase}/vsl-poster.webp`} onPlay={() => window.dispatchEvent(new CustomEvent("connecty-video-player", { detail: true }))} onPause={() => window.dispatchEvent(new CustomEvent("connecty-video-player", { detail: false }))} onEnded={() => window.dispatchEvent(new CustomEvent("connecty-video-player", { detail: false }))} onError={() => setFailed(true)} aria-label="Apresentação da produção de vídeos ConnectyHub">
        <source src={`${mediaBase}/vsl-720.mp4`} media="(max-width: 767px)" type="video/mp4"/>
        <source src={`${mediaBase}/vsl-1080.mp4`} type="video/mp4"/>
        Seu navegador não suporta vídeo. <a href={`${mediaBase}/vsl-1080.mp4`}>Abrir apresentação</a>
      </video> : <button type="button" className={styles.videoCover} onClick={() => setStarted(true)} aria-label="Assistir à apresentação da ConnectyHub, 90 segundos">
        <img src={`${mediaBase}/vsl-poster.webp`} alt="Magno apresenta a produção de vídeos da ConnectyHub" width="1280" height="720" fetchPriority="high"/>
        <span className={styles.playCircle}><Play size={27} fill="currentColor"/></span>
        <span className={styles.playLabel}>Dê play no seu próximo passo <span>Conheça nossa produção em 90 segundos</span></span>
      </button>}
    </div>
    {failed && <p className={styles.playerError}>Não foi possível reproduzir aqui. <a href={`${mediaBase}/vsl-1080.mp4`}>Abrir o vídeo</a></p>}
    <div className={styles.playerBottom}><span>Você grava. A gente transforma.</span><span>16:9 <b>HD</b></span></div>
  </div>;
}

export function VideoExamples() {
  const [selected, setSelected] = useState<(typeof videoExamples)[number] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selected) {
      document.querySelectorAll<HTMLVideoElement>("video:not([data-preview-loop])").forEach(video => video.pause());
      dialog.current?.showModal();
    } else dialog.current?.close();
    window.dispatchEvent(new CustomEvent("connecty-video-player", { detail: Boolean(selected) }));
    return () => { window.dispatchEvent(new CustomEvent("connecty-video-player", { detail: false })); };
  }, [selected]);
  return <>
    <div className={styles.examplesGrid}>
      {videoExamples.map(example => <article className={styles.exampleCard} key={example.id}>
        <button type="button" className={styles.exampleCover} onClick={() => setSelected(example)} aria-label={`Assistir referência: ${example.title}`}>
          <img src={example.poster} alt={`Referência visual de ${example.author}`} width="640" height="360" loading="lazy" referrerPolicy="no-referrer"/>
          <span className={styles.exampleNumber}>{example.number}</span><span className={styles.examplePlay}><Play size={20} fill="currentColor"/></span>
          <span className={styles.exampleType}>{example.type}</span>
        </button>
        <div className={styles.exampleBody}><p className={styles.kicker}>{example.category}</p><h3>{example.title}</h3><p>{example.description}</p>
          <div className={styles.exampleFooter}><a href={example.source} target="_blank" rel="noopener noreferrer">Referência · {example.author}<ArrowUpRight size={12}/></a><a href={`${videoContactPath}?estilo=${example.id}`} rel="nofollow" aria-label={`Conversar sobre ${example.category.toLowerCase()}`}><ArrowUpRight size={22}/></a></div>
        </div>
      </article>)}
    </div>
    <dialog ref={dialog} className={styles.videoDialog} onCancel={() => setSelected(null)} onClose={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) setSelected(null); }} aria-label={selected ? `Referência: ${selected.title}` : "Vídeo de referência"}>
      {selected && <div className={styles.dialogContent}>
        <div className={styles.dialogHeader}><div><p>REFERÊNCIA DE ESTILO</p><h3>{selected.title}</h3></div><button type="button" autoFocus onClick={() => setSelected(null)} aria-label="Fechar vídeo"><X size={24}/></button></div>
        <iframe src={selected.embed} title={`Referência de ${selected.author}`} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/>
        <div className={styles.dialogFooter}><a href={selected.source} target="_blank" rel="noopener noreferrer">Abrir na fonte · {selected.author}<ArrowUpRight size={14}/></a><a href={`${videoContactPath}?estilo=${selected.id}`} rel="nofollow">Quero conversar sobre esse estilo <ArrowUpRight size={17}/></a></div>
      </div>}
    </dialog>
  </>;
}
