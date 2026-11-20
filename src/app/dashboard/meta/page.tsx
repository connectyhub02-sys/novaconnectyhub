import { redirect } from "next/navigation";

// The Central Meta home was only a shortcut to the Meta card: everything lives in Conexões.
export default function MetaHome() {
  redirect("/dashboard/integracoes#meta-ads-guiado");
}
