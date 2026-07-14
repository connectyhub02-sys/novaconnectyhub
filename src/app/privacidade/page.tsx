import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Politica de Privacidade | ConnectyHub",
  description: "Politica de Privacidade da ConnectyHub.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Politica de Privacidade"
      description="Esta politica explica como a ConnectyHub coleta, usa, protege e permite a exclusao de dados em seus paineis, automacoes, integracoes e agentes de atendimento."
      updatedAt="14 de julho de 2026"
      sections={[
        {
          title: "1. Dados que coletamos",
          paragraphs: [
            "Coletamos dados fornecidos por usuarios e empresas durante cadastro, contratacao, configuracao de agentes, integracoes e uso dos paineis da plataforma.",
            "Quando uma empresa conecta plataformas externas, como Meta, Google ou Mercado Pago, podemos receber dados autorizados pelo proprio usuario durante o fluxo oficial de permissao.",
          ],
          items: [
            "Dados de conta: nome, email, empresa, usuario responsavel e configuracoes do workspace.",
            "Dados operacionais: conversas, leads, campanhas, produtos, pedidos, eventos, historico de atendimento e logs tecnicos.",
            "Dados de integracao Meta: contas de anuncios, paginas, contas Instagram Business, pixels, metricas, campanhas, insights e tokens autorizados pelo usuario.",
            "Dados de pagamento e catalogo: status de pedidos, referencias de pagamento, produtos e dados necessarios para operar checkout e cobrancas.",
          ],
        },
        {
          title: "2. Como usamos os dados",
          paragraphs: [
            "Usamos os dados para operar a plataforma, entregar automacoes, exibir dashboards, responder conversas, processar eventos, manter seguranca e melhorar a experiencia dos usuarios.",
            "Os dados de plataformas externas sao usados somente para os recursos solicitados pelo cliente, como acompanhamento de campanhas, leitura de metricas, conexao de contas e atendimento multicanal quando habilitado.",
          ],
        },
        {
          title: "3. Compartilhamento",
          paragraphs: [
            "A ConnectyHub nao vende dados pessoais. Podemos compartilhar dados somente com provedores necessarios para hospedagem, banco de dados, mensageria, pagamentos, analise tecnica, seguranca e execucao das funcionalidades contratadas.",
            "Quando o usuario conecta uma plataforma externa, o tratamento tambem segue as politicas e permissoes dessa plataforma.",
          ],
        },
        {
          title: "4. Seguranca e armazenamento",
          paragraphs: [
            "Credenciais sensiveis sao armazenadas de forma protegida. Tokens e chaves de integracao sao usados no servidor para executar chamadas autorizadas e nao devem ser expostos a usuarios sem permissao.",
            "Aplicamos controles de acesso por usuario, empresa, perfil administrativo e contexto operacional para reduzir acesso indevido.",
          ],
        },
        {
          title: "5. Direitos do usuario",
          paragraphs: [
            "O usuario pode solicitar acesso, correcao, desconexao de integracoes, exportacao ou exclusao de dados, conforme aplicavel pela legislacao brasileira de protecao de dados.",
            "Solicitacoes podem ser enviadas para connectyhub02@gmail.com. Para exclusao de dados de integracoes, tambem e possivel desconectar a conta no painel quando o recurso estiver disponivel.",
          ],
        },
        {
          title: "6. Contato",
          paragraphs: [
            "Para duvidas sobre privacidade, seguranca, uso de dados ou solicitacoes relacionadas a LGPD, entre em contato pelo email connectyhub02@gmail.com.",
          ],
        },
      ]}
    />
  );
}
