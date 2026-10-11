import { openDatabase, saveEntry, listEntries, getEntry, deleteEntry } from './storage.js';
import { initBackup } from './backup-ui.js';
import { startTranscription, localSupported } from './transcription.js';
import { initTranscriptionSettings, transcriptionMode } from './transcription-settings.js';

const $ = id => document.getElementById(id);
let mode = 'personal';
let busy = false;
let storageReady = false;
let recording = false;
let recorder;
let stream;
let timer;
let audioDraft;
let transcriptionDraft;
let originalDraft;
let transcriptionSession;
let processingTranscript = false;
let draftUrl;
let detailUrl;
let selectedEntry;
let messageTimer;
let installPrompt;
let renderVersion = 0;
const dateLabel = date => new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const labelMode = () => mode === 'personal' ? 'Personal' : 'Work';

function message(text, error = false) {
  clearTimeout(messageTimer);
  $('message').textContent = text;
  if ($('entry-dialog').open) $('detail-message').textContent = text;
  if (!error) messageTimer = setTimeout(() => { $('message').textContent = ''; }, 6500);
}
function failure(error) {
  console.error(error.name || 'Storage error');
  message(error.name === 'QuotaExceededError'
    ? 'Device storage is full. Your draft is still here. Free space, then retry.'
    : 'Could not complete that action. Your draft is still here. Check browser storage access and retry.', true);
}
function hasDraft() { return !!($('entry-text').value.trim() || audioDraft || recording); }
function updateControls() {
  $('personal').disabled = $('work').disabled = !storageReady || busy || hasDraft();
  $('record').disabled = !storageReady || busy || recording || !!audioDraft || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder;
  $('save-entry').disabled = !storageReady || busy || recording || processingTranscript;
  $('entry-text').disabled = !storageReady || busy || processingTranscript;
  $('transcription-mode').disabled = !storageReady || busy || hasDraft();
  $('enable-local').disabled = !storageReady || busy || hasDraft() || !localSupported();
  $('discard-draft').disabled = busy || recording || processingTranscript;
  $('save-hint').textContent = storageReady ? `Saving to ${labelMode()}${hasDraft() ? ' · clear or save to switch' : ''}` : 'Local storage is not ready';
}
function entryCard(entry) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'entry-card';
  const meta = document.createElement('div');
  meta.className = 'entry-meta';
  const date = document.createElement('span');
  date.textContent = dateLabel(entry.createdAt);
  const type = document.createElement('span');
  type.textContent = entry.audio ? '◉ Audio memory' : '✎ Written memory';
  meta.append(date, type);
  const note = document.createElement('p');
  const text = entry.text || 'Voice recording — tap to listen';
  note.textContent = text.length > 180 ? `${text.slice(0, 180)}…` : text;
  button.append(meta, note);
  button.addEventListener('click', () => openDetail(entry.id));
  return button;
}
function renderList(target, entries) {
  target.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const title = document.createElement('strong');
    title.textContent = `Your ${labelMode().toLowerCase()} story starts here.`;
    empty.append(title, document.createTextNode('Save a note or recording to see it here.'));
    target.append(empty);
  } else target.append(...entries.map(entryCard));
}
async function refresh() {
  const version = ++renderVersion;
  const entries = await listEntries(mode);
  if (version !== renderVersion) return;
  renderList($('recent-list'), entries.slice(0, 3));
  renderList($('history-list'), entries);
}
function route() {
  const page = ['home', 'history', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  for (const name of ['home', 'history', 'settings']) $(name).hidden = name !== page;
  document.querySelectorAll('[data-page]').forEach(link => {
    if (link.dataset.page === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
async function changeMode(next) {
  if (busy || hasDraft()) return;
  mode = next;
  document.body.dataset.mode = mode;
  $('personal').setAttribute('aria-pressed', String(mode === 'personal'));
  $('work').setAttribute('aria-pressed', String(mode === 'work'));
  $('mode-hint').textContent = mode === 'personal' ? 'Your space for everyday life.' : 'A clear place for your working day.';
  $('history-title').textContent = `${labelMode()} history`;
  updateControls();
  try { await refresh(); } catch (error) { failure(error); }
}
function clearAudioDraft() {
  if (draftUrl) URL.revokeObjectURL(draftUrl);
  draftUrl = undefined;
  audioDraft = undefined;
  transcriptionDraft = originalDraft = undefined;
  $('draft-player').removeAttribute('src');
  $('audio-draft').hidden = true;
}
async function saveDraft() {
  if (!storageReady || busy || recording || processingTranscript) return;
  const text = $('entry-text').value.trim();
  const originalText = originalDraft ?? $('entry-text').value;
  if (!text && !audioDraft) { message('Write a note or record something first.'); return; }
  busy = true;
  updateControls();
  try {
    const now = new Date().toISOString();
    const hadTranscript = !!transcriptionDraft;
    await saveEntry({ id: crypto.randomUUID(), mode, createdAt: now, updatedAt: now,
      text, originalText, audio: audioDraft || null, categories: [], schemaVersion: 1,
      ...(transcriptionDraft ? { transcription: transcriptionDraft } : {}) });
    $('entry-text').value = '';
    clearAudioDraft();
    if (hadTranscript) $('transcription-status').textContent = 'Entry saved. Original audio, raw transcription, and reviewed text are stored locally.';
    message(`Saved to ${labelMode()}. Open it in Recent memories to review or edit.`);
    await refresh();
  } catch (error) { failure(error); }
  finally { busy = false; updateControls(); }
}
function releaseStream() {
  clearInterval(timer);
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  recording = false;
  $('record-controls').hidden = true;
  $('record').classList.remove('recording');
  $('record-status').textContent = 'Tap the microphone to record a memory.';
  updateControls();
}
async function startRecording() {
  if (busy || recording || audioDraft) return;
  busy = true;
  updateControls();
  let chunks = [];
  let canceled = false;
  const speechMode = transcriptionMode();
  let typedBeforeRecording = $('entry-text').value;
  $('transcription-status').textContent = speechMode === 'off' ? 'Transcription is off. Your recording stays local.' : 'Preparing transcription…';
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getAudioTracks().forEach(track => {
      track.onmute = () => { if (recording) $('record-status').textContent = 'The microphone was muted by the browser or another app. Audio may be incomplete. Stop and check playback.'; };
    });
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t));
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      typedBeforeRecording = $('entry-text').value;
      const mimeType = recorder.mimeType;
      // Lock review controls before releasing the recorder's microphone.
      processingTranscript = !canceled && speechMode !== 'off';
      releaseStream();
      if (canceled) { transcriptionSession?.cancel(); transcriptionSession = undefined; $('transcription-status').textContent = 'Recording and transcription canceled.'; message('Recording canceled. Nothing was saved.'); return; }
      audioDraft = new Blob(chunks, { type: mimeType });
      if (!audioDraft.size) { audioDraft = undefined; transcriptionSession?.cancel(); processingTranscript = false; updateControls(); message('No audio was captured. Please try again.', true); return; }
      draftUrl = URL.createObjectURL(audioDraft);
      $('draft-player').src = draftUrl;
      $('audio-draft').hidden = false;
      updateControls();
      if (speechMode === 'off') { await saveDraft(); return; }
      $('finish-without-transcript').hidden = false;
      try {
        transcriptionDraft = await transcriptionSession.finish();
        const combined = [typedBeforeRecording, transcriptionDraft.rawText].filter(Boolean).join('\n\n');
        originalDraft = combined.slice(0, 50000);
        $('entry-text').value = originalDraft;
        const labels = { success: 'Transcription successful. Review and correct the text, then Save entry.',
          partial: 'Partial transcription. Some speech may be missing; listen to the recording and correct the text before saving.',
          failed: 'Transcription unsuccessful. Add text manually or save audio only.',
          unavailable: 'Transcription unavailable. Add text manually or save audio only.' };
        $('transcription-status').textContent = `${labels[transcriptionDraft.status]} ${transcriptionDraft.reason} Original audio is retained. This draft is not saved yet.${combined.length > 50000 ? ' The editable note was shortened to 50,000 characters; the raw transcript is also kept with the entry.' : ''}`;
      } catch {
        originalDraft = typedBeforeRecording;
        $('entry-text').value = typedBeforeRecording;
        $('transcription-status').textContent = 'Transcription unsuccessful. Your original audio is retained. Add text manually and Save entry.';
      } finally {
        processingTranscript = false;
        transcriptionSession = undefined;
        $('finish-without-transcript').hidden = true;
        updateControls();
        $('entry-text').scrollIntoView({ block: 'center' });
        message('Recording ready for review. It is not saved until you click Save entry.');
      }
    };
    recorder.onerror = () => {
      message('Recording was interrupted. Any captured audio will be saved when recording stops.', true);
      if (recorder.state !== 'inactive') recorder.stop();
    };
    $('cancel-recording').onclick = () => {
      canceled = true;
      transcriptionSession?.cancel();
      if (recorder.state !== 'inactive') recorder.stop();
    };
    $('stop-recording').onclick = () => {
      $('stop-recording').disabled = $('cancel-recording').disabled = true;
      if (recorder.state !== 'inactive') recorder.stop();
    };
    recorder.start(1000);
    recording = true;
    if (speechMode !== 'off') transcriptionSession = startTranscription(speechMode, text => { $('transcription-status').textContent = text; });
    $('stop-recording').disabled = $('cancel-recording').disabled = false;
    $('record-controls').hidden = false;
    $('record').classList.add('recording');
    $('record-status').textContent = 'Recording locally. Stop to save; cancel to discard audio.';
    const started = Date.now();
    const tick = () => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      $('timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    };
    tick();
    timer = setInterval(tick, 250);
  } catch (error) {
    transcriptionSession?.cancel();
    transcriptionSession = undefined;
    releaseStream();
    $('transcription-status').textContent = 'Transcription did not start. Microphone recording was unavailable.';
    message(error.name === 'NotAllowedError' ? 'Microphone permission was denied. You can still type a note.' : 'Microphone unavailable. Use HTTPS or localhost, check your microphone, or type a note.', true);
  } finally { busy = false; updateControls(); }
}
async function openDetail(id) {
  try {
    const entry = await getEntry(id);
    if (!entry || entry.mode !== mode) return;
    selectedEntry = entry;
    $('detail-message').textContent = '';
    $('detail-title').textContent = `${labelMode()} memory`;
    $('detail-date').textContent = dateLabel(entry.createdAt);
    $('edit-text').value = entry.text;
    $('original-text').textContent = entry.originalText || 'No original text — audio-only memory.';
    $('original-details').open = false;
    if (detailUrl) URL.revokeObjectURL(detailUrl);
    detailUrl = entry.audio ? URL.createObjectURL(entry.audio) : undefined;
    $('detail-audio').hidden = !detailUrl;
    if (detailUrl) $('detail-audio').src = detailUrl;
    else $('detail-audio').removeAttribute('src');
    $('entry-dialog').showModal();
  } catch (error) { failure(error); }
}
function closeDetail() {
  $('detail-audio').pause();
  $('detail-audio').removeAttribute('src');
  if (detailUrl) URL.revokeObjectURL(detailUrl);
  detailUrl = undefined;
  selectedEntry = undefined;
}
$('edit-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !selectedEntry) return;
  const text = $('edit-text').value.trim();
  if (!text && !selectedEntry.audio) { message('A written entry needs some text. Use Delete to remove it.'); return; }
  busy = true;
  try {
    await saveEntry({ ...selectedEntry, text, updatedAt: new Date().toISOString() });
    $('entry-dialog').close();
    await refresh();
    message('Changes saved. Original text and audio preserved.');
  } catch (error) { failure(error); }
  finally { busy = false; updateControls(); }
});
$('delete-entry').addEventListener('click', async () => {
  if (busy || !selectedEntry || !confirm('Permanently delete this entry and its recording? This cannot be undone.')) return;
  busy = true;
  try {
    await deleteEntry(selectedEntry.id);
    $('entry-dialog').close();
    await refresh();
    message('Entry deleted.');
  } catch (error) { failure(error); }
  finally { busy = false; updateControls(); }
});
$('entry-dialog').addEventListener('close', closeDetail);
$('close-detail').addEventListener('click', () => { if (!busy) $('entry-dialog').close(); });
$('entry-form').addEventListener('submit', event => { event.preventDefault(); saveDraft(); });
$('entry-text').addEventListener('input', updateControls);
$('personal').addEventListener('click', () => changeMode('personal'));
$('work').addEventListener('click', () => changeMode('work'));
$('record').addEventListener('click', startRecording);
$('finish-without-transcript').addEventListener('click', () => { if (processingTranscript) transcriptionSession?.cancel(); });
$('discard-draft').addEventListener('click', () => {
  if (busy || recording || processingTranscript || !confirm('Discard this unsaved recording and note? Nothing from this draft can be recovered.')) return;
  clearAudioDraft();
  $('entry-text').value = '';
  $('transcription-status').textContent = '';
  updateControls();
  message('Unsaved draft discarded. Existing entries were not changed.');
});
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', event => {
  if (hasDraft() || busy) { event.preventDefault(); event.returnValue = ''; }
});
$('persist').addEventListener('click', async () => {
  try {
    const granted = await navigator.storage?.persist?.();
    $('storage-status').textContent = granted ? 'More durable storage granted. Clearing browser data still erases records. This is not a backup.' : 'Browser did not grant durable storage. Records still save locally, but may be evicted when storage is low.';
  } catch { $('storage-status').textContent = 'Durable storage is unavailable in this browser. This is not a backup.'; }
});
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  document.body.dataset.theme = $('theme').value === 'system' ? (systemTheme.matches ? 'dark' : 'light') : $('theme').value;
}
try { $('theme').value = localStorage.getItem('dual-track-theme') || 'system'; } catch { /* Storage may be blocked. */ }
$('theme').addEventListener('change', () => {
  applyTheme();
  try { localStorage.setItem('dual-track-theme', $('theme').value); } catch { message('Theme changed for this visit only.'); }
});
systemTheme.addEventListener('change', applyTheme);
applyTheme();
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installPrompt = event; $('install').hidden = false;
});
$('install').addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = undefined;
  $('install').hidden = true;
});
window.addEventListener('appinstalled', () => { $('install').hidden = true; message('App installed. Your data stays in this browser.'); });
route();
updateControls();
if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) $('record-status').textContent = 'Recording is unavailable here. You can type a note below. Use HTTPS or localhost for microphone access.';
try {
  await openDatabase();
  await refresh();
  storageReady = true;
  initTranscriptionSettings({
    canConfigure: () => storageReady && !busy && !hasDraft(),
    setBusy: value => { busy = value; updateControls(); },
    changed: () => {
      const selected = transcriptionMode();
      $('stop-recording').textContent = selected === 'off' ? 'Stop & save recording' : 'Stop & review';
      $('transcription-policy').textContent = selected === 'online'
        ? 'Browser-service transcription enabled: speech may be sent externally while recording. Change this in Settings.'
        : selected === 'local' ? 'On-device transcription selected. Local processing is required; no remote fallback. Review text after stopping.'
          : 'Transcription is off. Enable an optional method in Settings; audio recording stays local.';
      updateControls();
    }
  });
  initBackup({
    canOperate: () => storageReady && !busy && !recording && !hasDraft(),
    setBusy: value => { busy = value; updateControls(); },
    afterRestore: refresh
  });
  document.documentElement.dataset.appStatus = 'ready';
  $('app-startup').hidden = true;
} catch (error) {
  document.documentElement.dataset.appStatus = 'storage-failed';
  $('app-startup').textContent = `Local storage is unavailable in this browser context (${error.name}). Saving is disabled. Try opening the running app in its own browser tab. No existing records have been changed. Preview revision: server-p1-3.`;
  failure(error);
} finally { updateControls(); }
// A file preview can load this module without Vite's build-time environment.
// Only production builds register an offline worker; previews never clear data.
if (import.meta.env?.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    message('Offline installation could not be prepared. Keep this page online and reload to retry.', true);
  });
}
