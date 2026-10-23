'use client';

import { useEffect, useState } from 'react';
import { newAgentEffects, type AgentEffects } from '@/lib/voice/agent-effects';
import { effectLabels } from '@/lib/voice-api/effect-labels';
import type { EffectsCatalog, SpeechEffects } from '@/lib/voice-api/speech-options';

const field = 'mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm';
export function AgentVoiceEffects({ value, onChange, url, resolved, onSample, busy }: {
  value: AgentEffects | undefined; onChange: (value: AgentEffects) => void; url: string;
  resolved?: SpeechEffects; onSample: () => void; busy: boolean;
}) {
  const config = value ?? newAgentEffects();
  const [catalog, setCatalog] = useState<EffectsCatalog | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!config.enabled) return;
    const controller = new AbortController();
    fetch(`${url}&catalog=effects`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Catálogo indisponível.');
      if (!controller.signal.aborted) { setCatalog(data); setError(''); }
    }).catch(error => { if (!controller.signal.aborted) { setCatalog(null); setError(error.message); } });
    return () => controller.abort();
  }, [url, config.enabled, revision]);
  const change = (patch: Partial<AgentEffects>) => onChange({ ...config, ...patch });
  function audio(key: keyof SpeechEffects, next: string | number) {
    const updated = { ...config.audio };
    if (next === '') delete updated[key]; else Object.assign(updated, { [key]: next });
    change({ audio: updated });
  }
  const automatic = config.environmentMode === 'auto' || config.backgroundMode === 'auto';
  const label = (id: string) => effectLabels[id] ?? catalog?.environments.find(e => e.environment_id === id)?.name ?? catalog?.background_noises.find(e => e.background_noise_id === id)?.name ?? catalog?.filter_presets.find(e => e.filter_preset_id === id)?.name ?? id;
  const selected = resolved ? [resolved.filter_preset_id, resolved.environment_id, resolved.background_noise_id].filter((id): id is string => Boolean(id)).map(label) : [];

  return <details className="rounded-lg border border-slate-200 bg-white p-3">
    <summary className="cursor-pointer font-medium">Efeitos e ambiente · {config.enabled ? 'ativados no rascunho' : 'desligados'}</summary>
    <div className="mt-3 space-y-4">
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={config.enabled} onChange={e => change({ enabled: e.target.checked })} />Usar efeitos nesta voz</label>
      <p className="text-xs leading-5">Os efeitos só entram no atendimento após salvar o comportamento. Desligar preserva suas escolhas. Mesmo custo do Estúdio, sem adicional por efeitos ou seleção automática.</p>
      {config.enabled && <>
        {error && <p role="alert" className="text-xs text-rose-700">{error} <button type="button" className="underline" onClick={() => { setCatalog(null); setError(''); setRevision(n => n + 1); }}>Recarregar efeitos</button></p>}
        {!catalog && !error && <p className="text-xs">Carregando efeitos…</p>}
        {catalog && <>
          <label className="block">Filtro<select aria-label="Filtro" className={field} value={config.audio.filter_preset_id ?? ''} onChange={e => audio('filter_preset_id', e.target.value)}>
            <option value="">Nenhum</option>
            {config.audio.filter_preset_id && !catalog.filter_presets.some(f => f.filter_preset_id === config.audio.filter_preset_id) && <option value={config.audio.filter_preset_id}>Filtro salvo indisponível</option>}
            {catalog.filter_presets.map(f => <option key={f.filter_preset_id} value={f.filter_preset_id}>{label(f.filter_preset_id)}</option>)}
          </select></label>
          <p className="text-xs">O filtro altera a textura do som e pode reduzir a semelhança da voz clonada. Não muda o estilo de interpretação.</p>
          {(['environment', 'background'] as const).map(group => {
            const environment = group === 'environment';
            const title = environment ? 'Ambiente' : 'Som de fundo';
            const modeKey = environment ? 'environmentMode' : 'backgroundMode';
            const idsKey = environment ? 'environmentIds' : 'backgroundIds';
            const audioKey = environment ? 'environment_id' : 'background_noise_id';
            const items = environment ? catalog.environments.map(e => e.environment_id) : catalog.background_noises.map(e => e.background_noise_id);
            const mode = config[modeKey];
            return <div key={group} className="space-y-2 rounded-lg border border-slate-200 p-3">
              <label className="block">{title}<select aria-label={`${title}: seleção`} className={field} value={mode} onChange={e => change({ [modeKey]: e.target.value })}>
                <option value="off">Desligado</option><option value="fixed">Escolher um fixo</option><option value="auto">Seleção automática</option>
              </select></label>
              <p className="text-xs leading-5">{environment ? 'Simula a acústica do espaço. Ajuste a reverberação para preservar a clareza da voz.' : 'Acrescenta um fundo contínuo do catálogo ao áudio. Não gera música nem sons personalizados.'}</p>
              {mode === 'fixed' && <label className="block">{title} fixo<select aria-label={`${title} fixo`} className={field} value={config.audio[audioKey] ?? ''} onChange={e => audio(audioKey, e.target.value)}>
                <option value="">Selecione…</option>
                {config.audio[audioKey] && !items.includes(config.audio[audioKey]!) && <option value={config.audio[audioKey]}>Opção salva indisponível</option>}
                {items.map(id => <option key={id} value={id}>{label(id)}</option>)}
              </select></label>}
              {mode === 'auto' && <fieldset className="space-y-2"><legend className="mb-2 text-xs font-medium">Opções permitidas — selecione uma ou mais</legend>
                {[...new Set([...items, ...config[idsKey]])].map(id => <label key={id} className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={config[idsKey].includes(id)} onChange={e => change({ [idsKey]: e.target.checked ? [...config[idsKey], id] : config[idsKey].filter(v => v !== id) })} />{label(id)}{!items.includes(id) ? ' — indisponível; desmarque' : ''}</label>)}
                {!config[idsKey].length && <p className="text-xs text-amber-800">Escolha pelo menos uma opção antes de gerar.</p>}
              </fieldset>}
            </div>;
          })}
          {automatic && <div className="space-y-3">
            <label className="block">Quando variar<select aria-label="Quando variar" className={field} value={config.frequency} onChange={e => change({ frequency: e.target.value as AgentEffects['frequency'] })}>
              <option value="conversation">Por conversa — recomendado</option><option value="period">Por período do dia — a cada 6 horas</option><option value="audio">A cada resposta em áudio</option>
            </select></label>
            {config.frequency === 'period' && <label className="block">Fuso dos períodos<select aria-label="Fuso dos períodos" className={field} value={config.timeZone} onChange={e => change({ timeZone: e.target.value })}>
              {[...new Set([config.timeZone, 'UTC', ...Intl.supportedValuesOf('timeZone')])].sort().map(zone => <option key={zone} value={zone}>{zone}</option>)}
            </select><span className="text-xs">Períodos: 00–06h, 06–12h, 12–18h e 18–24h.</span></label>}
            <p className="text-xs leading-5">O automático sorteia somente entre as opções marcadas; uma escolha pode se repetir. Partes da mesma resposta mantêm a combinação. Ambientação sonora não indica a localização física do agente.</p>
          </div>}
          <EffectRange label="Distância do microfone" value={config.audio.distance ?? 0} onChange={v => audio('distance', v)} />
          {config.environmentMode !== 'off' && <EffectRange label="Reverberação" value={config.audio.send_level ?? 1} onChange={v => audio('send_level', v)} />}
          <EffectRange label="Posição estéreo" value={config.audio.pan ?? 0} min={-1} onChange={v => audio('pan', v)} />
          <p className="text-xs leading-5">A distância é simulada. A posição estéreo pode ser reduzida na conversão do WhatsApp. O volume do fundo segue o efeito do catálogo, sem ajuste independente.</p>
        </>}
        {selected.length > 0 && <p className="text-xs leading-5">Combinação da prévia: <strong>{selected.join(' · ')}</strong>.</p>}
        {automatic && <button type="button" disabled={busy || !catalog} onClick={onSample} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 disabled:opacity-50">Sortear combinação para a prévia</button>}
        {automatic && <p className="text-xs">Sortear não gera áudio nem consome créditos. Use Ouvir teste para gerar a combinação exibida.</p>}
      </>}
    </div>
  </details>;
}

function EffectRange({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return <label className="block">{label} <span className="text-xs">{min === -1 ? (value === 0 ? 'Centro' : `${Math.round(Math.abs(value) * 100)}% à ${value < 0 ? 'esquerda' : 'direita'}`) : `${Math.round(value * 100)}%`}</span><input aria-label={label} className="mt-2 w-full" type="range" min={min} max={1} step={.1} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}
