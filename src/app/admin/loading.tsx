import { InfinityLoadingPanel } from "@/components/connectyhub-os/infinity-loader";

export default function AdminLoading() {
  return (
    <InfinityLoadingPanel
      eyebrow="Admin OS"
      label="Carregando pagina..."
      description="Atualizando os dados operacionais da plataforma."
    />
  );
}
