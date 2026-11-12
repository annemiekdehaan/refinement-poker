import { DECK, act, cleanText, createRoom, historyCsv, joinMember, newRoomCode, normalizeRoom, results, roomLabel, uuid, validRoom, viewFor } from './model.mjs';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.hash.slice(1));
let code = normalizeRoom(params.get('room') || '');
let mode = validRoom(code) ? 'join' : 'create';
let peer, upstream, room, view, owner = false, connected = false, busy = false, lastHost = 0, connectTimeout;
const connections = new Map();
const profile = readSession('rp-profile') || { id: uuid(), token: uuid(), name: '' };
let hostSnapshot = readSession('rp-host');
let toastTimeout;

function readSession(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } }
function saveSession(key, data) { try { sessionStorage.setItem(key, JSON.stringify(data)); } catch {} }
function removeSession(key) { try { sessionStorage.removeItem(key); } catch {} }
function text(id, value) { $(id).textContent = value; }
function show(id, visible) { $(id).hidden = !visible; }
function node(tag, className, content) { const el = document.createElement(tag); if (className) el.className = className; if (content !== undefined) el.textContent = content; return el; }
function message(value, error = false) { text('connection-message', value); $('connection-message').className = error ? 'error' : ''; }
function toast(value) { clearTimeout(toastTimeout); text('toast', value); show('toast', true); toastTimeout = setTimeout(() => show('toast', false), 3500); }
function selectMode(value) { mode = value; ['create', 'join'].forEach(type => { $(`${type}-tab`).setAttribute('aria-selected', String(value === type)); show(`${type}-panel`, value === type); }); $('room-code').required = value === 'join'; }
function busyState(value) { busy = value; ['create-room', 'join-room', 'resume-room'].forEach(id => $(id).disabled = value); }
function link() { return `${location.origin}${location.pathname}#room=${view.code}`; }
function setUrl(roomCode) { code = roomCode; history.replaceState(null, '', `#room=${roomCode}`); }
function setConnected(value, label = value ? 'Verbonden' : 'Verbinding verbroken') { connected = value; text('network-status', label); $('network-status').classList.toggle('offline', !value); if (view) render(); }
function stopTransport() { clearTimeout(connectTimeout); connections.clear(); upstream = null; if (peer) { const old = peer; peer = null; old.destroy(); } connected = false; }
function failed(value) { stopTransport(); busyState(false); message(value, true); if (view) { setConnected(false); toast(value); } }
function newPeer(id) {
  if (typeof window.Peer !== 'function') throw new Error('De verbindingsbibliotheek kon niet laden. Ververs de pagina.');
  return id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
}
function errorText(error) {
  if (error?.type === 'peer-unavailable') return 'Deze sessie is niet actief. Controleer de code en vraag de sessieleider de pagina open te houden.';
  if (error?.type === 'unavailable-id') return 'Deze kamer is al actief. Kies Deelnemen, of wacht een paar seconden om je sessie te hervatten.';
  return 'Verbinden lukt niet. Controleer je internetverbinding en probeer opnieuw. Een bedrijfsnetwerk of VPN kan de verbinding blokkeren.';
}
function persistHost() { saveSession('rp-host', { room, profileId: profile.id }); hostSnapshot = { room, profileId: profile.id }; }
function broadcast() {
  persistHost();
  view = viewFor(room, profile.id);
  for (const [id, conn] of connections) if (conn.open) conn.send({ type: 'state', view: viewFor(room, id) });
  render();
}
function enter() { busyState(false); clearTimeout(connectTimeout); show('lobby', false); show('room', true); message(''); $('story-title').value = view.title; setUrl(view.code); setConnected(true); window.scrollTo(0, 0); }
function doAction(action) {
  if (!view || !connected) return;
  action.round = view.round;
  if (owner) { if (act(room, profile.id, action)) broadcast(); }
  else if (upstream?.open) upstream.send({ type: 'action', action });
}

function startHost(roomCode = newRoomCode(), restored = null, joinOnCollision = false) {
  stopTransport(); busyState(true); message(restored ? 'Je sessie hervatten…' : 'Een tafel voor je team openen…');
  try { peer = newPeer(`rp-v1-${roomCode}`); } catch (e) { failed(e.message); return; }
  const current = peer;
  let opened = false;
  connectTimeout = setTimeout(() => { if (peer === current) failed('De sessie openen duurt te lang. Controleer je verbinding en probeer opnieuw.'); }, 18000);
  current.on('open', () => {
    if (peer !== current) return;
    if (opened) { toast('Verbindingsserver weer verbonden.'); return; }
    opened = true;
    owner = true;
    room = restored || createRoom(roomCode, profile);
    room.members.forEach(m => { m.online = m.id === profile.id; });
    room.members.find(m => m.id === profile.id).spectator = $('entry-spectator').checked;
    broadcast(); enter();
  });
  current.on('connection', conn => {
    let memberId = null;
    const joinTimeout = setTimeout(() => { if (!memberId) conn.close(); }, 8000);
    conn.on('data', data => {
      if (peer !== current || !room || !data || typeof data !== 'object') return;
      if (data.type === 'join' && !memberId) {
        if (!joinMember(room, data.profile)) { conn.send({ type: 'rejected', message: 'De kamer is vol of je sessie is ongeldig. Open de app in een nieuw tabblad.' }); setTimeout(() => conn.close(), 200); return; }
        memberId = data.profile.id;
        const previous = connections.get(memberId);
        connections.set(memberId, conn);
        if (previous && previous !== conn) previous.close();
        clearTimeout(joinTimeout); broadcast();
      } else if (memberId && connections.get(memberId) === conn) {
        if (data.type === 'ping') conn.send({ type: 'pong' });
        if (data.type === 'action' && act(room, memberId, data.action)) broadcast();
      }
    });
    const close = () => {
      clearTimeout(joinTimeout);
      if (peer === current && memberId && connections.get(memberId) === conn) {
        connections.delete(memberId);
        const member = room.members.find(m => m.id === memberId); if (member) member.online = false;
        broadcast();
      }
    };
    conn.on('close', close); conn.on('error', close);
  });
  current.on('error', error => {
    if (peer !== current) return;
    if (connected && ['network', 'socket-error', 'server-error'].includes(error.type)) { toast('Verbindingsserver tijdelijk niet bereikbaar. Bestaande verbindingen blijven actief.'); return; }
    if (joinOnCollision && error.type === 'unavailable-id') { startGuest(roomCode); return; }
    failed(errorText(error));
  });
  current.on('disconnected', () => {
    if (peer === current) { toast('Verbindingsserver tijdelijk weg. Bestaande deelnemers blijven verbonden; opnieuw verbinden…'); current.reconnect(); }
  });
}

function startGuest(roomCode, autoHost = false) {
  stopTransport(); owner = false; busyState(true); message('Aanschuiven bij je team…');
  try { peer = newPeer(); } catch (e) { failed(e.message); return; }
  const current = peer;
  connectTimeout = setTimeout(() => { if (peer === current) failed('Geen verbinding met de sessieleider. Vraag of de sessie nog openstaat, of probeer een ander netwerk.'); }, 18000);
  current.on('open', () => {
    if (peer !== current) return;
    if (upstream?.open) return;
    upstream = current.connect(`rp-v1-${roomCode}`, { reliable: true, serialization: 'json' });
    const conn = upstream;
    conn.on('open', () => { if (peer === current) conn.send({ type: 'join', profile: { ...profile, spectator: $('entry-spectator').checked } }); });
    conn.on('data', data => {
      if (peer !== current || !data || typeof data !== 'object') return;
      lastHost = Date.now();
      if (data.type === 'pong' && view && !connected) setConnected(true);
      if (data.type === 'rejected') { failed(cleanText(data.message, 200)); return; }
      if (data.type === 'state' && data.view?.code === roomCode && Array.isArray(data.view.members)) {
        const first = !view || !connected;
        view = data.view;
        if (first) enter(); else render();
      }
    });
    const lost = () => { if (peer === current) { clearTimeout(connectTimeout); busyState(false); setConnected(false); toast('De verbinding met de sessieleider is verbroken. Klik op Opnieuw verbinden.'); } };
    conn.on('close', lost); conn.on('error', lost);
  });
  current.on('error', error => {
    if (peer !== current) return;
    if (autoHost && error.type === 'peer-unavailable') { startHost(roomCode, null, true); return; }
    failed(errorText(error));
  });
  current.on('disconnected', () => { if (peer === current) current.reconnect(); });
}

function render() {
  if (!view) return;
  const me = view.members.find(m => m.id === profile.id);
  if (!me) return;
  const active = view.members.filter(m => !m.spectator);
  const voted = active.filter(m => m.hasVoted).length;
  const revealed = view.revealed;
  text('round-label', `RONDE ${view.round}`);
  text('phase-label', revealed ? 'Kaarten op tafel' : 'Stemmen maar');
  show('story-form', owner && !revealed); show('story-display', !owner || revealed);
  text('story-display', view.title || 'Een nieuwe inschatting');
  show('story-hint', !view.title && owner && !revealed);
  show('host-timer', owner && !revealed);
  $('story-title').disabled = !connected; $('save-title').disabled = !connected;
  if (document.activeElement !== $('story-title')) $('story-title').value = view.title;
  text('table-title', revealed ? 'Kaarten op tafel.' : voted === active.length && active.length ? 'Iedereen is er klaar voor.' : 'Even zelf nadenken.');
  text('table-description', revealed ? 'Bespreek de verschillen en spreek samen een inschatting af.' : 'Je stem blijft verborgen tot de sessieleider onthult.');
  $('participant-cards').replaceChildren(...view.members.map(member => {
    const wrapper = node('div', 'participant');
    const card = node('div', `table-card ${member.spectator ? 'spectating' : member.hasVoted ? revealed ? 'face-up' : 'face-down' : 'waiting'}`, member.spectator ? '◉' : revealed ? (member.vote ?? '—') : member.hasVoted ? '♠' : '· · ·');
    card.setAttribute('aria-label', `${member.name}: ${member.spectator ? 'kijkt mee' : revealed ? member.vote ?? 'niet gestemd' : member.hasVoted ? 'gestemd' : 'denkt na'}`);
    wrapper.append(card, node('span', 'participant-name', member.name + (member.id === profile.id ? ' (jij)' : ''))); return wrapper;
  }));
  text('vote-progress', `${voted} van ${active.length} ${active.length === 1 ? 'stem' : 'stemmen'} binnen`);
  show('reveal', owner && !revealed); $('reveal').disabled = !connected || voted === 0;
  show('next-round', owner && revealed); $('next-round').disabled = !connected;
  show('guest-wait', !owner);
  $('guest-wait').replaceChildren();
  if (!connected) {
    const retry = node('button', 'secondary', 'Opnieuw verbinden');
    retry.onclick = () => owner ? startHost(code, room) : startGuest(code);
    $('guest-wait').append(retry); show('guest-wait', true);
  } else text('guest-wait', 'De sessieleider beheert deze ronde.');
  $('spectator').checked = me.spectator; $('spectator').disabled = revealed || !connected;
  for (const card of $('deck').children) { const selected = card.dataset.vote === me.vote; card.setAttribute('aria-pressed', String(selected)); card.disabled = revealed || me.spectator || !connected; }
  text('my-vote-status', !connected ? 'Verbinding verbroken. Verbind opnieuw om verder te gaan.' : me.spectator ? 'Je kijkt mee en telt niet mee in de stemmen.' : revealed ? 'Deze ronde is onthuld. In de volgende ronde kun je weer stemmen.' : me.vote !== null ? `Je hebt ${me.vote} gekozen. Klik nogmaals om je stem in te trekken.` : 'Kies een kaart. Je kunt je keuze nog veranderen.');
  text('member-count', view.members.length);
  $('member-list').replaceChildren(...view.members.map((member, i) => {
    const row = node('div', 'member-row');
    const avatar = node('span', `avatar color-${i % 4}`, member.name.slice(0, 1).toUpperCase());
    const name = node('div', 'member-name', member.name + (member.id === profile.id ? ' (jij)' : ''));
    name.append(node('small', '', member.id === view.ownerId ? 'Sessieleider' : member.spectator ? 'Kijkt mee' : 'Deelnemer'));
    row.append(avatar, name, node('span', 'member-status', member.spectator ? '◉' : member.hasVoted ? '✓' : '···')); return row;
  }));
  text('copy-code', roomLabel(view.code));
  show('results', revealed);
  if (revealed) renderResults();
  $('history').replaceChildren(...view.history.map(item => { const row = node('div', 'history-item'); const info = node('div', '', item.title); info.append(node('small', '', `Ronde ${item.round} · ${item.votes.length} stemmen`)); row.append(info, node('strong', 'estimate-pill', item.estimate)); return row; }));
  if (!view.history.length) $('history').append(node('p', 'muted', 'Een schone lei. Bewaarde rondes verschijnen hier.'));
  $('export-csv').disabled = !view.history.length;
  text('host-note', owner ? 'Jij houdt de tafel open. Exporteer resultaten voordat je de sessie afsluit.' : 'Houd de pagina open. Als de sessieleider vertrekt, eindigt de sessie.');
  updateTimer();
}

function renderResults() {
  const summary = results(view.members);
  text('consensus', summary.consensus ? 'Iedereen dezelfde kaart ✨' : 'Tijd voor een goed gesprek');
  const avg = node('div', 'metric'); avg.append(node('strong', '', summary.average === null ? '—' : new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(summary.average)), node('span', '', 'gemiddelde (cijfers)'));
  const common = node('div', 'metric'); common.append(node('strong', '', summary.suggestion ?? '—'), node('span', '', 'meest gekozen'));
  $('result-summary').replaceChildren(avg, common);
  $('distribution').replaceChildren(...summary.counts.map(item => { const bar = node('div', 'distribution-row'); const track = node('span', 'bar-track'); const fill = node('span', 'bar-fill'); fill.style.width = `${item.count / summary.votes.length * 100}%`; track.append(fill); bar.append(node('strong', '', item.value), track, node('span', '', item.count)); return bar; }));
  show('save-result', owner && !view.saved); show('result-saved', view.saved);
  $('final-estimate').disabled = !connected; $('save-result').querySelector('button').disabled = !connected;
}
function updateTimer() {
  if (!view) return;
  const seconds = view.endsAt ? Math.max(0, Math.ceil((view.endsAt - Date.now()) / 1000)) : null;
  text('timer', seconds === null ? '◷ Geen timer' : seconds === 0 ? '◷ Tijd om te bespreken' : `◷ ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
  $('timer').classList.toggle('expired', seconds === 0);
  text('timer-start', view.endsAt ? 'Stop timer' : 'Start timer');
  $('timer-start').disabled = !connected;
}

for (const value of DECK) {
  const card = node('button', 'vote-card', value); card.type = 'button'; card.dataset.vote = value;
  card.setAttribute('aria-label', value === '?' ? 'Onzeker' : value === '☕' ? 'Pauze' : `Stem ${value}`); card.setAttribute('aria-pressed', 'false');
  card.onclick = () => { const me = view.members.find(m => m.id === profile.id); doAction({ type: 'vote', value: me.vote === value ? null : value }); };
  $('deck').append(card);
  const option = node('option', '', value); option.value = value; $('final-estimate').append(option);
}
$('create-tab').onclick = () => selectMode('create'); $('join-tab').onclick = () => selectMode('join');
$('entry-form').onsubmit = event => {
  event.preventDefault(); if (busy) return;
  profile.name = cleanText($('name').value, 30); if (!profile.name) { $('name').focus(); return; }
  saveSession('rp-profile', profile);
  if (mode === 'create') startHost();
  else {
    let input = $('room-code').value.trim();
    try { if (input.includes('://')) input = new URLSearchParams(new URL(input).hash.slice(1)).get('room') || ''; } catch {}
    const roomCode = normalizeRoom(input);
    if (!validRoom(roomCode)) { message('Vul de kamercode van 12 tekens in, bijvoorbeeld ABC123-DEF456.', true); return; }
    startGuest(roomCode, params.get('auto') === '1' && roomCode === code);
  }
};
$('resume-room').onclick = () => { if (hostSnapshot?.profileId === profile.id) startHost(hostSnapshot.room.code, hostSnapshot.room); };
$('story-form').onsubmit = event => { event.preventDefault(); doAction({ type: 'title', value: $('story-title').value }); toast('Onderwerp opgeslagen.'); };
$('spectator').onchange = () => doAction({ type: 'spectator', value: $('spectator').checked });
$('reveal').onclick = () => { doAction({ type: 'reveal' }); const summary = results(view.members); $('final-estimate').value = summary.suggestion || '5'; };
$('next-round').onclick = () => doAction({ type: 'next', clearTitle: true });
$('timer-start').onclick = () => doAction({ type: 'timer', seconds: view.endsAt ? 0 : Number($('timer-duration').value) });
$('save-result').onsubmit = event => { event.preventDefault(); doAction({ type: 'save', value: $('final-estimate').value }); };
async function copy(value, success) { try { await navigator.clipboard.writeText(value); toast(success); } catch { toast('Kopiëren lukt hier niet. Kopieer de kamercode uit de zijbalk.'); } }
$('copy-link').onclick = () => copy(link(), 'Uitnodigingslink gekopieerd. Deel hem met je team.');
$('copy-code').onclick = () => copy(roomLabel(view.code), 'Kamercode gekopieerd.');
$('export-csv').onclick = () => {
  const url = URL.createObjectURL(new Blob([historyCsv(view.history)], { type: 'text/csv;charset=utf-8' }));
  const a = node('a'); a.href = url; a.download = `refinement-poker-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('help-open').onclick = () => $('help').showModal(); $('help-close').onclick = () => $('help').close();
$('leave-room').onclick = () => { text('leave-copy', owner ? 'Als jij vertrekt, eindigt de sessie voor iedereen. Exporteer eerst jullie bewaarde resultaten als CSV.' : 'Je kunt later met dezelfde link weer aanschuiven zolang de sessieleider de tafel openhoudt.'); $('leave-dialog').showModal(); };
$('leave-cancel').onclick = () => $('leave-dialog').close();
$('leave-confirm').onclick = () => { $('leave-dialog').close(); stopTransport(); removeSession('rp-host'); hostSnapshot = null; view = room = null; owner = false; history.replaceState(null, '', location.pathname); code = ''; busyState(false); message('Je hebt de sessie verlaten.'); show('room', false); show('lobby', true); show('resume-room', false); selectMode('create'); };
window.addEventListener('beforeunload', event => { if (owner && view && connected) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('online', () => { if (peer?.disconnected && !peer.destroyed) peer.reconnect(); });
setInterval(() => {
  updateTimer();
  if (!owner && upstream?.open && view) {
    if (lastHost && Date.now() - lastHost > 25000) setConnected(false);
    upstream.send({ type: 'ping' });
  }
}, 5000);
setInterval(updateTimer, 500);
selectMode(mode); if (validRoom(code)) $('room-code').value = roomLabel(code);
$('name').value = profile.name;
if (hostSnapshot?.profileId === profile.id && validRoom(hostSnapshot.room?.code) && (!code || code === hostSnapshot.room.code)) show('resume-room', true);
async function initTeams() {
  if (window.parent === window || !window.microsoftTeams) return;
  try {
    await Promise.race([window.microsoftTeams.app.initialize(), new Promise((_, reject) => setTimeout(reject, 5000))]);
    const context = await window.microsoftTeams.app.getContext();
    if (!$('name').value && context.user?.displayName) $('name').value = cleanText(context.user.displayName, 30);
    if (context.app?.theme === 'contrast') document.body.classList.add('high-contrast');
    window.microsoftTeams.app.notifySuccess();
  } catch { /* The app also works in a regular browser or iframe. */ }
}
initTeams();
