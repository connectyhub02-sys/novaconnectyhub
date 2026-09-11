import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/docs/ia", destination: "/docs/api#ia", permanent: true }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.whatsapp.net" },
      { protocol: "https", hostname: "pps.whatsapp.net" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.uazapi.com" },
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "supabase.connectyhub.com.br", pathname: "/storage/v1/**" },
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "**.cloudflarestorage.com" },
    ],
  },
};

export default nextConfig;
