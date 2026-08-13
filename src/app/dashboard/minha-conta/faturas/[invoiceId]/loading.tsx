import { InfinityLoadingPanel } from "@/components/connectyhub-os/infinity-loader";

export default function LoadingInvoicePage() {
  return (
    <InfinityLoadingPanel
      label="Carregando fatura..."
      description="Preparando detalhes de pagamento, assinatura e comprovantes."
    />
  );
}
