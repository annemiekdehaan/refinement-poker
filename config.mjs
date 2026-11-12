import { cleanText, newRoomCode } from './model.mjs';
const name = document.getElementById('tab-name');
const status = document.getElementById('config-status');
const roomCode = newRoomCode();
const url = new URL('./', location.href);
url.hash = `room=${roomCode}&auto=1`;
document.getElementById('browser-link').href = url.href;
async function setup() {
  if (window.parent === window) { status.textContent = 'In Teams, save this tab with the Save button. Here you can open the app directly in your browser.'; return; }
  try {
    await Promise.race([window.microsoftTeams.app.initialize(), new Promise((_, reject) => setTimeout(() => reject(new Error('Teams is not responding.')), 6000))]);
    const config = window.microsoftTeams.pages.config;
    const validate = () => config.setValidityState(!!cleanText(name.value, 40));
    name.addEventListener('input', validate);
    config.registerOnSaveHandler(async saveEvent => {
      try {
        await config.setConfig({ entityId: `refinement-poker-${roomCode}`, contentUrl: url.href, websiteUrl: url.href, suggestedDisplayName: cleanText(name.value, 40) || 'Refinement Poker' });
        saveEvent.notifySuccess();
      } catch { saveEvent.notifyFailure('Unable to save. Please try again.'); }
    });
    validate();
    status.textContent = 'Ready! Click Save at the bottom of the Teams dialog.';
    window.microsoftTeams.app.notifySuccess();
  } catch { status.textContent = 'Unable to connect to Teams. Open this page through Add a tab in Teams, or use the app in your browser.'; }
}
setup();
