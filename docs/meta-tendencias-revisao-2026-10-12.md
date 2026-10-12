# Pesquisa de tendências e revisão de criativos — 12/10/2026

## Escopo

Autorizado Gemini com Google Search, após esclarecimento de que Sheets era uma referência equivocada. Sem Tavily/AdSpy. O estúdio compartilhado por admin e cliente recebeu pesquisa recolhível por nicho, país e plataforma, fontes numeradas, sugestões de busca do Google em iframe isolado, data, histórico próprio e aproveitamento no roteiro. Não há coleta do histórico privado de outras organizações.

O incremento também reúne acesso aos recursos em todos os planos ativos, prévia real de imagem/vídeo e simulação de Feed/Stories/Reels, modo IA automática ou orientada, detalhes recolhíveis e aprovação da versão da proposta. A aprovação é somente da proposta interna: não cria nem ativa anúncios. Posicionamentos finais, validação de ativos e execução efetiva Meta/Google continuam etapas posteriores do plano.

## Integridade

Endpoints usam sessão, empresa resolvida no servidor, papel de gestão, contrato e crédito. Payload não escolhe outra organização. Tabelas e RPCs são exclusivos do servidor. Pesquisa usa tarifas centrais de tokens e busca, reserva saldo da carteira responsável e liquida débito/resultado em transação idempotente. Guarda a resposta antes da liquidação; recuperação do histórico tenta somente o consumo já calculado, nunca nova geração. Chamada incerta conserva reserva e exige conferência do suporte. Não presume franquia gratuita do Google. Créditos internos registram custo sem débito fictício.

Sem fontes retornadas pelo provedor, o resultado não é apresentado como tendência. A inferência já consumida continua registrada. Nota do criativo é editorial, não previsão de vendas. Prévia preserva a proporção original e informa que o corte final da Meta ainda será validado.

## Verificação local

46 testes passaram em oito arquivos: política, fontes, acesso, todos os planos, idempotência, reserva compartilhada, cobrança única, falhas, restrição SQL e invalidação da aprovação. Mais um teste posterior cobriu referências UTF-8 em texto acentuado. TypeScript e lint dos componentes e módulo de pesquisa passaram. Migrations 0196 e 0197 aplicadas e registradas após backup privado do schema em `config/before-0196-0197-schema.sql`. Acesso direto authenticated às tabelas/RPCs recusado no banco de produção.

## Referências

- https://ai.google.dev/gemini-api/docs/generate-content/google-search
- https://ai.google.dev/gemini-api/docs/pricing

## Teste real

Em 12/10 às 17h02 BRT, pesquisa interna `77bc1dd4-2ed2-45cf-b959-59a5e5b4ee07` concluída com Gemini 3.6 Flash: quatro buscas, oito fontes, 188 tokens de entrada e 994 de saída. Evento `f0836af7-ec9e-4f7c-a541-6eda4c70a0af`, custo registrado R$ 0,359211, modo internal_shadow e zero débito de cliente. Atualização do histórico não repetiu geração nem consumo. A apresentação das referências foi corrigida para offsets UTF-8 sem nova inferência; a resposta original do provedor foi preservada.

Passagem da pesquisa para instruções do roteiro confirmada. Prévia real de JPG e de MP4 1080×1920, seis segundos, carregada no navegador; seletor Feed/Stories/Reels observado. Proposta interna anterior `55e4acd1-acc2-4ac5-a260-b5fab26912a2` revisada e aprovada às 17h06 como proposal_only, com snapshot e hash, sem chamada de criação/ativação na Meta.

Painel BuffaloMass exibiu os mesmos recursos e histórico próprio vazio, sem resultados internos. Essa checagem ocorreu em sessão administrativa assistida, não equivale a login real de usuário comum; os testes de rota exercitaram owner comum e bloqueio de member/sem sessão, e a matriz de planos confirmou Start/Pro/Scale. Não foram debitados créditos desse cliente.

Evidências locais em `output/meta-trends-20261012`: `cliente-estudio.png`, `admin-previa-aprovacao.png`, resposta e resultado do teste. Nenhuma publicação social ou anúncio foi criado. A pesquisa não fornece métricas independentes de popularidade, e não é uma biblioteca de anúncios concorrentes.

## Publicação confirmada

Versão final 843231c3a9523af676b27196706f0508b6cf5153 ativada em 12/10 às 17h14 BRT, slot a/3130. Fallback 160e6f12fe33621be075eb6de37ebbf9c95eb68d no slot b/3131. Health público confirmou a versão; login e asset JS responderam 200, endpoints privados recusaram acesso sem sessão, e Inngest assinado confirmou 58 funções. Builder parado após ativação. Pesquisa existente relida na versão final com referências UTF-8 corretas e aviso de evidência pública; screenshot pesquisa-fontes-final.png. Nenhuma nova inferência foi necessária para corrigir a apresentação.
