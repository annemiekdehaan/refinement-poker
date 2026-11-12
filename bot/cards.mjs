import { DECK } from '../model.mjs';
const text = (value, extra = {}) => ({ type: 'TextBlock', text: String(value), wrap: true, ...extra });
const safe = value => String(value).replace(/[\\*_`\[\]<>]/g, '\\$&');
const action = (s, verb, label, more = {}) => ({ type: 'Action.Execute', title: label, verb: 'poker', data: { sessionId: s.id, round: s.round, action: verb, ...more } });

export function cardFor(s) {
  const votes = Object.values(s.votes), visible = s.phase === 'revealed';
  const body = [text('♠ Refinement Poker', { weight: 'Bolder', size: 'Large' }), text(safe(s.title), { size: 'Medium', weight: 'Bolder' }),
    text(`Round ${s.round} · Facilitator: ${safe(s.ownerName)}`, { isSubtle: true }),
    text(visible ? 'Cards revealed' : `⏱ Voting ends {{TIME(${new Date(s.endsAt).toISOString()}, SHORT)}} · 2-minute round`, { weight: 'Bolder' }),
    text(`${votes.length} ${votes.length === 1 ? 'vote' : 'votes'} received. ${visible ? '' : 'Your choice stays hidden until reveal.'}`)];
  if (!visible && s.phase !== 'closed') {
    for (let i = 0; i < DECK.length; i += 6) body.push({ type: 'ActionSet', actions: DECK.slice(i, i + 6).map(value => action(s, 'vote', value, { value })) });
    body.push(text('Click a card to vote or change your vote. Your Teams identity is used automatically.', { size: 'Small', isSubtle: true }));
    body.push({ type: 'ActionSet', actions: [action(s, 'reveal', 'Reveal now'), action(s, 'restart', 'Restart round')] });
    body.push(text('Only the facilitator can reveal or restart. When time runs out, results appear here automatically.', { size: 'Small', isSubtle: true }));
  } else if (visible) {
    if (!votes.length) body.push(text('No votes were submitted.'));
    for (const value of DECK) { const count = votes.filter(v => v.value === value).length; if (count) body.push(text(`${value}   ${'■'.repeat(Math.min(count, 30))}   ${count}`)); }
    if (votes.length) body.push({ type: 'FactSet', facts: votes.slice(0, 100).map(v => ({ title: safe(v.name), value: v.value })) });
    const numbers = votes.filter(v => !['?', '☕'].includes(v.value)).map(v => v.value === '½' ? .5 : Number(v.value));
    if (numbers.length) body.push(text(`Average: ${(numbers.reduce((a,b)=>a+b,0)/numbers.length).toFixed(1)} · Discuss differences before agreeing an estimate.`));
    body.push({ type: 'Input.Text', id: 'nextTitle', label: 'Next topic (facilitator only)', placeholder: 'Optional new story or ticket', maxLength: 180 });
    body.push({ type: 'ActionSet', actions: [action(s, 'next', 'Next round'), action(s, 'close', 'End session')] });
  } else body.push(text('Session ended. Start another with /poker followed by a title.'));
  return { type: 'AdaptiveCard', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', version: '1.5', body, msteams: { width: 'Full' } };
}

export function publicMessage(s) {
  // No targeted recipient: every participant in this conversation can see the card.
  return { type: 'message', summary: `Refinement Poker: ${s.title}`, attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: cardFor(s) }] };
}
export const acknowledgement = value => ({ statusCode: 200, type: 'application/vnd.microsoft.activity.message', value });
