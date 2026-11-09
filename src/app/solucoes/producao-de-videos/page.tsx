import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, Check, Clapperboard, Film, MessageCircle, Scissors, Sparkles, Volume2, WandSparkles } from "lucide-react";
import { ConnectyLogo } from "@/components/brand/connecty-logo";
import { PublicSiteHeader } from "@/components/seo/public-site-header";
import { JsonLd } from "@/components/seo/json-ld";
import { buildCanonicalUrl } from "@/lib/seo/site";
import { videoContactPath, videoServicePath } from "@/lib/marketing/video-service";
import { VideoExamples, VslPlayer } from "./video-players";
import { MotionShowcaseProvider, HeroVideoRail, StyleFilmstrip, AudioShowcase, CreativeMosaic } from "./motion-showcase";
import styles from "./video-services.module.css";

const title = "Produção e edição de vídeos para sua marca | ConnectyHub";
const description = "Edição profissional e produção com IA para anúncios, Reels e apresentações. Cortes, motion graphics e som. Converse no WhatsApp e solicite uma proposta.";
export const metadata: Metadata = { title, description, alternates: { canonical: videoServicePath },
  openGraph: { title, description, url: videoServicePath, type: "website", locale: "pt_BR", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};
const faq = [
  ["Preciso ter os vídeos gravados?", "Para edição, trabalhamos a partir das gravações que você envia. Se você precisa criar o conteúdo desde o começo, podemos planejar uma produção com IA, imagens de apoio, apresentação e narração conforme a proposta."],
  ["O que está incluído na edição por R$200?", "A edição profissional transforma as gravações que você envia em um vídeo de até 90 segundos, entregue em Full HD, em um formato escolhido. Inclui os recursos de edição apresentados nesta página, aplicados conforme a necessidade da narrativa: cortes, motion graphics, imagens de apoio, tratamento de áudio, cor e identidade visual. Materiais, direção e condições de ajustes são alinhados antes de começar."],
  ["O vídeo de 90 segundos será todo feito com avatar ou IA?", "Os 90 segundos se referem à duração do vídeo final, que pode combinar avatar, cenas de IA, imagens reais, B-rolls e edição profissional. A quantidade e a duração das cenas geradas por IA são definidas na proposta. A produção com avatar e cenas de IA começa em R$600 por vídeo; mais cenas ou maior complexidade recebem orçamento específico."],
  ["Como funciona o avatar com minha imagem e voz?", "Planejamos as cenas, orientamos sobre as referências necessárias e utilizamos sua imagem e voz com sua autorização. O avatar aparece em cenas selecionadas, integrado a demonstrações, imagens de apoio e motion graphics, conforme a proposta aprovada."],
  ["Vocês entregam cinco vídeos por dia?", "Essa é uma capacidade de produção para escopos compatíveis, com planejamento e materiais disponíveis. O volume e o prazo de cada projeto são combinados antes do início. Não é uma promessa de entrega imediata para qualquer produção."],
  ["Posso escolher o estilo e enviar referências?", "Sim. Os exemplos ajudam a conversar sobre ritmo, linguagem visual e formato. Você também pode enviar suas referências. Definimos uma direção própria para sua marca e avaliamos o que cabe no escopo, nos materiais e no orçamento."],
  ["Vocês fazem vídeos verticais e horizontais?", "Sim. Podemos preparar vídeos para Reels, Shorts, anúncios, YouTube e páginas de apresentação. Formatos e versões adicionais são combinados na proposta."],
  ["Como funcionam os ajustes?", "Você recebe uma prévia para revisar. A quantidade de rodadas, o tipo de ajuste e as condições de aprovação ficam definidos na proposta, antes da produção."],
  ["Preciso assinar a plataforma ConnectyHub?", "Não. A produção e edição de vídeos é um serviço que você pode contratar diretamente com a ConnectyHub. O primeiro passo é conversar com a Eliane pelo nosso WhatsApp."],
];

function Contact({ children = "Solicitar proposta", variant = "primary", style }: { children?: React.ReactNode; variant?: "primary" | "secondary"; style?: string }) {
  return <a className={variant === "primary" ? styles.primary : styles.secondary} href={`${videoContactPath}${style ? `?estilo=${style}` : ""}`} rel="nofollow"><MessageCircle size={18}/>{children}<ArrowRight size={17}/></a>;
}

export default function VideoServicesPage() {
  // Versioned public media; an environment override can select a future approved release.
  const mediaBase = (process.env.CONNECTYHUB_VIDEO_MEDIA_BASE_URL || "https://pub-9f5b2802265a4ee2b52bc4e080f3941e.r2.dev/marketing/video-services/vsl-v1-2990f8d5").replace(/\/$/, "");
  return <div className={styles.page}>
    <PublicSiteHeader active="video"/>
    <JsonLd id="connectyhub-video-services" data={{ "@context": "https://schema.org", "@type": "Service", name: "Produção e edição de vídeos ConnectyHub", description, serviceType: "Edição e produção audiovisual", url: buildCanonicalUrl(videoServicePath), provider: { "@type": "Organization", name: "ConnectyHub", url: buildCanonicalUrl("/") }, areaServed: "BR" }}/>
    <MotionShowcaseProvider>
    <main>
      <section className={styles.hero}>
        <div className={styles.heroGlow}/>
        <div className={styles.heroStage}>
        <div className={styles.heroCopy}>
          <p className={styles.badge}><span/> SUA MARCA MERECE DAR PLAY</p>
          <h1>Você cuida do negócio.<br/><em>A gente cuida do vídeo.</em></h1>
          <p className={styles.heroLead}>Transforme suas ideias e gravações em conteúdo que dá vontade de assistir. Edição profissional e produção com IA, do primeiro corte ao último detalhe.</p>
          <div className={styles.heroActions}><Contact/><a href="#estilos" className={styles.textAction}>Explore os estilos <ArrowDown size={16}/></a></div>
          <div className={styles.heroNotes}><span><Check size={14}/>Edição por R$200</span><span><Check size={14}/>Proposta para a sua rotina</span></div>
        </div>
        <HeroVideoRail/>
        </div>
        <div className={styles.commercialFacts}><div><strong>R$200</strong><span>edição de vídeos</span></div><div><strong>R$600<span>+</span></strong><span>produção com IA</span></div><div><strong><small>até </small>5<span>/dia</span></strong><span>conforme escopo e materiais</span></div></div>
        <p className={styles.factNote}>Vídeos de até 90 segundos. Produção com IA a partir de R$600, com cenas e duração de IA definidas na proposta.</p>
        <div className={styles.miniSteps}><span><b>01</b> Você traz a ideia</span><span><b>02</b> A gente produz</span><span><b>03</b> Sua marca dá play</span></div>
      </section>

      <section className={`${styles.section} ${styles.vslSection}`}>
        <div className={styles.centerHead}><p className={styles.kicker}>CONHEÇA A NOSSA PRODUÇÃO</p><h2>Da sua ideia ao vídeo.<br/><em>A gente cuida do caminho.</em></h2><p>Edição, criatividade e tecnologia a serviço da sua mensagem.</p></div>
        <div className={styles.vslWrap}><VslPlayer mediaBase={mediaBase}/><p className={styles.vslCaption}>Dê play. São 90 segundos para conhecer o que podemos criar juntos.</p></div>
      </section>

      <section className={`${styles.section} ${styles.styleSection}`} id="estilos">
        <div className={styles.centerHead}><p className={styles.kicker}>UM ESTILO PARA CADA IDEIA</p><h2>Imagine o que a sua marca<br/><em>pode colocar no mundo.</em></h2><p>Explore linguagens, cenas e possibilidades para o seu próximo vídeo.</p></div>
        <StyleFilmstrip/>
      </section>

      <section className={`${styles.section} ${styles.audioSection}`}>
        <div className={styles.centerHead}><p className={styles.kicker}>O IMPACTO VAI ALÉM DA IMAGEM</p><h2>Tem ritmo. Tem voz.<br/><em>Tem a sua mensagem.</em></h2><p>Narração, trilha e desenho de som dão presença a cada cena.</p></div>
        <AudioShowcase/>
      </section>

      <section className={styles.visualPanel}>
        <div className={styles.visualCopy}><p className={styles.kicker}>PESSOAS, HISTÓRIAS E PERSONALIDADE</p><h2>Sua marca.<br/>Seu universo.<br/><em>Novas possibilidades.</em></h2><p>Uma apresentação, um anúncio ou um conteúdo para as redes. Encontramos a linguagem que aproxima sua ideia de quem precisa conhecê-la.</p><p className={styles.visualDetail}>Direção criativa · Apresentação · Conteúdo social</p><Contact style="apresentador">Vamos criar o seu vídeo</Contact></div>
        <CreativeMosaic/>
      </section>

      <section className={`${styles.visualPanel} ${styles.visualPanelReverse}`}>
        <div className={styles.visualCopy}><p className={styles.kicker}>DO DETALHE À CENA INTEIRA</p><h2>Um toque de surpresa.<br/><em>Um vídeo que fica.</em></h2><p>Cenas com IA, movimento e efeitos visuais abrem espaço para ideias que pedem algo diferente. Nós planejamos os recursos de acordo com o seu projeto.</p><p className={styles.visualDetail}>Efeitos visuais · Cenas com IA · Finalização</p><Contact variant="secondary" style="especial">Conversar sobre uma ideia</Contact></div>
        <CreativeMosaic kind="effects"/>
      </section>

      <section className={`${styles.section} ${styles.completeExamples}`}>
        <div className={styles.centerHead}><p className={styles.kicker}>DO CONCEITO AO VÍDEO COMPLETO</p><h2>Encontre uma direção.<br/><em>Crie a sua versão.</em></h2><p>Referências de edição, publicidade e motion para começar nossa conversa.</p></div>
        <VideoExamples/>
        <p className={styles.sectionNote}>Cada projeto ganha uma linguagem própria. Técnica, complexidade e entregas são definidas na proposta.</p>
      </section>

      <section className={styles.painSection}>
        <div className={styles.centerHead}><p className={styles.kicker}>MAIS IDEIAS PUBLICADAS. MENOS MATERIAL PARADO.</p><h2>Sua próxima ideia<br/><em>não precisa entrar na fila.</em></h2></div>
        <div className={styles.painPoints}><p><span>01</span> Gravações esperando uma edição.</p><p><span>02</span> Conteúdo sem ritmo ou identidade.</p><p><span>03</span> Boas ideias que nunca saem do papel.</p><p><span>04</span> Frequência de publicação que não acompanha o negócio.</p></div>
        <p className={styles.painEnding}>Você foca no que faz.<br/><strong>A ConnectyHub cuida da produção.</strong></p><Contact>Quero colocar minhas ideias em movimento</Contact>
      </section>

      <section className={styles.section}>
        <div className={styles.centerHead}><p className={styles.kicker}>CADA DETALHE TRABALHA JUNTO</p><h2>Mais intenção.<br/><em>Em cada segundo.</em></h2></div>
        <div className={styles.craftGrid}>{[
          { icon: Scissors, title: "Cortes com ritmo", text: "Uma edição que valoriza o que importa e mantém sua mensagem em movimento." },
          { icon: Film, title: "Imagens que contam", text: "B-rolls e cenas de apoio conectam o que você fala ao que o público vê." },
          { icon: WandSparkles, title: "Motion com propósito", text: "Textos, destaques e gráficos tornam a sua explicação mais clara e visual." },
          { icon: Volume2, title: "Som que faz sentir", text: "Voz, trilha e efeitos se encontram para dar presença a cada cena." },
        ].map(item => <article key={item.title}><item.icon size={25}/><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
        <div className={styles.capacity}><div className={styles.capacityNumber}><span>ATÉ</span><strong>5</strong></div><div><h3>vídeos por dia.<br/><em>Uma rotina com mais possibilidades.</em></h3><p>Capacidade conforme escopo, planejamento e disponibilidade dos materiais. Prazo e volume são combinados para cada projeto.</p></div><span className={styles.capacityIcon}><Clapperboard size={42}/></span></div>
      </section>

      <section className={`${styles.section} ${styles.processSection}`} id="processo">
        <div className={styles.sectionHead}><div><p className={styles.kicker}>DO “TENHO UMA IDEIA” AO PLAY</p><h2>Próximo passo?<br/><em>Uma conversa.</em></h2></div><p>Você não precisa chegar com tudo resolvido. Nós organizamos a produção com você.</p></div>
        <ol className={styles.steps}>{[
          ["Conte o que precisa", "Fale com a Eliane no WhatsApp. Conte seu objetivo, onde vai publicar e o que já tem de material."],
          ["Aprove a direção", "Definimos o estilo, os formatos, o prazo, as revisões e o investimento da produção."],
          ["A gente produz", "Seu conteúdo ganha edição, elementos visuais e som conforme o escopo aprovado."],
          ["Revise e dê play", "Você recebe a prévia, alinhamos os ajustes previstos e entregamos os arquivos finais."],
        ].map(([heading, copy], index) => <li key={heading}><span>0{index + 1}</span><h3>{heading}</h3><p>{copy}</p></li>)}</ol>
      </section>

      <section className={styles.section} id="valores">
        <div className={styles.centerHead}><p className={styles.kicker}>PRODUÇÃO QUE CABE NO SEU MOMENTO</p><h2>Seu próximo vídeo<br/><em>começa aqui.</em></h2><p>Do material que você já gravou a uma ideia criada do zero.</p></div>
        <div className={styles.pricingGrid}>
          <article className={styles.priceCard}>
            <Scissors size={24}/><h3>Edição profissional</h3>
            <p className={styles.offerIntro}>Transformamos suas gravações em um vídeo dinâmico para apresentar seu negócio, produto ou serviço.</p>
            <div className={styles.price}><small>EDIÇÃO DO SEU MATERIAL</small><strong><span>R$</span>200</strong><span>por vídeo de até 90 segundos</span></div>
            <ul>
              <li><Check/>Seleção de cenas, cortes dinâmicos, zooms e transições</li>
              <li><Check/>Motion graphics, títulos e destaques animados</li>
              <li><Check/>B-rolls, animação de fotos, tela dividida e demonstrações</li>
              <li><Check/>Tratamento de voz, trilha e efeitos sonoros</li>
              <li><Check/>Cor, enquadramento, identidade visual e chamada para ação</li>
              <li><Check/>Full HD em um formato: vertical ou horizontal</li>
            </ul>
            <details className={styles.offerDetails}><summary>Veja todos os recursos de edição<span>+</span></summary><dl>{[
              ["Edição do seu material", "Seleção dos melhores trechos, organização das cenas e montagem a partir das gravações que você enviar."],
              ["Cortes, zooms e transições", "Edição dinâmica acompanhando a narrativa e o ritmo do vídeo."],
              ["Motion graphics", "Títulos animados, números, destaques, ícones e elementos gráficos para explicar e valorizar sua mensagem."],
              ["B-rolls e imagens de apoio", "Uso do seu material e de acervo com licença adequada, conforme a necessidade."],
              ["Animações de fotos", "Movimento em fotos e elementos visuais, dentro do estilo definido para o vídeo."],
              ["Tela dividida e demonstrações", "Combinação de apresentador, produto, imagens e informações."],
              ["Tratamento de áudio", "Redução de ruídos quando possível, ajuste da voz e equilíbrio dos volumes."],
              ["Trilha e efeitos sincronizados", "Cliques, impactos, transições e mudanças de música conforme as cenas."],
              ["Cor, iluminação e enquadramento", "Ajustes que respeitam a qualidade das suas gravações."],
              ["Identidade visual", "Cores, tipografia e aplicação do logotipo da sua marca."],
              ["Chamada para ação", "Fechamento direcionado ao objetivo do vídeo."],
              ["Entrega em Full HD", "Um formato escolhido: vertical para Reels, Shorts e TikTok ou horizontal para YouTube e páginas de venda."],
            ].map(([heading,copy])=><div key={heading}><dt>{heading}</dt><dd>{copy}</dd></div>)}</dl></details>
            <p className={styles.offerClosing}>Você grava. A ConnectyHub transforma seu conteúdo em um vídeo pronto para publicar.</p>
            <Contact variant="secondary" style="edicao">Conversar sobre edição</Contact>
          </article>
          <article className={`${styles.priceCard} ${styles.featuredPrice}`}>
            <div className={styles.priceBadge}>SUA IMAGEM. SUA VOZ. NOVAS CENAS.</div><Sparkles size={24}/><h3>Produção com avatar<br/>e cenas de IA</h3>
            <p className={styles.offerIntro}>Apresente seu negócio com sua imagem e sua voz, combinando cenas de IA, imagens reais e edição profissional.</p>
            <div className={styles.price}><small>A PARTIR DE</small><strong><span>R$</span>600</strong><span>por vídeo final de até 90 segundos</span></div>
            <ul>
              <li><Check/>Todos os recursos de edição profissional</li>
              <li><Check/>Planejamento das cenas e orientação sobre as referências</li>
              <li><Check/>Uso autorizado da sua imagem e voz na apresentação</li>
              <li><Check/>Cenas selecionadas do avatar apresentando seu produto, serviço ou ambiente</li>
              <li><Check/>Avatar integrado a B-rolls, demonstrações e motion graphics</li>
              <li><Check/>Cenas e transformações com IA conforme o escopo contratado</li>
            </ul>
            <div className={styles.aiScope}><strong>Até 90s de vídeo final.</strong><p>A quantidade e a duração das cenas geradas por IA são definidas na proposta. O vídeo pode combinar avatar, cenas reais e outros recursos.</p></div>
            <Contact style="ia">Conversar sobre produção</Contact>
          </article>
          <article className={styles.priceCard}>
            <Clapperboard size={24}/><h3>Produções especiais</h3>
            <p className={styles.offerIntro}>Mais tempo, mais cenas ou uma ideia fora do comum. Vamos desenhar a produção para o seu projeto.</p>
            <div className={`${styles.price} ${styles.customPrice}`}><small>FEITO PARA O SEU PROJETO</small><strong>Sob orçamento</strong><span>escopo e investimento personalizados</span></div>
            <ul>
              <li><Check/>VSLs e apresentações com mais de 90 segundos</li>
              <li><Check/>Vídeos com muitas cenas de IA, personagens ou ambientes</li>
              <li><Check/>Transformações de imóveis, decoração virtual e cenas cinematográficas</li>
              <li><Check/>Animações complexas, demonstrações detalhadas e peças personalizadas</li>
              <li><Check/>Versões adicionais, outros idiomas e adaptações para campanhas</li>
              <li><Check/>Pacotes de produção recorrente</li>
            </ul>
            <p className={styles.offerClosing}>Uma proposta construída para a dimensão da sua ideia.</p>
            <Contact variant="secondary" style="especial">Conversar sobre minha ideia</Contact>
          </article>
        </div>
        <p className={styles.pricingNote}>Os recursos são aplicados conforme a necessidade da narrativa e a direção aprovada. Prazo, materiais, revisões e eventuais serviços adicionais são combinados na proposta antes do início da produção.</p>
        <div className={styles.recurringOffer}><div><p className={styles.kicker}>CONTEÚDO PARA A SUA ROTINA</p><h3>Precisa publicar com frequência?</h3><p>Consulte nossos pacotes recorrentes. Produção de até cinco vídeos por dia, conforme o volume contratado, a complexidade e o recebimento dos materiais.</p></div><Contact variant="secondary" style="especial">Consultar pacotes recorrentes</Contact></div>
      </section>

      <section className={`${styles.section} ${styles.faq}`} id="perguntas"><div><p className={styles.kicker}>ANTES DO PRIMEIRO PLAY</p><h2>Vamos deixar<br/><em>tudo claro.</em></h2><p>Ficou com outra dúvida?<br/>A conversa continua no WhatsApp.</p></div><div className={styles.questions}>{faq.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></section>

      <section className={styles.finalCta}><p className={styles.kicker}>MENOS IDEIAS PARADAS. MAIS CONTEÚDO NO MUNDO.</p><h2>Seu próximo vídeo<br/>pode começar <em>agora.</em></h2><p>Conte o que você tem em mente.<br/>Vamos montar uma proposta para a sua rotina.</p><Contact>Falar com a Eliane no WhatsApp</Contact><small>Atendimento pelo WhatsApp da ConnectyHub.</small></section>
    </main>
    </MotionShowcaseProvider>
    <footer className={styles.footer}><div><Link href="/" aria-label="ConnectyHub, início"><ConnectyLogo type="full" tone="white" className="h-6 w-40"/></Link><p>Tecnologia, criatividade e negócios conectados.</p></div><nav aria-label="Rodapé"><Link href="/solucoes">Soluções</Link><Link href="/solucoes-personalizadas">Desenvolvimento</Link><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link></nav><small>© {new Date().getFullYear()} ConnectyHub</small></footer>
    <div className={styles.mobileCta}><Contact>Solicitar proposta no WhatsApp</Contact></div>
  </div>;
}
