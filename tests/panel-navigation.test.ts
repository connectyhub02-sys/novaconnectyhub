import { describe, expect, it } from "vitest";
import { groupPanelNavigation, matchesMenuSearch, panelContextLinks, panelDockHrefs } from "@/lib/ui/panel-navigation";

describe("panel navigation", () => {
  it("matches accents, case and the attendance alias", () => {
    expect(matchesMenuSearch("Ferramentas", { label: "Integrações", href: "/dashboard/integracoes" }, " INTEGRACOES ")).toBe(true);
    expect(matchesMenuSearch("Operação", { label: "WhatsApp Interno", href: "/admin/whatsapp/atendimento" }, "atender")).toBe(true);
  });
  it("retains exactly the authorized routes and metadata, including unknown routes", () => {
    const items = [{ label: "Integrações", href: "/dashboard/integracoes", comingSoon: true }, { label: "Future", href: "/new-route", comingSoon: false }];
    const grouped = groupPanelNavigation([{ label: "Original", items }], "client");
    expect(grouped.flatMap(section => section.items).map(({href,comingSoon})=>({href,comingSoon})).sort((a,b) => a.href.localeCompare(b.href))).toEqual(items.map(({href,comingSoon})=>({href,comingSoon})).sort((a,b) => a.href.localeCompare(b.href)));
    expect(groupPanelNavigation([], "admin")).toEqual([]);
  });
  it("puts conversations under attendance, with provider-independent groups and legacy search names", () => {
    const group = groupPanelNavigation([{label:"Meta",items:[{href:"/dashboard/chat-meta",label:"Chat Meta oficial"},{href:"/dashboard/meta/atendimento",label:"Direct"}]}], "client");
    expect(group).toHaveLength(1); expect(group[0].label).toBe("Atendimento");
    expect(matchesMenuSearch("Vendas", {href:"/dashboard/produtos",label:"Produtos para revender"},"produtos")).toBe(true);
    expect(panelContextLinks("/dashboard/chat-meta", "client")?.items).toHaveLength(3);
  });
  it("keeps restricted navigation restricted and merges only the existing maintenance alias", () => {
    const restricted=[{href:"/dashboard/meus-produtos",label:"Compras"},{href:"/dashboard/planos",label:"Plano"}];
    expect(groupPanelNavigation([{label:"Conta",items:restricted}],"client").flatMap(s=>s.items).map(i=>i.href)).toEqual(restricted.map(i=>i.href));
    const admin=groupPanelNavigation([{label:"Sistema",items:[{href:"/admin/configuracoes",label:"Config"},{href:"/admin/maintenance",label:"Manutenção"}]}],"admin");
    expect(admin[0].items.map(x=>x.href)).toEqual(["/admin/maintenance"]);
    expect(panelDockHrefs("admin")).toContain("/admin/infrastructure");
    expect(panelDockHrefs("client")).toContain("/dashboard/whatsapp");
  });
});
