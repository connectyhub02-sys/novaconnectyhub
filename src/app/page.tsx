import type { Metadata } from "next";
import ConnectyHubHome from "@/components/marketing/connectyhub-home";
import { buildCanonicalUrl } from "@/lib/seo/site";

export const metadata: Metadata = { alternates: { canonical: buildCanonicalUrl("/") } };
export default function HomePage() { return <ConnectyHubHome />; }
