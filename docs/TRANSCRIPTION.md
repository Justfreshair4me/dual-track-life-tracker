# Speech-to-text — browser-only guide

Open the deployed app in Chrome or Brave. No development software, account, credit card, or subscription is needed:

https://justfreshair4me.github.io/dual-track-life-tracker/

## Which methods are practical?

| Method | Where speech is processed | Support and limitations |
| --- | --- | --- |
| Browser on-device recognition | Local processing is required using `processLocally = true` | Experimental APIs exist in recent desktop Chrome. MDN currently lists `available()`, `install()`, and `processLocally` as unsupported on Android Chrome. Device policy and language-pack availability can also prevent use. The app checks its actual browser, rather than guessing from the browser name. |
| Standard browser recognition | The browser chooses; Chrome commonly uses an external recognition service | Often available in Android Chrome. Brave may disable it or lack service access; sharing Chromium code does not guarantee recognition. Internet and provider availability are normally required. A managed laptop may block it. |
| A bundled model such as Whisper | Local model inference | Free in principle and able to process completed files, but large model downloads, phone memory, battery use, and processing time require device benchmarks. This phase does not bundle one. |

Sources: [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [on-device processing](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally), [availability checks](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static), and [live audio-track input](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/start). The implementation assessment used MDN's current documentation and browser compatibility data; real-device behavior remains a manual check.

Transcription is **off by default**. With it off, Stop saves recordings automatically as in Phase 1. Recording and manual text still work when recognition is unavailable.

## Enable a method

1. Finish recording and save or discard any draft. Open **Settings → Speech-to-text**.
2. For **On-device only**, click **Check/enable on-device transcription** if available. The browser checks its English (US) language pack. If a download is offered, read and confirm the download warning. This downloads browser model files using internet/storage; no microphone recording is sent by that check/download step.
3. If the language pack is available, the app selects on-device recognition. It requires local processing and will fail safely rather than use a browser service. This does not establish that every device supports offline recognition; test airplane mode with fictional speech after installing a supported pack.
4. If local recognition is unavailable, you may keep transcription **Off** or select **Browser service**. Read the confirmation before choosing Enable: your browser may send live speech to an external provider, commonly Google in Chrome. The app cannot control that provider's retention or processing. This method is **not guaranteed offline or private**. Do not use confidential employer information without authorization.
5. A browser-service selection applies to future recordings until you select **Off**. The Home screen displays that policy. Microphone permission alone never enables recognition. Consent is stored in this browser only and is not transferred by backup restoration.

English (US) is the initial recognition language. No service account or paid API is used. Selecting a method does not start listening; recognition starts only with a new recording. Merely pressing Record with transcription Off never starts recognition.

## Record, review, and save

1. Choose **Personal** or **Work** before recording. Optionally type context in Your note.
2. Tap the microphone and allow microphone access if prompted. When recognition is enabled, wait for “Recognition microphone ready” before speaking. Recognition listens alongside the independent original-audio recorder.
3. Speak a short fictional note, then tap **Stop & review**. The app automatically asks recognition to finish; no extra transcription button is required.
4. While **Processing transcription** is displayed, the original recording remains available. A slow service is bounded to eight seconds; recording tracks stay alive briefly for pending recognition results, then are released. Original audio has already stopped recording. You can click **Continue without waiting** sooner; this stops recognition and keeps audio plus any partial text for review.
5. Review the editable **Your note** field. Correct mistakes and add context. If recognition is unsuccessful/unavailable, type manually or save audio only. Partial transcripts are labeled; do not assume every spoken word was captured.
6. Listen to the original recording using its playback control, then click **Save entry**. The edited note, raw recognized text, status, and unchanged original audio are stored locally in the selected mode.
7. Open the entry in **History** to read/play it. **Original text** preserves the note/transcript before correction; backup export also includes raw transcription metadata and original audio.

The review draft is **not saved until Save entry succeeds**. Closing/reloading warns about the draft but a crash, forced shutdown, or browser discard can still lose it. Save promptly. A failed save keeps the draft for retry. **Discard unsaved recording and note** requires confirmation and affects only that draft. Cancel during recording discards that new recording as before.

## Important limits

- This feature recognizes **live microphone speech**, then finishes at Stop. It does not transcribe existing recordings or imported backups. Experimental audio-track input cannot be assumed reliable across Android Chrome and Brave, so the app does not use it.
- Android uses a single-utterance request because native continuous dictation is unreliable. Recognition can finish before the audio recording stops. The app flags an early ending and retains the recording. It does not silently restart listening or resend a recording. Use short notes and check results.
- Some browser/device combinations cannot support recognition and recording together reliably. Mic interruptions may produce incomplete audio. Check playback during your first tests; turn transcription Off if this happens. This cannot be established by simulated browser tests.
- Local-only means the app requires the browser's local-processing API, with no remote fallback. Model downloads use internet. Installed-pack performance and actual offline operation need device testing; experimental API availability is not an accuracy guarantee.
- Browser-service recognition may fail offline, after a permission denial, due to managed-device policy, or when its provider is unavailable. Original recording and manual text remain usable.
- Browser keyboard dictation is a separate alternative whose privacy/online behavior depends on the keyboard; the app cannot establish that it is local.
- Saved browser data and backup files are not encrypted by this app. Recognition consent is separate from browser microphone permission.

## Test safely on Android and Windows

1. Export a backup of current records first. Never clear browser/site data to update the app.
2. After the pull request is reviewed and merged, wait for **Actions → Test and deploy GitHub Pages** to finish. Save drafts, close every app tab/window, then reopen the app online to activate updated offline files.
3. Leave transcription Off and verify typed entries, recording, History, and playback still work.
4. Enable a supported method after reading its disclosure. Record “Fictional garden walk with Alex,” stop, and confirm no entry is saved before review. Correct the note to “Fictional garden walk with Alex and Sam,” save, and check both text and playback.
5. Repeat in Work with fictitious information. Verify the Personal note is absent from Work and vice versa. Reload and check persistence.
6. Export and restore the new entries on your other browser/device using **Merge**. Check corrected text, Original text, and audio playback. Recognition consent should remain Off on a fresh destination browser.
7. Test airplane mode. Off mode must still record/save. Browser-service mode should retain audio and allow manual text rather than promise transcription. Local-only can be tested offline only where a supported language pack is installed.
8. Turn transcription Off again if you do not want future speech sent to a provider. Check a new recording still saves normally. If recognition or audio capture fails on your phone, report the browser/version, status message, and whether playback works—without sharing sensitive recordings.

Automated tests use synthetic microphone audio and a simulated recognition provider. They verify application behavior, not actual speech accuracy, local-model performance, external-provider privacy, or Chrome/Brave hardware compatibility.

## Android early-disconnection follow-up

The owner's real Android Chrome test found clear audio but no concurrent transcript. [Android troubleshooting](ANDROID-SPEECH.md) explains the investigation, diagnostic timeline, focused stop-order fix, and an explicit **Dictate a new note after recording** fallback. The fallback uses NEW speech after recording tracks stop and preserves the original recording. It does not transcribe that file. Please run the comparison test on your phone; automated simulations do not establish that Android capture contention or provider behavior has been fixed.
