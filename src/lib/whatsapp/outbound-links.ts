type Body = Record<string, unknown>;
export type OutboundLink = { target: string; label: string; url: string };
const urlPattern = /https?:\/\/[^\s<>"'\]\}]+/gi;
const trimUrl = (url: string) => url.replace(/[.,;!?]+$/, "").replace(/\)+$/, closing => {
  const opens = (url.match(/\(/g) ?? []).length, closes = (url.match(/\)/g) ?? []).length;
  return closing.slice(Math.min(closing.length, Math.max(0, closes - opens)));
});
const proseFields = new Set(["text", "caption", "description", "footerText", "footer", "title", "body", "message", "buttonText", "display_text", "listButton"]);
const displayFields = new Set([...proseFields, "url", "buttonUrl", "button_url", "paymentLink"]);
function choiceUrl(choice: string) {
  const split = choice.indexOf("|");
  if (split < 0) return null;
  const action = choice.slice(split + 1).replace(/^url:/, "");
  return /^https?:\/\//i.test(action) ? { label: choice.slice(0, split), target: action } : null;
}

export function collectOutboundLinks(body: Body, allowedOrigin?: string): Array<{target: string; label: string}> {
  const links = new Map<string, string>();
  const add = (target: string, label = "Abrir link") => {
    try {
      const url = new URL(target);
      if (url.username || url.password || !/^https?:$/.test(url.protocol) || (allowedOrigin && url.origin!==allowedOrigin)) throw new Error("Invalid navigation origin");
    } catch {
      if (allowedOrigin) throw new Error("Native navigation must use its configured origin");
      return;
    }
    if (label === "Abrir link" && /\/(contato\/preferencias|avisos)\//.test(target)) label=target.endsWith("/contato")?"Salvar contato":"Sair da lista";
    if (!links.has(target) || label !== "Abrir link") links.set(target, label);
  };
  const walk = (value: unknown, field = "") => {
    if (typeof value === "string") {
      if (field === "choices") {
        if (allowedOrigin && /\|url:/.test(value)) add(value.slice(value.indexOf("|url:")+5));
        const action = choiceUrl(value);
        if (action) { add(action.target, action.label); return; }
        // Image blocks, Pix payloads and reply IDs are not navigation links.
        if (/^\{|\|(copy:|call:)/.test(value) || value.includes("|")) return;
      } else if (!displayFields.has(field)) return;
      if (allowedOrigin && ["url","buttonUrl","button_url","paymentLink"].includes(field) && value) add(value);
      for (const found of value.matchAll(urlPattern)) add(trimUrl(found[0]));
    } else if (Array.isArray(value)) value.forEach(item => walk(item, field));
    else if (value && typeof value === "object") Object.entries(value).forEach(([key,item]) => walk(item,key));
  };
  walk(body);
  return [...links].map(([target,label])=>({target,label}));
}

export function rewriteOutboundBody(body: Body, links: OutboundLink[]): Body {
  const replacements = new Map(links.map(link=>[link.target,link.url]));
  const walk = (value: unknown, field = ""): unknown => {
    if (typeof value === "string") {
      if (field === "choices") {
        const action = choiceUrl(value);
        if (action) return `${action.label}|${value.slice(value.indexOf("|")+1).startsWith("url:") ? "url:" : ""}${replacements.get(action.target) ?? action.target}`;
        if (/^\{|\|(copy:|call:)/.test(value) || value.includes("|")) return value;
      } else if (!displayFields.has(field)) return value;
      return value.replace(urlPattern, raw => { const url=trimUrl(raw); return (replacements.get(url) ?? url)+raw.slice(url.length); });
    }
    if (Array.isArray(value)) return value.map(item=>walk(item,field));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,walk(item,key)]));
    return value;
  };
  return walk(body) as Body;
}

/** Resource URLs and button actions are transport data; prose never carries links. */
export function removeVisibleOutboundUrls(body: Body): Body {
  const prose = proseFields;
  const clean = (text: string) => text.replace(/\[([^\]]+)\]\(https?:\/\/[^\s]+\)/gi, "$1")
    .replace(urlPattern, "").replace(/\(\s*\)/g, "").replace(/[ \t]+\n/g, "\n").trim();
  const walk = (value: unknown, field = ""): unknown => {
    if (typeof value === "string") {
      if (prose.has(field)) return clean(value);
      if (field === "choices" && value.includes("|")) {
        const split = value.indexOf("|");
        return `${clean(value.slice(0, split)) || "Abrir"}${value.slice(split)}`;
      }
      if (field === "choices" && !value.startsWith("{")) return clean(value);
      return value;
    }
    if (Array.isArray(value)) return value.map(item => walk(item, field));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item, key)]));
    return value;
  };
  return walk(body) as Body;
}

const cleanButtonLabel = (label: string) => String(removeVisibleOutboundUrls({text:label}).text || "Abrir link");

export function planOutboundMessages(path: string, body: Body, links: OutboundLink[]) {
  body = removeVisibleOutboundUrls(body);
  if (!links.length) return [{path,body}];
  if (!body.text && (path === "/send/text" || path === "/send/menu")) body.text = "Acesse pelo botão abaixo.";
  const choices = links.map((link,index)=>`${cleanButtonLabel(link.label) === "Abrir link" && links.length > 1 ? `Abrir link ${index+1}` : cleanButtonLabel(link.label)}|${link.url}`);
  const buttonBody = (chunk: string[], text: string) => ({number:body.number, text, type:"button",choices:chunk,track_source:body.track_source,track_id:body.track_id});
  const messages: Array<{path:string;body:Body}> = [];
  if (path === "/send/text") {
    messages.push({path:"/send/menu",body:{...body,type:"button",choices:choices.splice(0,3)}});
  } else if (path === "/send/menu" && body.type === "button" && Array.isArray(body.choices) && body.choices.every(item=>typeof item === "string" && /\|(https?:|url:|copy:|call:)/.test(item))) {
    const existing=body.choices as string[];
    const all=[...existing,...choices.filter(choice=>!existing.some(item=>choiceUrl(item)?.target === choiceUrl(choice)?.target))];
    choices.splice(0,choices.length,...all.slice(3));
    messages.push({path,body:{...body,choices:all.slice(0,3)}});
  } else {
    const existing=Array.isArray(body.choices)?body.choices as string[]:[];
    const hasReplies=existing.some(choice=>typeof choice==="string"&&!/\|(https?:|url:|copy:|call:)/.test(choice));
    if(path==="/send/menu"&&body.type==="button"&&hasReplies){
      const replies=existing.filter(choice=>!/\|(https?:|url:|copy:|call:)/.test(choice));
      choices.push(...existing.filter(choice=>/\|(copy:|call:)/.test(choice)));
      messages.push({path,body:{...body,choices:replies,...(replies.length>3?{type:"list",listButton:"Ver opções"}:{})}});
    }else messages.push({path,body});
    // Carousel cards already carry their own URL buttons. Add only links outside those cards.
    if (path === "/send/carousel" || body.type === "carousel") choices.splice(0,choices.length,...choices.filter(choice=>!JSON.stringify(body.cards ?? body.carousel ?? body.choices ?? []).includes(choice.slice(choice.indexOf("|")+1))));
  }
  while(choices.length) messages.push({path:"/send/menu",body:buttonBody(choices.splice(0,3),"Links da mensagem")});
  return messages;
}
