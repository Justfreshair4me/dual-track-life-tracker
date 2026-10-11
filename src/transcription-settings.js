import { recognitionClass, localSupported, checkLocal, installLocal, bounded } from './transcription.js';

const KEY = 'dual-track-transcription-v1';
let mode = 'off';
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved?.version === 1 && (saved.mode === 'local' || saved.mode === 'online' && saved.onlineConsent === true)) mode = saved.mode;
} catch { /* Default off; recording needs no preference storage. */ }
export const transcriptionMode = () => mode;

export function initTranscriptionSettings({ canConfigure, setBusy, changed }) {
  const select = document.getElementById('transcription-mode');
  const status = document.getElementById('transcription-settings-status');
  const local = document.getElementById('enable-local');
  const localOption = select.querySelector('[value=local]');
  const onlineOption = select.querySelector('[value=online]');
  let working = false;
  localOption.disabled = !localSupported() && mode !== 'local';
  onlineOption.disabled = !recognitionClass() && mode !== 'online';
  select.value = mode;
  select.disabled = false;
  local.disabled = !localSupported();
  status.textContent = localSupported() ? 'Local APIs detected. Check the language pack before using on-device transcription.' : 'On-device transcription is unavailable here. Android Chrome currently lacks the local APIs; Brave recognition may be unavailable. Audio recording and typed notes still work.';
  const save = next => {
    mode = next;
    select.value = mode;
    try { localStorage.setItem(KEY, JSON.stringify({ version: 1, mode, onlineConsent: mode === 'online' })); }
    catch { status.textContent = 'This choice applies to this visit only; browser preference storage is unavailable.'; }
    changed();
  };
  select.addEventListener('change', async () => {
    const next = select.value;
    if (working || !canConfigure()) { select.value = mode; status.textContent = 'Finish your recording and save or discard the draft before changing transcription.'; return; }
    if (next === 'online' && mode !== 'online' && !confirm('Enable browser-service transcription? Your browser may send live microphone speech to an external recognition provider (commonly Google in Chrome). The app cannot control that provider’s retention or processing. This is not guaranteed offline or private. Enabling applies to future recordings until you turn it off. Microphone permission alone is not this consent. Do not use confidential work information without authorization. Enable?')) { select.value = mode; return; }
    if (next === 'local') { await enableLocal(); return; }
    status.textContent = next === 'off' ? 'Transcription is off. Recording stays local and Stop saves audio as before.' : 'Browser-service transcription enabled by your consent. Future recordings may send speech externally. Turn Off to revoke this choice.';
    save(next);
  });
  async function enableLocal() {
    if (working || !canConfigure()) { select.value = mode; status.textContent = 'Save or discard your draft before checking local recognition.'; return; }
    working = true;
    // Choosing local-only must revoke any previous browser-service selection,
    // even when a pack check, download, or permissions policy later fails.
    save('off');
    setBusy(true);
    select.disabled = local.disabled = true;
    status.textContent = 'Checking the browser’s English (US) language pack…';
    try {
      let availability = await bounded(checkLocal());
      if (availability === 'downloadable') {
        if (!confirm('Download the browser’s English (US) recognition language pack? This may be a large download and use device storage. The browser downloads model files; this step does not send microphone audio. Local-only recognition will be required. Continue?')) return;
        status.textContent = 'Downloading the browser language pack. Keep this tab open.';
        // Install may continue inside the browser after this bounded UI wait.
        await bounded(installLocal(), 60000);
        availability = await bounded(checkLocal());
      }
      if (availability !== 'available') throw new Error(availability === 'downloading' ? 'The language pack is still downloading. Check again later.' : 'No usable on-device language pack is available. Browser-service recognition was not enabled.');
      status.textContent = 'On-device English (US) recognition enabled. Local processing is required; there is no automatic remote fallback.';
      save('local');
    } catch (error) { status.textContent = error.message; }
    finally { working = false; setBusy(false); select.value = mode; select.disabled = false; local.disabled = !localSupported(); }
  }
  local.addEventListener('click', enableLocal);
  changed();
}
