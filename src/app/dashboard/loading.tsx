import { InfinityLoadingPanel } from "@/components/connectyhub-os/infinity-loader";

export default function DashboardLoading() {
  return (
    <InfinityLoadingPanel
      eyebrow="Client OS"
      label="Carregando pagina..."
      description="Preparando os dados desta area do painel."
    />
  );
}
