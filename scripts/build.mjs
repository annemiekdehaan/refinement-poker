import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
const base = 'https://annemiekdehaan.github.io/refinement-poker/';
const files = ['index.html', 'config.html', 'config.mjs', 'app.mjs', 'model.mjs', 'style.css', 'icon.svg', 'privacy.html'];
await mkdir('vendor', { recursive: true });
for (const [source, target] of [
  ['node_modules/peerjs/dist/peerjs.min.js', 'vendor/peerjs.min.js'],
  ['node_modules/@microsoft/teams-js/dist/umd/MicrosoftTeams.min.js', 'vendor/teams.min.js']
]) {
  // Do not ship sourceMappingURL references to files that are not deployed.
  const content = (await readFile(source, 'utf8')).replace(/\/\/# sourceMappingURL=.*$/gm, '');
  await writeFile(target, content);
}
await mkdir('dist/vendor', { recursive: true });
for (const file of [...files, 'THIRD_PARTY_NOTICES.txt', 'vendor/peerjs.min.js', 'vendor/teams.min.js']) await cp(file, `dist/${file}`);
await writeFile('.nojekyll', ''); await writeFile('dist/.nojekyll', '');
await mkdir('teams', { recursive: true });
const manifest = {
  $schema: 'https://developer.microsoft.com/en-us/json-schemas/teams/v1.19/MicrosoftTeams.schema.json',
  manifestVersion: '1.19', version: '1.0.2', id: '0c355514-f609-4c49-8c28-376736180e73',
  developer: { name: 'Annemiek de Haan', websiteUrl: 'https://github.com/annemiekdehaan/refinement-poker', privacyUrl: base + 'privacy.html', termsOfUseUrl: base + 'privacy.html' },
  name: { short: 'Refinement Poker', full: 'Refinement Poker — estimate together' },
  description: { short: 'Estimate stories together with hidden votes and a shared reveal.', full: 'Start a refinement session in your meeting, chat or channel. Everyone chooses a card independently; the facilitator reveals the votes together. Discuss differences, save agreed story points and export results as CSV. No account needed. Up to 12 participants; the facilitator keeps the app open. Requires a network that allows WebRTC.' },
  icons: { outline: 'outline.png', color: 'color.png' }, accentColor: '#203B33',
  configurableTabs: [{ configurationUrl: base + 'config.html', canUpdateConfiguration: true, scopes: ['team', 'groupChat'], context: ['channelTab', 'privateChatTab', 'meetingChatTab', 'meetingDetailsTab', 'meetingSidePanel'] }],
  staticTabs: [{ entityId: 'refinement-poker-home', name: 'Poker', contentUrl: base, websiteUrl: base, scopes: ['personal'] }],
  validDomains: ['annemiekdehaan.github.io', '0.peerjs.com']
};
await writeFile('teams/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
function inside(x, y, points) { let c = false; for (let i = 0, j = points.length - 1; i < points.length; j = i++) { const a = points[i], b = points[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) c = !c; } return c; }
const spade = [[.5,.22],[.42,.32],[.31,.41],[.27,.49],[.28,.57],[.34,.61],[.41,.60],[.46,.55],[.42,.72],[.58,.72],[.54,.55],[.59,.60],[.66,.61],[.72,.57],[.73,.49],[.69,.41],[.58,.32]];
for (const [filename, size] of [['color.png', 192], ['outline.png', 32]]) {
  const scale = 4, png = new PNG({ width: size, height: size });
  for (let py=0; py<size; py++) for(let px=0;px<size;px++) {
    const out = [0,0,0,0];
    for(let sy=0;sy<scale;sy++) for(let sx=0;sx<scale;sx++) {
      const x=(px+(sx+.5)/scale)/size, y=(py+(sy+.5)/scale)/size;
      const on = inside(x,y,spade);
      const rgb = filename === 'outline.png' ? [255,255,255,on?255:0] : on ? [211,237,158,255] : [32,59,51,255];
      for(let c=0;c<4;c++) out[c]+=rgb[c]/(scale*scale);
    }
    for(let c=0;c<4;c++) png.data[(py*size+px)*4+c]=Math.round(out[c]);
  }
  await writeFile(`teams/${filename}`, PNG.sync.write(png));
}
console.log('Build klaar: website in dist/ en Teams-pakketbestanden in teams/.');
