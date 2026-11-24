import { SocialWorkspacePage } from "@/components/connectyhub-os/social-workspace-page";
export const metadata = { title: "Redes sociais | ConnectyHub" };
export default async function Page({ params, searchParams }: { params: Promise<{ area: string }>; searchParams: Promise<{ connection?: string; create?: string }> }) {
  return <SocialWorkspacePage shell="client" area={(await params).area} outcome={(await searchParams).connection} initialCompose={(await searchParams).create === "1"}/>;
}
