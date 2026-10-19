'use client';

import {useState, type ReactNode} from 'react';
import {CircleHelp} from 'lucide-react';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';

// Same question-mark pattern as the agents panel, also operable by tap/keyboard.
export function VoiceHelp({title,children}:{title:string;children:ReactNode}) {
  const [open,setOpen]=useState(false);
  return <Tooltip open={open} onOpenChange={setOpen}>
    <TooltipTrigger asChild>
      <button type="button" aria-label={`Ajuda: ${title}`} onClick={event=>{event.preventDefault();event.stopPropagation();setOpen(value=>!value);}}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        <CircleHelp size={16} aria-hidden="true" />
      </button>
    </TooltipTrigger>
    <TooltipContent side="top" sideOffset={6} collisionPadding={16} className="z-[1000] block max-h-[min(70dvh,var(--radix-tooltip-content-available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto border border-slate-200 bg-white p-4 text-left font-sans text-xs font-normal normal-case leading-5 tracking-normal text-slate-900 shadow-xl [&>svg]:bg-white [&>svg]:fill-white">
      <p className="mb-1 font-semibold">{title}</p><div className="space-y-2">{children}</div>
    </TooltipContent>
  </Tooltip>;
}

export function VoiceHelpLabel({title,children}:{title:string;children:ReactNode}) {
  return <span className="inline-flex items-center gap-1">{title}<VoiceHelp title={title}>{children}</VoiceHelp></span>;
}

export const voiceModelHelp:Record<string,{name:string;description:string}>= {
  eleven_multilingual_v2:{name:'Voz Multilíngue v2',description:'Prioriza uma leitura natural e consistente, útil para narrações longas. Aceita pausas em segundos; os botões de emoções, reações e estilos expressivos ficam indisponíveis neste painel.'},
  eleven_flash_v2_5:{name:'Voz Rápida v2.5',description:'Prioriza rapidez na geração. Útil para falas do dia a dia e testes de roteiro. Aceita pausas em segundos, sem os comandos de emoções e reações do v3. Confira o custo mostrado no painel.'},
  eleven_turbo_v2_5:{name:'Voz Expressa v2.5',description:'Alternativa de geração rápida para leitura comum, com pausas em segundos. Apesar do nome Expressa, não libera emoções e reações: esses comandos usam Voz Expressiva v3.'},
  eleven_v3:{name:'Voz Expressiva v3',description:'Libera estilos de interpretação, emoções e reações, inclusive com clones. Use para uma atuação mais expressiva. As pausas são curtas ou longas, sem duração exata; confira o resultado em Ouvir trecho.'},
};

export const voiceStyleHelp:Record<string,string>={
  natural:'Lê seguindo o texto e as características da voz, sem acrescentar uma orientação de atuação. É um ponto de partida para mensagens e leituras do dia a dia.',
  narrator:'Orienta uma apresentação de narrador, com foco na leitura e na condução do conteúdo. Use para documentários, explicações e apresentações.',
  story:'Orienta uma maneira de contar histórias, buscando envolvimento e variação de entonação ao longo dos acontecimentos. Use para relatos e histórias de marcas ou produtos.',
  sales:'Orienta uma fala confiante e acolhedora. Use para apresentar benefícios e conversar sobre uma oferta; não reescreve o texto nem garante vendas.',
  advertising:'Orienta uma fala animada, com energia de anúncio. Use para chamadas, lançamentos e peças publicitárias.',
  cinematic:'Orienta uma entrega dramática. Use para suspense, cenas e narrativas com mais tensão. Não adiciona música, efeitos sonoros ou trilha cinematográfica.',
};

export const voiceAdjustmentHelp:Record<string,string>={
  Velocidade:'Muda a rapidez da fala: abaixo de 1 fica mais lenta; acima de 1, mais rápida. O valor 1 é a velocidade padrão. Não determina a emoção.',
  Estabilidade:'Valores mais altos favorecem uma entrega consistente; mais baixos permitem maior variação de entonação. Variação demais pode deixar a fala menos previsível. Com um estilo expressivo, a Intensidade pretendida orienta este ajuste.',
  Semelhança:'Orienta a proximidade com a voz escolhida, inclusive o clone. Aumentar não garante uma cópia perfeita; a gravação de origem e o modelo também influenciam. Compare pela prévia.',
  'Exagero de estilo':'Orienta o quanto acentuar o estilo próprio da voz, nos modelos que aceitam esse ajuste. Não escolhe uma emoção nem substitui o Estilo de interpretação. Comece baixo e compare a prévia.',
};
