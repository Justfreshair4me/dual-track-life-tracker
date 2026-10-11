# Android speech recognition troubleshooting

This change responds to real Android Chrome tests where original audio played clearly but speech recognition disconnected early with no recognized text. **The phone's specific cause remains unverified.** The previous message exposed only the browser's generic `end` event, which does not explain why the service disconnected.

## What investigation established

- The app gets a recording stream, starts MediaRecorder, then starts SpeechRecognition without passing a track. Recognition therefore requests its own microphone capture. The app does not start recognition before its recording microphone is available, but a recognition `start` event is not proof its own microphone is ready; `audiostart` is the stronger readiness signal.
- Chromium's Android implementation delegates recognition, audio capture, and speech detection to Android's native recognizer. Its continuous flag requests a dictation mode, yet native final results end the session. Android's recognizer and device audio policy differ from desktop Chrome's implementation.
- MDN currently lists the experimental `SpeechRecognition.start(audioTrack)` overload as unsupported on Android Chrome. It is not safe to assume passing a MediaRecorder track would share capture there. This fix does not call that overload or replay saved recordings into recognition.
- Chromium explicitly terminates Android recognition when the page becomes hidden. Permission/service failures, silence, capture contention, or device/provider behavior can also interrupt recognition. A generic `end` without an error cannot distinguish them.
- The earlier Stop sequence released recording tracks before asking recognition for final results. That is an app-level ordering risk independent of the cause of an early disconnection during recording.

Sources: [MDN start/audioTrack support](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/start), [MDN end event](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/end_event), [Chromium Android native bridge](https://github.com/chromium/chromium/blob/main/content/public/android/java/src/org/chromium/content/browser/SpeechRecognitionImpl.java), and [Chromium recognition manager](https://github.com/chromium/chromium/blob/main/content/browser/speech/speech_recognition_manager_impl.cc). These are current source/documentation findings, not proof that the installed phone's browser/provider behaves identically.

## Focused changes

1. Android uses a single-utterance request (`continuous = false`), avoiding reliance on continuous dictation. Recording can continue after that utterance ends; the app flags possible incomplete text. No automatic restarts occur.
2. The readiness message now waits for recognition's `audiostart` event before telling you its microphone is ready. Speak a short phrase after that message.
3. Stop requests final recognition results first, then stops MediaRecorder. Capture tracks stay alive briefly while recognition finishes, to avoid interrupting pending results, and are released on completion, cancellation, or the eight-second timeout. The original audio stops recording at Stop; the browser microphone indicator may remain briefly during processing.
4. **Speech diagnostics — no speech content** exposes a temporary local event timeline, booleans, recognized error codes, and relative milliseconds. It includes whether the app recorder was active when recognition started. It never logs words, audio, note content, audio hashes, URLs, full browser/device identifiers, absolute dates, or Personal/Work mode. It is not stored in entries/backups, printed to the console, or uploaded. Startup events and recent shutdown events are bounded to 40 events per attempt.
5. An explicit **Dictate a new note after recording** fallback runs only after recording tracks are released. It pauses original-audio playback, listens to a NEW utterance, and appends recognized text to your current note. This is not transcription of the saved file. It uses the selected method and its existing consent; browser-service dictation may send that new speech externally. One separate attempt is allowed per draft, bounded to 30 seconds of listening plus up to eight seconds for completion. It never overwrites or re-records the original audio.

Reversing startup order alone would still require two native captures and could jeopardize the original recording. We retain the proven recording-first sequence rather than claim that recognition-first fixes Android. A post-recording separate-note attempt is a practical way to remove the app recorder from the recognition phase. Manual text and keyboard dictation remain alternatives; keyboard privacy/online behavior depends on the keyboard and is not established by this app.

## Browser-only phone test after review and deployment

1. Export a current backup. After this pull request is approved/merged and deployment succeeds, save drafts, close every app tab/window, and reopen the site online. **Do not clear site data.**
2. Leave **Browser service — external** enabled only if you still consent to external recognition. Keep Chrome visible and the screen unlocked. Use fictional notes, not employer information.
3. Record a short phrase. Wait for **Recognition microphone ready** before speaking. If that message never appears, stop rather than keep waiting. Original audio remains available.
4. Tap **Stop & review**, check the original recording, and open **Speech diagnostics — no speech content**. The first object describes the automatic attempt.
5. If automatic recognition failed, type a fictional note, then tap **Dictate a new note after recording**. Speak a NEW short phrase after readiness. Allow it to end, or tap **Finish note dictation**. The second diagnostic object describes this attempt with `recorderActiveAtStart: false`. Original audio and existing typed text should remain intact. If this also fails, enter text manually.
6. Review and Save entry. Check playback in History, Personal/Work separation, persistence after reopening, and export/merge restoration. Diagnostics stay temporary and are not included in backups.
7. To help investigate, share only the diagnostic JSON from the two attempts and whether separate-note dictation worked. Do not share transcripts, recordings, backups, or screenshots containing your notes.

## How to interpret the timeline cautiously

- `started: false` or `audioStarted: false` followed by `end`: recognition disconnected before readiness. Initialization, provider availability, or permissions may be involved; this does not prove capture contention.
- `audioStarted: true` but `speechDetected: false`: its microphone session began but no speech-start event was reported. Silence, input routing, or contention are possibilities.
- `page-hidden`: Android background restrictions may explain termination. Keep the tab visible and screen unlocked for the next attempt.
- `errorCode: not-allowed`: permission denial or a busy native recognizer may map to this same browser code. `network` points to service connectivity. A null code means the browser supplied no specific error.
- Concurrent failure plus separate-note success is consistent with simultaneous capture being involved; it is stronger evidence but still not proof. If both fail, inspect readiness/errors and browser/device policy before blaming simultaneous recording.
- `stop-request` should precede final `end` for a user-stopped session, and `recorder-tracks-released` follows recognition completion/timeout. An earlier `end` accurately remains flagged as early.

## What tests establish

Automated tests simulate Android-like silent disconnects, capture contention, readiness events, native track-release interruptions, and errors. They verify shutdown order, finite attempts, original-audio integrity/playback, appended text, diagnostics privacy, resource cleanup, and all existing storage/backup behavior. They **do not establish** real Android speech accuracy, microphone sharing, provider availability, or that this adjustment fixes the reported phone. That requires the owner's comparison test above.
