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

export function startTranscription(mode, report, { purpose = 'recording', diagnostic = () => {}, recorderActiveAtStart = false } = {}) {
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
  let listeningTimeout;
  const android = navigator.userAgentData?.platform === 'Android' || /Android/i.test(navigator.userAgent);
  const startedAt = performance.now();
  const trace = { version: 1, purpose, provider, android, continuous: purpose === 'recording' && !android,
    onlineAtStart: navigator.onLine, visibleAtStart: document.visibilityState === 'visible', recorderActiveAtStart,
    started: false, audioStarted: false, speechDetected: false, resultsReceived: false,
    finalResultReceived: false, endedEarly: false, stopRequested: false, errorCode: null, exception: null, events: [] };
  const mark = event => {
    // Preserve startup evidence and recent shutdown events for long sessions.
    if (trace.events.length >= 40) trace.events.splice(8, 1);
    trace.events.push({ event, elapsedMs: Math.round(performance.now() - startedAt) });
    diagnostic(structuredClone(trace));
  };
  const visible = () => { if (document.visibilityState !== 'visible') mark('page-hidden'); };
  document.addEventListener('visibilitychange', visible);
  let resolveEnd;
  const done = new Promise(resolve => { resolveEnd = resolve; });
  const text = () => {
    const joined = [...segments.entries()].sort((a, b) => a[0] - b[0]).map(([, result]) => result.text).join(' ').trim();
    if (joined.length > 50000) truncated = true;
    return joined.slice(0, 50000);
  };
  const detach = () => {
    if (recognition) for (const name of ['start', 'result', 'error', 'end', 'audiostart', 'audioend', 'speechstart', 'speechend', 'nomatch']) recognition['on' + name] = null;
    clearTimeout(timeout);
    clearTimeout(listeningTimeout);
    document.removeEventListener('visibilitychange', visible);
  };
  const complete = () => { ended = true; clearTimeout(timeout); clearTimeout(listeningTimeout); resolveEnd(); };
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
    // Android's native recognizer cannot reliably honor continuous dictation.
    // Use one utterance, never automatically restart or replay the recording.
    recognition.continuous = trace.continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (inactive) return;
      trace.started = true; mark('start');
      if (!stopping) report('Recognition session started. Wait for microphone readiness before speaking.');
    };
    recognition.onaudiostart = () => {
      if (inactive) return;
      trace.audioStarted = true; mark('audio-start');
      if (!stopping) report(purpose === 'recording' ? 'Recognition microphone ready. Speak a short note while audio records.' : 'Recognition microphone ready. Dictate your new note; the original recording is stopped and kept.');
    };
    recognition.onspeechstart = () => { if (!inactive) { trace.speechDetected = true; mark('speech-start'); } };
    recognition.onspeechend = () => { if (!inactive) mark('speech-end'); };
    recognition.onaudioend = () => { if (!inactive) mark('audio-end'); };
    recognition.onnomatch = () => { if (!inactive) mark('no-match'); };
    recognition.onresult = event => {
      if (inactive) return;
      if (!trace.resultsReceived && event.results.length > 0) { trace.resultsReceived = true; mark('result'); }
      if (!trace.finalResultReceived && Array.from(event.results).some(result => result.isFinal === true)) { trace.finalResultReceived = true; mark('final-result'); }
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
      trace.errorCode = ['not-allowed', 'service-not-allowed', 'network', 'no-speech', 'audio-capture', 'language-not-supported', 'aborted', 'bad-grammar'].includes(event.error) ? event.error : 'unknown';
      mark('error');
      report(`${error} Audio recording is separate and will be kept.`);
      complete();
      inactive = true;
      detach();
      try { recognition.abort(); } catch { /* Keep MediaRecorder running. */ }
    };
    recognition.onend = () => {
      if (inactive) return;
      early = purpose === 'recording' && !stopping && !error;
      trace.endedEarly = early; mark('end');
      if (early) report(!trace.continuous && trace.finalResultReceived
        ? 'Single-utterance recognition finished. Audio is still recording; later speech will not be transcribed. Review at Stop.'
        : 'Recognition disconnected before Stop. Its cause is unknown; audio is still recording. Check diagnostics or dictate a separate note after stopping.');
      complete();
      detach();
    };
    report(purpose === 'recording' ? 'Starting speech recognition. Audio is recording independently.' : 'Starting separate note dictation. Original audio is stopped and retained.');
    mark('start-request');
    recognition.start(); // Live microphone input only; never pass a Blob.
  } catch (failure) {
    error = failure.message;
    trace.exception = ['NotAllowedError', 'InvalidStateError', 'NotSupportedError', 'SecurityError', 'Error'].includes(failure.name) ? failure.name : 'other';
    mark('start-failed');
    report(`${unavailable ? 'Transcription unavailable.' : 'Transcription could not start.'} ${error} Audio recording continues independently.`);
    complete();
    inactive = true;
    detach();
    try { recognition?.abort(); } catch { /* A failed start must not keep listening. */ }
  }

  const requestStop = () => {
      if (stopping) return;
      stopping = true;
      trace.stopRequested = true; mark('stop-request');
      clearTimeout(listeningTimeout);
      if (!ended) {
        report('Processing transcription… Original audio recording has stopped. The microphone is released after recognition finishes, within eight seconds.');
        timeout = setTimeout(() => { error = 'Recognition timed out.'; mark('finish-timeout'); complete(); }, FINISH_TIMEOUT);
        try { recognition.stop(); } catch { error = 'Recognition could not finish.'; complete(); }
      }
  };
  const result = async () => {
      await done;
      inactive = true;
      detach();
      try { recognition?.abort(); } catch { /* No service should keep listening. */ }
      const rawText = text();
      const partial = early || error || truncated || [...segments.values()].some(segment => !segment.final);
      return { provider, language: LANGUAGE, status: rawText ? (partial ? 'partial' : 'success') : (unavailable ? 'unavailable' : 'failed'),
        rawText, reason: error || (truncated ? 'Recognition text exceeded the 50,000-character limit; audio is kept in full.' : early ? (!trace.continuous && trace.finalResultReceived ? 'Single-utterance recognition finished before Stop; later speech may be missing.' : 'Recognition disconnected before Stop; the browser supplied no specific error. The cause is unknown.') : rawText ? '' : 'No speech was recognized.'), completedAt: new Date().toISOString() };
  };
  return {
    requestStop,
    async finish() { requestStop(); return result(); },
    async waitForEnd() {
      if (!ended && !stopping) listeningTimeout = setTimeout(() => {
        error = 'Separate note dictation timed out.'; mark('listen-timeout'); complete();
      }, 30000);
      return result();
    },
    noteRecorderEvent(event) { if (['recorder-stop-request', 'recording-ready', 'recorder-muted', 'recorder-tracks-released'].includes(event)) mark(event); },
    cancel() {
      inactive = true;
      error = 'Transcription was stopped by you.';
      mark('cancel');
      detach();
      try { recognition?.abort(); } catch { /* Cancellation must not lose audio. */ }
      complete();
    }
  };
}
