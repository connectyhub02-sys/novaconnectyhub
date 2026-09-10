// Catalog verified against the configured service account on 2026-09-10.
// Private routing IDs never leave the server catalog projection.
export const aiModelDefinitions = [
  {
    "id": "flash-2.5",
    "providerId": "gemini-2.5-flash",
    "name": "Flash 2.5",
    "family": "text",
    "profile": "Conversas, análise e tarefas de linguagem.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "pro-2.5",
    "providerId": "gemini-2.5-pro",
    "name": "Pro 2.5",
    "family": "text",
    "profile": "Raciocínio, código e tarefas complexas, priorizando profundidade.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "flash-2.5-preview-tts",
    "providerId": "gemini-2.5-flash-preview-tts",
    "name": "Flash 2.5 Preview Voz",
    "family": "voice",
    "profile": "Geração de fala a partir de texto.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "audio_output"
    ],
    "methods": [
      "countTokens",
      "generateContent"
    ],
    "inputCapacity": 8192,
    "outputCapacity": 16384
  },
  {
    "id": "pro-2.5-preview-tts",
    "providerId": "gemini-2.5-pro-preview-tts",
    "name": "Pro 2.5 Preview Voz",
    "family": "voice",
    "profile": "Geração de fala a partir de texto.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "audio_output",
      "batch"
    ],
    "methods": [
      "countTokens",
      "generateContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 8192,
    "outputCapacity": 16384
  },
  {
    "id": "open-4-26b-a4b-it",
    "providerId": "gemma-4-26b-a4b-it",
    "name": "Open 4 26B A4B It",
    "family": "text",
    "profile": "Conversas, análise e tarefas de linguagem.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "chat"
    ],
    "methods": [
      "generateContent",
      "countTokens"
    ],
    "inputCapacity": 262144,
    "outputCapacity": 32768
  },
  {
    "id": "open-4-31b-it",
    "providerId": "gemma-4-31b-it",
    "name": "Open 4 31B It",
    "family": "text",
    "profile": "Conversas, análise e tarefas de linguagem.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "chat"
    ],
    "methods": [
      "generateContent",
      "countTokens"
    ],
    "inputCapacity": 262144,
    "outputCapacity": 32768
  },
  {
    "id": "flash-latest",
    "providerId": "gemini-flash-latest",
    "name": "Flash Latest",
    "family": "text",
    "profile": "Conversas, análise e tarefas de linguagem.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "flash-lite-latest",
    "providerId": "gemini-flash-lite-latest",
    "name": "Flash Lite Latest",
    "family": "text",
    "profile": "Tarefas simples e alto volume, priorizando economia e rapidez.",
    "consumption": "Econômico",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "pro-latest",
    "providerId": "gemini-pro-latest",
    "name": "Pro Latest",
    "family": "text",
    "profile": "Raciocínio, código e tarefas complexas, priorizando profundidade.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "flash-lite-2.5",
    "providerId": "gemini-2.5-flash-lite",
    "name": "Flash Lite 2.5",
    "family": "text",
    "profile": "Tarefas simples e alto volume, priorizando economia e rapidez.",
    "consumption": "Econômico",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "flash-2.5-image",
    "providerId": "gemini-2.5-flash-image",
    "name": "Flash 2.5 Image",
    "family": "image",
    "profile": "Criação e edição de imagens.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "image_output",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "batchGenerateContent"
    ],
    "inputCapacity": 32768,
    "outputCapacity": 32768
  },
  {
    "id": "flash-3-preview",
    "providerId": "gemini-3-flash-preview",
    "name": "Flash 3 Preview",
    "family": "text",
    "profile": "Conversas, análise e tarefas de linguagem.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "pro-3.1-preview",
    "providerId": "gemini-3.1-pro-preview",
    "name": "Pro 3.1 Preview",
    "family": "text",
    "profile": "Raciocínio, código e tarefas complexas, priorizando profundidade.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "pro-3.1-preview-customtools",
    "providerId": "gemini-3.1-pro-preview-customtools",
    "name": "Pro 3.1 Preview Customtools",
    "family": "text",
    "profile": "Raciocínio, código e tarefas complexas, priorizando profundidade.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "flash-lite-3.1-preview",
    "providerId": "gemini-3.1-flash-lite-preview",
    "name": "Flash Lite 3.1 Preview",
    "family": "text",
    "profile": "Tarefas simples e alto volume, priorizando economia e rapidez.",
    "consumption": "Econômico",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "flash-lite-3.1",
    "providerId": "gemini-3.1-flash-lite",
    "name": "Flash Lite 3.1",
    "family": "text",
    "profile": "Tarefas simples e alto volume, priorizando economia e rapidez.",
    "consumption": "Econômico",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "pro-3-image-preview",
    "providerId": "gemini-3-pro-image-preview",
    "name": "Pro 3 Image Preview",
    "family": "image",
    "profile": "Criação e edição de imagens.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "image_output",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "batchGenerateContent"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 32768
  },
  {
    "id": "pro-3-image",
    "providerId": "gemini-3-pro-image",
    "name": "Pro 3 Image",
    "family": "image",
    "profile": "Criação e edição de imagens.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "image_output",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "batchGenerateContent"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 32768
  },
  {
    "id": "image-pro-preview",
    "providerId": "nano-banana-pro-preview",
    "name": "Image Pro Preview",
    "family": "image",
    "profile": "Criação e edição de imagens.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "image_output",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "batchGenerateContent"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 32768
  },
  {
    "id": "flash-3.1-image-preview",
    "providerId": "gemini-3.1-flash-image-preview",
    "name": "Flash 3.1 Image Preview",
    "family": "image",
    "profile": "Criação e edição de imagens.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "image_output",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "batchGenerateContent"
    ],
    "inputCapacity": 65536,
    "outputCapacity": 65536
  },
  {
    "id": "flash-3.1-image",
    "providerId": "gemini-3.1-flash-image",
    "name": "Flash 3.1 Image",
    "family": "image",
    "profile": "Criação e edição de imagens.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "image_output",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "batchGenerateContent"
    ],
    "inputCapacity": 65536,
    "outputCapacity": 65536
  },
  {
    "id": "flash-lite-3.1-image",
    "providerId": "gemini-3.1-flash-lite-image",
    "name": "Flash Lite 3.1 Image",
    "family": "image",
    "profile": "Criação e edição de imagens.",
    "consumption": "Econômico",
    "recommended": false,
    "capabilities": [
      "image_output",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "batchGenerateContent"
    ],
    "inputCapacity": 65536,
    "outputCapacity": 65536
  },
  {
    "id": "flash-3.5",
    "providerId": "gemini-3.5-flash",
    "name": "Flash 3.5",
    "family": "text",
    "profile": "Uso geral, conversas e raciocínio, com equilíbrio entre rapidez e profundidade.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": true,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "code_execution",
      "web_search",
      "url_context",
      "maps",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "flash-lite-3.5",
    "providerId": "gemini-3.5-flash-lite",
    "name": "Flash Lite 3.5",
    "family": "text",
    "profile": "Tarefas simples e alto volume, priorizando economia e rapidez.",
    "consumption": "Econômico",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "omni-flash-preview",
    "providerId": "gemini-omni-flash-preview",
    "name": "Omni Flash Preview",
    "family": "video",
    "profile": "Criação e transformação de vídeos.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "video_output"
    ],
    "methods": [
      "generateContent",
      "countTokens"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 65536
  },
  {
    "id": "omni-1.1-flash",
    "providerId": "gemini-omni-1.1-flash",
    "name": "Omni 1.1 Flash",
    "family": "video",
    "profile": "Criação e transformação de vídeos.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "video_output"
    ],
    "methods": [
      "generateContent",
      "countTokens"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 65536
  },
  {
    "id": "3.5-transcribe",
    "providerId": "gemini-3.5-transcribe",
    "name": "3.5 Transcribe",
    "family": "transcription",
    "profile": "Transcrição de áudio para texto.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "audio_input"
    ],
    "methods": [
      "generateContent",
      "countTokens"
    ],
    "inputCapacity": 98304,
    "outputCapacity": 32768
  },
  {
    "id": "flash-3.6",
    "providerId": "gemini-3.6-flash",
    "name": "Flash 3.6",
    "family": "text",
    "profile": "Conversas e análise multimodal para tarefas do dia a dia.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "code_execution",
      "web_search",
      "url_context",
      "maps",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "flash-3.7",
    "providerId": "gemini-3.7-flash",
    "name": "Flash 3.7",
    "family": "text",
    "profile": "Programação e execução de tarefas em várias etapas.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "code_execution",
      "web_search",
      "url_context",
      "maps",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "flash-3.8",
    "providerId": "gemini-3.8-flash",
    "name": "Flash 3.8",
    "family": "text",
    "profile": "Tarefas complexas de programação, agentes e fluxos empresariais extensos.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "code_execution",
      "web_search",
      "url_context",
      "maps",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "music-3-clip-preview",
    "providerId": "lyria-3-clip-preview",
    "name": "Music 3 Clip Preview",
    "family": "music",
    "profile": "Composição musical.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "music"
    ],
    "methods": [
      "generateContent",
      "countTokens"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "music-3-pro-preview",
    "providerId": "lyria-3-pro-preview",
    "name": "Music 3 Pro Preview",
    "family": "music",
    "profile": "Composição musical.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "music"
    ],
    "methods": [
      "generateContent",
      "countTokens"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "music-3.5",
    "providerId": "lyria-3.5",
    "name": "Music 3.5",
    "family": "music",
    "profile": "Composição musical.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "music"
    ],
    "methods": [
      "generateContent",
      "countTokens"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  },
  {
    "id": "flash-3.1-tts-preview",
    "providerId": "gemini-3.1-flash-tts-preview",
    "name": "Flash 3.1 Voz Preview",
    "family": "voice",
    "profile": "Geração de fala a partir de texto.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "audio_output",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "batchGenerateContent"
    ],
    "inputCapacity": 8192,
    "outputCapacity": 16384
  },
  {
    "id": "robotics-er-2-preview",
    "providerId": "gemini-robotics-er-2-preview",
    "name": "Robotics Er 2 Preview",
    "family": "text",
    "profile": "Conversas, análise e tarefas de linguagem.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions",
      "cache",
      "batch"
    ],
    "methods": [
      "generateContent",
      "countTokens",
      "createCachedContent",
      "batchGenerateContent"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 65536
  },
  {
    "id": "2.5-computer-use-preview-10-2025",
    "providerId": "gemini-2.5-computer-use-preview-10-2025",
    "name": "2.5 Computer Use Preview 10 2025",
    "family": "text",
    "profile": "Conversas, análise e tarefas de linguagem.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "chat",
      "image_input",
      "audio_input",
      "video_input",
      "pdf_input",
      "structured_output",
      "functions"
    ],
    "methods": [
      "generateContent",
      "countTokens"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 65536
  },
  {
    "id": "antigravity-preview-05-2026",
    "providerId": "antigravity-preview-05-2026",
    "name": "Antigravity Preview 05 2026",
    "family": "text",
    "profile": "Conversas, análise e tarefas de linguagem.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "chat"
    ],
    "methods": [
      "generateContent",
      "countTokens"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 65536
  },
  {
    "id": "deep-research-max-preview-04-2026",
    "providerId": "deep-research-max-preview-04-2026",
    "name": "Deep Research Max Preview 04 2026",
    "family": "text",
    "profile": "Conversas, análise e tarefas de linguagem.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "chat"
    ],
    "methods": [
      "generateContent",
      "countTokens"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 65536
  },
  {
    "id": "deep-research-preview-04-2026",
    "providerId": "deep-research-preview-04-2026",
    "name": "Deep Research Preview 04 2026",
    "family": "text",
    "profile": "Conversas, análise e tarefas de linguagem.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "chat"
    ],
    "methods": [
      "generateContent",
      "countTokens"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 65536
  },
  {
    "id": "deep-research-pro-preview-12-2025",
    "providerId": "deep-research-pro-preview-12-2025",
    "name": "Deep Research Pro Preview 12 2025",
    "family": "text",
    "profile": "Raciocínio, código e tarefas complexas, priorizando profundidade.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "chat"
    ],
    "methods": [
      "generateContent",
      "countTokens"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 65536
  },
  {
    "id": "embedding-001",
    "providerId": "gemini-embedding-001",
    "name": "Embedding 001",
    "family": "embeddings",
    "profile": "Representações numéricas para busca e comparação.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "embeddings"
    ],
    "methods": [
      "embedContent",
      "countTextTokens",
      "countTokens",
      "asyncBatchEmbedContent"
    ],
    "inputCapacity": 2048,
    "outputCapacity": 1
  },
  {
    "id": "embedding-2-preview",
    "providerId": "gemini-embedding-2-preview",
    "name": "Embedding 2 Preview",
    "family": "embeddings",
    "profile": "Representações numéricas para busca e comparação.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "embeddings"
    ],
    "methods": [
      "embedContent",
      "countTextTokens",
      "countTokens",
      "asyncBatchEmbedContent"
    ],
    "inputCapacity": 8192,
    "outputCapacity": 1
  },
  {
    "id": "embedding-2",
    "providerId": "gemini-embedding-2",
    "name": "Embedding 2",
    "family": "embeddings",
    "profile": "Representações numéricas para busca e comparação.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "embeddings"
    ],
    "methods": [
      "embedContent",
      "countTextTokens",
      "countTokens",
      "asyncBatchEmbedContent"
    ],
    "inputCapacity": 8192,
    "outputCapacity": 1
  },
  {
    "id": "aqa",
    "providerId": "aqa",
    "name": "Aqa",
    "family": "text",
    "profile": "Conversas, análise e tarefas de linguagem.",
    "consumption": "Conforme o conteúdo processado",
    "recommended": false,
    "capabilities": [
      "chat"
    ],
    "methods": [
      "generateAnswer"
    ],
    "inputCapacity": 7168,
    "outputCapacity": 1024
  },
  {
    "id": "video-3.1-generate-preview",
    "providerId": "veo-3.1-generate-preview",
    "name": "Video 3.1 Generate Preview",
    "family": "video",
    "profile": "Criação e transformação de vídeos.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "video_output"
    ],
    "methods": [
      "predictLongRunning"
    ],
    "inputCapacity": 480,
    "outputCapacity": 8192
  },
  {
    "id": "video-3.1-fast-generate-preview",
    "providerId": "veo-3.1-fast-generate-preview",
    "name": "Video 3.1 Fast Generate Preview",
    "family": "video",
    "profile": "Criação e transformação de vídeos.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "video_output"
    ],
    "methods": [
      "predictLongRunning"
    ],
    "inputCapacity": 480,
    "outputCapacity": 8192
  },
  {
    "id": "video-3.1-lite-generate-preview",
    "providerId": "veo-3.1-lite-generate-preview",
    "name": "Video 3.1 Lite Generate Preview",
    "family": "video",
    "profile": "Criação e transformação de vídeos.",
    "consumption": "Econômico",
    "recommended": false,
    "capabilities": [
      "video_output"
    ],
    "methods": [
      "predictLongRunning"
    ],
    "inputCapacity": 480,
    "outputCapacity": 8192
  },
  {
    "id": "3.5-transcribe-live",
    "providerId": "gemini-3.5-transcribe-live",
    "name": "3.5 Transcribe Live",
    "family": "live",
    "profile": "Interação contínua em tempo real.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "live"
    ],
    "methods": [
      "bidiGenerateContent"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 65536
  },
  {
    "id": "flash-2.5-native-audio-latest",
    "providerId": "gemini-2.5-flash-native-audio-latest",
    "name": "Flash 2.5 Native Audio Latest",
    "family": "live",
    "profile": "Interação contínua em tempo real.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "live"
    ],
    "methods": [
      "countTokens",
      "bidiGenerateContent"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 8192
  },
  {
    "id": "flash-2.5-native-audio-preview-09-2025",
    "providerId": "gemini-2.5-flash-native-audio-preview-09-2025",
    "name": "Flash 2.5 Native Audio Preview 09 2025",
    "family": "live",
    "profile": "Interação contínua em tempo real.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "live"
    ],
    "methods": [
      "countTokens",
      "bidiGenerateContent"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 8192
  },
  {
    "id": "flash-2.5-native-audio-preview-12-2025",
    "providerId": "gemini-2.5-flash-native-audio-preview-12-2025",
    "name": "Flash 2.5 Native Audio Preview 12 2025",
    "family": "live",
    "profile": "Interação contínua em tempo real.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "live"
    ],
    "methods": [
      "countTokens",
      "bidiGenerateContent"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 8192
  },
  {
    "id": "flash-3.1-live-preview",
    "providerId": "gemini-3.1-flash-live-preview",
    "name": "Flash 3.1 Live Preview",
    "family": "live",
    "profile": "Interação contínua em tempo real.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "live"
    ],
    "methods": [
      "bidiGenerateContent"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 65536
  },
  {
    "id": "robotics-er-2-streaming-preview",
    "providerId": "gemini-robotics-er-2-streaming-preview",
    "name": "Robotics Er 2 Streaming Preview",
    "family": "live",
    "profile": "Interação contínua em tempo real.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "live"
    ],
    "methods": [
      "bidiGenerateContent"
    ],
    "inputCapacity": 131072,
    "outputCapacity": 65536
  },
  {
    "id": "3.5-live-translate-preview",
    "providerId": "gemini-3.5-live-translate-preview",
    "name": "3.5 Live Translate Preview",
    "family": "live",
    "profile": "Interação contínua em tempo real.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "live"
    ],
    "methods": [
      "bidiGenerateContent"
    ],
    "inputCapacity": 16384,
    "outputCapacity": 32768
  },
  {
    "id": "music-realtime-exp",
    "providerId": "lyria-realtime-exp",
    "name": "Music Realtime Exp",
    "family": "live",
    "profile": "Interação contínua em tempo real.",
    "consumption": "Maior conforme a tarefa",
    "recommended": false,
    "capabilities": [
      "live"
    ],
    "methods": [
      "bidiGenerateMusic"
    ],
    "inputCapacity": 1048576,
    "outputCapacity": 65536
  }
];
