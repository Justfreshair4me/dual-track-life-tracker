# Dual-Track Life Tracker — Phase 1

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

Recall, Tasks, and Summaries are visibly marked “Coming soon.” Categorization/search are Phase 2; tasks/reminders are Phase 3; advanced summaries, trends, backups, and recovery are Phase 4. No transcription is included: common browser speech-recognition services may upload audio and need internet. Local recording does not.

## Preview on Windows — step by step

1. Install the free **Node.js LTS** version from https://nodejs.org (version 24 LTS recommended; version 22.12 or newer required). Keep the installer's default options. Restart your terminal after installation.
2. Download and unzip the Phase 1 source archive supplied with this task. Alternatively, after these changes have been committed and pushed to GitHub, open your repository, click **Code → Download ZIP**, and unzip it. Cloud workspace changes do not appear on GitHub automatically.
3. Open the extracted folder containing `package.json`. Click File Explorer's address bar, type `powershell`, and press Enter. This opens a command window in that folder.
4. Enter each command separately:

   ```powershell
   npm.cmd ci
   npm.cmd run preview:cloud
   ```

5. Keep the command window open. In a separate Chrome or Edge tab, enter `http://localhost:5173/`. This address works after starting the server **on your Windows computer**; it cannot connect your computer to the cloud server. Do not double-click `index.html`: the app needs a local web server.
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

The simplest next step is to publish the built static files on a free HTTPS host, such as GitHub Pages, subject to its free-plan eligibility and usage limits. This has not been published by this task. The app's files would be publicly accessible on Pages, while your entries remain in each device's browser. Free GitHub Pages normally requires a public repository. **Confirm before making a repository public or publishing.** A private repository can remain private while using local Windows previews; we can discuss a suitable free HTTPS alternative before Android setup.

Once an approved HTTPS deployment exists:

1. Open its address in Android Chrome, while online, and let it finish loading.
2. Tap **Settings** and **Install app** if available, or use Chrome's **⋮ → Install app / Add to Home screen** option. Menu wording depends on Chrome's version.
3. Open the app from its home-screen icon.
4. Tap the microphone and allow microphone access. Speak a fictional note, then tap **Stop & save recording**. Open it in History and listen.
5. Close the app, reopen it, and check the entry. Then try airplane mode and create a fictional note offline.

Android hardware recording, actual installation, and Windows browser operation still need your device testing. Cloud browser tests use simulated layout sizes and a synthetic microphone, not your phone's hardware. Recording may be interrupted if you switch apps or lock the screen; keep the recording screen open until you stop and save.

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

The updated suite has 22 passing tests: the original 10, eight appearance checks, one source-preview interaction check, and three startup-failure checks. These appearance tests inspect actual computed styles and capture screenshots. The custom source-preview test is a normal HTTP server mounted at a nested address; it is not the Codex Index panel.

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
| `public/manifest.webmanifest` | Home-screen installation details |
| `vite.config.js` | Production build and offline file caching |
| `tests/foundation.spec.js` | Automated browser tests |

To request a change through Codex, describe the visible behavior you want, for example: “Make the recording button larger on Android; preserve saving and mode separation.” Changes to text and appearance are straightforward. Database format changes should include a migration plan so older records survive.

## Development plan

1. **Foundation:** test capture, saving, editing, and installation on your devices.
2. **Organization:** deterministic categories, explicit field extraction, search, and concise summaries.
3. **Tasks and reminders:** due dates, completed archive, in-app alerts, and honest notification limits.
4. **Advanced features:** complete audio-inclusive backups, restore validation/deduplication, historical summaries, trends, and privacy improvements.

The next essential approval is where to publish the static app for secure Android access. No paid service or major architectural change is needed for the current foundation.
