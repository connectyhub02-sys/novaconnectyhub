// Who answers a group, and when: one agent per group at a time; different agents may take different hours.

export type RoomSchedule = { open: number; close: number; days: number[] };
export type GroupHolder = { groupName: string; agentName: string; always: boolean; rooms: RoomSchedule[] };

const allDays = [0, 1, 2, 3, 4, 5, 6];
const weekdayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Hours that touch also conflict: at the turn, one agent's closing would lock the group the other just opened. */
export function schedulesOverlap(a: RoomSchedule, b: RoomSchedule) {
  const daysA = a.days.length ? a.days : allDays;
  const daysB = b.days.length ? b.days : allDays;
  return daysA.some(day => daysB.includes(day)) && a.open <= b.close && b.open <= a.close;
}

/** Whether my room (or, without a schedule, answers at any time) collides with the agent already holding the group. */
export function holderConflicts(holder: GroupHolder, mine?: RoomSchedule | null) {
  if (holder.always) return true;
  if (!mine) return holder.rooms.length > 0;
  return holder.rooms.some(room => schedulesOverlap(room, mine));
}

export function describeSchedule(room: RoomSchedule) {
  const days = room.days.length && room.days.length < 7 ? ` (${[...room.days].sort().map(day => weekdayNames[day]).join(", ")})` : "";
  return `${room.open}h–${room.close}h${days}`;
}

export function describeHolder(holder: GroupHolder) {
  return holder.always ? `${holder.agentName} responde o dia todo` : `${holder.agentName} atende ${holder.rooms.map(describeSchedule).join(" e ")}`;
}

export function groupHolderConflictMessage(holder: GroupHolder) {
  return holder.always
    ? `O grupo ${holder.groupName} já é atendido por ${holder.agentName} o dia todo. Só um agente responde em cada grupo por vez: desligue as respostas de ${holder.agentName} nesse grupo para liberar. Postar produtos no grupo continua liberado para os dois.`
    : `O grupo ${holder.groupName} já é atendido por ${holder.agentName} em ${holder.rooms.map(describeSchedule).join(" e ")}. Escolha outro horário ou outros dias (com pelo menos 1 hora de intervalo) ou desligue a sala de ${holder.agentName} nesse grupo. Postar produtos no grupo continua liberado para os dois.`;
}
