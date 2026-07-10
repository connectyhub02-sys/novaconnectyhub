import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Audiowide, Geist, Geist_Mono } from "next/font/google";
import { MagicLinkFragmentRedirect } from "@/components/auth/magic-link-fragment-redirect";
import { ConnectyTracker } from "@/components/tracking/connecty-tracker";
import { TooltipProvider } from "@/components/ui/tooltip";
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
  applicationName: "ConnectyHub",
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
  icons: {
    icon: [
      { url: "/brand/connectyhub-app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/connectyhub-app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/connectyhub-app-icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ConnectyHub",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05080d",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${audiowide.variable} dark h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <head>
        <link rel="dns-prefetch" href="https://prod.spline.design" />
        <link rel="preconnect" href="https://prod.spline.design" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://www.youtube.com" />
        <link rel="preconnect" href="https://www.youtube.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://painel.connectyhub.com.br" />
      </head>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <MagicLinkFragmentRedirect />
          <Suspense fallback={null}>
            <ConnectyTracker />
          </Suspense>
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
