"use client";
import { HardDrive } from "lucide-react";
import { CapacityDial } from "./capacity-dial";
import { projectStorage, storageScale, type ProjectStorage, type StorageMeasurement } from "@/lib/infrastructure/storage";

function StorageCard({ title, source, description }: { title: string; source: StorageMeasurement; description: string }) {
  const scale = source.bytes === null ? null : storageScale(source.bytes);
  return <div className="min-w-0 space-y-3">
    <CapacityDial title={title} metric="disk" value={scale?.percent ?? null} stale={!source.available}
      display={{ value: scale?.value ?? "—", maximum: scale?.maximum ?? "—", status: source.available ? "Uso medido · sem cota" : "Leitura indisponível" }} caption="armazenados"
      free={source.available ? "Sem limite contratado definido" : "Aguardando medição deste projeto"}
      detail={scale ? `Escala visual de 0 a ${scale.maximum}; ela se ajusta ao consumo e não representa uma cota.` : "Nenhum percentual estimado sem uma medição válida."} />
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs leading-5 text-slate-600">{description}</p>
      {source.available && <>
        <p className="mt-2 text-xs text-slate-500">{source.objects !== null && `${source.objects.toLocaleString("pt-BR")} arquivo(s) · ${source.buckets} espaço(s) exclusivo(s) · `}Medido em {new Date(source.observedAt!).toLocaleString("pt-BR")}</p>
        <h4 className="mt-4 text-sm font-semibold">O que ocupa mais espaço</h4>
        <div className="mt-3 space-y-3">{source.components.map(c => {
          const percent = source.bytes ? c.bytes / source.bytes * 100 : 0;
          return <div key={c.id} className="space-y-1"><div className="flex flex-wrap justify-between gap-2 text-xs"><span>{c.label}</span><strong>{storageScale(c.bytes).value}</strong></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="meter" aria-label={`${c.label}: parcela do total medido`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><div className="h-full rounded-full bg-blue-500" style={{ width: `${percent}%` }} /></div>
            <p className="text-[11px] text-slate-500">{percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% deste armazenamento</p></div>;
        })}{!source.components.length && <p className="text-xs text-slate-500">Nenhum espaço ocupado nesta medição.</p>}</div>
      </>}
    </div>
  </div>;
}

export function HostingStorage({ storage }: { storage?: ProjectStorage }) {
  const data = storage ?? projectStorage("", null);
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-slate-900 sm:p-5">
    <div><h3 className="flex items-center gap-2 text-lg font-bold"><HardDrive size={20} className="text-blue-700" />Armazenamento do projeto</h3><p className="mt-2 text-sm leading-6 text-slate-600">Arquivos no Cloudflare e dados na VPS são medidos separadamente. Os relógios mostram o espaço usado; não há cobrança nem limite automático.</p></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <StorageCard title="Cloudflare R2" source={data.r2} description="Tamanho dos arquivos nos espaços exclusivos do projeto, agrupados por extensão. Atualização a cada seis horas. Uploads ainda não concluídos ficam fora desta leitura." />
      <StorageCard title="Disco na VPS" source={data.local} description="Estimativa do espaço local: bancos, automações, arquivos, versões, backups e logs, incluindo serviços parados. Atualização a cada hora. Imagens Docker compartilhadas e armazenamento externo ficam fora deste total." />
    </div>
    <p className="text-xs leading-5 text-slate-500">Valores em MB/GB usam base 1024. A escala azul indica quantidade, não situação de limite. Esta medição não é uma fatura nem o total faturado pelo fornecedor.</p>
  </section>;
}
