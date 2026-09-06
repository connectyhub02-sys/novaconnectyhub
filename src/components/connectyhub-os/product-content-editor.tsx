"use client";
import { useState } from "react";

export function ProductContentEditor({ productId, initialBody, initialFiles }: { productId: string; initialBody: string; initialFiles: { name: string }[] }) {
  const [body, setBody] = useState(initialBody);
  const [files, setFiles] = useState(initialFiles);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <form className="space-y-5" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget;
    try {
      const result = await fetch(`/api/admin/platform-products/${productId}/content`, { method: "PUT", body: new FormData(form) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error);
      setFiles(data.files); setMessage("Conteúdo salvo. Disponível para os compradores autorizados.");
      const input = form.elements.namedItem("files") as HTMLInputElement; input.value = "";
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }}>
    <label className="block font-medium">Conteúdo e instruções para o comprador<textarea name="body" value={body} onChange={e => setBody(e.target.value)} rows={12} className="mt-2 block w-full rounded-xl border bg-white p-4 text-slate-900" /></label>
    <label className="block font-medium">Adicionar arquivos privados<input type="file" name="files" multiple className="mt-2 block w-full text-sm" /></label>
    <p className="text-sm text-slate-500">Estes arquivos ficam disponíveis em Meus produtos após confirmação do pagamento. Até 25 MB por arquivo.</p>
    {files.length > 0 && <ul className="space-y-1 text-sm">{files.map((file, i) => <li key={i}>{file.name}</li>)}</ul>}
    <button disabled={busy} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Salvando…" : "Salvar conteúdo"}</button>
    <p role="status" className="text-sm">{message}</p>
  </form>;
}
