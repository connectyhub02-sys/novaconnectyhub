import Link from "next/link";
import { Coins, ArrowRight } from "lucide-react";
export function formatPreciseCredits(value: number) {
  if (value>0 && value<0.000001) return "menos de 0,000001";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
}
export function CreditExplainer({ compact = false }: { compact?: boolean }) {
  return <details className="rounded-2xl border border-blue-200 bg-blue-50 text-slate-900">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 p-4 text-sm font-semibold"><Coins size={18} className="shrink-0 text-blue-700"/>Como meus créditos são usados?<span className="ml-auto text-blue-700">+</span></summary>
    <div className="space-y-3 px-4 pb-4 text-sm leading-6 text-slate-700">
      <p>Pense nos créditos como o saldo de um plano de dados. Cada tarefa usa uma parte desse saldo. Uma resposta curta e a análise de uma imagem podem exigir quantidades diferentes de trabalho.</p>
      <p>O consumo considera o conteúdo que a IA lê, incluindo o histórico necessário, o que ela produz e o modelo utilizado. A ConnectyHub converte esse uso em créditos e mostra o desconto no extrato. Automações também podem consumir saldo.</p>
      {!compact && <div className="rounded-xl bg-white p-3"><strong>Exemplo ilustrativo</strong><p>Saldo de 1.000 → atividade de 3 → saldo de 997 créditos.</p><p className="text-xs text-slate-500">O exemplo não é uma tarifa. Não existe um custo fixo por mensagem; consulte “Ver cálculo” nas atividades.</p></div>}
      <Link href="/docs/ia#creditos" className="inline-flex min-h-11 items-center gap-2 font-semibold text-blue-800 underline underline-offset-4">Entender o cálculo<ArrowRight size={14}/></Link>
    </div>
  </details>;
}
