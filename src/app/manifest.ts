import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ConnectyHub",
    short_name: "ConnectyHub",
    description: "Painel mobile para operar agentes, CRM, WhatsApp, vendas e administracao.",
    start_url: "/iniciar",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#05080d",
    theme_color: "#05080d",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/brand/connectyhub-app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/connectyhub-app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/connectyhub-app-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
