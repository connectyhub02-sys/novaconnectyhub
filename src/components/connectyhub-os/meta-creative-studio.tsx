"use client";
import { useCallback, useEffect, useState } from "react";
import { Sparkles, Upload, Download, Loader2, RefreshCw } from "lucide-react";
import { creativeMediaIds, type CreativeMode, type CreativeReport, type CreativeBrief } from "@/lib/meta/creative-policy";
import { CreativeMediaPreview } from "./creative-media-preview";
import { MetaTrendResearch } from "./meta-trend-research";
import { MetaCampaignLaunch } from "./meta-campaign-launch";
type Media = { id: string; fileName: string; storageUrl: string; contentType: string };
type Job = { proposal_approval?: { approvedAt: string; scope: string } | null; id: string; mode: CreativeMode; status: string; brief: CreativeBrief; result: CreativeReport | null; charge_credits: number | null; created_at: string; error_message: string | null };
const field = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900";
const button = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:opacity-50";
export function MetaCreativeStudio({ companyId, accountCurrency }: { companyId?: string; accountCurrency?: string | null }) {
  const [opened, setOpened] = useState(false), [mode, setMode] = useState<CreativeMode>("analysis");
  const [media, setMedia] = useState<Media[]>([]), [mediaId, setMediaId] = useState("");
  const [extraMediaIds,setExtraMediaIds]=useState<string[]>([]),[products,setProducts]=useState<{id:string;title:string}[]>([]),[productId,setProductId]=useState(""),[sourceAnalysisId,setSourceAnalysisId]=useState<string|null>(null);
  const [prompt, setPrompt] = useState(""), [goal, setGoal] = useState(""), [audience, setAudience] = useState(""), [destination, setDestination] = useState("");
  const [budgetMode, setBudgetMode] = useState("CBO"), [budget, setBudget] = useState(""), [adCount, setAdCount] = useState(3), [analyze, setAnalyze] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]), [selected, setSelected] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [drafted, setDrafted] = useState<string[]>([]);
  const [currency, setCurrency] = useState("");
  const [assistance, setAssistance] = useState<"automatic" | "guided">("automatic");
  const [localPreview, setLocalPreview] = useState<Media | null>(null);
  const [approvalCheck, setApprovalCheck] = useState(false);
  const [tariffs,setTariffs]=useState<{feature:string;inputPerThousand:number;outputPerThousand:number;perMedia:number;minimum:number}[]>([]);
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview.storageUrl); }, [localPreview]);
  const automatic = mode === "campaign" && assistance === "automatic";
  const proposalCurrency = currency || (["BRL", "USD", "EUR"].includes(accountCurrency || "") ? accountCurrency! : "");
  const suffix = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  const load = useCallback(async () => {
    const [r, m] = await Promise.all([fetch(`/api/dashboard/meta-creative${suffix}`, { cache: "no-store" }), fetch(`/api/dashboard/meta-organic${suffix}`, { cache: "no-store" })]);
    const data = await r.json(), assets = await m.json();
    if (!r.ok) throw Error(data.error || "Histórico indisponível.");
    setJobs(data.jobs.filter((j: {mode: string}) => j.mode !== "script")); setTariffs(data.tariffs??[]); setProducts(data.products??[]); if (m.ok) setMedia(assets.overview.media);
  }, [suffix]);
  const current = jobs.find(j => j.id === selected) ?? jobs[0], report = current?.result;
  const selectedMedia = localPreview ?? media.find(m => m.id === mediaId);
  const savedMedia = media.find(m => m.id === current?.brief.mediaId);
  const savedAssets=current?creativeMediaIds(current.brief).map(id=>media.find(m=>m.id===id)).filter((m):m is Media=>Boolean(m)):[];
  async function uploadFiles(files: File[]) {
    if(!files.length)return; if(files.length>10 || (files.length>1&&files.some(f=>!f.type.startsWith("image/")))){setError("Envie até 10 imagens para carrossel, ou um vídeo por vez.");return;}
    setMode("analysis");setSourceAnalysisId(null);setExtraMediaIds([]);
    const uploaded:string[]=[];for(const file of files){const id=await upload(file);if(!id)break;uploaded.push(id);}
    if(uploaded.length){setMediaId(uploaded[0]);setExtraMediaIds(uploaded.slice(1));}
  }
  function paidPath(){if(!current)return;const ids=creativeMediaIds(current.brief);setMediaId(ids[0]||"");setExtraMediaIds(ids.slice(1));setProductId(current.brief.productId||"");setSourceAnalysisId(current.mode==="analysis"?current.id:null);setGoal(current.brief.goal);setAudience(report?.suitability?.audience||current.brief.audience);setMode("campaign");setAnalyze(false);setNotice("Escolha a verba e revise a proposta paga. Gerar a estratégia usa créditos; ativar exige aprovação separada.");}
  async function upload(file?: File) {
    if (!file) return; setBusy(true); setError(""); setMediaId("");
    setLocalPreview({id: "local", storageUrl: URL.createObjectURL(file), contentType: file.type, fileName: file.name});
    try { const form = new FormData(); form.set("file", file);
      const r = await fetch(`/api/dashboard/meta-organic/media${suffix}`, { method: "POST", body: form });
      const d = await r.json(); if (!r.ok) throw Error(d.error || "Upload falhou.");
      setMedia(d.overview.media); setMediaId(d.media.id); setLocalPreview(null); return String(d.media.id);
    } catch (e) { setLocalPreview(null); setError(e instanceof Error ? e.message : "Upload falhou."); } finally { setBusy(false); }
  }
  async function generate() {
    setBusy(true); setError(""); setNotice("");
    try { const id = crypto.randomUUID(); setSelected(id); setApprovalCheck(false);
      const r = await fetch(`/api/dashboard/meta-creative${suffix}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id, mode, mediaId: mediaId || null, mediaIds:mediaId?[mediaId,...extraMediaIds]:[], productId:productId||null, sourceAnalysisId:mode==="campaign"?sourceAnalysisId:null, prompt: automatic ? "" : prompt, goal, audience, destination, budgetMode, dailyBudget: budget || null, currency: proposalCurrency || null, adCount, analyze, assistance }) });
      const d = await r.json(); if (!r.ok) throw Error(d.error || "Análise indisponível."); setJobs(d.jobs.filter((j: {mode: string}) => j.mode !== "script"));
    } catch (e) { setError(e instanceof Error ? e.message : "Confira o histórico antes de repetir."); await load().catch(() => undefined); } finally { setBusy(false); }
  }
  async function approveProposal() {
    if (!current || !approvalCheck) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/dashboard/meta-creative${suffix}`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({action: "approve_proposal", requestId: current.id})});
      const data = await response.json(); if (!response.ok) throw Error(data.error || "Não foi possível aprovar.");
      setJobs(data.jobs); setApprovalCheck(false); setNotice("Proposta aprovada e registrada. Nenhuma campanha foi criada ou ativada na Meta.");
    } catch (e) { setError(e instanceof Error ? e.message : "Confira a aprovação no histórico."); } finally {setBusy(false);}
  }
  async function organicDraft() {
    if (!report || !current) return; const asset = media.find(m => m.id === current.brief.mediaId);
    if (!asset || savedAssets.length!==creativeMediaIds(current.brief).length) { setError("Selecione o arquivo original na biblioteca para preparar a publicação."); return; }
    setBusy(true); setError("");
    try { const r = await fetch(`/api/dashboard/meta-organic${suffix}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_draft", title: report.title, caption: [report.captions.find(c => c.platform.toLowerCase().includes("instagram"))?.text || report.summary,(report.hashtags??[]).join(" ")].filter(Boolean).join("\n\n"),
        format: savedAssets.length>1?"carousel":asset.contentType.startsWith("video/") ? "reel" : "feed", media: savedAssets.map(a=>({ url: a.storageUrl, type: a.contentType.startsWith("video/") ? "video" : "image" })), surfaces: ["facebook_page", "instagram_feed"] }) });
      const d = await r.json(); if (!r.ok) throw Error(d.error || "Não foi possível preparar a publicação.");
      setDrafted(ids => [...ids, current.id]);
      setNotice("Rascunho orgânico criado com legenda e hashtags. Abra Publicações para revisar, escolher as redes e agendar.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao criar rascunho."); } finally { setBusy(false); }
  }
  function download() {
    if (!current?.result) return;
    const r = current.result;
    const text = [`# ${r.title}`, new Date(current.created_at).toLocaleString("pt-BR"), r.summary,
      `Score editorial: ${r.score === null ? "Não atribuído" : `${r.score}/100`}`,
      ...r.criteria.map(c => `## ${c.name} · ${c.score ?? "Sem nota"}\n${c.evidence}\n${c.improvement}`),
      `## Pontos fortes\n${r.strengths.map(x => `- ${x}`).join("\n")}`, `## Melhorias\n${r.improvements.map(x => `- ${x}`).join("\n")}`,
      ...(r.suitability?[`## Orgânico\n${r.suitability.organic.verdict}: ${r.suitability.organic.reason}`,`## Pago\n${r.suitability.paid.verdict}: ${r.suitability.paid.reason}`,`## Público sugerido\n${r.suitability.audience}`]:[]), `Hashtags: ${(r.hashtags??[]).join(" ")}`,
      ...r.captions.map(c => `## Legenda · ${c.platform}\n${c.text}`),
      ...(r.campaign ? [`## Proposta de campanha\n${JSON.stringify(r.campaign, null, 2)}`] : []),
      `## Limitações\n${r.limitations.join("\n")}`, "Diagnóstico editorial por IA. Não garante resultados nem constitui campanha publicada."].join("\n\n");
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const href = URL.createObjectURL(blob), a = document.createElement("a"); a.href = href; a.download = `connectyhub-criativo-${current.id}.md`; a.click(); URL.revokeObjectURL(href);
  }
  return <details className="rounded-2xl border border-blue-200 bg-white text-slate-900" onToggle={e => { if(e.target !== e.currentTarget) return; const open = e.currentTarget.open; setOpened(open); if (open) load().catch(e => setError(e.message)); }}>
    <summary className="flex cursor-pointer items-center gap-3 p-5 font-semibold"><Sparkles size={20} className="text-blue-600"/>Criativos e campanhas com IA<span className="ml-auto text-xs font-normal text-slate-500">1. Criativo · 2. Análise · 3. Destino</span></summary>
    {opened && <div className="space-y-5 border-t border-slate-100 p-5">
      <p className="text-sm text-slate-600">Envie seu criativo, confira a análise e escolha entre orgânico ou pago. A IA utiliza os créditos da sua conta.</p>
      <details className="text-xs text-slate-500"><summary className="cursor-pointer">Como os créditos de IA são cobrados</summary><p className="mt-2">Reservamos créditos antes da geração e cobramos o consumo efetivo uma única vez. Imagens, vídeo e áudio entram nos tokens medidos pelo provedor. O total aparece no histórico. Consultar um resultado salvo não gera nova cobrança.</p>{tariffs.map(t=><p key={t.feature}>{t.feature==="media_video_analysis"?"Análise de vídeo":t.feature==="media_image_analysis"?"Análise de imagem":"Propostas de campanha"}: {t.inputPerThousand.toLocaleString("pt-BR")} créditos / mil tokens de entrada + {t.outputPerThousand.toLocaleString("pt-BR")} / mil de saída{t.perMedia?` + ${t.perMedia.toLocaleString("pt-BR")} por mídia`:""}. Mínimo por solicitação: {t.minimum.toLocaleString("pt-BR")} créditos.</p>)}{!tariffs.length&&<p>As tarifas serão conferidas no servidor antes de gerar. Sem tarifa válida, a geração é bloqueada.</p>}</details>
      <MetaTrendResearch companyId={companyId} onUse={text=>{setMode("analysis");setPrompt(text);setNotice("Pesquisa adicionada como contexto. Selecione seu criativo para analisar.");}}/>
      <p className="text-sm font-semibold">{mode==="analysis"?"1. Envie o criativo · 2. Confira o diagnóstico":"3. Prepare o tráfego pago"}</p>
      {mode==="campaign"&&<button className={button} disabled={busy} onClick={()=>{setMode("analysis");setSourceAnalysisId(null);}}>Voltar à análise do criativo</button>}
      {mode === "campaign" && <fieldset className="rounded-xl bg-blue-50 p-3">
        <legend className="px-1 text-sm font-medium">Como você quer preparar?</legend>
        <div className="flex flex-wrap gap-2">{([["automatic", "Deixar a IA preparar"], ["guided", "Orientar a IA"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={assistance === value} disabled={busy} className={`${button} ${assistance === value ? "bg-blue-600 text-white" : "bg-white"}`} onClick={() => setAssistance(value)}>{label}</button>)}</div>
        <p className="mt-2 text-xs text-slate-600">{automatic ? "Você envia o criativo. A IA sugere a estrutura e os textos para sua revisão." : "Escreva sua estratégia e ajuste a estrutura. A IA prepara a proposta seguindo suas escolhas."}</p>
      </fieldset>}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-sm">Criativo da empresa<select className={field} value={mediaId} disabled={busy} onChange={e => { setMediaId(e.target.value); setExtraMediaIds([]);setSourceAnalysisId(null);setLocalPreview(null); }}><option value="">{mode === "analysis" || automatic ? "Selecione ou envie um arquivo" : "Selecione ou envie um arquivo"}</option>{media.map(m => <option key={m.id} value={m.id}>{m.fileName}</option>)}</select></label>
          <label className={`${button} cursor-pointer`}><Upload size={16}/>Enviar foto, carrossel ou vídeo<input aria-label="Enviar criativo para IA" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4" className="sr-only" disabled={busy} onChange={e => { uploadFiles(Array.from(e.target.files??[])); e.target.value = ""; }}/></label>
          {selectedMedia && <CreativeMediaPreview key={selectedMedia.storageUrl} url={selectedMedia.storageUrl} contentType={selectedMedia.contentType} name={selectedMedia.fileName} pending={Boolean(localPreview)}/>}
          {extraMediaIds.map((id,i)=>{const m=media.find(a=>a.id===id);return m&&<details key={id} className="rounded-lg border p-2"><summary>Slide {i+2} · {m.fileName}</summary><CreativeMediaPreview url={m.storageUrl} contentType={m.contentType} name={m.fileName}/></details>;})}
          {mediaId&&media.find(m=>m.id===mediaId)?.contentType.startsWith("image/")&&<label className="block text-sm">Adicionar slide da biblioteca<select aria-label="Adicionar slide do carrossel" className={field} value="" disabled={busy||extraMediaIds.length>=9} onChange={e=>{setExtraMediaIds(ids=>[...ids,e.target.value]);setSourceAnalysisId(null);}}><option value="">Opcional · até 10 imagens na ordem escolhida</option>{media.filter(m=>m.contentType.startsWith("image/")&&m.id!==mediaId&&!extraMediaIds.includes(m.id)).map(m=><option key={m.id} value={m.id}>{m.fileName}</option>)}</select></label>}
          {extraMediaIds.length>0&&<button className={button} disabled={busy} onClick={()=>{setExtraMediaIds([]);setSourceAnalysisId(null);}}>Usar somente a primeira imagem</button>}
          <label className="block text-sm">Produto ou serviço<select className={field} value={productId} disabled={busy} onChange={e=>setProductId(e.target.value)}><option value="">Descrever nas instruções abaixo</option>{products.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
          <p className="text-xs text-slate-500">Imagens até 8 MB; vídeo MP4 até 100 MB. O arquivo será analisado pelo provedor de IA somente ao gerar.</p>
          {!automatic && <label className="block text-sm">Suas instruções<textarea className={field} rows={4} maxLength={6000} value={prompt} disabled={busy} onChange={e => setPrompt(e.target.value)} placeholder={mode === "campaign" ? "Ex.: quero uma campanha CBO com três anúncios. Use este vídeo para apresentar meu produto e explique sua estratégia." : "Ex.: este criativo apresenta meu produto para receber pedidos. Avalie a clareza da oferta."}/></label>}
          <label className="block text-sm">Objetivo<input className={field} maxLength={500} value={goal} disabled={busy} onChange={e => setGoal(e.target.value)} placeholder="Ex.: receber pedidos de orçamento pelo site"/></label>
          <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm">Mais contexto (opcional)</summary><label className="mt-3 block text-sm">Público e contexto do negócio<textarea className={field} rows={2} maxLength={1000} value={audience} disabled={busy} onChange={e => setAudience(e.target.value)} placeholder="Descreva seu produto, região e necessidades do público. Sem dados pessoais de leads."/></label></details>
          {mode === "campaign" && <>{!automatic && <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm">Ajustar estrutura (CBO / ABO)</summary><div className="mt-3 grid grid-cols-2 gap-3"><label className="text-sm">Distribuição da verba<select className={field} value={budgetMode} disabled={busy} onChange={e => setBudgetMode(e.target.value)}><option>CBO</option><option>ABO</option></select></label><label className="text-sm">Número de anúncios<input className={field} type="number" min={1} max={10} value={adCount} disabled={busy} onChange={e => setAdCount(Number(e.target.value))}/></label></div><p className="mt-2 text-xs text-slate-500">CBO: verba na campanha. ABO: verba dividida entre conjuntos. Esses campos prevalecem sobre as instruções.</p></details>}
            <div className="grid grid-cols-2 gap-3"><label className="block text-sm">Quanto pretende investir por dia?<input className={field} type="number" min="0.01" step="0.01" value={budget} disabled={busy} onChange={e => setBudget(e.target.value)} placeholder="Opcional"/></label><label className="block text-sm">Moeda<select className={field} value={proposalCurrency} disabled={busy} onChange={e => setCurrency(e.target.value)}><option value="">Selecione</option><option value="BRL">BRL · Real</option><option value="USD">USD · Dólar</option><option value="EUR">EUR · Euro</option></select></label></div>
            <p className="text-xs text-slate-500">A verba é uma proposta. Nenhum valor será investido nesta etapa.</p>
            <label className="block text-sm">Para onde levar as pessoas? (opcional)<input className={field} type="url" value={destination} disabled={busy} onChange={e => setDestination(e.target.value)} placeholder="https://..."/></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={analyze} disabled={busy} onChange={e => setAnalyze(e.target.checked)}/>Incluir diagnóstico e score do criativo</label>
</>}
          <button className={`${button} bg-blue-600 font-semibold text-white`} disabled={busy || !mediaId} onClick={generate}>{busy ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>} {busy ? "Processando…" : mode === "campaign" ? "Gerar proposta de campanha" : "Analisar criativo"}</button>
          <p className="text-xs text-slate-500">A nota avalia o conteúdo; não garante viralização, vendas ou aprovação de anúncios. Propostas ficam no histórico e não ativam anúncios.</p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-2"><h3 className="font-semibold">Histórico desta empresa</h3><button aria-label="Atualizar análises" className={`${button} ml-auto`} disabled={busy} onClick={() => load().catch(e => setError(e.message))}><RefreshCw size={15}/></button></div>
          <select aria-label="Análise salva" className={field} value={current?.id || ""} onChange={e => { setSelected(e.target.value); setApprovalCheck(false); }}><option value="" disabled>Nenhuma análise ainda</option>{jobs.map(j => <option value={j.id} key={j.id}>{new Date(j.created_at).toLocaleString("pt-BR")} · {j.result?.title || j.mode} · {j.status === "completed" ? "Concluída" : j.status === "running" ? "Processando" : j.status === "failed" ? "Não concluída" : "Em conferência"}</option>)}</select>
          {current && !report && <p className="rounded-xl bg-amber-50 p-3 text-sm">{current.error_message || "Análise em processamento. Atualize o histórico para acompanhar; não é necessário enviar novamente."}</p>}
          {report && <article className="space-y-4 rounded-xl border border-slate-200 p-4">
            <div className="flex justify-between gap-4"><h3 className="font-semibold">{report.title}</h3>{report.score !== null && <span className="shrink-0 text-2xl font-bold text-blue-600">{report.score}<small className="text-sm">/100</small></span>}</div>
            <p className="text-sm">{report.summary}</p>
            {savedMedia && <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium">Conferir criativo desta proposta</summary><div className="mt-3 space-y-3">{savedAssets.map((m,i)=><div key={m.id}><p className="text-xs">{savedAssets.length>1?`Slide ${i+1}`:"Criativo"}</p><CreativeMediaPreview url={m.storageUrl} contentType={m.contentType} name={m.fileName}/></div>)}</div></details>}
            {report.suitability&&<div className="grid gap-2 sm:grid-cols-2">{(["organic","paid"] as const).map(channel=><div key={channel} className="rounded-lg bg-slate-50 p-3 text-sm"><strong>{channel==="organic"?"Orgânico":"Pago"} · {({adequado:"Boa adequação",ajustar:"Melhorar antes",insuficiente:"Falta evidência"} as Record<string,string>)[report.suitability![channel].verdict]}</strong><p>{report.suitability![channel].reason}</p></div>)}<p className="text-xs sm:col-span-2">{report.suitability.productFit} A nota orienta; você pode seguir mesmo com nota baixa.</p></div>}
            <div className="flex flex-wrap gap-2"><button className={`${button} bg-blue-600 text-white`} disabled={busy||drafted.includes(current.id)} onClick={organicDraft}>{drafted.includes(current.id)?"Rascunho orgânico preparado":"Usar no orgânico"}</button>{current.mode==="analysis"&&<button className={button} disabled={busy} onClick={paidPath}>Preparar tráfego pago</button>}</div>
            {drafted.includes(current.id)&&<a className="text-sm text-blue-600 underline" href={companyId?"/admin/meta/publicacoes":"/dashboard/trafego-organico"}>Abrir Publicações e calendário</a>}
            <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium">Ver diagnóstico e melhorias</summary><div className="mt-3 space-y-3">{report.criteria.map(c => <div key={c.name} className="border-t pt-2 text-sm"><strong>{c.name} · {c.score ?? "Sem evidência"}{c.score !== null ? "/100" : ""}</strong><p className="mt-1 text-slate-600">{c.evidence}</p><p className="mt-1">{c.improvement}</p></div>)}
            {([["Pontos fortes", report.strengths], ["O que melhorar", report.improvements], ["Limites da análise", report.limitations]] as const).map(([title, values]) => values.length > 0 && <div key={title}><h4 className="text-sm font-semibold">{title}</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{values.map((s, i) => <li key={i}>{s}</li>)}</ul></div>)}
            </div></details>
            {report.campaign && <div className="space-y-3 rounded-xl bg-blue-50 p-3 text-sm"><h4 className="font-semibold">Proposta: {report.campaign.name}</h4><p>{report.campaign.objective}</p><p>{report.campaign.budgetMode} · Total diário: {report.campaign.dailyBudget ?? "A definir"} · {report.campaign.ads.length} anúncios</p><p>Público: {report.campaign.audience}</p>
              <p>Moeda da proposta: {report.campaign.currency || "Não definida — confira antes de executar"}</p>
              <details><summary className="cursor-pointer font-medium">Ver estrutura e anúncios</summary><div className="mt-3 space-y-3">{report.campaign.adSets.map((s, i) => <p key={i}><strong>{s.name}</strong> · {s.audience}{s.dailyBudget !== null ? ` · ${s.dailyBudget}/dia` : ""}</p>)}
              {report.campaign.ads.map((a, i) => <details key={i} className="rounded-lg bg-white p-3"><summary className="cursor-pointer font-medium">{a.name}</summary><p className="mt-2 font-semibold">{a.headline}</p><p className="mt-2 whitespace-pre-wrap">{a.primaryText}</p><p className="mt-2">CTA: {a.cta}</p><p className="mt-2 text-slate-600">{a.creativeGuidance}</p></details>)}
              {report.campaign.assumptions.map((a, i) => <p key={i}>{a}</p>)}
              </div></details>
              <p className="font-medium">Aprove a proposta para revisar as escolhas finais e criar a campanha pausada na Meta.</p></div>}
            {report.campaign && <div className="space-y-3 rounded-xl border border-blue-200 p-3 text-sm">
              {current?.proposal_approval ? <p role="status" className="font-medium text-emerald-700">Proposta aprovada em {new Date(current.proposal_approval.approvedAt).toLocaleString("pt-BR")} · sem veiculação.</p> : <>
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={approvalCheck} disabled={busy} onChange={e => setApprovalCheck(e.target.checked)}/>Revisei o criativo, os textos, a estratégia e a verba desta proposta.</label>
                <button className={`${button} bg-blue-600 text-white`} disabled={busy || !approvalCheck || !savedMedia || !current?.brief.dailyBudget || !current?.brief.currency} onClick={approveProposal}>Aprovar proposta</button>
                {(!savedMedia || !current?.brief.dailyBudget || !current?.brief.currency) && <p className="text-xs text-slate-500">Para aprovar, gere uma proposta com criativo, moeda e verba definidos.</p>}
              </>}
              <p className="text-xs text-slate-500">Aprova somente esta versão. Criação na Meta, posicionamentos finais e autorização de veiculação serão conferidos na próxima etapa.</p>
            </div>}
            {current?.proposal_approval && report.campaign && <MetaCampaignLaunch key={current.id} companyId={companyId} proposalId={current.id} brief={current.brief}/>}
            {!!report.hashtags?.length&&<p className="text-sm text-blue-700">{report.hashtags.join(" ")}</p>}
            {report.captions.map((c, i) => <details key={i}><summary className="cursor-pointer text-sm font-medium">Legenda · {c.platform}</summary><p className="mt-2 whitespace-pre-wrap text-sm">{c.text}</p></details>)}
            <div className="flex flex-wrap gap-2"><button className={button} onClick={download}><Download size={15}/>Exportar relatório</button></div>
            <p className="text-xs text-slate-500">Créditos utilizados: {current?.charge_credits ?? "Em conferência"}</p>
          </article>}
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}{notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    </div>}
  </details>;
}
