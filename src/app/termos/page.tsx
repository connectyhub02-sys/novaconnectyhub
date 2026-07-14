import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Termos de Uso | ConnectyHub",
  description: "Termos de Uso da ConnectyHub.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Termos de Uso"
      description="Estes termos regulam o acesso e uso da ConnectyHub, incluindo paineis, agentes de IA, automacoes, WhatsApp, catalogos, pagamentos, trafego e integracoes com plataformas externas."
      updatedAt="14 de julho de 2026"
      sections={[
        {
          title: "1. Uso da plataforma",
          paragraphs: [
            "A ConnectyHub fornece ferramentas para atendimento, automacao comercial, gestao de leads, catalogos, pagamentos, trafego, relatorios e integracoes.",
            "O usuario e responsavel por usar a plataforma de forma licita, respeitando leis aplicaveis, politicas de terceiros e direitos de clientes, leads e contatos.",
          ],
        },
        {
          title: "2. Integracoes externas",
          paragraphs: [
            "Alguns recursos dependem de plataformas externas, como Meta, Google, Mercado Pago, provedores de envio, bancos de dados, mensageria e servicos de IA.",
            "O usuario deve possuir permissao para conectar contas, ativos, paginas, contas de anuncios, catalogos, numeros e demais recursos vinculados a essas plataformas.",
          ],
        },
        {
          title: "3. Conteudo, conversas e automacoes",
          paragraphs: [
            "O usuario e responsavel pelo conteudo inserido na plataforma, mensagens enviadas, campanhas, prompts, produtos, politicas comerciais e dados de seus clientes.",
            "Agentes de IA podem auxiliar operacoes, mas devem ser configurados, revisados e monitorados pelo usuario, especialmente em decisoes comerciais, juridicas, financeiras ou sensiveis.",
          ],
        },
        {
          title: "4. Disponibilidade",
          paragraphs: [
            "Trabalhamos para manter a plataforma disponivel, mas interrupcoes podem ocorrer por manutencao, atualizacoes, falhas de terceiros, limites de API, revisoes de permissao ou incidentes operacionais.",
            "Recursos dependentes de terceiros podem mudar conforme alteracoes de politicas, APIs, planos, revisoes, limites ou indisponibilidades desses provedores.",
          ],
        },
        {
          title: "5. Pagamentos e planos",
          paragraphs: [
            "Planos, precos, creditos, limites e recursos podem variar conforme contrato, oferta, consumo e configuracoes aprovadas pela ConnectyHub.",
            "Quando houver cobranca recorrente ou transacional, as condicoes serao apresentadas no momento da contratacao ou no painel financeiro aplicavel.",
          ],
        },
        {
          title: "6. Encerramento e contato",
          paragraphs: [
            "A ConnectyHub pode restringir ou encerrar acesso em caso de uso abusivo, violacao destes termos, risco operacional, fraude, inadimplencia ou descumprimento de politicas de terceiros.",
            "Duvidas sobre estes termos podem ser enviadas para connectyhub02@gmail.com.",
          ],
        },
      ]}
    />
  );
}
