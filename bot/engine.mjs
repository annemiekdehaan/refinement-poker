import { randomUUID } from 'node:crypto';
import { DECK, cleanText } from '../model.mjs';
import { acknowledgement, publicMessage } from './cards.mjs';

export function commandTitle(text) {
  const withoutMention = String(text || '').replace(/<at\b[^>]*>.*?<\/at>/gi, '').trim();
  const match = /^(?:\/)?poker(?:\s+([\s\S]+))?$/i.exec(withoutMention);
  return match ? cleanText(match[1], 180) || 'Refinement round' : null;
}
function scope(activity) {
  const tenant = activity.channelData?.tenant?.id || activity.conversation?.tenantId;
  if (!tenant || !activity.conversation?.id || !activity.from?.id || !activity.id) throw new Error('Incomplete Teams activity');
  return { tenant, conversation: activity.conversation.id, actor: activity.from.id };
}
export class PokerEngine {
  constructor({ store, connector, tenantId, now = Date.now }) { this.store = store; this.connector = connector; this.tenantId = tenantId; this.now = now; this.queue = Promise.resolve(); }
  serial(task) { const result = this.queue.then(task); this.queue = result.catch(() => {}); return result; }
  check(activity) { const s = scope(activity); if (s.tenant !== this.tenantId || activity.channelId !== 'msteams') throw new Error('Wrong tenant or channel'); return s; }
  async publish(s) {
    // Save before network I/O. Failed PUT updates are retried by the durable scheduler.
    s.dirty = true; this.store.save(s);
    if (!s.messageId) {
      // Never automatically retry a POST whose outcome may be ambiguous.
      if (s.createAttempted) throw new Error('Initial post outcome is unknown; check the conversation before starting again.');
      s.createAttempted = true; this.store.save(s);
      const result = await this.connector.create(s, publicMessage(s));
      if (!result?.id) throw new Error('Teams returned no activity ID');
      s.messageId = result.id;
    } else await this.connector.update(s, publicMessage(s));
    s.dirty = false; this.store.save(s);
  }
  message(activity) { return this.serial(async () => {
    const context = this.check(activity), title = commandTitle(activity.text);
    if (title === null) return null;
    const eventKey = `${context.tenant}:${context.conversation}:${activity.id}`;
    const previous = this.store.seen(eventKey);
    if (previous) return this.store.get(previous.session_id);
    const session = { id: randomUUID(), tenant: context.tenant, conversation: context.conversation,
      serviceUrl: activity.serviceUrl, owner: context.actor, ownerName: cleanText(activity.from.name, 40) || 'Facilitator',
      title, round: 1, phase: 'voting', endsAt: this.now() + 120000, votes: {}, history: [], messageId: null, dirty: true };
    this.store.save(session); this.store.remember(eventKey, session.id);
    await this.publish(session); return session;
  }); }
  action(activity) { return this.serial(async () => {
    const context = this.check(activity), data = activity.value?.action?.data;
    if (!data || typeof data.sessionId !== 'string') return acknowledgement('This card is invalid. Start again with /poker followed by a title.');
    const s = this.store.get(data.sessionId);
    if (!s || s.tenant !== context.tenant || s.conversation !== context.conversation || activity.replyToId !== s.messageId) return acknowledgement('This card does not belong to this conversation or has expired.');
    if (data.round !== s.round || s.phase === 'closed') return acknowledgement('This round has ended. Use the latest card.');
    if (s.phase === 'voting' && this.now() >= s.endsAt) {
      this.reveal(s); await this.publish(s); return acknowledgement('Voting has ended. The results are now visible.');
    }
    if (data.action === 'vote') {
      if (s.phase !== 'voting' || !DECK.includes(data.value)) return acknowledgement('Voting is closed or this card is invalid.');
      if (!s.votes[context.actor] && Object.keys(s.votes).length >= 50) return acknowledgement('This session has reached its 50-voter limit.');
      s.votes[context.actor] = { name: cleanText(activity.from.name, 40) || 'Participant', value: data.value };
      await this.publish(s); return acknowledgement(`Your vote ${data.value} is recorded. You can change it before the reveal.`);
    }
    if (context.actor !== s.owner) return acknowledgement('Only the person who started this session can manage the round.');
    if (data.action === 'reveal' && s.phase === 'voting') this.reveal(s);
    else if (data.action === 'restart' && s.phase === 'voting') { s.round++; s.votes = {}; s.endsAt = this.now() + 120000; }
    else if (data.action === 'next' && s.phase === 'revealed') { s.round++; s.title = cleanText(data.nextTitle, 180) || s.title; s.votes = {}; s.phase = 'voting'; s.endsAt = this.now() + 120000; s.messageId = null; s.createAttempted = false; }
    else if (data.action === 'close') s.phase = 'closed';
    else return acknowledgement('This action is not available in the current round.');
    await this.publish(s); return acknowledgement(data.action === 'close' ? 'Session ended.' : 'Round updated.');
  }); }
  reveal(s) { s.phase = 'revealed'; s.history.push({ round: s.round, title: s.title, votes: structuredClone(s.votes), at: this.now() }); s.history = s.history.slice(-100); }
  tick() { return this.serial(async () => {
    for (const s of this.store.all()) {
      if (s.phase === 'voting' && this.now() >= s.endsAt) this.reveal(s);
      else if (!s.dirty) continue;
      if (!s.messageId && s.createAttempted) continue;
      try { await this.publish(s); } catch { /* The persisted dirty state is retried on the next tick. */ }
    }
    this.store.prune(this.now());
  }); }
}
