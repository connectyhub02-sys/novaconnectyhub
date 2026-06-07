"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const maxAvatarBytes = 5 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type UploadState =
  | { status: "idle"; message: string }
  | { status: "uploading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function AgentAvatarUpload({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ status: "idle", message: "" });

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!allowedTypes.has(file.type)) {
      setState({ status: "error", message: "Use JPG, PNG ou WEBP." });
      return;
    }

    if (file.size > maxAvatarBytes) {
      setState({ status: "error", message: "Maximo 5 MB." });
      return;
    }

    const formData = new FormData();
    formData.set("avatar", file);
    setState({ status: "uploading", message: "Enviando foto..." });

    try {
      const response = await fetch(`/api/admin/agents/${agentId}/avatar`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setState({ status: "error", message: payload?.error ?? "Nao foi possivel enviar." });
        return;
      }

      setState({ status: "success", message: "Foto atualizada." });
      router.refresh();
    } catch {
      setState({ status: "error", message: "Falha de rede no upload." });
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={`Enviar foto de ${agentName}`}
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={state.status === "uploading"}
        onClick={() => inputRef.current?.click()}
        className="border-cyan-500/30 bg-cyan-500/5 font-mono text-[9px] uppercase tracking-widest text-cyan-700 hover:bg-cyan-500/10"
      >
        {state.status === "uploading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
        Trocar foto
      </Button>
      {state.message && (
        <span
          className={[
            "font-mono text-[9px] uppercase tracking-widest",
            state.status === "error" ? "text-rose-500" : "text-slate-500",
          ].join(" ")}
        >
          {state.message}
        </span>
      )}
    </div>
  );
}
