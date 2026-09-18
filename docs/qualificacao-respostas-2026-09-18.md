# Qualificação por respostas — 18/09/2026

## Comportamento

Perguntas possuem alternativas com identificador estável, texto, pontos inteiros
de 0 a 100 e sinalizador de desqualificação. O editor permite até 16 perguntas e
12 respostas por pergunta. Criar perguntas ou respostas gera identificadores;
renomear texto não altera vínculos. Campos vazios e espaços são preservados
durante a edição; respostas vazias/duplicadas impedem salvar.

Cada pergunta aceita uma alternativa por análise. A IA interpreta a conversa e
devolve a alternativa com citação literal do lead. O servidor rejeita alternativas
inexistentes, respostas duplicadas e evidência ausente. Soma pontos das respostas,
divide pela soma dos maiores valores não desqualificadores de cada pergunta e
normaliza para 0–100. Zero pontos é uma resposta válida, distinta de pendente.
Qualificado e VIP respeitam limites configurados e conclusão das obrigatórias.
Uma alternativa desqualificadora prevalece sobre o total. Enriquecimento CRM
continua registrando contexto, mas não atribui pontos.

O CRM mostra pergunta, fala original, alternativa, pontos e motivos de
desqualificação. Respostas anteriores só podem ser reaproveitadas quando a versão
da configuração coincide; a próxima análise refaz a classificação após alteração.
Não há reprocessamento retroativo de leads nem envio de mensagens nesta operação.

## Padrões e preservação

Todos os 32 perfis de atividade possuem quatro perguntas e três respostas iniciais,
com máximo de 100 pontos. As perguntas acompanham a atividade; alternativas
igualmente úteis podem ter a mesma nota. Usuários podem mudar perguntas, respostas,
notas e limites. Padrões antigos reconhecidos recebem opções no editor e runtime;
configurações personalizadas não são substituídas silenciosamente. Perguntas
autorais antigas sem opções continuam editáveis e sem pontos até serem configuradas.

A rubrica particular autorizada pelo titular possui oito perguntas e máximo de
110 pontos, normalizado para 100. Sua resposta desqualificadora impede o avanço
comercial. Pontos ou declarações do lead não comprovam documentos nem autorizam
fornecimento. A aplicação em dados reais será registrada após publicação.

## Verificação e limites

Testes cobrem cálculo determinístico, zero versus pendência, obrigatórias,
desqualificação, evidência, versões, os 32 perfis e preservação de conteúdo autoral.
Navegador local com APIs simuladas conferiu os dois painéis, alterações e persistência
simulada, identificadores estáveis, sanfonas fechadas e ausência de overflow móvel.
Teste antigo da cobrança passou a verificar a função de rotas já compartilhada,
em vez de procurar código que havia sido movido do componente; sem mudar cobrança.
Rodada completa inicial: 3.383 de 3.384 testes passaram, com apenas essa asserção
antiga falhando. Após corrigi-la e acrescentar cobertura de perguntas opcionais,
os 214 testes direcionados passaram. ESLint dos arquivos alterados, TypeScript
e build de produção webpack passaram; 108 páginas estáticas geradas.

O entendimento semântico de conversas reais pelo fornecedor não foi medido neste
trabalho. O cálculo é determinístico; a escolha da alternativa continua dependendo
da interpretação da IA e deve ficar pendente quando não houver correspondência clara.
