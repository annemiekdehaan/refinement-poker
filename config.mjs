import { cleanText, newRoomCode } from './model.mjs';
const name = document.getElementById('tab-name');
const status = document.getElementById('config-status');
const roomCode = newRoomCode();
const url = new URL('./', location.href);
url.hash = `room=${roomCode}&auto=1`;
document.getElementById('browser-link').href = url.href;
async function setup() {
  if (window.parent === window) { status.textContent = 'In Teams sla je dit tabblad op met de knop Opslaan. Hier kun je de app direct in de browser openen.'; return; }
  try {
    await Promise.race([window.microsoftTeams.app.initialize(), new Promise((_, reject) => setTimeout(() => reject(new Error('Teams reageert niet.')), 6000))]);
    const config = window.microsoftTeams.pages.config;
    const validate = () => config.setValidityState(!!cleanText(name.value, 40));
    name.addEventListener('input', validate);
    config.registerOnSaveHandler(async saveEvent => {
      try {
        await config.setConfig({ entityId: `refinement-poker-${roomCode}`, contentUrl: url.href, websiteUrl: url.href, suggestedDisplayName: cleanText(name.value, 40) || 'Refinement Poker' });
        saveEvent.notifySuccess();
      } catch { saveEvent.notifyFailure('Opslaan is niet gelukt. Probeer het opnieuw.'); }
    });
    validate();
    status.textContent = 'Klaar! Klik onderaan in Teams op Opslaan.';
    window.microsoftTeams.app.notifySuccess();
  } catch { status.textContent = 'Geen verbinding met Teams. Open deze pagina via Een tabblad toevoegen in Teams, of gebruik de app in je browser.'; }
}
setup();
