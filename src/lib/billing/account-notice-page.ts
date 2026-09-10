export function accountNoticePage(state: "confirm" | "disabled" | "missing" | "error", key = "") {
  const title = state === "disabled" ? "Você saiu da lista" : state === "missing" ? "Link não encontrado" : state === "error" ? "Não foi possível concluir" : "Sair dos avisos pelo WhatsApp?";
  const description = state === "disabled"
    ? "Os próximos avisos automáticos desta conta não serão enviados para este número, nem pelo seu agente nem pela ConnectyHub. Uma mensagem já em envio pode ainda chegar."
    : state === "confirm" ? "Ao confirmar, você deixa de receber neste número os avisos automáticos de cadastro, créditos, plano e pagamentos desta conta."
    : state === "missing" ? "Confira o link na mensagem que você recebeu."
    : "Sua escolha não foi confirmada. Tente novamente em alguns instantes.";
  const form = state === "confirm" ? `<form method="post" action="/avisos/${key}"><input type="hidden" name="action" value="unsubscribe"><button type="submit">Confirmar saída da lista</button></form>` : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} | ConnectyHub</title><style>body{margin:0;background:#f5f7fb;color:#172033;font:16px/1.6 system-ui,sans-serif;padding:24px}main{max-width:520px;margin:8vh auto;background:white;border:1px solid #dfe5ef;border-radius:20px;padding:clamp(20px,5vw,40px)}strong{color:#1547db}h1{font-size:28px;line-height:1.25}p{color:#475569}button{background:#1744eb;color:white;border:0;border-radius:10px;padding:14px 20px;font:600 16px system-ui;cursor:pointer;width:100%}button:focus-visible,a:focus-visible{outline:3px solid #87aaff;outline-offset:4px}a{color:#1744eb}small{display:block;margin-top:20px;color:#64748b}</style></head><body><main><strong>CONNECTYHUB</strong><h1>${title}</h1><p>${description}</p>${form}<p>Sair da lista não cancela seu plano, seus pagamentos ou seus agentes. Você continua consultando saldo e faturas no painel.</p><a href="/dashboard/minha-conta">Ir para Minha conta</a><small>Para voltar a receber, ative os avisos em Minha conta. Abrir este link não altera sua preferência.</small></main></body></html>`;
}

export const accountNoticePageHeaders = {
  "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
