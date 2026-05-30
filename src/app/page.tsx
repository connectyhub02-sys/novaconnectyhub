"use client";

import * as React from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Briefcase,
  Check,
  ChevronDown,
  GraduationCap,
  Layers,
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
import { SplineScene } from "@/components/ui/splite";
import { Spotlight } from "@/components/ui/spotlight";

/* ── DESIGN TOKEN ─────────────────────────────────── */
const G = "#00ff88"; // primary green

/* ── DATA ─────────────────────────────────────────── */

const capabilities = [
  { icon: MessageSquare, label: "Texto" },
  { icon: Mic, label: "Áudio com sua voz" },
  { icon: Layers, label: "Imagem" },
  { icon: Video, label: "Vídeo" },
  { icon: MessageCircle, label: "WhatsApp 24/7" },
];

const differentials = [
  {
    icon: Brain,
    title: "Responde como humano",
    text: "Linguagem natural, sem respostas engessadas. O lead não sente o roteiro.",
  },
  {
    icon: TrendingUp,
    title: "Negocia em tempo real",
    text: "Lida com objeções, contrapropõe e fecha. Como seu melhor vendedor faria.",
  },
  {
    icon: Zap,
    title: "Aprende com cada conversa",
    text: "Fica mais preciso com o tempo, sem precisar reprogramar nada.",
  },
];

const botMessages = [
  { text: "Olá! Selecione uma opção:\n1 - Produtos\n2 - Preços\n3 - Atendente", time: "10:32" },
  { text: "Digite o número da opção desejada.", time: "10:33" },
  {
    text: "Horário de atendimento: 9h–18h.\nTente novamente amanhã.",
    time: "10:34",
  },
];

const cloneMessages = [
  {
    text: "Oi João! Vi que você olhou o Curso de Tráfego ontem — ainda tem dúvidas?",
    time: "10:32",
  },
  {
    text: "Faz sentido. O que trava a maioria é exatamente isso. Posso explicar em 1 minuto?",
    time: "10:33",
  },
  {
    text: "Posso garantir uma condição especial até meia-noite. Quer aproveitar?",
    time: "10:34",
  },
];

const profiles = [
  {
    icon: GraduationCap,
    title: "Infoprodutor",
    pain: "Leads quentes somem enquanto você dorme.",
    result: "Você lança. O clone atende. A venda fecha.",
  },
  {
    icon: Briefcase,
    title: "Prestador de serviço",
    pain: "Tempo perdido respondendo sempre as mesmas perguntas.",
    result: "Qualifica, agenda e confirma. Sem você na conversa.",
  },
  {
    icon: ShoppingCart,
    title: "E-commerce",
    pain: "Carrinho abandonado é receita que vai embora.",
    result: "Clone recupera, responde dúvidas e fecha pedido no WhatsApp.",
  },
];

const beforeItems = [
  "Responde quando lembra",
  "Perde lead fora do horário",
  "Tempo gasto em repetição",
];

const afterItems = [
  "Responde em segundos, sempre",
  "Clone atende 24h, 7 dias",
  "Você foca em escalar",
];

const socialMetrics = [
  { value: "+14.382", label: "conversas processadas" },
  { value: "98%", label: "taxa de resposta < 30s" },
  { value: "2.108", label: "clones ativos hoje" },
];

const plans = [
  {
    name: "Starter",
    price: "R$ 97",
    description: "Para começar hoje.",
    included: [
      "1 WhatsApp conectado",
      "1 clone ativo",
      "Respostas ilimitadas",
      "CRM básico",
      "Transcrição de áudio",
    ],
    locked: ["Campanhas em massa", "Múltiplos clones", "WooCommerce"],
  },
  {
    name: "Profissional",
    price: "R$ 297",
    description: "Para quem já vende.",
    popular: true,
    included: [
      "3 WhatsApps conectados",
      "3 clones ativos",
      "Respostas ilimitadas",
      "CRM completo",
      "Transcrição de áudio",
      "Campanhas em massa",
      "WooCommerce",
    ],
    locked: ["API personalizada", "White-label"],
  },
  {
    name: "Elite",
    price: "R$ 497",
    description: "Para escalar sem limites.",
    premium: true as const,
    included: [
      "5 WhatsApps conectados",
      "5 clones ativos",
      "Respostas ilimitadas",
      "CRM completo",
      "Transcrição de áudio",
      "Campanhas em massa",
      "WooCommerce",
      "API personalizada",
      "White-label",
    ],
    locked: [],
  },
];

const faqs: [string, string][] = [
  [
    "Meus clientes vão perceber que é uma IA?",
    "Não, se você configurar bem. O clone usa linguagem natural, responde em tempo variável e adapta o tom ao cliente. A maioria não percebe.",
  ],
  [
    "Preciso saber programar para configurar?",
    "Não. Você conecta o WhatsApp, escreve o que o clone precisa saber sobre o seu negócio e ele está pronto. O processo leva menos de 24h.",
  ],
  [
    "Funciona para o meu nicho?",
    "Sim. Infoprodutores, prestadores de serviço, e-commerce, imóveis, clínicas — qualquer negócio que usa WhatsApp para vender.",
  ],
  [
    "Quanto tempo leva para configurar?",
    "Em menos de 24h você já tem o clone ativo. O setup é guiado pela plataforma, sem necessidade de suporte técnico.",
  ],
  [
    "E se eu quiser cancelar?",
    "Cancele quando quiser pelo painel. Sem multa, sem fidelidade. O histórico fica disponível por 30 dias após o cancelamento.",
  ],
  [
    "Qual a diferença para outros chatbots do mercado?",
    "Chatbots respondem frases prontas. O clone digital raciocina sobre o contexto, adapta o tom e toma decisões de negociação. A diferença é visível na primeira conversa.",
  ],
];

const TOAST_EVENTS = [
  { name: "Carlos M.", action: "recuperou carrinho de", value: "R$ 412" },
  { name: "Fernanda L.", action: "fechou venda de", value: "R$ 297" },
  { name: "Diego S.", action: "clone ativou e vendeu", value: "R$ 189" },
  { name: "Ana P.", action: "recebeu pix de", value: "R$ 547" },
  { name: "Roberto A.", action: "clone fechou negócio de", value: "R$ 1.290" },
  { name: "Mariana C.", action: "lead convertido em", value: "R$ 397" },
  { name: "Lucas T.", action: "venda via áudio de", value: "R$ 249" },
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
  const [isDesktop, setIsDesktop] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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
      }, 4_200);
    };
    const first = setTimeout(() => {
      showToast();
      toastTimerRef.current = setInterval(showToast, 11_000);
    }, 6_000);
    return () => {
      clearTimeout(first);
      if (toastTimerRef.current) clearInterval(toastTimerRef.current);
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white overflow-x-hidden">
      <Header />

      {/* ── 1. HERO ──────────────────────────────────── */}
      <section className="relative w-full overflow-hidden">
        <Spotlight className="-top-60 right-0 md:right-32" fill={G} />

        {/* Mobile: robô como fundo — começa na metade da tela, zoom-out via margens negativas */}
        <div className="absolute inset-0 lg:hidden">
          {/* Container do Spline: inicia em 8% da altura e extrapola 24% para cada lado
              para que o robô apareça menor/mais distante, como na referência */}
          <div
            className="absolute bottom-0 top-[12%]"
            style={{ left: "-40%", right: "-40%" }}
          >
            {isDesktop === false && (
              <SplineScene
                scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                className="h-full w-full"
              />
            )}
          </div>
          {/* ConnectyHub label no peito do robô */}
          <div
            className="pointer-events-none absolute z-10"
            style={{ top: "63%", left: "50%", transform: "translate(-50%, -50%)" }}
          >
            <span
              className="display-type text-[8px] font-bold tracking-widest opacity-80"
              style={{ color: "#ffffff", textShadow: "0 0 10px rgba(255,255,255,0.4)" }}
            >
              ConnectyHub
            </span>
          </div>
          {/* Gradiente: forte no topo (texto legível), desaparece na metade inferior */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.70) 38%, rgba(10,10,10,0.22) 58%, transparent 75%)",
            }}
          />
        </div>

        {/* Content grid */}
        <div className="mx-auto max-w-[1760px] px-6 md:px-10 lg:grid lg:min-h-screen lg:grid-cols-[minmax(480px,0.82fr)_minmax(600px,1.18fr)] lg:items-center lg:px-14 2xl:px-20">

          {/* Left: copy — no mobile fica sobre o robô de fundo */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="relative z-10 flex min-h-[100svh] flex-col justify-start pt-24 pb-16 lg:order-1 lg:min-h-0 lg:justify-normal lg:py-0"
          >
            <motion.div variants={fadeUp}>
              <GreenPill>:: Clone digital no WhatsApp ::</GreenPill>
            </motion.div>

            <motion.h1 variants={fadeUp} className="hero-headline mt-5">
              Atende como humano.<br />
              <span style={{ color: G }}>Escala como máquina.</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="mt-5 max-w-lg leading-relaxed" style={{ fontSize: "1.125rem", color: "#e5e5e5" }}>
              O ConnectyHub cria um clone do seu melhor vendedor — que responde,
              negocia e fecha no{" "}
              <span style={{ color: "#00ff88", fontWeight: 600 }}>WhatsApp</span>{" "}
              24h,{" "}
              <span style={{ color: "#00ff88", fontStyle: "italic" }}>sem parecer bot</span>.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-7 flex max-w-[280px] flex-col gap-3 sm:max-w-none sm:flex-row">
              <a className="cta-primary" href="https://painel.connectyhub.com.br/signup">
                Ativar meu clone <ArrowRight size={16} />
              </a>
              <a className="cta-secondary" href="#diferencial">
                Ver como funciona
              </a>
            </motion.div>

            <motion.div variants={fadeUp} className="capability-strip mt-5">
              {capabilities.map((c) => (
                <div key={c.label} className="capability-pill">
                  <c.icon size={10} />
                  {c.label}
                </div>
              ))}
            </motion.div>

            {/* Social proof inline metrics */}
            <motion.div
              variants={fadeUp}
              className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/[0.06] pt-5 font-mono text-[11px] text-zinc-500"
            >
              <span>+14.382 conversas</span>
              <span className="text-white/10">·</span>
              <span>98% taxa de resposta</span>
              <span className="text-white/10">·</span>
              <span>2.108 clones ativos</span>
            </motion.div>

            {/* Mobile clone card */}
            <div className="mt-8 block w-full max-w-xs lg:hidden">
              <CloneScannerCard />
            </div>
          </motion.div>

          {/* Right: robot — desktop only, only mounts when confirmed desktop */}
          <div className="relative hidden h-screen lg:order-2 lg:block">
            <div
              className="absolute inset-0"
              style={{ touchAction: "none" }}
            >
              <div className="absolute inset-x-[-22%] bottom-[-8%] top-[-4%]">
                {isDesktop === true && (
                  <SplineScene
                    scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                    className="h-full w-full"
                  />
                )}
              </div>
            </div>
            <p
              className="absolute bottom-8 right-6 font-mono text-[11px] opacity-50"
              style={{ color: G }}
            >
              Este é o seu clone. Desperto.
            </p>
            <div className="absolute left-0 top-1/2 z-20 -translate-y-1/2">
              <CloneScannerCard />
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. DIFERENCIAL CENTRAL ───────────────────── */}
      <PageSection id="diferencial" bg="#0d0d0d">
        <GreenPill>{"// Diferencial"}</GreenPill>
        <h2 className="section-heading mt-4">
          Seus clientes não vão saber que é uma IA.
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
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

      {/* ── 3. DEMO COMPARATIVO ──────────────────────── */}
      <PageSection bg="#0a0a0a">
        <GreenPill>{"// Demo comparativo"}</GreenPill>
        <h2 className="section-heading mt-4">
          A diferença que seus clientes sentem.
        </h2>
        <ChatDemo />
      </PageSection>

      {/* ── 4. PARA QUEM É ───────────────────────────── */}
      <PageSection bg="#0d0d0d">
        <GreenPill>{"// Para quem é"}</GreenPill>
        <h2 className="section-heading mt-4">
          Feito para quem vende todos os dias.
        </h2>
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
        <GreenPill>{"// Antes / Depois"}</GreenPill>
        <h2 className="section-heading mt-4">
          Do zero ao clone vendendo.<br className="hidden sm:block" /> Em menos de 24h.
        </h2>
        <div className="mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
          <div className="before-col">
            <span className="col-label col-label-red">Antes</span>
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
            <span className="col-label col-label-green">Depois</span>
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
            <p className="mt-5 text-sm leading-7 text-zinc-400">
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
          Quem já ativou o clone.
        </h2>
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
          Planos para iniciar,<br className="hidden sm:block" /> automatizar e escalar.
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
              <p className="mt-3 font-mono text-xs text-zinc-500">{plan.description}</p>
              <ul>
                {plan.included.map((item) => <li key={item}>{item}</li>)}
                {plan.locked.map((item) => <li key={item} className="plan-locked">{item}</li>)}
              </ul>
              <a href="https://painel.connectyhub.com.br/signup">Começar agora</a>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center font-mono text-xs text-zinc-600">
          Cancele quando quiser. Sem fidelidade.
        </p>
      </PageSection>

      {/* ── 8. FAQ ───────────────────────────────────── */}
      <PageSection bg="#0d0d0d">
        <GreenPill>{"// FAQ"}</GreenPill>
        <h2 className="section-heading mt-4">
          Perguntas antes de ativar o clone.
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
          <p className="mt-5 text-base text-zinc-400 sm:text-lg">
            Seu clone pode estar ativo ainda hoje.
          </p>
          <div className="mt-8 flex justify-center">
            <a
              className="cta-primary !text-base !px-8 !min-h-[54px]"
              href="https://painel.connectyhub.com.br/signup"
            >
              Ativar meu clone <Sparkles size={18} />
            </a>
          </div>
        </motion.div>
      </section>

      {/* ── 10. FOOTER ───────────────────────────────── */}
      <footer className="border-t border-white/[0.05] bg-[#0a0a0a] px-6 py-10 pb-24 md:px-12 lg:px-16">
        <div className="mx-auto flex max-w-[1760px] flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="display-type text-sm font-bold tracking-widest text-white">
            CONNECTY<span style={{ color: G }}>HUB</span>
          </div>
          <div className="flex gap-6 font-mono text-xs text-zinc-600">
            <a href="#" className="transition-colors hover:text-zinc-400">Termos de uso</a>
            <a href="#" className="transition-colors hover:text-zinc-400">Privacidade</a>
          </div>
          <p className="font-mono text-[11px] text-zinc-700">
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
  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.05] bg-black/60 px-6 py-4 backdrop-blur-md md:px-12 lg:px-16">
      <div className="mx-auto flex max-w-[1760px] items-center justify-between">
        <a
          className="display-type rounded-full border px-4 py-1.5 text-xs text-white transition-colors"
          style={{ borderColor: `${G}50` }}
          href="#"
        >
          Connecty<span style={{ color: G }}>Hub</span>
        </a>
        <nav className="hidden items-center gap-8 font-mono text-xs text-zinc-400 md:flex">
          <a href="#diferencial" className="transition-colors hover:text-white">[ Como funciona ]</a>
          <a href="#planos" className="transition-colors hover:text-white">[ Planos ]</a>
        </nav>
        <a
          className="rounded-full px-4 py-2 text-xs font-bold text-black transition-all hover:opacity-90"
          style={{ background: G }}
          href="https://painel.connectyhub.com.br/signup"
        >
          Teste grátis
        </a>
      </div>
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
      className="border-t border-white/5 px-6 py-14 md:px-12 md:py-20 lg:px-16"
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

function GreenPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex w-fit items-center rounded-full border px-3 py-1 font-mono text-[10px] uppercase"
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
        <GreenPill>{"// Veja o clone em ação."}</GreenPill>
        <div
          className="mt-6 flex flex-col md:flex-row md:items-center"
          style={{ gap: "48px" }}
        >
          {/* Texto */}
          <div style={{ flex: "0 0 35%" }}>
            <h3 className="section-heading">
              Assista ao clone digital atendendo no WhatsApp.
            </h3>
            <p className="mt-5 text-sm leading-7 text-zinc-400">
              Veja na prática como o agente de IA conversa, responde objeções e fecha — sem parecer bot.
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
                  title="Veja o clone digital em ação no WhatsApp"
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
          className="flex-shrink-0 text-zinc-500"
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
        ID: CLONE_#001 — REDE NEURAL v2.4
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
