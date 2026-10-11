// Test-only provider. Installed into isolated Playwright contexts, never
// bundled, enabled by an app setting, or loaded by production app files.
export async function simulateSpeech(page, options = {}) {
  await page.addInitScript(config => {
    window.speechSpy = { starts: [], stops: 0, aborts: 0, checks: [], installs: 0 };
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
        if (config.throwOnStart) throw new DOMException('Simulated recognition denial', 'NotAllowedError');
        setTimeout(() => {
          this.onstart?.();
          if (config.error) { this.onerror?.({ error: config.error }); this.onend?.(); }
          else if (config.early) { emit(this); this.onend?.(); }
          else if (!config.empty) emit(this, true);
        }, 0);
      }
      stop() {
        window.speechSpy.stops++;
        if (config.stalled) return;
        setTimeout(() => {
          if (config.removeInterim) this.onresult?.({ resultIndex: 0, results: [] });
          else if (!config.empty) { emit(this); emit(this); } // Repeated final results must not duplicate text.
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
