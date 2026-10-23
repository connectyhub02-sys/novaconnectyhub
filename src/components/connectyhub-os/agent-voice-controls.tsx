'use client';

import { useEffect, useRef, useState } from 'react';
import { interpretations, type SpeechSettings } from '@/lib/voice-api/performance';
import { speechControls } from '@/lib/voice-api/model-controls';
import { newAgentVoiceSettings, type AgentVoiceSettings } from '@/lib/voice/agent-settings';

type Model = { model_id: AgentVoiceSettings['model']; name: string; available: boolean; credits_per_character?: number; minimum_credits?: number };
const number = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const inputClass = 'mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800';

export function AgentVoiceControls({ value, onChange, voiceId, endpoint, scopeId, scopeKey }: {
  value: AgentVoiceSettings | null;
  onChange: (value: AgentVoiceSettings | null) => void;
  voiceId: string;
  endpoint: string;
  scopeId: string;
  scopeKey: 'companyId' | 'sectorId';
}) {
  const [models, setModels] = useState<Model[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [text, setText] = useState('Olá! Vou te explicar com calma e ajudar a encontrar a melhor opção para você.');
  const [quote, setQuote] = useState<{ key: string; credits: number } | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [result, setResult] = useState<{ key: string; audioUrl: string; credits: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestKey = useRef<{ input: string; id: string } | null>(null);
  const url = `${endpoint}/settings?${scopeKey}=${encodeURIComponent(scopeId)}`;
  const key = JSON.stringify([url, voiceId, value, text]);
  const currentKey = useRef(key);
  useEffect(() => { currentKey.current = key; }, [key]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível carregar os modelos.');
      setModels(data.models); setCatalogError('');
    }).catch(error => { if (!controller.signal.aborted) setCatalogError(error.message); });
    return () => controller.abort();
  }, [url]);

  useEffect(() => {
    if (!value || !voiceId || !text.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(url, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'quote', settings: value, voiceId, text }) })
        .then(async response => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? 'Estimativa indisponível.');
          if (!controller.signal.aborted) { setQuote({ key, credits: data.credits }); setQuoteError(''); }
        }).catch(error => { if (!controller.signal.aborted) setQuoteError(error.message); });
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, url, value, voiceId, text]);

  const model = models.find(model => model.model_id === value?.model);
  const controls = value ? speechControls[value.model] : null;
  const expressive = value?.model === 'eleven_v3';
  const directional = expressive && value.performance.style !== 'natural';
  const currentQuote = quote?.key === key ? quote : null;
  const currentResult = result?.key === key ? result : null;
  function settings(patch: SpeechSettings) { if (value) onChange({ ...value, settings: { ...value.settings, ...patch } }); }

  async function preview() {
    if (!value || !currentQuote || busy) return;
    if (!requestKey.current || requestKey.current.input !== key) requestKey.current = { input: key, id: crypto.randomUUID() };
    setBusy(true); setError('');
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey.current.id }, body: JSON.stringify({ action: 'generate', settings: value, voiceId, text, maxCredits: currentQuote.credits }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'A prévia aguarda confirmação. Reutilize esta solicitação.');
      if (currentKey.current === key) setResult({ key, audioUrl: data.audioUrl, credits: data.credits });
    } catch (error) { if (currentKey.current === key) setError(error instanceof Error ? error.message : 'Não foi possível gerar a prévia.'); }
    finally { setBusy(false); }
  }

  return <div className="mt-4 space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-sm text-slate-700">
    <label className="block font-medium">Modelo de voz
      <select aria-label="Modelo de voz" className={inputClass} value={value?.model ?? ''} onChange={event => {
        const model = event.target.value as AgentVoiceSettings['model'];
        onChange(model ? { ...(value ?? newAgentVoiceSettings(model)), model, performance: model === 'eleven_v3' && value ? value.performance : newAgentVoiceSettings(model).performance } : null);
      }}>
        <option value="">Configuração atual — manter</option>
        {value && !models.some(model => model.model_id === value.model) && <option value={value.model}>{value.model} — verificando disponibilidade</option>}
        {models.map(model => <option key={model.model_id} value={model.model_id} disabled={!model.available}>{model.name}{!model.available ? ' — indisponível' : ''}</option>)}
      </select>
    </label>
    {!value && <p className="text-xs leading-5">Sua voz e os ajustes atuais continuam iguais. Escolha um modelo e salve o comportamento para personalizar as próximas respostas.</p>}
    {catalogError && <p role="alert" className="text-xs text-rose-700">{catalogError}</p>}
    {value && <>
      {model?.available && <p className="text-xs leading-5">Mesmo custo do Estúdio: <strong>{number((model.credits_per_character ?? 0) * 1000)} créditos / mil caracteres</strong>. Mínimo {number(model.minimum_credits ?? 0)} por geração. Sem adicional por estilo ou intensidade.</p>}
      {expressive && <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">Estilo de interpretação
          <select aria-label="Estilo de interpretação" className={inputClass} value={value.performance.style} onChange={event => onChange({ ...value, performance: { ...value.performance, style: event.target.value as AgentVoiceSettings['performance']['style'] } })}>
            {interpretations.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        {directional && <label className="block">Intensidade pretendida
          <select aria-label="Intensidade pretendida" className={inputClass} value={value.performance.intensity} onChange={event => onChange({ ...value, performance: { ...value.performance, intensity: event.target.value as AgentVoiceSettings['performance']['intensity'] } })}>
            <option value="gentle">Suave</option><option value="balanced">Equilibrada</option><option value="strong">Marcante</option>
          </select>
        </label>}
      </div>}
      {expressive && <p className="text-xs leading-5">A interpretação também se aplica às vozes clonadas. Pausas e emoção são orientações, sem duração exata. Ouça a prévia para conferir a voz e a naturalidade.</p>}
      <details className="rounded-lg border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer font-medium">Ajustes avançados</summary>
        <div className="mt-3 space-y-4">
          {!directional && (expressive ? <label className="block">Estabilidade
            <select aria-label="Estabilidade" className={inputClass} value={Number(value.settings.stability ?? .5) < .25 ? 0 : Number(value.settings.stability ?? .5) > .75 ? 1 : .5} onChange={event => settings({ stability: Number(event.target.value) })}>
              <option value={0}>Criativa</option><option value={.5}>Equilibrada</option><option value={1}>Robusta</option>
            </select>
          </label> : <Range label="Estabilidade" value={value.settings.stability ?? .5} onChange={stability => settings({ stability })} />)}
          {directional && <p className="text-xs">A intensidade escolhida acima já define a estabilidade da interpretação.</p>}
          {controls?.speed && <Range label="Velocidade" min={.7} max={1.2} value={value.settings.speed ?? 1} onChange={speed => settings({ speed })} />}
          {controls?.similarity && <Range label="Semelhança com a voz" value={value.settings.similarity_boost ?? .78} onChange={similarity_boost => settings({ similarity_boost })} />}
          {controls?.style && <Range label="Exagero de estilo" value={value.settings.style ?? 0} onChange={style => settings({ style })} />}
          {controls?.speakerBoost && <label className="flex gap-2"><input type="checkbox" checked={value.settings.use_speaker_boost ?? true} onChange={event => settings({ use_speaker_boost: event.target.checked })} />Reforço da voz</label>}
          <p className="text-xs leading-5">Somente ajustes compatíveis com este modelo são aplicados. Semelhança não é uma medição de fidelidade. Valores extremos podem alterar a naturalidade.</p>
        </div>
      </details>
      <label className="block">Frase para ouvir o teste
        <textarea className={inputClass} value={text} maxLength={600} rows={3} onChange={event => setText(event.target.value)} />
      </label>
      <p className="text-xs">{currentQuote ? `Prévia: ${number(currentQuote.credits)} créditos. Inclui os caracteres de interpretação, como no Estúdio.` : quoteError || 'Calculando estimativa…'}</p>
      {!currentResult && <button type="button" onClick={preview} disabled={busy || !currentQuote || !model?.available} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Gerando prévia…' : 'Ouvir teste'}</button>}
      {error && !currentResult && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      {currentResult && <div><audio controls src={currentResult.audioUrl} className="w-full" /><p className="mt-1 text-xs">Consumo: {number(currentResult.credits)} créditos. Reproduzir este áudio novamente não cobra créditos.</p></div>}
      <p className="text-xs leading-5">O teste usa os ajustes desta tela. Para aplicá-los ao atendimento, use Salvar comportamento.</p>
    </>}
  </div>;
}

function Range({ label, value, min = 0, max = 1, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return <label className="block"><span className="flex justify-between gap-2">{label}<span>{number(value)}</span></span><input aria-label={label} className="mt-2 w-full" type="range" min={min} max={max} step={.01} value={value} onChange={event => onChange(Number(event.target.value))} /></label>;
}
