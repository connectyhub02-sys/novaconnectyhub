# Referências fotográficas na API de imagens

Teste real da Vision Comex em 26/11 encontrou rejeição `model_capability_unavailable` antes do envio ao provedor: os sete modelos de imagem declaravam saída de imagem, mas omitiam entrada de imagem. A correção adiciona `image_input` aos catálogos interno/público e à linha correspondente do banco, sem alterar habilitação, preços, chaves ou isolamento.

17 testes de catálogo, gateway e edição com duas referências passaram. ESLint aprovado. Release 688bdb006a34d6f17134887ad927149957eba5a6 promovida ao slot b após smoke. Dois testes reais concluíram pelo gateway: preparação do cenário e montagem com duas fotos, com 673,752 créditos liquidados no total. A primeira tentativa, anterior à correção, falhou na validação de capacidade. Publicação social não executada por esta correção.

Referência: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-pro-image (edição de imagens e entrada multimodal).
