import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Exclusao de Dados | ConnectyHub",
  description: "Instrucoes para solicitar exclusao de dados na ConnectyHub.",
};

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Exclusao de Dados"
      description="Esta pagina informa como usuarios e empresas podem solicitar a exclusao de dados tratados pela ConnectyHub, inclusive dados associados a integracoes externas."
      updatedAt="14 de julho de 2026"
      sections={[
        {
          title: "1. Como solicitar",
          paragraphs: [
            "Envie uma solicitacao para connectyhub02@gmail.com usando o assunto Exclusao de Dados ConnectyHub.",
            "Informe o email da conta, nome da empresa, identificacao do workspace e quais dados deseja excluir ou desconectar.",
          ],
        },
        {
          title: "2. Integracoes Meta, Google e outras plataformas",
          paragraphs: [
            "Quando a solicitacao envolver dados recebidos de plataformas externas, a ConnectyHub removera tokens, credenciais e dados armazenados sob seu controle, respeitando obrigacoes legais, antifraude, fiscais e registros tecnicos necessarios.",
            "O usuario tambem pode revogar o acesso diretamente na plataforma externa, como Meta Business, Google Account ou Mercado Pago.",
          ],
        },
        {
          title: "3. Prazos e confirmacao",
          paragraphs: [
            "Apos recebermos a solicitacao, poderemos pedir informacoes adicionais para confirmar a titularidade ou autorizacao da empresa.",
            "Quando a exclusao for concluida, enviaremos confirmacao pelo email informado na solicitacao.",
          ],
        },
        {
          title: "4. Dados que podem permanecer",
          paragraphs: [
            "Alguns registros podem ser mantidos quando forem necessarios para cumprimento de obrigacoes legais, auditoria, seguranca, prevencao a fraude, defesa de direitos ou continuidade operacional minima.",
          ],
        },
      ]}
    />
  );
}
