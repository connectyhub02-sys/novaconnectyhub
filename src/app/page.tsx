"use client";

import * as React from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  ArrowRight,
  Briefcase,
  Check,
  ChevronDown,
  GraduationCap,
  Layers,
  Languages,
  MessageCircle,
  MessageSquare,
  Mic,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  User,
  Video,
  X,
  Zap,
} from "lucide-react";
import { ConnectyLogo } from "@/components/brand/connecty-logo";
import { Spotlight } from "@/components/ui/spotlight";

const HERO_VIDEO_MP4 = "https://pub-9f5b2802265a4ee2b52bc4e080f3941e.r2.dev/avatar%20connectyhub.mp4";

/* ── DESIGN TOKEN ─────────────────────────────────── */
const G = "#00ff88"; // primary green

/* ── DATA ─────────────────────────────────────────── */

const capabilities = [
  { icon: MessageSquare, label: "Texto" },
  { icon: Mic, label: "Áudio com sua voz" },
  { icon: Layers, label: "Imagem" },
  { icon: Video, label: "Vídeo" },
  { icon: MessageCircle, label: "WhatsApp 24/7" },
  { icon: Sparkles, label: "Teste de Turing" },
  { icon: Languages, label: "55 idiomas" },
];

const differentials = [
  {
    icon: MessageSquare,
    title: "Sem menu, sem fluxo travado",
    text: "O cliente não recebe opções numeradas. Ele conversa, pergunta, manda áudio e recebe resposta natural.",
  },
  {
    icon: Layers,
    title: "Nada de textão",
    text: "Seu clone responde em partes, com pausas e ritmo de WhatsApp. Parece conversa, não bloco de atendimento.",
  },
  {
    icon: Mic,
    title: "Áudio com contexto",
    text: "Pode usar voz, interpretar intenção e manter rapport para o lead não abandonar a conversa.",
  },
  {
    icon: Video,
    title: "Entende mídia",
    text: "Foto, vídeo, print, áudio e texto entram no mesmo contexto para seu clone continuar a venda.",
  },
  {
    icon: TrendingUp,
    title: "Contorna objeções",
    text: "Quando o lead trava, seu clone pergunta melhor, argumenta e conduz para agenda, pagamento ou próximo passo.",
  },
  {
    icon: Zap,
    title: "Atende 24h",
    text: "Enquanto você vive, dorme ou grava conteúdo, seu clone mantém o WhatsApp respondendo e vendendo.",
  },
];

const botMessages = [
  { text: "Olá! Selecione uma opção:\n1 - Produtos\n2 - Preços\n3 - Atendente", time: "10:32" },
  { text: "Digite o número da opção desejada.", time: "10:33" },
  {
    text: "Horário de atendimento: 9h-18h.\nTente novamente amanhã.",
    time: "10:34",
  },
];

const cloneMessages = [
  {
    text: "Oi, João. Vi que você olhou o Curso de Tráfego ontem. Quer que eu te ajude a decidir?",
    time: "10:32",
  },
  {
    text: "Faz sentido ter dúvida. Antes do preço: você quer vender mais como gestor ou para o seu próprio negócio?",
    time: "10:33",
  },
  {
    text: "Pelo seu caso, eu começaria pelo plano de entrada. Posso te mandar o link com a condição de hoje?",
    time: "10:34",
  },
];

const profiles = [
  {
    icon: GraduationCap,
    title: "Infoprodutor",
    pain: "Seu clone captura o lead, qualifica, quebra objeções e manda o link de pagamento no WhatsApp.",
    result: "Vendas rodando enquanto você dorme",
  },
  {
    icon: Briefcase,
    title: "Prestador de serviço",
    pain: "Clínica, salão, consultório, academia: seu clone responde, agenda e confirma sem mensagem perdida.",
    result: "Agenda cheia sem tocar no celular",
  },
  {
    icon: ShoppingCart,
    title: "E-commerce",
    pain: "Recupera carrinho, responde dúvidas sobre produto, confirma pedido e mantém o pós-venda ativo.",
    result: "Mais conversão sem anúncio extra",
  },
];

const beforeItems = [
  "Menu fixo e resposta engessada",
  "Textão que o lead não lê",
  "Não entende áudio, foto ou contexto",
  "Trava quando aparece uma objeção",
];

const afterItems = [
  "Conversa natural e particionada",
  "Áudio, texto, imagem e vídeo no contexto",
  "Rapport antes de vender",
  "Negocia, agenda e fecha no WhatsApp",
];

const socialMetrics = [
  { value: "+14.382", label: "conversas processadas" },
  { value: "98%", label: "taxa de resposta < 30s" },
  { value: "2.108", label: "clones ativos hoje" },
];

const plans = [
  {
    name: "Start",
    price: "R$ 97",
    description: "Para começar a vender com IA no WhatsApp.",
    tagline: "Entrada com 1 agente para validar atendimento e vendas",
    included: [
      "3.000 créditos inclusos",
      "1 WhatsApp conectado",
      "1 agente IA",
      "2 usuários no painel",
      "Catálogo de vendas",
      "CRM básico, leads e conversas",
      "Voz IA por créditos",
    ],
    locked: ["Campanhas e automações", "API WhatsApp", "Relatórios avançados"],
  },
  {
    name: "Pro",
    price: "R$ 247",
    description: "Para operação comercial com mais volume.",
    tagline: "4 agentes e 4 WhatsApps para times que atendem todos os dias",
    popular: true,
    included: [
      "10.000 créditos inclusos",
      "4 WhatsApps conectados",
      "4 agentes IA",
      "5 usuários no painel",
      "CRM e funil comercial",
      "Campanhas e automações",
      "Relatórios básicos",
      "Voz IA por créditos",
    ],
    locked: ["API WhatsApp", "Integrações avançadas"],
  },
  {
    name: "Scale",
    price: "R$ 497",
    description: "Para escalar atendimento, agentes e API.",
    tagline: "1 agente para cada WhatsApp em operações com equipe",
    premium: true as const,
    included: [
      "25.000 créditos inclusos",
      "8 WhatsApps conectados",
      "8 agentes IA",
      "15 usuários no painel",
      "API WhatsApp",
      "Integrações avançadas",
      "Relatórios e operação em escala",
      "Voz IA por créditos",
    ],
    locked: [],
  },
];

const landingNavItems = [
  { href: "#inicio", label: "Início" },
  { href: "#teste-turing", label: "Teste" },
  { href: "#diferencial", label: "Diferenciais" },
  { href: "#idiomas", label: "Idiomas" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "FAQ" },
];

const faqs: [string, string][] = [
  [
    "O que é Teste de Turing no WhatsApp?",
    "É a prova prática de que a conversa deixou de parecer robótica. O lead pode até saber que existe IA por trás, mas continua porque recebe resposta útil, rápida, contextual e natural.",
  ],
  [
    "Preciso saber programar para configurar?",
    "Não. Você conecta o WhatsApp, explica seu negócio em linguagem natural e treina seu clone como treinaria uma pessoa nova da equipe.",
  ],
  [
    "Funciona para o meu nicho?",
    "Se você vende, agenda ou atende pelo WhatsApp, seu clone pode ajudar. Ele funciona para infoprodutores, prestadores de serviço, e-commerce, clínicas, consultorias e operações locais.",
  ],
  [
    "Ele entende áudio, imagem e vídeo?",
    "Sim. A proposta do seu clone é conversar como uma pessoa no WhatsApp: texto curto, áudio, imagem, vídeo, histórico e contexto entrando na mesma conversa.",
  ],
  [
    "Seu clone atende em outros idiomas?",
    "Sim. O ConnectyHub pode atender leads em 55 idiomas, identificando o idioma da conversa e mantendo o contexto comercial para venda, agenda ou suporte.",
  ],
  [
    "Posso vender qualquer coisa pelo WhatsApp?",
    "Você pode vender produtos e serviços permitidos no WhatsApp. O uso precisa respeitar as políticas comerciais do WhatsApp/Meta e as regras do seu mercado.",
  ],
  [
    "Quanto tempo leva para ativar?",
    "A maioria dos negócios consegue configurar, testar e colocar seu clone para atender em menos de 24h.",
  ],
  [
    "Qual a diferença para outros chatbots?",
    "Chatbots seguem fluxo. Seu clone entende contexto, responde em partes, usa rapport, contorna objeções e conduz para venda, agenda ou pagamento.",
  ],
];

const TOAST_EVENTS = [
  { name: "Carlos M.", action: "recuperou carrinho de", value: "R$ 412" },
  { name: "Fernanda L.", action: "fechou venda de", value: "R$ 297" },
  { name: "Diego S.", action: "Seu clone ativou e vendeu", value: "R$ 189" },
  { name: "Ana P.", action: "recebeu pix de", value: "R$ 547" },
  { name: "Roberto A.", action: "Seu clone fechou negócio de", value: "R$ 1.290" },
  { name: "Mariana C.", action: "lead convertido em", value: "R$ 397" },
  { name: "Lucas T.", action: "venda via áudio de", value: "R$ 249" },
];

const toastFirstDelayMs = 14_000;
const toastIntervalMs = 10_000;
const toastVisibleMs = 2_800;

const steps = [
  {
    n: "01",
    title: "Conecte seu WhatsApp",
    text: "Use o número que seus clientes já conhecem. A conexão é guiada e não exige instalação complicada.",
  },
  {
    n: "02",
    title: "Treine com seu jeito de vender",
    text: "Explique oferta, tom de voz, perguntas frequentes, objeções e como você conduz o fechamento.",
  },
  {
    n: "03",
    title: "Ative e acompanhe",
    text: "Seu clone começa a atender. Você acompanha tudo e pode assumir qualquer conversa quando quiser.",
  },
];

const forWhom = [
  { emoji: "💬", text: "Negócios que vendem, atendem ou agendam pelo WhatsApp todos os dias" },
  { emoji: "⚡", text: "Quem perde lead porque demora para responder" },
  { emoji: "🌙", text: "Quem quer vender 24h sem contratar mais atendentes" },
  { emoji: "🤝", text: "Quem precisa de IA com conversa humana, não bot genérico" },
];

const languageHighlights = [
  {
    title: "Responde no idioma do lead",
    text: "Seu clone identifica o idioma da conversa e mantém o atendimento natural sem trocar de canal.",
  },
  {
    title: "Vende fora do Brasil",
    text: "Atenda clientes de outros países pelo WhatsApp sem contratar uma equipe multilíngue.",
  },
  {
    title: "Mantém contexto comercial",
    text: "Texto, áudio, objeções, orçamento e follow-up seguem adaptados para cada mercado.",
  },
];

const languageSamples = [
  "Português",
  "English",
  "Español",
  "Français",
  "Deutsch",
  "Italiano",
  "Japanese",
  "Arabic",
  "Mandarin",
  "Hindi",
  "Korean",
  "Dutch",
];

const turingChatEvents = [
  { kind: "lead", text: "Oi, vi seu anúncio. Isso serve para clínica?", time: "10:42" },
  { kind: "typing", text: "Seu clone digitando..." },
  { kind: "clone", text: "Serve sim, Mariana.", time: "10:42" },
  { kind: "clone", text: "Você quer melhorar o agendamento ou responder dúvidas antes da consulta?", time: "10:42" },
  { kind: "lead-audio", duration: "0:08", time: "10:43" },
  { kind: "recording", text: "Seu clone gravando áudio..." },
  { kind: "clone-audio", duration: "0:12", time: "10:43" },
  { kind: "clone", text: "Entendi. Hoje vocês perdem lead porque a pessoa pergunta preço e some, certo?", time: "10:44" },
  { kind: "lead-media", label: "print enviado", text: "Esse tipo de conversa acontece direto.", time: "10:44" },
  { kind: "typing", text: "Seu clone analisando imagem..." },
  { kind: "clone", text: "Vi aqui. Seu clone responderia em partes, tiraria a objeção e já ofereceria um horário.", time: "10:45" },
  { kind: "clone", text: "Quer testar com uma conversa real da sua clínica?", time: "10:45" },
];

/* ── FRAMER VARIANTS ──────────────────────────────── */

const stagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.1 },
  },
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: "easeOut" },
  },
} as const;

/* ── PAGE ─────────────────────────────────────────── */

export default function Home() {
  const [toast, setToast] = React.useState<(typeof TOAST_EVENTS)[0] | null>(null);
  const [toastLeaving, setToastLeaving] = React.useState(false);
  const toastIndexRef = React.useRef(0);
  const toastTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  // Toast FOMO
  React.useEffect(() => {
    const showToast = () => {
      const event = TOAST_EVENTS[toastIndexRef.current % TOAST_EVENTS.length];
      toastIndexRef.current++;
      setToastLeaving(false);
      setToast(event);
      setTimeout(() => {
        setToastLeaving(true);
        setTimeout(() => setToast(null), 400);
      }, toastVisibleMs);
    };
    const first = setTimeout(() => {
      showToast();
      toastTimerRef.current = setInterval(showToast, toastIntervalMs);
    }, toastFirstDelayMs);
    return () => {
      clearTimeout(first);
      if (toastTimerRef.current) clearInterval(toastTimerRef.current);
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white overflow-x-hidden">
      <Header />

      {/* ── 1. HERO ──────────────────────────────────── */}
      <section id="inicio" className="connecty-hero relative w-full overflow-hidden">
        <Spotlight className="-top-60 right-0 md:right-32" fill={G} />

        {/* Mobile: vídeo como fundo atrás do texto */}
        <div className="hero-mobile-clone-bg pointer-events-none absolute inset-0 z-0 overflow-hidden lg:hidden">
          <video autoPlay muted loop playsInline
            className="absolute inset-0 h-full w-full object-cover"
            style={{ opacity: 0.65 }}
          >
            <source src={HERO_VIDEO_MP4} type="video/mp4" />
          </video>
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to bottom, rgba(10,10,10,0.90) 0%, rgba(10,10,10,0.55) 42%, rgba(10,10,10,0.15) 64%, transparent 80%)"
          }} />
        </div>

        <div className="hero-layout mx-auto max-w-[1760px] px-6 md:px-10">

          {/* ── Coluna esquerda: copy ── */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="hero-copy relative z-10 flex min-h-[100svh] flex-col justify-start pt-28 pb-10"
          >
            <motion.div variants={fadeUp}>
              <GreenPill className="turing-pulse-pill">:: Teste de Turing no WhatsApp ::</GreenPill>
            </motion.div>

            <motion.h1 variants={fadeUp} className="hero-headline mt-5">
              Atende como humano.<br />
              <span style={{ color: G }}>Escala como máquina.</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="hero-subcopy mt-5 max-w-lg leading-relaxed" style={{ fontSize: "1.125rem", color: "#e5e5e5" }}>
              Crie o{" "}
              <span style={{ color: "#00ff88", fontWeight: 800 }}>Seu clone</span>{" "}
              de vendas no{" "}
              <span style={{ color: "#00ff88", fontWeight: 600 }}>WhatsApp</span>{" "}
              que atende, negocia e fecha 24h com conversa natural{" "}
              <span style={{ color: "#00ff88", fontWeight: 700 }}>aprovada no Teste de Turing</span>.
            </motion.p>

            <motion.div variants={fadeUp} className="hero-ctas mt-7 flex max-w-[320px] flex-col gap-3 sm:max-w-none sm:flex-row">
              <a className="cta-primary" href="/iniciar">
                Ativar meu clone agora <ArrowRight size={16} />
              </a>
              <a className="cta-secondary" href="#teste-turing">
                Ver o teste na prática
              </a>
            </motion.div>
            <motion.div variants={fadeUp} className="hero-trial-offer mt-4">
              <Check size={15} />
              <div>
                <strong>Teste grátis por 7 dias</strong>
                <span>Veja seu clone atendendo antes de pagar.</span>
              </div>
              <em>Sem cartão</em>
              <em>Sem programar</em>
            </motion.div>

            <motion.div variants={fadeUp} className="capability-strip mt-5">
              {capabilities.map((c) => (
                <div
                  key={c.label}
                  className={`capability-pill ${c.label.includes("Turing") || c.label.includes("55") ? "capability-pill-highlight" : ""}`}
                >
                  <c.icon size={10} />
                  {c.label}
                </div>
              ))}
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/[0.06] pt-5 font-mono text-[11px] text-zinc-300"
            >
              <span>+14.382 conversas</span>
              <span className="text-white/25">·</span>
              <span>98% taxa de resposta</span>
              <span className="text-white/25">·</span>
              <span>2.108 clones ativos</span>
              <span className="text-white/25">·</span>
              <span>55 idiomas</span>
            </motion.div>
          </motion.div>

          {/* ── Coluna direita: painel futurista com vídeo — desktop only ── */}
          <div className="hero-visual-shell">
            <div className="hero-visual">

              {/* Card VOCÊ (DIGITAL) — sobreposto à esquerda no desktop */}
              <div className="hero-digital-card">
                <CloneScannerCard />
              </div>

              {/* Frame do vídeo com bordas HUD — tudo dentro para evitar overflow */}
              <div className="clone-video-frame">
                <div className="hud-grid" />
                <div className="hud-scanlines" />
                <div className="hud-glow-top" />
                <div className="hud-glow-br" />
                <span className="hud-corner hud-corner-tl" />
                <span className="hud-corner hud-corner-tr" />
                <span className="hud-corner hud-corner-bl" />
                <span className="hud-corner hud-corner-br" />
                <video autoPlay muted loop playsInline>
                  <source src={HERO_VIDEO_MP4} type="video/mp4" />
                </video>
                {/* Barra de status dentro do frame */}
                <div className="hud-status-bar">
                  <span className="hud-dot" />
                  <span className="hud-dot hud-dot-dim" />
                  <span className="hud-dot hud-dot-dim" />
                  <span className="hud-label">SEU.CLONE.ACTIVE</span>
                </div>
                {/* Traços decorativos dentro do frame, lado direito */}
                <div className="hud-side-lines">
                  <div className="hud-side-line" style={{ width: "20px" }} />
                  <div className="hud-side-line" style={{ width: "13px", opacity: 0.55 }} />
                  <div className="hud-side-line" style={{ width: "17px", opacity: 0.35 }} />
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── 2. TESTE DE TURING NA PRÁTICA ─────────────── */}
      <PageSection id="teste-turing" bg="#101010">
        <div className="turing-practice-grid">
          <div>
            <GreenPill className="turing-pulse-pill">:: Teste de Turing na prática ::</GreenPill>
            <h2 className="section-heading mt-4">
              Veja o Teste de Turing acontecendo no WhatsApp.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
              Texto, áudio, imagem, vídeo, objeções e fechamento. Seu clone conversa em partes,
              entende o contexto e mantém o cliente na conversa.
            </p>
            <div className="turing-proof-list mt-8">
              {[
                "online, digitando e gravando áudio no ritmo certo",
                "mensagens curtas, particionadas e com rapport",
                "leitura de mídia, objeção e próximo passo comercial",
              ].map((item) => (
                <div key={item} className="turing-proof-item">
                  <Check size={15} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-[#00ff88]/70">
              Não é menu. Não é resposta pronta. É atendimento natural treinado para vender.
            </p>
          </div>
          <TuringWhatsAppDemo />
        </div>
      </PageSection>

      {/* ── 2. DIFERENCIAL CENTRAL ───────────────────── */}
      <PageSection id="diferencial" bg="#0d0d0d">
        <GreenPill>{"// Não é bot. É seu clone."}</GreenPill>
        <h2 className="section-heading mt-4">
          O cliente pode saber que existe IA. Ele continua porque está sendo bem atendido.
        </h2>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">
          A diferença não é esconder tecnologia. É entregar uma conversa tão útil, rápida e humana
          que o lead não sente vontade de abandonar o WhatsApp.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {differentials.map((d, i) => (
            <motion.div
              key={d.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="diff-card"
            >
              <div className="diff-card-icon">
                <d.icon size={20} />
              </div>
              <h3>{d.title}</h3>
              <p>{d.text}</p>
            </motion.div>
          ))}
        </div>
      </PageSection>

      {/* ── 2.5. IDIOMAS ───────────────────────── */}
      <PageSection id="idiomas" bg="#0a0a0a">
        <div className="language-section-grid">
          <div>
            <GreenPill>{"// 55 idiomas"}</GreenPill>
            <h2 className="section-heading mt-4">
              Venda e atenda leads em 55 idiomas pelo WhatsApp.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
              Seu clone conversa no idioma do cliente, mantém o contexto da venda e conduz o lead
              até agenda, orçamento ou pagamento sem depender de página de vendas.
            </p>
            <div className="language-proof-grid mt-8">
              {languageHighlights.map((item) => (
                <div key={item.title} className="language-proof-card">
                  <Check size={15} />
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="language-orbit-panel" aria-label="Atendimento em 55 idiomas">
            <div className="language-orbit-grid" />
            <div className="language-orbit-glow" />
            <span className="language-number">55</span>
            <span className="language-label">idiomas ativos</span>
            <div className="language-chip-cloud">
              {languageSamples.map((language) => (
                <span key={language} className="language-chip">{language}</span>
              ))}
            </div>
            <p>
              Do primeiro contato ao fechamento, seu clone responde no idioma do lead com ritmo de WhatsApp,
              mensagens curtas e contexto comercial.
            </p>
          </div>
        </div>
      </PageSection>

      {/* ── 3. COMO FUNCIONA ───────────────────────── */}
      <PageSection id="como-funciona" bg="#0a0a0a">
        <GreenPill>{"// Como funciona"}</GreenPill>
        <h2 className="section-heading mt-4">
          Do WhatsApp ao seu clone atendendo<br className="hidden sm:block" /> em menos de 24h.
        </h2>
        <div className="setup-timeline mt-10 grid gap-5 sm:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="setup-step-card relative rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6"
            >
              <span className="setup-step-number font-mono text-5xl font-black leading-none">
                {s.n}
              </span>
              <h3 className="mt-4 text-base font-bold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">{s.text}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center gap-2">
          <a
            className="cta-primary w-full max-w-sm justify-center sm:w-auto"
            href="/iniciar"
          >
            Quero meu clone agora <ArrowRight size={16} />
          </a>
          <p className="font-mono text-[11px] text-zinc-400">
            7 dias grátis · Sem cartão · Cancele quando quiser
          </p>
        </div>
      </PageSection>

      {/* ── 3. DEMO COMPARATIVO ──────────────────────── */}
      <PageSection bg="#0a0a0a">
        <GreenPill>{"// Demo comparativo"}</GreenPill>
        <h2 className="section-heading mt-4">
          Bot comum vs Seu clone.
        </h2>
        <ChatDemo />
      </PageSection>

      {/* ── 4. PARA QUEM É ───────────────────────────── */}
      <PageSection bg="#0d0d0d">
        <GreenPill>{"// Para quem é"}</GreenPill>
        <h2 className="section-heading mt-4">
          Se você vende, atende ou agenda pelo WhatsApp,<br className="hidden sm:block" /> seu clone pode fazer por você.
        </h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {forWhom.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="flex items-start gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
            >
              <span className="text-2xl leading-none">{item.emoji}</span>
              <p className="text-sm leading-relaxed text-zinc-300">{item.text}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {profiles.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="profile-card"
            >
              <div className="profile-card-icon">
                <p.icon size={22} />
              </div>
              <h3>{p.title}</h3>
              <p className="profile-pain">{p.pain}</p>
              <p className="profile-result">→ {p.result}</p>
            </motion.div>
          ))}
        </div>
      </PageSection>

      {/* ── 5. ANTES / DEPOIS ────────────────────────── */}
      <PageSection bg="#0a0a0a">
        <GreenPill>{"// O que muda na conversa"}</GreenPill>
        <h2 className="section-heading mt-4">
          O lead sente a diferença<br className="hidden sm:block" /> na primeira resposta.
        </h2>
        <div className="mt-10 grid max-w-4xl gap-4 md:grid-cols-2">
          <div className="before-col">
            <span className="col-label col-label-red">Bot comum</span>
            <div className="space-y-3 mt-4">
              {beforeItems.map((item) => (
                <div key={item} className="compare-row">
                  <X size={14} className="flex-shrink-0 mt-0.5 text-red-500" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="after-col">
            <span className="col-label col-label-green">Seu clone</span>
            <div className="space-y-3 mt-4">
              {afterItems.map((item) => (
                <div key={item} className="compare-row">
                  <Check size={14} className="flex-shrink-0 mt-0.5" style={{ color: G }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageSection>

      {/* ── 5.5. O MERCADO MUDOU ─────────────────────── */}
      <PageSection bg="#0d0d0d">
        <GreenPill>{"// Por que agora"}</GreenPill>
        <div
          className="mt-6 flex flex-col md:flex-row md:items-center"
          style={{ gap: "48px" }}
        >
          {/* Texto */}
          <div style={{ flex: "0 0 35%" }}>
            <h2 className="section-heading">
              O mercado mudou. A atenção do seu cliente está no WhatsApp.
            </h2>
            <p className="mt-5 text-sm leading-7 text-zinc-300">
              Entenda por que quem não estiver lá vai perder para quem estiver.
            </p>
          </div>
          {/* Vídeo — ocupa o espaço restante sem max-width */}
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <div className="video-frame">
              <div className="video-frame-inner">
                <iframe
                  src="https://www.youtube.com/embed/LwBEVnjdISM?rel=0&modestbranding=1"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                  title="O mercado mudou — ConnectyHub"
                  style={{ width: "100%", aspectRatio: "16/9", borderRadius: "12px" }}
                />
              </div>
            </div>
          </div>
        </div>
      </PageSection>

      {/* ── 6. PROVA SOCIAL ──────────────────────────── */}
      <PageSection bg="#111111">
        <GreenPill>{"// Prova social"}</GreenPill>
        <h2 className="section-heading mt-4">
          Quem já ativou seu clone.
        </h2>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-300">
          Conversas reais. Atendimento natural. Clientes permanecendo no WhatsApp.
        </p>
        <div className="mt-10 grid grid-cols-3 gap-3">
          {socialMetrics.map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="metric-card"
            >
              <strong>{m.value}</strong>
              <span>{m.label}</span>
            </motion.div>
          ))}
        </div>
      </PageSection>

      {/* ── 7. PLANOS ────────────────────────────────── */}
      <PageSection id="planos" bg="#0a0a0a">
        <GreenPill>{"// Planos"}</GreenPill>
        <h2 className="section-heading mt-4">
          Planos para iniciar,<br className="hidden sm:block" /> vender e escalar.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3 md:items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={
                plan.popular
                  ? "pricing-card pricing-card-popular"
                  : "premium" in plan && plan.premium
                  ? "pricing-card pricing-card-premium"
                  : "pricing-card"
              }
            >
              {plan.popular && <span className="popular-badge">Mais popular</span>}
              {"premium" in plan && plan.premium && (
                <span className="premium-badge">Mais completo</span>
              )}
              <h3>{plan.name}</h3>
              <strong>{plan.price}<small>/mês</small></strong>
              <p className="mt-3 font-mono text-xs text-zinc-400">{plan.description}</p>
              {"tagline" in plan && plan.tagline && (
                <p className="mt-1 text-xs italic" style={{ color: `${G}99` }}>{plan.tagline}</p>
              )}
              <ul>
                {plan.included.map((item) => <li key={item}>{item}</li>)}
                {plan.locked.map((item) => <li key={item} className="plan-locked">{item}</li>)}
              </ul>
              <a href="/iniciar">Ativar teste grátis</a>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center font-mono text-xs text-zinc-400">
          Cancele quando quiser. Sem fidelidade. Sem contrato.
        </p>
      </PageSection>

      {/* ── 8. FAQ ───────────────────────────────────── */}
      <PageSection id="faq" bg="#0d0d0d">
        <GreenPill>{"// FAQ"}</GreenPill>
        <h2 className="section-heading mt-4">
          Perguntas antes de ativar seu clone.
        </h2>
        <div className="mx-auto mt-10 max-w-3xl space-y-2">
          {faqs.map(([q, a]) => (
            <FaqItem key={q} question={q} answer={a} />
          ))}
        </div>
      </PageSection>

      {/* ── 9. CTA FINAL ─────────────────────────────── */}
      <section className="border-t border-white/5 px-6 py-24 text-center md:py-36 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl"
        >
          <h2 className="display-type text-[52px] leading-[1.02] text-white sm:text-[72px] lg:text-[96px]">
            <span style={{ color: G }}>Clone-se</span> agora.
          </h2>
          <p className="mt-5 text-base text-zinc-300 sm:text-lg">
            Seu clone pode estar atendendo ainda hoje. Sem programação. Sem página de vendas. 100% no WhatsApp.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <a
              className="cta-primary !text-base !px-8 !min-h-[54px]"
              href="/iniciar"
            >
              Ativar meu clone <Sparkles size={18} />
            </a>
            <p className="font-mono text-[11px] text-zinc-400">
              Sem cartão · Sem fidelidade · Cancele quando quiser
            </p>
          </div>
        </motion.div>
      </section>

      {/* ── 10. FOOTER ───────────────────────────────── */}
      <footer className="border-t border-white/[0.05] bg-[#0a0a0a] px-6 py-10 pb-24 md:px-12 lg:px-16">
        <div className="mx-auto flex max-w-[1760px] flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <ConnectyLogo className="h-5 w-[160px]" tone="white" type="full" />
          <div className="flex gap-6 font-mono text-xs text-zinc-400">
            <a href="/termos" className="transition-colors hover:text-zinc-300">Termos de uso</a>
            <a href="/privacidade" className="transition-colors hover:text-zinc-300">Privacidade</a>
          </div>
          <p className="font-mono text-[11px] text-zinc-500">
            &copy; {new Date().getFullYear()} ConnectyHub
          </p>
        </div>
      </footer>

      {/* ── WHATSAPP DOCK ─────────────────────────────── */}
      <div className="whatsapp-dock">
        <div className="dock-status">
          <div className="dock-status-dot" />
          <span>
            Operadores: <strong className="text-white">ONLINE</strong>
          </span>
        </div>
        <a
          className="dock-cta"
          href="https://wa.me/554788556936?text=Olá%20ConnectyHub"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="dock-cta-text">
            <small>Dúvidas?</small>
            <strong>Iniciar conexão</strong>
          </div>
          <div className="dock-cta-icon">
            <MessageCircle size={20} />
          </div>
        </a>
      </div>

      {/* ── TOAST FOMO ────────────────────────────────── */}
      {toast && (
        <div className="toast-fomo-container">
          <div className={`toast-fomo${toastLeaving ? " leaving" : ""}`}>
            <div className="toast-dot" />
            <div className="toast-content">
              <strong>{toast.name}</strong>
              <span>{toast.action} {toast.value}</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ── COMPONENTS ────────────────────────────────────── */

function Header() {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.05] bg-black/70 px-4 py-3 backdrop-blur-md md:px-12 lg:px-16">
      <div className="mx-auto flex max-w-[1760px] items-center justify-between gap-3">
        <a
          className="inline-flex shrink-0 rounded-full border px-3 py-2 transition-colors sm:px-4"
          style={{ borderColor: `${G}50` }}
          href="#inicio"
          onClick={() => setMobileNavOpen(false)}
        >
          <ConnectyLogo className="h-4 w-[118px] sm:w-[132px]" tone="white" type="full" />
        </a>
        <nav className="hidden min-w-0 items-center gap-4 font-mono text-[11px] text-zinc-300 lg:flex xl:gap-6">
          {landingNavItems.map((item) => (
            <a key={item.href} href={item.href} className="whitespace-nowrap transition-colors hover:text-white">
              [ {item.label} ]
            </a>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <a
            className="hidden rounded-full border border-white/15 px-3 py-2 text-[11px] font-bold text-white transition hover:border-white/35 sm:inline-flex"
            href="/login"
          >
            Entrar
          </a>
          <a
            className="rounded-full px-3 py-2 text-[11px] font-bold text-black transition-all hover:opacity-90 sm:px-4"
            style={{ background: G }}
            href="#planos"
            onClick={() => setMobileNavOpen(false)}
          >
            Ver planos
          </a>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center gap-1 rounded-full border border-white/15 px-3 font-mono text-[10px] font-bold uppercase text-zinc-200 transition hover:border-white/35 lg:hidden"
            aria-label={mobileNavOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((current) => !current)}
          >
            Menu
            {mobileNavOpen ? <X size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileNavOpen ? (
          <motion.nav
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="mx-auto mt-3 grid max-w-[1760px] gap-2 rounded-2xl border border-white/10 bg-black/95 p-3 font-mono text-[11px] text-zinc-200 shadow-2xl shadow-black/35 lg:hidden"
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {landingNavItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-xl border border-white/10 px-3 py-2 text-center transition hover:border-white/30 hover:text-white"
                  onClick={() => setMobileNavOpen(false)}
                >
                  {item.label}
                </a>
              ))}
            </div>
            <a
              href="/login"
              className="rounded-xl border border-white/10 px-3 py-2 text-center font-bold text-white transition hover:border-white/30 sm:hidden"
              onClick={() => setMobileNavOpen(false)}
            >
              Entrar
            </a>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

function PageSection({
  children,
  id,
  bg = "#0a0a0a",
}: {
  children: React.ReactNode;
  id?: string;
  bg?: string;
}) {
  return (
    <section
      id={id}
      className="border-t border-white/5 px-6 py-16 md:px-12 md:py-24 lg:px-16"
      style={{ background: bg }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-20px", amount: 0.05 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mx-auto max-w-[1760px]"
      >
        {children}
      </motion.div>
    </section>
  );
}

function GreenPill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`green-pill inline-flex w-fit items-center rounded-full border px-3 py-1 font-mono text-[10px] uppercase ${className}`}
      style={{
        borderColor: `${G}38`,
        background: `${G}08`,
        color: G,
      }}
    >
      {children}
    </span>
  );
}

function TuringWhatsAppDemo() {
  const ref = React.useRef(null);
  const inView = useInView(ref, { margin: "-80px", once: false });
  const [visibleCount, setVisibleCount] = React.useState(1);

  React.useEffect(() => {
    if (!inView) return;

    const timers = [
      setTimeout(() => setVisibleCount(1), 0),
      ...turingChatEvents.map((_, index) =>
        setTimeout(() => {
          setVisibleCount(index + 1);
        }, 260 + index * 430)
      ),
    ];

    return () => timers.forEach(clearTimeout);
  }, [inView]);

  return (
    <div ref={ref} className="wa-demo-phone">
      <div className="wa-demo-topbar">
        <div className="wa-avatar">
          <Sparkles size={17} />
        </div>
        <div>
          <strong>Seu clone</strong>
          <span>online agora</span>
        </div>
        <div className="wa-header-dot" />
      </div>

      <div className="wa-demo-body">
        {turingChatEvents.slice(0, visibleCount).map((event, index) => (
          <TuringChatEvent key={`${event.kind}-${index}`} event={event} index={index} />
        ))}
      </div>

      <div className="wa-demo-input">
        <span>Mensagem</span>
        <Mic size={16} />
      </div>
    </div>
  );
}

function TuringChatEvent({
  event,
  index,
}: {
  event: (typeof turingChatEvents)[number];
  index: number;
}) {
  if (event.kind === "typing" || event.kind === "recording") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="wa-activity"
      >
        <span className="wa-activity-dots"><i /><i /><i /></span>
        {event.text}
      </motion.div>
    );
  }

  const isLead = event.kind.startsWith("lead");
  const isAudio = event.kind.includes("audio");
  const isMedia = event.kind.includes("media");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.02, 0.12) }}
      className={`wa-message ${isLead ? "wa-message-lead" : "wa-message-clone"}`}
    >
      {isAudio ? (
        <div className="wa-audio-row">
          <Mic size={15} />
          <div className="wa-waveform">
            {[10, 18, 13, 26, 15, 22, 11, 28, 17, 20, 12].map((height, i) => (
              <span key={i} style={{ height }} />
            ))}
          </div>
          <em>{"duration" in event ? event.duration : ""}</em>
        </div>
      ) : isMedia ? (
        <>
          <div className="wa-media-card">
            <Video size={15} />
            <span>{"label" in event ? event.label : "mídia enviada"}</span>
          </div>
          <p>{"text" in event ? event.text : ""}</p>
        </>
      ) : (
        <p>{"text" in event ? event.text : ""}</p>
      )}
      <span className="wa-message-meta">
        {"time" in event ? event.time : ""}
        {!isLead && <span className="wa-seen">✓✓</span>}
      </span>
    </motion.div>
  );
}

function ChatColumn({
  label,
  badge,
  messages,
  isBot,
}: {
  label: string;
  badge: string;
  messages: { text: string; time: string }[];
  isBot: boolean;
}) {
  const ref = React.useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <div ref={ref} className="chat-wrapper">
      <div className="chat-header">
        <span
          className="chat-badge"
          style={
            isBot
              ? { background: "rgba(239,68,68,0.1)", color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }
              : { background: `${G}14`, color: G, borderColor: `${G}38` }
          }
        >
          {badge}
        </span>
        <span className="chat-label">{label}</span>
      </div>
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: 0.3 + i * 0.4 }}
            className={isBot ? "chat-bubble-bot" : "chat-bubble-clone"}
          >
            <p className="whitespace-pre-line text-sm">{msg.text}</p>
            <span className="chat-time">{msg.time}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ChatDemo() {
  return (
    <>
      <div className="chat-swipe-outer mt-10">
        <div className="chat-swipe-inner">
          <ChatColumn
            label="Como um bot responde"
            badge="BOT"
            messages={botMessages}
            isBot
          />
          <ChatColumn
            label="Como o seu clone responde"
            badge="SEU CLONE"
            messages={cloneMessages}
            isBot={false}
          />
        </div>
      </div>


      {/* Vídeo — texto + vídeo lado a lado */}
      <div className="mt-12 w-full">
        <GreenPill>{"// Veja ao vivo"}</GreenPill>
        <div
          className="mt-6 flex flex-col md:flex-row md:items-center"
          style={{ gap: "48px" }}
        >
          {/* Texto */}
          <div style={{ flex: "0 0 35%" }}>
            <h3 className="section-heading">
              Assista ao seu clone atendendo de verdade no WhatsApp.
            </h3>
            <p className="mt-4 text-sm leading-7 text-zinc-300">
              Em 2 minutos você entende por que leads que antes sumiam estão sendo convertidos — e como seu clone faz isso sem você precisar estar online.
            </p>
            <p className="mt-3 text-sm font-semibold" style={{ color: G }}>
              → Seu clone respondendo, negociando e fechando em tempo real.
            </p>
          </div>
          {/* Vídeo */}
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <div className="video-frame">
              <div className="video-frame-inner">
                <iframe
                  src="https://www.youtube.com/embed/lE_I0YhhD0I?rel=0&modestbranding=1"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                  title="Veja seu clone digital em ação no WhatsApp"
                  style={{ width: "100%", aspectRatio: "16/9", borderRadius: "12px" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="faq-new-item">
      <button
        className="faq-new-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>{question}</span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          className="flex-shrink-0 text-zinc-400"
        >
          <ChevronDown size={16} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="faq-new-answer">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CloneScannerCard({ className }: { className?: string }) {
  return (
    <div className={`clone-scanner-card ${className ?? ""}`}>
      <div className="clone-scanner-line" />
      <div className="clone-scanner-line clone-scanner-line-reverse" />
      <div className="clone-orbit" style={{ top: "62px", width: "100px", height: "100px" }} />
      <div className="clone-avatar-wrapper !w-20 !h-20 !mt-2">
        <div className="clone-pulse-ring" />
        <div className="clone-pulse-ring clone-pulse-ring-delay" />
        <div className="clone-avatar !w-16 !h-16">
          <User className="text-[#00ff88]" size={30} />
        </div>
      </div>
      <h4 className="mt-3 text-sm font-bold tracking-wider text-white">
        VOCÊ <span className="text-[#00ff88]">(DIGITAL)</span>
      </h4>
      <p className="mt-0.5 font-mono text-[9px] text-[#00ff88]/60">
        ID: SEU_CLONE_#001 — REDE NEURAL v2.4
      </p>
      <div className="mt-4 w-full space-y-1.5 px-3">
        {[
          { label: "Personalidade", pct: "94%", colorClass: "text-[#00ff88]", fillClass: "clone-progress-fill" },
          { label: "Voz", pct: "78%", colorClass: "text-[#00f3ff]", fillClass: "clone-progress-fill clone-progress-fill-cyan" },
          { label: "Contexto", pct: "100%", colorClass: "text-[#00ff88]", fillClass: "clone-progress-fill" },
        ].map((row) => (
          <div key={row.label} className="clone-progress-row !text-[9px]">
            <span>{row.label}</span>
            <div className="clone-progress-bar !h-1">
              <div className={row.fillClass} style={{ width: row.pct }} />
            </div>
            <span className={row.colorClass}>{row.pct}</span>
          </div>
        ))}
      </div>
      <div className="voice-bars !mt-3 !h-8">
        {[14, 26, 8, 30, 16, 24, 12, 20, 10, 28].map((h, i) => (
          <span
            key={i}
            style={{
              ["--speed" as string]: `${0.3 + i * 0.08}s`,
              ["--max-h" as string]: `${h}px`,
            }}
          />
        ))}
      </div>
      <p className="mt-2 animate-pulse font-mono text-[9px] text-[#00ff88]">
        ● SINTETIZANDO VOZ...
      </p>
    </div>
  );
}
