import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Politica de Privacidade | ConnectyHub",
  description: "Politica de Privacidade da ConnectyHub.",
  alternates: { canonical: "/privacidade" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Politica de Privacidade"
      description="Esta politica explica como a ConnectyHub coleta, usa, protege e permite a exclusao de dados em seus paineis, automacoes, integracoes e agentes de atendimento."
      updatedAt="3 de novembro de 2026"
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
          title: "6. YouTube, TikTok e publicação de vídeos",
          paragraphs: [
            "A ConnectyHub utiliza os Serviços de API do YouTube e as APIs oficiais do TikTok. A conexão é opcional e ocorre na tela de autorização de cada plataforma. Não solicitamos a senha do Google, do YouTube ou do TikTok e não exigimos que o usuário forneça chaves de desenvolvedor.",
            "No YouTube, acessamos a identificação e o nome do canal autorizado, as permissões concedidas e informações necessárias para enviar o vídeo aprovado e acompanhar seu processamento. No TikTok, acessamos a identificação, o nome e informações do perfil autorizado, as opções e os limites atuais de publicação e o resultado dos envios. Os tokens de acesso e renovação são armazenados criptografados no servidor e vinculados à empresa que realizou a conexão.",
            "A biblioteca guarda os vídeos enviados pelo próprio usuário e seus dados técnicos. Os rascunhos registram título, legenda, destinos, privacidade, declarações, aprovação e agendamento. A ConnectyHub envia à rede escolhida o arquivo e as configurações aprovadas pelo usuário; cada rede processa e modera o conteúdo de forma independente. A autorização de uma conta, por si só, não inicia uma publicação.",
            "Quando o usuário solicita uma análise de vídeo com IA, o arquivo que ele enviou e o contexto necessário são processados pelos provedores de IA usados pela ConnectyHub, conforme o recurso e o consumo apresentados no painel. A avaliação editorial não é uma métrica fornecida pelo YouTube ou TikTok. Os tokens de acesso das redes sociais não são enviados ao modelo de IA.",
            "O uso e a transferência de informações recebidas das APIs do Google seguem a Política de Dados do Usuário dos Serviços de API do Google, inclusive os requisitos de Uso Limitado. Não vendemos esses dados, não os utilizamos para publicidade personalizada e não os utilizamos para treinar modelos de IA de uso geral.",
          ],
          links: [
            { label: "Política de Privacidade do Google", href: "https://policies.google.com/privacy" },
            { label: "Política de Dados do Usuário dos Serviços de API do Google", href: "https://developers.google.com/terms/api-services-user-data-policy" },
            { label: "Política de Privacidade do TikTok", href: "https://www.tiktok.com/legal/page/row/privacy-policy/pt-BR" },
          ],
        },
        {
          title: "7. Desconexão e exclusão de dados das redes sociais",
          paragraphs: [
            "Em Redes sociais > Contas conectadas, o usuário pode desconectar uma conta e excluir os dados recebidos dessa integração. A ação remove tokens, perfil, vínculos de conta, identificadores e endereços de resultados de publicação na ConnectyHub, interrompe entregas pendentes e solicita a revogação à plataforma. Um envio já recebido pela rede pode concluir e deve ser conferido no próprio perfil. O painel informa quando a revogação externa não puder ser confirmada. Também é possível revogar o acesso diretamente nas configurações da conta Google ou TikTok.",
            "As autorizações ativas são verificadas periodicamente, com revalidação diária. Conexões sem confirmação bem-sucedida por seis dias são removidas com os dados associados. Os dados recebidos das APIs nos registros de entrega são removidos em até 30 dias; por isso, links e identificadores antigos podem deixar de aparecer. O histórico preserva o destino, o resultado e as datas da operação, sem os dados de identificação recebidos da rede.",
            "Você também pode solicitar a exclusão por connectyhub02@gmail.com, identificando a empresa e a conta. Os dados recebidos das APIs do YouTube relacionados à solicitação são excluídos assim que possível, em até sete dias. Os vídeos originais enviados por você à biblioteca, seus títulos, legendas e registros comerciais têm finalidade própria; a solicitação pode incluir sua exclusão, observadas as obrigações legais aplicáveis.",
            "Desconectar ou excluir dados na ConnectyHub não apaga os vídeos já publicados no YouTube ou TikTok. Para remover uma publicação dessas redes, utilize os controles da própria plataforma.",
            "Utilizamos cookies de sessão e de segurança para autenticação e proteção do fluxo de conexão. Arquivos destinados à publicação são disponibilizados ao provedor pelo endereço necessário para a transferência; não envie conteúdo sem autorização para esse processamento.",
          ],
          links: [
            { label: "Revogar acesso na Conta do Google", href: "https://security.google.com/settings/security/permissions" },
            { label: "Gerenciar conexões na ConnectyHub", href: "/dashboard/redes-sociais/contas" },
          ],
        },
        {
          title: "8. Contato",
          paragraphs: [
            "Para duvidas sobre privacidade, seguranca, uso de dados ou solicitacoes relacionadas a LGPD, entre em contato pelo email connectyhub02@gmail.com.",
          ],
        },
      ]}
    />
  );
}
