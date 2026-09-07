"use client";
import { useState } from "react";
import {
  campaignPriceNotice,
  quoteCampaign,
  type CampaignConfig,
} from "@/lib/commerce/campaigns";
export type StoreContract = {
  id: string;
  lead_id: string;
  state: string;
  period_end: string | null;
  paid_cycles: number;
  cancel_at_period_end: boolean;
  configuration: CampaignConfig;
  option_id: string;
};
export function SubscriptionConsole({
  contracts,
  buyers,
  onCancel,
}: {
  contracts: StoreContract[];
  buyers: { id: string; name: string }[];
  onCancel: (id: string) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!contracts.length) return null;
  return (
    <section className="rounded-2xl bg-white p-5 text-slate-900 sm:p-6">
      <h2 className="text-xl font-bold">Assinaturas dos seus clientes</h2>
      <p className="mt-1 text-sm text-slate-500">
        Períodos pagos e próximas renovações. Cancelar mantém o histórico da
        compra.
      </p>
      <div className="mt-4 divide-y">
        {contracts.map((contract) => (
          <article key={contract.id} className="space-y-2 py-4">
            <div className="flex flex-wrap justify-between gap-2">
              <b>
                {buyers.find((b) => b.id === contract.lead_id)?.name ??
                  "Cliente"}{" "}
                · {contract.configuration.name}
              </b>
              <span className="text-xs text-slate-500">
                {contract.cancel_at_period_end
                  ? "Renovação cancelada"
                  : contract.state === "active"
                    ? "Ativa"
                    : contract.state === "past_due"
                      ? "Vencida"
                      : contract.state === "reserved"
                        ? "Aguardando pagamento"
                        : "Encerrada"}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {contract.paid_cycles} período(s) pago(s)
              {contract.period_end
                ? ` · Pago até ${new Date(contract.period_end).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
                : ""}
            </p>
            {!contract.cancel_at_period_end ? (
              <>
                <p className="max-w-3xl text-sm leading-6">
                  {campaignPriceNotice(
                    quoteCampaign(
                      "preview",
                      1,
                      contract.configuration,
                      contract.option_id,
                      contract.paid_cycles,
                    ),
                  )}
                </p>
                {confirm === contract.id ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm">
                    <span>Cancelar as próximas renovações?</span>
                    <button
                      className="min-h-11 font-bold text-red-700"
                      onClick={async () => {
                        await onCancel(contract.id);
                        setConfirm(null);
                      }}
                    >
                      Confirmar cancelamento
                    </button>
                    <button
                      className="min-h-11 underline"
                      onClick={() => setConfirm(null)}
                    >
                      Voltar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirm(contract.id)}
                    className="min-h-11 text-sm font-semibold text-red-700"
                  >
                    Cancelar renovação
                  </button>
                )}
              </>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
