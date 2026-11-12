import { App, ExpressAdapter } from '@microsoft/teams.apps';
import express from 'express';
import { PokerEngine } from './engine.mjs';
import { Store } from './store.mjs';
import { acknowledgement } from './cards.mjs';

export async function createBot({ clientId, clientSecret, tenantId, dbPath, managedIdentityClientId } = {}) {
  if (!clientId || !tenantId || (!clientSecret && !managedIdentityClientId)) throw new Error('Bot registration is required: configure CLIENT_ID, TENANT_ID, and CLIENT_SECRET or MANAGED_IDENTITY_CLIENT_ID.');
  const http = express(); http.disable('x-powered-by'); http.use(express.json({ limit: '128kb' }));
  http.get('/health', (_req, res) => res.json({ status: 'ok', service: 'refinement-poker-bot' }));
  // SDK validates the signed Microsoft service token and serviceUrl. Never bypass authentication.
  http.post('/api/messages', (req, res, next) => {
    if (!/^Bearer\s+\S+$/i.test(req.headers.authorization || '')) return res.sendStatus(401);
    const tenant = req.body?.channelData?.tenant?.id || req.body?.conversation?.tenantId;
    if (tenant !== tenantId || req.body?.channelId !== 'msteams') return res.sendStatus(403);
    next();
  });
  const app = new App({ clientId, clientSecret, tenantId, managedIdentityClientId, httpServerAdapter: new ExpressAdapter(http), client: { timeout: 8000 } });
  const connector = {
    create: (s, message) => app.api.clone({ serviceUrl: s.serviceUrl }).conversations.activities(s.conversation).create(message),
    update: (s, message) => app.api.clone({ serviceUrl: s.serviceUrl }).conversations.activities(s.conversation).update(s.messageId, message)
  };
  const store = new Store(dbPath), engine = new PokerEngine({ store, connector, tenantId });
  app.on('message', async ({ activity, send }) => {
    try { await engine.message(activity); }
    catch { await send({ type: 'message', text: 'The session could not be posted. Check this conversation before starting another /poker round.', recipient: { ...activity.from, isTargeted: true } }); }
  });
  app.on('card.action', async ({ activity }) => {
    try { return await engine.action(activity); }
    catch { return acknowledgement('Teams could not refresh the shared card. Your action may already be saved; it will be retried.'); }
  });
  // Log an error code only; activities contain names, topics and private votes.
  app.event('error', () => console.error('Teams request failed'));
  await app.initialize();
  const timer = setInterval(() => engine.tick().catch(() => console.error('Poker scheduler failed')), 3000); timer.unref();
  return { http, app, engine, store, close: async () => { clearInterval(timer); await engine.queue; store.close(); } };
}
