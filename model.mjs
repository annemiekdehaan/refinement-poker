export const DECK = ['0', '½', '1', '2', '3', '5', '8', '13', '21', '?', '☕'];
export const cleanText = (value, max = 120) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export const validRoom = value => /^[A-F0-9]{12}$/.test(value);
export const normalizeRoom = value => String(value).toUpperCase().replace(/[\s-]/g, '');
export const roomLabel = value => `${value.slice(0, 6)}-${value.slice(6)}`;
export const uuid = () => crypto.randomUUID();
export const newRoomCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();

export function createRoom(code, owner) {
  return { code, ownerId: owner.id, round: 1, title: '', revealed: false, endsAt: null,
    members: [{ ...owner, online: true, spectator: false, vote: null }], history: [], saved: false };
}

export function joinMember(room, info) {
  if (!info || !/^[a-f0-9-]{36}$/i.test(info.id || '') || !/^[a-f0-9-]{36}$/i.test(info.token || '') || !cleanText(info.name, 30)) return false;
  const member = room.members.find(m => m.id === info.id);
  if (member) {
    if (member.token !== info.token || member.id === room.ownerId) return false;
    member.online = true;
    member.name = cleanText(info.name, 30);
  } else {
    if (room.members.filter(m => m.online).length >= 12 || room.members.length >= 100) return false;
    room.members.push({ id: info.id, token: info.token, name: cleanText(info.name, 30), online: true, spectator: !!info.spectator, vote: null });
  }
  return true;
}

export function act(room, actorId, action, now = Date.now()) {
  if (!action || typeof action !== 'object' || JSON.stringify(action).length > 3000) return false;
  const member = room.members.find(m => m.id === actorId && m.online);
  if (!member || action.round !== room.round) return false;
  const host = member.id === room.ownerId;
  switch (action.type) {
    case 'vote':
      if (room.revealed || member.spectator || (action.value !== null && !DECK.includes(action.value))) return false;
      member.vote = action.value;
      return true;
    case 'spectator':
      if (room.revealed || typeof action.value !== 'boolean') return false;
      member.spectator = action.value;
      member.vote = null;
      return true;
    case 'title':
      if (!host || room.revealed) return false;
      room.title = cleanText(action.value, 180);
      return true;
    case 'reveal':
      if (!host || room.revealed || !room.members.some(m => m.online && !m.spectator && m.vote !== null)) return false;
      room.revealed = true;
      room.endsAt = null;
      return true;
    case 'next':
      if (!host) return false;
      room.round++;
      room.revealed = false;
      room.saved = false;
      room.endsAt = null;
      if (action.clearTitle) room.title = '';
      room.members.forEach(m => { m.vote = null; });
      return true;
    case 'timer':
      if (!host || room.revealed || ![0, 60, 120, 300].includes(action.seconds)) return false;
      room.endsAt = action.seconds ? now + action.seconds * 1000 : null;
      return true;
    case 'save': {
      if (!host || !room.revealed || room.saved || !DECK.includes(action.value)) return false;
      room.history.unshift({ round: room.round, title: room.title || `Round ${room.round}`, estimate: action.value,
        votes: room.members.filter(m => m.online && !m.spectator && m.vote !== null).map(m => ({ name: m.name, vote: m.vote })), at: new Date(now).toISOString() });
      room.history = room.history.slice(0, 100);
      room.saved = true;
      return true;
    }
    default: return false;
  }
}

export function viewFor(room, recipientId) {
  return { ...room, members: room.members.filter(m => m.online).map(({ token, ...member }) => ({ ...member,
    hasVoted: member.vote !== null, vote: room.revealed || member.id === recipientId ? member.vote : null })) };
}

export function results(members) {
  const votes = members.filter(m => m.online && !m.spectator && m.vote !== null).map(m => m.vote);
  const numbers = votes.filter(v => !['?', '☕'].includes(v)).map(v => v === '½' ? 0.5 : Number(v));
  const counts = DECK.map(value => ({ value, count: votes.filter(v => v === value).length })).filter(v => v.count);
  const high = Math.max(0, ...counts.map(v => v.count));
  const winners = counts.filter(v => v.count === high);
  return { votes, counts, average: numbers.length ? numbers.reduce((a,b) => a+b, 0) / numbers.length : null,
    consensus: votes.length > 0 && counts.length === 1, suggestion: winners.length === 1 ? winners[0].value : null };
}

export function historyCsv(history) {
  const cell = value => {
    let text = String(value);
    if (/^[=+@\-\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [['Round', 'Topic', 'Story points', 'Votes', 'Date'], ...history.map(h => [h.round, h.title, h.estimate, h.votes.map(v => `${v.name}: ${v.vote}`).join(' | '), h.at])];
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}
