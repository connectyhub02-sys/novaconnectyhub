type Body = Record<string, unknown>;
export type OutboundLink = { target: string; label: string; url: string };
const urlPattern = /https?:\/\/[^\s<>"'\]\}]+/gi;
const trimUrl = (url: string) => url.replace(/[.,;!?]+$/, "").replace(/\)+$/, closing => {
  const opens = (url.match(/\(/g) ?? []).length, closes = (url.match(/\)/g) ?? []).length;
  return closing.slice(Math.min(closing.length, Math.max(0, closes - opens)));
});
const displayFields = new Set(["text", "caption", "description", "footerText", "title", "url", "buttonUrl", "button_url"]);
function choiceUrl(choice: string) {
  const split = choice.indexOf("|");
  if (split < 0) return null;
  const action = choice.slice(split + 1).replace(/^url:/, "");
  return /^https?:\/\//i.test(action) ? { label: choice.slice(0, split), target: action } : null;
}

export function collectOutboundLinks(body: Body): Array<{target: string; label: string}> {
  const links = new Map<string, string>();
  const add = (target: string, label = "Abrir link") => {
    try { const url = new URL(target); if (url.username || url.password || !/^https?:$/.test(url.protocol)) return; } catch { return; }
    if (label === "Abrir link" && /\/(contato\/preferencias|avisos)\//.test(target)) label=target.endsWith("/contato")?"Salvar contato":"Sair da lista";
    if (!links.has(target) || label !== "Abrir link") links.set(target, label);
  };
  const walk = (value: unknown, field = "") => {
    if (typeof value === "string") {
      if (field === "choices") {
        const action = choiceUrl(value);
        if (action) { add(action.target, action.label); return; }
        // Image blocks, Pix payloads and reply IDs are not navigation links.
        if (/^\{|\|(copy:|call:)/.test(value) || value.includes("|")) return;
      } else if (!displayFields.has(field)) return;
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
        if (action) return `${action.label}|${replacements.get(action.target) ?? action.target}`;
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

export function planOutboundMessages(path: string, body: Body, links: OutboundLink[]) {
  if (!links.length) return [{path,body}];
  const choices = links.map((link,index)=>`${link.label === "Abrir link" && links.length > 1 ? `Abrir link ${index+1}` : link.label}|${link.url}`);
  const buttonBody = (chunk: string[], text: string) => ({number:body.number, text, type:"button",choices:chunk,track_source:body.track_source,track_id:body.track_id});
  const messages: Array<{path:string;body:Body}> = [];
  if (path === "/send/text") {
    messages.push({path:"/send/menu",body:{...body,type:"button",choices:choices.splice(0,3)}});
  } else if (path === "/send/menu" && body.type === "button" && Array.isArray(body.choices) && body.choices.every(item=>typeof item === "string" && /\|(https?:|url:|copy:|call:)/.test(item))) {
    const existing=body.choices as string[];
    const all=[...existing,...choices.filter(choice=>!existing.some(item=>item.endsWith(choice.slice(choice.indexOf("|")))))];
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
