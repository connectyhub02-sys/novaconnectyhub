export type AccountNoticeActions = { unsubscribeUrl: string; contactUrl?: string };

export function noticeActionsMessage(message: string, actions: AccountNoticeActions) {
  return `${message}${actions.contactUrl ? `\n\nSalve o contato da ConnectyHub na sua agenda: ${actions.contactUrl}` : ""}\n\nSair da lista de avisos da conta: ${actions.unsubscribeUrl}`;
}

export function noticeActionChoices(actions: AccountNoticeActions, checkout: { label: string; url: string } | null, pixCode?: string | null) {
  return [
    ...(pixCode ? [`Copiar código Pix|copy:${pixCode}`] : checkout ? [`${checkout.label}|${checkout.url}`] : []),
    ...(actions.contactUrl ? [`Salvar contato|${actions.contactUrl}`] : []),
    `Sair da lista|${actions.unsubscribeUrl}`,
  ];
}

export function connectyHubContactCard(phone: string) {
  if (!/^[1-9][0-9]{9,14}$/.test(phone)) throw new Error("Contato indisponível.");
  return ["BEGIN:VCARD", "VERSION:3.0", "FN:ConnectyHub", "N:ConnectyHub;;;;", "ORG:ConnectyHub", `TEL;TYPE=CELL:+${phone}`, "END:VCARD", ""].join("\r\n");
}
