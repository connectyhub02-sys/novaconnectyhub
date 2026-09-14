export type AccountNoticeActions = { unsubscribeUrl: string; contactUrl?: string };

export function noticeActionsMessage(message: string, actions: AccountNoticeActions) {
  return `${message}${actions.contactUrl ? "\n\nVocê pode salvar o contato pelo botão." : ""}`;
}

export function noticeActionChoices(actions: AccountNoticeActions, checkout: { label: string; url: string } | null, pixCode?: string | null) {
  return [
    ...(checkout ? [`${checkout.label}|${checkout.url}`] : []),
    ...(pixCode ? [`Copiar código Pix|copy:${pixCode}`] : []),
    ...(actions.contactUrl ? [`Salvar contato|${actions.contactUrl}`] : []),
    `Sair da lista|${actions.unsubscribeUrl}`,
  ];
}

export function connectyHubContactCard(phone: string) {
  if (!/^[1-9][0-9]{9,14}$/.test(phone)) throw new Error("Contato indisponível.");
  return ["BEGIN:VCARD", "VERSION:3.0", "FN:ConnectyHub", "N:ConnectyHub;;;;", "ORG:ConnectyHub", `TEL;TYPE=CELL:+${phone}`, "END:VCARD", ""].join("\r\n");
}
