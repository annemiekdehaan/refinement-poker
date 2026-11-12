import { createBot } from './app.mjs';
const bot = await createBot({ clientId: process.env.CLIENT_ID, clientSecret: process.env.CLIENT_SECRET, tenantId: process.env.TENANT_ID, managedIdentityClientId: process.env.MANAGED_IDENTITY_CLIENT_ID, dbPath: process.env.POKER_DB_PATH || './data/poker.sqlite' });
const server = bot.http.listen(Number(process.env.PORT || 3978), '0.0.0.0', () => console.log('Refinement Poker bot ready'));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(async () => { await bot.close(); process.exit(0); }));
