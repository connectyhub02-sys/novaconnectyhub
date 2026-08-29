import type { MetadataRoute } from "next";
import { buildCanonicalUrl, getConnectyhubSiteUrl } from "@/lib/seo/site";

const privatePaths = [
  "/admin",
  "/admin/",
  "/api/",
  "/auth/",
  "/checkout",
  "/checkout/",
  "/dashboard",
  "/dashboard/",
  "/iniciar",
  "/login",
  "/login/",
  "/loja/*/carrinho",
  "/r/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: privatePaths,
      },
      {
        userAgent: ["OAI-SearchBot", "ChatGPT-User", "GPTBot"],
        allow: "/",
        disallow: privatePaths,
      },
    ],
    sitemap: buildCanonicalUrl("/sitemap.xml"),
    host: getConnectyhubSiteUrl(),
  };
}
