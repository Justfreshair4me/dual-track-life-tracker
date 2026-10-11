// The browser recognizes live microphone input; this does NOT accept saved
// audio files. No model, remote API client, or test provider ships in the app.
export const recognitionClass = () => window.SpeechRecognition || window.webkitSpeechRecognition;
export const LANGUAGE = 'en-US';
export const FINISH_TIMEOUT = 8000;
export function localSupported() {
  try {
    const Constructor = recognitionClass();
    return !!(Constructor?.available && Constructor?.install && 'processLocally' in new Constructor());
  } catch { return false; }
}
export async function checkLocal() {
  if (!localSupported()) throw new Error('On-device recognition is unavailable in this browser. Android Chrome currently lacks these local APIs; Brave may also lack recognition.');
  return recognitionClass().available({ langs: [LANGUAGE], processLocally: true });
}
export async function installLocal() {
  return recognitionClass().install({ langs: [LANGUAGE] });
}
export async function bounded(promise, milliseconds = 15000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('The browser did not respond. Try again later.')), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

export function startTranscription(mode, report) {
  const provider = mode === 'local' ? 'browser-local' : 'browser-service';
  const segments = new Map();
  let recognition;
  let ended = false;
  let stopping = false;
  let inactive = false;
  let early = false;
  let error;
  let unavailable = false;
  let truncated = false;
  let timeout;
  let resolveEnd;
  const done = new Promise(resolve => { resolveEnd = resolve; });
  const text = () => {
    const joined = [...segments.entries()].sort((a, b) => a[0] - b[0]).map(([, result]) => result.text).join(' ').trim();
    if (joined.length > 50000) truncated = true;
    return joined.slice(0, 50000);
  };
  const detach = () => {
    if (recognition) recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
    clearTimeout(timeout);
  };
  const complete = () => { ended = true; clearTimeout(timeout); resolveEnd(); };
  try {
    const Constructor = recognitionClass();
    if (!Constructor) { unavailable = true; throw new Error('Recognition is unavailable in this browser.'); }
    if (mode === 'online' && navigator.onLine === false) { unavailable = true; throw new Error('Browser-service recognition needs internet. You are offline.'); }
    recognition = new Constructor();
    if (mode === 'local') {
      if (!localSupported()) { unavailable = true; throw new Error('On-device recognition is unavailable. No browser service was used.'); }
      recognition.processLocally = true;
      if (recognition.processLocally !== true) throw new Error('Local-only processing could not be required.');
    }
    recognition.lang = LANGUAGE;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { if (!inactive && !stopping) report('Listening for speech while audio records. Speak after recognition is ready.'); };
    recognition.onresult = event => {
      if (inactive) return;
      if (event.results.length > 1000) truncated = true;
      // The API may remove interim hypotheses from its results list.
      for (const index of segments.keys()) if (index >= event.results.length) segments.delete(index);
      for (let index = event.resultIndex; index < event.results.length && index < 1000; index++) {
        const result = event.results[index];
        if (typeof result?.[0]?.transcript === 'string') {
          const otherLength = [...segments.entries()].reduce((sum, [key, segment]) => sum + (key === index ? 0 : segment.text.length + 1), 0);
          const remaining = Math.max(0, 50000 - otherLength);
          if (result[0].transcript.length > remaining) truncated = true;
          segments.set(index, { text: result[0].transcript.slice(0, remaining), final: result.isFinal === true });
        }
      }
    };
    recognition.onerror = event => {
      if (inactive) return;
      const reasons = { 'not-allowed': 'Recognition permission was denied.', 'service-not-allowed': 'The browser recognition service is blocked.',
        network: 'The recognition service could not be reached.', 'no-speech': 'No speech was recognized.',
        'audio-capture': 'Recognition could not access the microphone.', 'language-not-supported': 'The on-device language pack is unavailable.' };
      error = reasons[event.error] || 'Recognition was unsuccessful.';
      report(`${error} Audio recording is separate and will be kept.`);
      complete();
      inactive = true;
      detach();
      try { recognition.abort(); } catch { /* Keep MediaRecorder running. */ }
    };
    recognition.onend = () => {
      if (inactive) return;
      early = !stopping && !error;
      if (early) report('Recognition ended before recording stopped. The transcript may be incomplete; audio is still recording.');
      complete();
    };
    report('Starting speech recognition. Audio is recording independently.');
    recognition.start(); // Live microphone input only; never pass a Blob.
  } catch (failure) {
    error = failure.message;
    report(`${unavailable ? 'Transcription unavailable.' : 'Transcription could not start.'} ${error} Audio recording continues independently.`);
    complete();
    inactive = true;
    detach();
    try { recognition?.abort(); } catch { /* A failed start must not keep listening. */ }
  }

  return {
    async finish() {
      stopping = true;
      if (!ended) {
        report('Processing transcription… Your original recording is ready.');
        timeout = setTimeout(() => { error = 'Recognition timed out.'; complete(); }, FINISH_TIMEOUT);
        try { recognition.stop(); } catch { error = 'Recognition could not finish.'; complete(); }
      }
      await done;
      inactive = true;
      detach();
      try { recognition?.abort(); } catch { /* No service should keep listening. */ }
      const rawText = text();
      const partial = early || error || truncated || [...segments.values()].some(segment => !segment.final);
      return { provider, language: LANGUAGE, status: rawText ? (partial ? 'partial' : 'success') : (unavailable ? 'unavailable' : 'failed'),
        rawText, reason: error || (truncated ? 'Recognition text exceeded the 50,000-character limit; audio is kept in full.' : early ? 'Recognition ended early.' : rawText ? '' : 'No speech was recognized.'), completedAt: new Date().toISOString() };
    },
    cancel() {
      inactive = true;
      error = 'Transcription was stopped by you.';
      detach();
      try { recognition?.abort(); } catch { /* Cancellation must not lose audio. */ }
      complete();
    }
  };
}
