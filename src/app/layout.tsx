import type { Metadata } from "next";
import { Audiowide, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const audiowide = Audiowide({
  variable: "--font-audiowide",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "ConnectyHub | Clone-se. Seu Gêmeo Digital no WhatsApp.",
  description:
    "Crie um clone digital com a sua voz para vender qualquer coisa no WhatsApp 24/7. Modo espelho, rapport adaptativo, áudio, vídeo e imagem com IA.",
  keywords: [
    "clone digital whatsapp",
    "gemeo digital ia",
    "automacao whatsapp",
    "agente de voz ia",
    "vendas automaticas whatsapp",
    "recuperacao de carrinho",
    "connectyhub",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${audiowide.variable} h-full antialiased`}
    >
      <head>
        <link rel="dns-prefetch" href="https://prod.spline.design" />
        <link rel="preconnect" href="https://prod.spline.design" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://www.youtube.com" />
        <link rel="preconnect" href="https://www.youtube.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://painel.connectyhub.com.br" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
