/** Shared, deterministic speech direction. No provider calls or text rewriting. */
export const speechCapabilities = {
  eleven_multilingual_v2: { timedPauses: true, emotions: false, speakerBoost: true, language: false },
  eleven_flash_v2_5: { timedPauses: true, emotions: false, speakerBoost: true, language: true },
  eleven_turbo_v2_5: { timedPauses: true, emotions: false, speakerBoost: true, language: true },
  eleven_v3: { timedPauses: false, emotions: true, speakerBoost: false, language: true },
} as const;
export const interpretations = [
  { id: 'natural', label: 'Natural', tag: '' },
  { id: 'narrator', label: 'Narrador', tag: '[narration delivery]' },
  { id: 'story', label: 'Contador de histórias', tag: '[storytelling]' },
  { id: 'sales', label: 'Vendedor consultivo', tag: '[confident] [warmly]' },
  { id: 'advertising', label: 'Publicitário', tag: '[excited]' },
  { id: 'cinematic', label: 'Dramático / cinematográfico', tag: '[dramatic]' },
] as const;
export type Performance = { style: typeof interpretations[number]['id']; intensity: 'gentle' | 'balanced' | 'strong'; preview: boolean };
export type SpeechSettings = { stability?: number; similarity_boost?: number; style?: number; speed?: number; use_speaker_boost?: boolean };
export type SpeechScript = { text: string; voice_id: string; model_id: string; voice_settings?: SpeechSettings; language_code?: string; dictionary_ids?: string[]; performance: Performance };
export const defaultPerformance: Performance = { style: 'natural', intensity: 'balanced', preview: false };
export const directionMarkers = [
  { label: 'Pausa · 0,5 s', tag: '<break time="0.5s" />', kind: 'timed' },
  { label: 'Pausa · 1 s', tag: '<break time="1s" />', kind: 'timed' },
  { label: 'Pausa · 2 s', tag: '<break time="2s" />', kind: 'timed' },
  { label: 'Pausa · 3 s', tag: '<break time="3s" />', kind: 'timed' },
  { label: 'Pausa curta', tag: '[short pause]', kind: 'pause' },
  { label: 'Pausa longa', tag: '[long pause]', kind: 'pause' },
  { label: 'Sussurrar', tag: '[whispers]', kind: 'emotion' },
  { label: 'Animado', tag: '[excited]', kind: 'emotion' },
  { label: 'Curioso', tag: '[curious]', kind: 'emotion' },
  { label: 'Triste', tag: '[sad]', kind: 'emotion' },
  { label: 'Rir', tag: '[laughs]', kind: 'reaction' },
  { label: 'Suspirar', tag: '[sighs]', kind: 'reaction' },
  { label: 'Expirar', tag: '[exhales]', kind: 'reaction' },
] as const;
export const markerText = (label: string) => `⟦${label}⟧`;
export const normalizeSpeech = (text: string) => text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
export function parsePerformance(raw: unknown): Performance {
  if (raw === undefined) return { ...defaultPerformance };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Interpretação inválida.');
  const p = raw as Record<string, unknown>;
  if (Object.keys(p).some(k => !['style', 'intensity', 'preview'].includes(k)) || !interpretations.some(s => s.id === p.style)
    || !['gentle', 'balanced', 'strong'].includes(String(p.intensity)) || typeof p.preview !== 'boolean') throw new Error('Interpretação inválida.');
  return p as Performance;
}
export function performancePrefix(performance: Performance) {
  return interpretations.find(s => s.id === performance.style)!.tag;
}
export function prepareSpeech(source: string, model: string, settings: SpeechSettings = {}, rawPerformance?: unknown) {
  const capabilities = speechCapabilities[model as keyof typeof speechCapabilities];
  if (!capabilities) throw new Error('Modelo de fala não suportado.');
  const performance = parsePerformance(rawPerformance);
  if (performance.style !== 'natural' && !capabilities.emotions) throw new Error('Este estilo precisa de Voz Expressiva v3. Troque o modelo ou escolha Natural.');
  let text = normalizeSpeech(source).replace(/⟦([^⟦⟧]+)⟧/g, (_, label: string) => {
    const marker = directionMarkers.find(m => m.label === label);
    if (!marker) throw new Error(`Marcação desconhecida: ${label}.`);
    return marker.tag;
  });
  if (/[⟦⟧]/.test(text)) throw new Error('Há uma marcação incompleta no texto. Edite ou remova antes de gerar.');
  const breaks = text.match(/<break\b[^>]*>/gi) ?? [];
  if (breaks.length && !capabilities.timedPauses) throw new Error('Este modelo usa pausas expressivas. Remova as pausas em segundos ou troque o modelo.');
  for (const tag of breaks) {
    const match = tag.match(/^<break\s+time=["'](\d+(?:\.\d+)?)s["']\s*\/>$/i);
    if (!match || Number(match[1]) <= 0 || Number(match[1]) > 3) throw new Error('Pausas devem ter duração maior que zero e até 3 segundos.');
  }
  if (/<\/?break\b/i.test(text.replace(/<break\b[^>]*>/gi, ''))) throw new Error('Tag de pausa incompleta.');
  if (!capabilities.emotions && /\[[^\]\n]+\]/.test(text)) throw new Error('Marcações entre colchetes precisam de Voz Expressiva v3.');
  if (!text.replace(/<break\b[^>]*>|\[[^\]]*\]/g, '').trim()) throw new Error('Escreva um trecho de fala além das marcações.');
  const voiceSettings = { ...settings };
  if (!capabilities.speakerBoost) delete voiceSettings.use_speaker_boost;
  if (capabilities.emotions && voiceSettings.stability !== undefined && ![0, 0.5, 1].includes(voiceSettings.stability)) throw new Error('Estabilidade do v3: escolha 0, 0,5 ou 1.');
  if (performance.style !== 'natural') {
    voiceSettings.stability = performance.intensity === 'gentle' ? 1 : performance.intensity === 'strong' ? 0 : 0.5;
    text = `${performancePrefix(performance)} ${text}`;
  }
  return { text, voiceSettings, performance };
}

/** Never cut a markup token while choosing an automatic preview. */
export function previewExcerpt(source: string, start = 0, end = 0, limit = 600) {
  const selected = end > start;
  const value = (selected ? source.slice(start, end) : source).trim();
  if (selected && value.length > limit) throw new Error(`Selecione até ${limit} caracteres para a prévia.`);
  if (selected) {
    for (const match of source.matchAll(/⟦[^⟧]*⟧|<[^>]*>|\[[^\]]*\]/g)) {
      const a = match.index!, b = a + match[0].length;
      if ((start > a && start < b) || (end > a && end < b)) throw new Error('Selecione a marcação inteira junto com o trecho.');
    }
    return value;
  }
  if (value.length <= limit) return value;
  let cut = value.lastIndexOf(' ', limit);
  if (cut < 1) cut = limit;
  for (const match of value.matchAll(/⟦[^⟧]*⟧|<[^>]*>|\[[^\]]*\]/g)) if (match.index! < cut && match.index! + match[0].length > cut) cut = match.index!;
  return value.slice(0, cut).trim();
}

/** Atomic tags, preserved paragraphs and bounded chunks; no sentence split inside 1.5s. */
export function splitSpeechText(text:string,limit:number,prefix='') {
  const body=prefix?text.slice(prefix.length+1):text;
  const budget=limit-(prefix?prefix.length+1:0);
  if(budget<1)throw new Error('Limite de trecho inválido.');
  const parts:string[]=[];let current='';
  const flush=()=>{if(current.trim())parts.push((prefix?prefix+' ':'')+current.trim());current='';};
  const tokens=body.match(/<break\b[^>]*>|\[[^\]]*\]|\s+|[^\s<\[]+|[\s\S]/g)??[];
  for(const token of tokens){
    if(/^\s+$/.test(token)){if(current)current+=token;continue;}
    if(token.length>budget){
      if(/^(<break|\[)/.test(token))throw new Error('Marcação longa demais.');
      flush();for(let i=0;i<token.length;i+=budget){current=token.slice(i,i+budget);if(current.length===budget)flush();}continue;
    }
    if(current.length+token.length>budget)flush();
    current+=token;
  }
  flush();return parts;
}
