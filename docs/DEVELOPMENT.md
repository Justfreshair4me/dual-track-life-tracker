# Developer notes — optional technical setup

These instructions are for a developer or a personal computer where software installation is permitted. The browser-only GitHub Pages instructions in the main README are the normal user path. No terminal or software installation is needed to use the hosted app.

The Vite base is `/dual-track-life-tracker/`. Append that path to local preview/development addresses. The standard test suite runs the production build at this same path, and the current suite contains 62 checks. `npm run verify:preview` defaults to `http://127.0.0.1:5173/dual-track-life-tracker/`. The database name, version, object store, and entry schema remain unchanged.

A free, local-first memory app for Personal and Work notes. No account, credit card, subscription, AI API, analytics, or cloud database is required. HTML defines the screens, CSS controls their appearance, and JavaScript handles recording and saving. Vite is the free development/build tool; IndexedDB is the browser's built-in database. There are no runtime packages loaded from external websites.

## What works now

- Mobile and desktop layouts, with Personal selected by default.
- Separate Personal and Work histories. Save or clear a draft before switching modes.
- Typed notes and microphone recordings with elapsed time, stop, and cancel.
- Stop & save automatically saves audio, even without text. Type before recording to include a note, or edit the saved recording afterward.
- Entries and audio persist locally after closing and reopening the browser.
- Open an entry to read, play audio, edit, or delete it. Editing preserves original text and audio; deletion asks for confirmation.
- Installable production PWA with cached files for offline use.
- Light/dark themes and an optional request for more durable storage.
- Phase 2A: local audio-inclusive backups, integrity checks, safe merging, and explicitly confirmed atomic replacement. See [the backup guide](BACKUPS.md).

Recall, Tasks, and Summaries are visibly marked “Coming soon.” Categorization/search, tasks/reminders, and advanced summaries/trends remain later work. Backups were brought forward as the explicitly requested Phase 2A. Phase 2B adds optional transcription. Browser-service recognition may send live speech externally and requires an explicit confirmation; local-only recognition requires supported APIs and a language pack. Recording audio is independent of recognition. See [the speech-to-text guide](TRANSCRIPTION.md).

## Preview on Windows — step by step

1. Install the free **Node.js LTS** version from https://nodejs.org (version 24 LTS recommended; version 22.12 or newer required). Keep the installer's default options. Restart your terminal after installation.
2. Download and unzip the Phase 1 source archive supplied with this task. Alternatively, after these changes have been committed and pushed to GitHub, open your repository, click **Code → Download ZIP**, and unzip it. Cloud workspace changes do not appear on GitHub automatically.
3. Open the extracted folder containing `package.json`. Click File Explorer's address bar, type `powershell`, and press Enter. This opens a command window in that folder.
4. Enter each command separately:

   ```powershell
   npm.cmd ci
   npm.cmd run preview:cloud
   ```

5. Keep the command window open. In a separate Chrome or Edge tab, enter `http://localhost:5173/dual-track-life-tracker/`. This address works after starting the server **on your Windows computer**; it cannot connect your computer to the cloud server. Do not double-click `index.html`: the app needs a local web server.
6. Try a fictional Personal note, save it, then switch to Work and save a fictional work note. Click **History**, open an entry, and try editing. Stop the server later with **Ctrl+C**.

`npm.cmd` avoids the PowerShell script-policy issue that can affect the `npm` shortcut. `npm ci` installs the exact versions recorded in `package-lock.json`; the first installation needs internet. It does not require an account or payment. `preview:cloud` builds the current files and serves the complete production app on port 5173, so it is also appropriate for a local Windows preview. For editing with automatic updates, stop it with Ctrl+C, then run `npm.cmd run dev -- --port 5173 --strictPort`.

For production/offline testing, stop the development server and enter:

```powershell
npm.cmd run build
npm.cmd run preview
```

Open the new **Local** address printed in the terminal. Give the first load time to complete, then reload with the browser's network offline to verify cached startup. Offline caching is enabled in the production build, not the development server. Keep using the same browser and address: development, preview, and a hosted address each have separate storage.

## Android access and installation

Your phone cannot use the computer's localhost address. A plain HTTP address over Wi-Fi also does not meet Chrome's secure-connection requirement for microphone recording and normal PWA installation.

The owner has already deployed the app to free GitHub Pages and verified Phase 1 on Windows and Android. Use https://justfreshair4me.github.io/dual-track-life-tracker/ for browser-only access. App files are public; entries remain local. New backup features need manual device verification after merge and deployment.

On the deployed site:

1. Open its address in Android Chrome, while online, and let it finish loading.
2. Tap **Settings** and **Install app** if available, or use Chrome's **⋮ → Install app / Add to Home screen** option. Menu wording depends on Chrome's version.
3. Open the app from its home-screen icon.
4. Tap the microphone and allow microphone access. Speak a fictional note, then tap **Stop & save recording**. Open it in History and listen.
5. Close the app, reopen it, and check the entry. Then try airplane mode and create a fictional note offline.

Phase 1 hardware behavior has been verified by the owner. Cloud backup tests use simulated mobile layout/touch and a synthetic microphone; the owner's download/file-picker checks remain necessary. Recording may be interrupted if you switch apps or lock the screen; keep the recording screen open until you stop and save.

## Important data limits

- Use fictional/disposable notes during this early phase. **Backup and restoration are not implemented yet.**
- Clearing site/browser data, private browsing, device loss, storage eviction, or application removal can lose records. Durable storage can reduce eviction but cannot prevent deletion or replace a backup.
- Records are scoped to this browser and site address, not synchronized between phone and PC. Changing hostnames, ports, or browsers creates a separate data location.
- Local data is not automatically encrypted or protected by a separate app lock. Anyone with access to the unlocked device/browser may access it.
- Microphone recording needs HTTPS or localhost, browser support, and permission. Denying permission still allows typed entries. A failed save keeps the draft on the open page for retry; do not close it until saved.
- No scheduled notifications exist in Phase 1. A future local PWA reminder cannot promise exact-time notifications when completely closed. A free native Android alarm/calendar is a practical reliable alternative for critical reminders.

## Tests and maintenance

### Codex preview troubleshooting — what is and is not verified

The user opened **Web Preview → Open in**, with an **Index** dropdown, without choosing a running server or port. Earlier tests exercised an ordinary web server and a custom source-file server. Neither test was the actual Codex Index panel. The passing tests therefore did not establish that the panel could load the app.

The Index panel's URL, browser console, network requests, storage permissions, and handling of stale files are not exposed by the available tools. Its exact failure is unconfirmed. The user's symptoms fit failed CSS/JavaScript loading or a restricted preview context; this is a diagnosis to investigate, not a verified console finding. We cannot automatically connect the running server to that panel, create a forwarded cloud URL, or promise it supports interactive apps.

The supported preview command is now `npm run preview:cloud`, executed from `/workspace/dual-track-life-tracker`. It builds fresh files and starts Vite's production server on `0.0.0.0:5173`. The cloud-local address is not a public link and does not automatically attach to the Index panel. If Codex provides a running-server/port forwarding feature, it must target port 5173; its controls are not available to this agent. The reliable separate-tab alternative is the Windows procedure above, using the downloadable source archive.

A startup notice now remains visible if application scripts cannot load, with revision **server-p1-3**. Save, typing, modes, and recording are disabled until local storage is ready. Module initialization failures and storage denial produce a visible explanation rather than silent inactive controls. No browser data is cleared by these changes.

The running production server was separately checked at 390px and 1280px using isolated Chromium profiles. Its CSS and JavaScript returned HTTP 200 with the proper content types, there were no console/network errors, Save showed a confirmation, clicking **View history** opened History with the note, Personal/Work records stayed separate, and notes survived reload and page closure. The centered 92-pixel microphone and both themes were checked. This does **not** verify the actual Index panel, your physical Windows browser, or your phone.

To repeat that check against a server that is already running:

```bash
CHROMIUM_PATH=/usr/bin/chromium npm run verify:preview
```

The script writes screenshots and a console/network report to `test-results/running-preview`. Set `PREVIEW_URL` to test a different accessible address. It always creates isolated browser profiles and does not clear or modify the user's browser records. The current live-server evidence from this task is in `/workspace/dual-track-preview-evidence`.

### Earlier stylesheet fix — limited to source-file servers

The source page now loads `src/style.css` directly through an HTML stylesheet link. Previously, CSS was imported by JavaScript, which requires Vite to convert that import into a browser-compatible form. A direct file preview therefore displayed plain HTML. The script URL is now relative to the page, so previews mounted in a subfolder can find it. JavaScript also checks whether Vite's environment exists before using production-only offline features.

If you have the earlier preview open, refresh it at the same address. **Do not clear browser/site data to refresh the appearance:** that would erase your saved entries. Vite development, source-file previews, and production builds now load the same stylesheet. Installable/offline operation still requires the production build.

The earlier stylesheet fix added appearance and source-preview checks. These appearance tests inspect actual computed styles and capture screenshots. The custom source-preview test is a normal HTTP server mounted at a nested address; it is not the Codex Index panel. The current full suite has 62 tests, including Pages and backup checks.

On Windows, install the free test browser once and run the tests:

```powershell
npm.cmd exec -- playwright install chromium
npm.cmd test
```

The browser tests build and start their own production preview on port 4173 and a source-file preview on port 4174. Stop any manual server on those ports first. They use fictional entries in isolated test profiles, not your normal browser data. On a machine with system Chromium, use `CHROMIUM_PATH` to avoid downloading another browser; this cloud environment uses:

```bash
CHROMIUM_PATH=/usr/bin/chromium npm test
```

Test coverage: persistence after page closure; Personal/Work isolation; original text preservation; deletion confirmation; blank input rejection; safe text rendering; audio capture/playback/persistence/cancel; permission denial; failed save and retry; offline reload/save; phone-size and desktop-size layouts; minimum 44-pixel capture buttons; dark theme.

Cloud result: the production build and all automated checks pass after fixing a preview-server cache-header mismatch discovered by the offline test. See `tests/foundation.spec.js` for the checks. Physical Windows/Android tests remain manual.

Main files:

| File | Purpose |
| --- | --- |
| `index.html` | Screen structure and labels |
| `src/style.css`, `src/theme.css` | Layout, colors, and touch-friendly controls |
| `src/main.js` | Capture, recording, history, editing, and settings |
| `src/storage.js` | Local database; separate original text and audio |
| `src/backup.js`, `src/backup-ui.js` | Portable backup validation, merge planning, atomic restoration, and Settings controls |
| `public/manifest.webmanifest` | Home-screen installation details |
| `vite.config.js` | Production build and offline file caching |
| `tests/foundation.spec.js` | Automated browser tests |
| `tests/backup.spec.js` | Audio/text restore, duplicates, corruption, offline, chunking, and rollback tests |

To request a change through Codex, describe the visible behavior you want, for example: “Make the recording button larger on Android; preserve saving and mode separation.” Changes to text and appearance are straightforward. Database format changes should include a migration plan so older records survive.

## Development plan

1. **Foundation:** test capture, saving, editing, and installation on your devices.
2. **Organization:** deterministic categories, explicit field extraction, search, and concise summaries.
3. **Tasks and reminders:** due dates, completed archive, in-app alerts, and honest notification limits.
4. **Advanced features:** historical summaries, trends, and privacy improvements. Audio-inclusive backups and restore validation/deduplication are delivered in Phase 2A.

GitHub Pages deployment is already authorized and working. No paid service or major architectural change is needed for backups.

## Backup format and safety

Version 1 `.dtbackup` layout: 8-byte `DTLTBK01` signature, little-endian uint32 manifest length, 32-byte SHA-256 manifest digest, UTF-8 JSON manifest, then original audio bytes in entry order. The manifest contains all non-audio entry fields, backup time, and each recording's size, MIME type, and SHA-256 hashes for 1 MiB chunks. It is uncompressed and unencrypted. Integrity checks detect corruption, not malicious authorship.

Export and validation read bounded audio slices and compose/slice Blobs, avoiding whole-audio ArrayBuffers and base64 copies. Metadata is bounded to 8 MiB; backups are limited to 2 GiB and 10,000 entries. The browser's storage/download buffers are outside this guarantee. The large-file test uses a 12 MiB + 17-byte fixture, not a physical 2 GiB phone download.

Merge skips identical IDs/content; differing content at the same ID receives a deterministic content-derived ID so repeated imports do not multiply copies. Preview fingerprints include metadata and exact audio checksums. Current app writes share a Web Lock where available. Restore rechecks the reviewed snapshot, then performs optional clear and all additions in one IndexedDB transaction; duplicates or storage errors abort the whole operation. Close other app tabs during restore, especially older app versions that do not participate in the lock.

Preferences and permissions are device settings and are excluded from journal backups. No new runtime dependencies, external requests, or schema migrations are introduced.

## Transcription implementation

`src/transcription.js` wraps the browser's live microphone recognition API. It does not accept a Blob or replay saved recordings into recognition. Local mode checks API support and forces `processLocally = true`; it never switches to remote mode. Browser-service mode is enabled only by the Settings consent flow. Its device preference is excluded from journal backups. The app has no service API key, model dependency, or cloud endpoint.

Recognition starts while MediaRecorder captures original audio. Stop requests final recognition results before stopping MediaRecorder, and bounds that wait to eight seconds. Capture tracks are released after recognition completes/aborts/times out, protecting pending final results. Android uses a single-utterance request; other simultaneous-capture behavior remains device-dependent. Early end, interim-only results, errors, and timeout are exposed as incomplete/failed outcomes. There is no automatic recognition restart after silence. With recognition enabled, the audio draft and editable text wait for explicit Save. With recognition off, the Phase 1 automatic save behavior remains. Pending drafts warn on tab closure; they are not crash-proof or durable until Save succeeds.

Optional entry `transcription` metadata contains provider, language, status, rawText, reason, and completion time. `text` contains the user's reviewed note; `originalText` preserves the combined note/transcript before correction. Original audio is never replaced by transcription. Existing version-1 backup validation preserves these additional fields.

`tests/speech-provider.js` supplies a simulated constructor only inside isolated browser tests. It is not imported by application code or included in dist/offline caches. Tests never exercise a real recognition network. Physical Android simultaneous microphone access, recognition accuracy, provider policy, and installed local models remain manual checks. The offline-update test installs an older shell-cache variant, verifies the new worker waits, then closes/reopens the app and checks existing IndexedDB records offline.

## Android recognition diagnostics and separate-note fallback

See [the Android troubleshooting guide](ANDROID-SPEECH.md) for evidence, hypotheses, sources, and physical-device instructions. Session `start` is distinguished from `audiostart` readiness. No audioTrack overload is assumed on Android. Starting recognition before getUserMedia was considered but would still create two captures and could disturb the working recording flow; recorder-first remains.

A local, ephemeral diagnostic callback emits only fixed event names, relative times, provider/purpose, platform/visibility/connectivity booleans, state flags, and allowlisted error/exception codes. It never receives raw recognition text in the diagnostic payload. Data is excluded from saved records/backups and not sent or logged to the console. Startup/recent shutdown events are bounded to 40.

The separate-note button explicitly starts one recognition-only attempt after all recording tracks are released and original playback is paused. It appends new speech, retains corrected note text and original audio, and saves nested `transcription.separateNote` metadata with source `new-dictation-after-recording`. It is not file transcription. Listening is bounded to 30 seconds with an explicit Finish button and the existing eight-second completion bound. The same privacy preference/consent applies; no automatic retry or remote fallback occurs.
