"use client";
/* eslint-disable @next/next/no-img-element */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Pause, Play, X } from "lucide-react";
import { showcaseMedia, type ShowcaseMedia } from "./showcase-media";
import { videoContactPath } from "@/lib/marketing/video-service";
import styles from "./motion-showcase.module.css";

type ShowcaseContext = { paused: boolean; open: (media: ShowcaseMedia) => void };
const Context = createContext<ShowcaseContext>({ paused: true, open: () => undefined });

export function MotionShowcaseProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<ShowcaseMedia | null>(null);
  const [activePlayer, setActivePlayer] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const open = useCallback((media: ShowcaseMedia) => setSelected(media), []);
  useEffect(() => {
    const onPlayer = (event: Event) => setActivePlayer(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener("connecty-video-player", onPlayer);
    return () => window.removeEventListener("connecty-video-player", onPlayer);
  }, []);
  useEffect(() => {
    if (selected) {
      document.querySelectorAll<HTMLVideoElement>("main video:not([data-preview-loop])").forEach(video => video.pause());
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [selected]);
  return <Context.Provider value={{ paused: paused || Boolean(selected) || activePlayer, open }}>
    {children}
    <div className={styles.motionControl}><button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={12}/> : <Pause size={12}/>} {paused ? "Reproduzir prévias" : "Pausar prévias"}</button><span>Referências visuais: <a href="https://kairogen.ai/" target="_blank" rel="noopener noreferrer">Kairogen</a> e criadores identificados nos vídeos.</span></div>
    <dialog ref={dialog} className={styles.dialog} onCancel={() => setSelected(null)} onClose={() => setSelected(null)} onClick={e => { if (e.target === e.currentTarget) setSelected(null); }} aria-label={selected ? `Referência de ${selected.label}` : "Referência de vídeo"}>
      {selected && <div><header><div><span>REFERÊNCIA VISUAL</span><h3>{selected.label}</h3></div><button type="button" autoFocus aria-label="Fechar referência" onClick={() => setSelected(null)}><X size={22}/></button></header>
        <video key={selected.id} src={selected.src} poster={selected.poster} controls autoPlay playsInline preload="none" aria-label={`Vídeo de referência: ${selected.label}`}/>
        <footer><a href={selected.source} target="_blank" rel="noopener noreferrer">Fonte · {selected.author}<ArrowUpRight size={13}/></a><a href={`${videoContactPath}?estilo=${selected.interest}`} rel="nofollow">Conversar sobre esse estilo<ArrowUpRight size={15}/></a></footer>
      </div>}
    </dialog>
  </Context.Provider>;
}

function Clip({ media, eager = false, className = "" }: { media: ShowcaseMedia; eager?: boolean; className?: string }) {
  const { paused, open } = useContext(Context);
  const target = useRef<HTMLButtonElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const change = () => setAutomatic(!preference.matches && !connection?.saveData);
    change(); preference.addEventListener("change", change);
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setLoaded(true);
    }, { threshold: .2 });
    if (target.current) observer.observe(target.current);
    return () => { observer.disconnect(); preference.removeEventListener("change", change); };
  }, []);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const update = () => {
      if (visible && automatic && !paused && !document.hidden) void element.play().catch(() => undefined);
      else element.pause();
    };
    update(); document.addEventListener("visibilitychange", update);
    return () => { document.removeEventListener("visibilitychange", update); element.pause(); };
  }, [visible, automatic, paused, loaded]);
  return <button ref={target} type="button" className={`${styles.clip} ${className}`} onClick={() => open(media)} aria-label={`Ver referência: ${media.label}`}>
    <img src={media.poster} alt="" width="360" height="480" loading={eager ? "eager" : "lazy"}/>
    {loaded && automatic && !failed && <video ref={video} data-preview-loop src={media.src} muted loop playsInline preload="none" poster={media.poster} aria-hidden="true" tabIndex={-1} onError={() => setFailed(true)}/>}
    <span className={styles.clipPlay}><Play size={13} fill="currentColor"/></span>
    <span className={styles.clipCaption}><small>{media.category}</small><strong>{media.label}</strong></span>
  </button>;
}

export function HeroVideoRail() {
  return <div className={styles.heroRail} aria-label="Prévia dos estilos de vídeo">{showcaseMedia.slice(0,6).map(media => <Clip key={media.id} media={media} eager/>)}</div>;
}

export function StyleFilmstrip() {
  return <div className={styles.filmstripSection}><div className={styles.styleTags}>{["Apresentações","Anúncios","Produtos","Reels","Histórias","Efeitos visuais","Conteúdo com IA"].map(tag=><span key={tag}>{tag}</span>)}</div><div className={styles.filmstrip} tabIndex={0} role="region" aria-label="Estilos de vídeo: deslize para explorar">{showcaseMedia.slice(0,7).map(media=><Clip media={media} key={media.id}/>)}</div><p className={styles.source}>Referências visuais · <a href="https://kairogen.ai/" target="_blank" rel="noopener noreferrer">Kairogen</a><span>Selecione um vídeo para assistir</span></p></div>;
}

export function AudioShowcase() {
  return <div className={styles.audioGrid}>{showcaseMedia.slice(7).map((media,index)=><article key={media.id}><Clip media={media}/><div><span>0{index+1} / ÁUDIO & IMAGEM</span><h3>{media.label}</h3><p>{[
    "A interpretação e o ritmo da voz ajudam sua mensagem a chegar do jeito certo.",
    "Uma trilha que acompanha a cena, cria atmosfera e sustenta a sua narrativa.",
    "Apresentação, fala e imagem trabalhando juntas para tornar seu conteúdo mais próximo.",
  ][index]}</p></div></article>)}</div>;
}

export function CreativeMosaic({ kind = "people" }: { kind?: "people" | "effects" }) {
  const items = kind === "people" ? [showcaseMedia[0],showcaseMedia[2],showcaseMedia[1],showcaseMedia[4]] : [showcaseMedia[5],showcaseMedia[6],showcaseMedia[3],showcaseMedia[4]];
  return <div className={styles.mosaic}>{items.map(media=><Clip key={media.id} media={media}/>)}</div>;
}
