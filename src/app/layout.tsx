import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Audiowide, Geist, Geist_Mono } from "next/font/google";
import { MagicLinkFragmentRedirect } from "@/components/auth/magic-link-fragment-redirect";
import { CommerceAgentDock } from "@/components/commerce-agent/commerce-agent-dock";
import { JsonLd } from "@/components/seo/json-ld";
import { ConnectyTracker } from "@/components/tracking/connecty-tracker";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildConnectyhubRootStructuredData } from "@/lib/seo/structured-data";
import {
  connectyhubSeoKeywords,
  connectyhubSiteName,
  getConnectyhubSiteUrl,
} from "@/lib/seo/site";
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

const siteUrl = getConnectyhubSiteUrl();
const rootTitle = "ConnectyHub | Clone-se. Seu Gêmeo Digital no WhatsApp.";
const rootDescription =
  "Crie agentes de IA para WhatsApp com automacoes, CRM, catalogo de vendas, checkout, atendimento e API para integradores em uma plataforma brasileira.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: connectyhubSiteName,
  title: rootTitle,
  description: rootDescription,
  keywords: connectyhubSeoKeywords,
  creator: connectyhubSiteName,
  publisher: connectyhubSiteName,
  authors: [{ name: connectyhubSiteName, url: siteUrl }],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
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
  openGraph: {
    title: rootTitle,
    description: rootDescription,
    url: "/",
    siteName: connectyhubSiteName,
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "ConnectyHub - agentes de IA, automacao e API WhatsApp",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: rootTitle,
    description: rootDescription,
    images: ["/opengraph-image"],
  },
  pinterest: {
    richPin: true,
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: {
      ...(process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : {}),
      ...(process.env.PINTEREST_SITE_VERIFICATION ? { "p:domain_verify": process.env.PINTEREST_SITE_VERIFICATION } : {}),
    },
  },
  other: {
    "llms-txt": `${siteUrl}/llms.txt`,
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
          <JsonLd id="connectyhub-root-jsonld" data={buildConnectyhubRootStructuredData()} />
          <MagicLinkFragmentRedirect />
          <Suspense fallback={null}>
            <ConnectyTracker />
            <CommerceAgentDock />
          </Suspense>
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
