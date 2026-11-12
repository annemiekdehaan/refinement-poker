import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function combinedManifest(botId) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(botId || '') || /^0{8}-/.test(botId)) throw new Error('A real Microsoft bot client ID is required. No installable bot package can be produced without registration.');
  const manifest = JSON.parse(await readFile(resolve(root, 'teams/manifest.json'), 'utf8'));
  manifest.$schema = 'https://developer.microsoft.com/en-us/json-schemas/teams/v1.29/MicrosoftTeams.schema.json';
  manifest.manifestVersion = '1.29'; manifest.version = '2.0.0';
  manifest.description.short = 'Planning poker in your channel chat and in a shared tab.';
  manifest.description.full = 'Use /poker followed by a title to post a public voting card in this conversation. Vote with one click, reveal together and start the next round. Voting ends automatically after two minutes. The starter manages the rounds. The shared tab remains available with a large live countdown. Chat sessions and tab sessions are independent. Requires the registered Refinement Poker bot service.';
  manifest.bots = [{ botId, scopes: ['personal', 'team', 'groupChat'], isNotificationOnly: false, supportsFiles: false, supportsTargetedMessages: true,
    commandLists: [{ scopes: ['personal', 'team', 'groupChat'], triggers: ['slash', 'mention'], commands: [{ title: 'poker', description: 'Post a public voting round here: /poker your story title' }] }] }];
  return manifest;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const botId = process.argv[process.argv.indexOf('--bot-id') + 1];
  if (!process.argv.includes('--bot-id')) throw new Error('Usage: node bot/package-teams.mjs --bot-id <registered-client-id> [--output <directory>]');
  const manifest = await combinedManifest(botId);
  const output = process.argv.includes('--output') ? resolve(process.argv[process.argv.indexOf('--output') + 1]) : resolve(root, 'bot/package');
  await mkdir(output, { recursive: true }); await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  for (const name of ['color.png', 'outline.png']) await copyFile(resolve(root, 'teams', name), resolve(output, name));
  console.log('Combined tab + slash-command package files are ready in ' + output);
}
