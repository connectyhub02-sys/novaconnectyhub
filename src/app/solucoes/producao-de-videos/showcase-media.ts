// Public demonstration clips from the visual reference, checked 2026-11-08.
// Embedded in place from the publisher; not downloaded or presented as our work.
const root = "https://kairogen.ai/images/landing/multimodelo/v2";
export const showcaseMedia = [
  { id: "portrait", asset: "nano-banana-2-1", label: "Apresentação", category: "Pessoas & marcas", interest: "apresentador" },
  { id: "fitness", asset: "seedance-2-5", label: "Lifestyle", category: "Campanhas & movimento", interest: "ia" },
  { id: "creator", asset: "veo-3-1", label: "Conteúdo social", category: "Reels & anúncios", interest: "apresentador" },
  { id: "detail", asset: "kling-4-0", label: "Cinema", category: "Universo visual", interest: "ia" },
  { id: "animation", asset: "wan-3-0", label: "Animação", category: "Personagens & histórias", interest: "especial" },
  { id: "wings", asset: "fx-asas", label: "Transformações", category: "Efeitos visuais", interest: "especial" },
  { id: "camera", asset: "fx-bullet-time", label: "Câmera em movimento", category: "Cenas com impacto", interest: "especial" },
  { id: "voice", asset: "audio-narracao", label: "Narração", category: "Uma voz para sua ideia", interest: "ia" },
  { id: "music", asset: "audio-jingle", label: "Trilha & atmosfera", category: "Música em cena", interest: "especial" },
  { id: "dubbing", asset: "audio-dublagem", label: "Voz & apresentação", category: "Conteúdo que conversa", interest: "apresentador" },
].map(item => ({ ...item, src: `${root}/${item.asset}.mp4`, poster: `${root}/${item.asset}.webp`, source: "https://kairogen.ai/", author: "Kairogen" }));
export type ShowcaseMedia = (typeof showcaseMedia)[number];
