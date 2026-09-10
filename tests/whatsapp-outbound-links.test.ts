import { expect,it } from "vitest";
import { collectOutboundLinks,rewriteOutboundBody,planOutboundMessages } from "../src/lib/whatsapp/outbound-links";
function prepare(path:string,body:Record<string,unknown>){const links=collectOutboundLinks(body).map((link,i)=>({...link,url:`https://app.invalid/w/${i}`}));return{links,body:rewriteOutboundBody(body,links),messages:planOutboundMessages(path,rewriteOutboundBody(body,links),links)};}
it("turns every distinct visible URL into a tracked button, preserving punctuation and signed query strings",()=>{
 const target="https://checkout.invalid/pay?signature=a%2Fb&method=pix#details",f=prepare("/send/text",{number:"5511999999999",text:`Pague (${target}). Consulte https://shop.invalid/product(foo). ${target}`});
 expect(f.links.map(l=>l.target)).toEqual([target,"https://shop.invalid/product(foo)"]);
 expect(f.body.text).toBe("Pague (https://app.invalid/w/0). Consulte https://app.invalid/w/1. https://app.invalid/w/0");
 expect(f.messages[0].path).toBe("/send/menu");expect(f.messages[0].body.choices).toHaveLength(2);
});
it("preserves Pix copy actions, existing CTA labels and attachment URLs",()=>{
 const f=prepare("/send/menu",{number:"phone",type:"button",text:"Pague aqui: https://pay.invalid",imageButton:"https://assets.invalid/image.png",choices:["Pagar|url:https://pay.invalid","Copiar Pix|copy:000201https://pix.invalid/key","Sair da lista|https://app.invalid/avisos/key"]});
 expect(f.links).toHaveLength(2);expect(f.body.imageButton).toBe("https://assets.invalid/image.png");
 expect(f.messages[0].body.choices).toEqual(["Pagar|https://app.invalid/w/0","Copiar Pix|copy:000201https://pix.invalid/key","Sair da lista|https://app.invalid/w/1"]);
});
it("keeps quick replies separate from navigation buttons for WhatsApp Web",()=>{
 const f=prepare("/send/menu",{number:"phone",type:"button",text:"Mensagem",choices:["Confirmar|confirm","Abrir|https://shop.invalid","Copiar|copy:123"]});
 expect(f.messages).toHaveLength(2);expect(f.messages[0].body.choices).toEqual(["Confirmar|confirm"]);
 expect(f.messages[1].body.choices).toEqual(["Abrir|https://app.invalid/w/0","Copiar|copy:123"]);
});
it("keeps media bytes and URLs intact and sends the visible links as companion buttons",()=>{
 const f=prepare("/send/media",{number:"phone",type:"document",file:"https://storage.invalid/file.pdf?sig=untouched",text:"Seu documento: https://portal.invalid"});
 expect(f.body.file).toBe("https://storage.invalid/file.pdf?sig=untouched");expect(f.messages.map(m=>m.path)).toEqual(["/send/media","/send/menu"]);
 expect(f.messages[1].body.choices).toEqual(["Abrir link|https://app.invalid/w/0"]);
});
it("does not rewrite resources or generate duplicate carousel buttons",()=>{
 const f=prepare("/send/menu",{number:"phone",type:"carousel",choices:["[Produto]","{https://assets.invalid/photo.jpg}","Comprar|https://shop.invalid"]});
 expect(f.links).toHaveLength(1);expect(f.messages).toHaveLength(1);expect(f.messages[0].body.choices).toContain("Comprar|https://app.invalid/w/0");
});
it("keeps every URL when more than three buttons are needed",()=>{
 const f=prepare("/send/text",{number:"phone",text:Array.from({length:7},(_,i)=>`https://example.invalid/${i}`).join("\n")});
 expect(f.messages.map(m=>(m.body.choices as string[]).length)).toEqual([3,3,1]);
});
