// Test-only provider. Installed into isolated Playwright contexts, never
// bundled, enabled by an app setting, or loaded by production app files.
export async function simulateSpeech(page, options = {}) {
  await page.addInitScript(config => {
    window.speechSpy = { starts: [], stops: 0, aborts: 0, checks: [], installs: 0, events: [] };
    if (config.android) Object.defineProperty(navigator, 'userAgentData', { value: { platform: 'Android' }, configurable: true });
    window.recordingTracks = [];
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async options => {
      const stream = await getUserMedia(options);
      recordingTracks.push(...stream.getAudioTracks());
      speechSpy.events.push('media-ready');
      return stream;
    };
    const stopTrack = MediaStreamTrack.prototype.stop;
    MediaStreamTrack.prototype.stop = function () {
      speechSpy.events.push('recording-track-stop');
      if (config.endOnTrackRelease) window.activeSpeech?.onend?.();
      return stopTrack.call(this);
    };
    if (config.preference) localStorage.setItem('dual-track-transcription-v1', JSON.stringify(config.preference));
    if (config.unsupported) {
      Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
      return;
    }
    let installed = false;
    const emit = (recognition, interim = false) => {
      const result = [{ transcript: interim ? 'Fictional gar' : (config.text || 'Fictional garden walk') }];
      result.isFinal = !interim;
      recognition.onresult?.({ resultIndex: 0, results: [result] });
    };
    class SimulatedRecognition {
      constructor() { this.processLocally = false; }
      static async available(options) {
        window.speechSpy.checks.push(options);
        if (config.checkFails) throw new DOMException('Local recognition blocked by browser policy', 'NotAllowedError');
        return installed ? 'available' : (config.availability || 'available');
      }
      static async install() { window.speechSpy.installs++; installed = !config.installFails; return installed; }
      start() {
        window.speechSpy.starts.push({ local: this.processLocally, language: this.lang, continuous: this.continuous });
        window.activeSpeech = this;
        speechSpy.events.push('recognition-start');
        if (config.throwOnStart) throw new DOMException('Simulated recognition denial', 'NotAllowedError');
        setTimeout(() => {
          if (config.silentEarly || config.concurrentFailure && recordingTracks.some(track => track.readyState === 'live')) {
            speechSpy.events.push('recognition-end'); this.onend?.(); return;
          }
          this.onstart?.();
          this.onaudiostart?.();
          if (config.error) { this.onerror?.({ error: config.error }); this.onend?.(); }
          else if (config.early) { emit(this); this.onend?.(); }
          else if (!config.empty) {
            this.onspeechstart?.(); emit(this, true);
            if (config.concurrentFailure || config.naturalEnd) setTimeout(() => {
              emit(this); speechSpy.events.push('recognition-end'); this.onend?.();
            }, 200);
          }
        }, 0);
      }
      stop() {
        window.speechSpy.stops++;
        speechSpy.events.push('recognition-stop');
        if (config.stalled) return;
        setTimeout(() => {
          if (config.removeInterim) this.onresult?.({ resultIndex: 0, results: [] });
          else if (!config.empty) { emit(this); emit(this); } // Repeated final results must not duplicate text.
          speechSpy.events.push('recognition-end');
          this.onend?.();
        }, config.delay ?? 200);
      }
      abort() { window.speechSpy.aborts++; }
    }
    if (config.noLocal) {
      delete SimulatedRecognition.available;
      delete SimulatedRecognition.install;
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: SimulatedRecognition, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
  }, options);
}
