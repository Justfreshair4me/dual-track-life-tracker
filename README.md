# Dual-Track Life Tracker — Phase 1

A free memory app for Personal and Work notes. Notes and microphone recordings stay in your device's browser using IndexedDB. No paid APIs, subscriptions, analytics, cloud database, credit card, or additional app account are required.

**Application address after deployment:**

https://justfreshair4me.github.io/dual-track-life-tracker/

You can use Chrome on your Windows laptop without installing Node.js, opening a terminal, or downloading the project. The public website contains application code, not your journal records. GitHub serves the app files and may log ordinary website requests; the app does not upload your entries or audio.

## Enable GitHub Pages — browser only

1. Open https://github.com/Justfreshair4me/dual-track-life-tracker while signed in as the repository owner.
2. Click **Settings** near the top of the repository. In the left sidebar, choose **Pages** under **Code and automation**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**. Save if GitHub displays a Save button. Do not choose “Deploy from a branch.”
4. Open the pull request for the github-pages-deployment branch. Check that the destination/base branch is main, review **Files changed**, and wait for its automated checks to pass.
5. Click **Merge pull request**, then **Confirm merge**. This adds the deployment setup to main.
6. Click the repository's **Actions** tab. Open the newest **Test and deploy GitHub Pages** run for main.
7. Wait until **build** and **deploy** both show green checkmarks. GitHub builds and tests the app for you; you do not run software on your laptop.
8. Open https://justfreshair4me.github.io/dual-track-life-tracker/ in a separate Chrome tab. The first deployment may take a few minutes to appear.

If there is no deployment run, open **Actions → Test and deploy GitHub Pages → Run workflow**, select **main**, and click **Run workflow**. This option appears after the workflow has been merged. If deployment fails, open the red run and its failed step, then share the error text with Codex. A 404 before deployment completes does not mean your records were deleted.

GitHub Actions runs tests on pull requests but publishes only main. Future changes deploy after they are merged. This uses GitHub's free Pages hosting and Actions for this public repository, subject to GitHub's normal usage limits.

## Test the deployed app in Chrome

Use fictional or disposable entries while testing. Backups and restoration are not implemented yet.

1. Open the application address above. The centered microphone, styled Personal/Work toggle, and bottom navigation should appear. A startup notice should disappear once the app and local storage are ready.
2. Leave **Personal** selected. Type “Fictional walk in the park” and click **Save entry**. A confirmation and recent entry should appear.
3. Click **View history** or **History** in the bottom navigation. Your note should appear. Open it to edit it or test deletion; deleting asks for confirmation.
4. Switch to **Work**. The Personal note should disappear from this mode. Return to **Home**, save “Fictional Orion project meeting,” and open History again. Work should show only the Work note.
5. Reload the tab. Personal is selected by default, and your Personal note should still exist. Switch to Work to see the saved Work note. Close/reopen the same address in the same browser and check again.
6. In **Settings**, try **Light**, **Dark**, and **Use device setting**.
7. If your browser allows microphone access, tap the microphone and click **Allow** when prompted. Speak a fictional memory, then click **Stop & save recording**. Open it in History and listen. Cancel discards the recording. Denying permission still allows typed notes.

## Android and offline use

1. Open the same HTTPS application address in Android Chrome while online, and let it finish loading.
2. Open Chrome's **⋮** menu and choose **Install app** or **Add to Home screen** when available. You can also use **Settings → Install app** if the app displays that button.
3. Open the app from its home-screen icon and test the same steps above.
4. After the initial online load finishes, try airplane mode, reopen the app, save a fictional note, and check History. The production app caches its files for offline use; it does not rely on a cloud database.

Microphone support depends on browser permission and device policy. Your company-managed laptop may restrict microphone access or local storage. Actual managed-laptop and Android hardware behavior still needs your testing.

## Local data and privacy

- Personal and Work histories remain separate. No automatic cross-device synchronization exists.
- Each device/browser has its own records. Your Windows notes will not automatically appear on Android. The new GitHub Pages address also has separate storage from earlier localhost/Codex previews; those records are not moved or erased by deployment.
- Clearing browser/site data, device loss, private browsing, storage eviction, or app removal may lose records. **Do not clear site data to refresh the app.** Export/restore and backup verification are planned for Phase 4.
- Local storage is not encrypted by this app or protected by a separate app lock. Do not assume an unlocked or company-managed device is private.
- Use fictitious Work information during development; do not enter confidential employer information without authorization.
- To pick up a deployed update, first save any draft, then close all tabs/windows of this app and reopen its address while online. The offline worker waits for older app tabs to close before replacing their cached app files. Saved records remain in IndexedDB.

## What is included

Phase 1 includes mobile/desktop layouts, mode switching, typed entries, local audio capture/playback, persistence, separate histories, editing that preserves original text/audio, confirmed deletion, light/dark themes, and PWA/offline support.

Transcription, categorization, search, summaries, tasks, reminders, trends, and backups remain later phases. No Phase 2 features were added for deployment.

## Validation and maintenance

The production build and all **24 automated browser tests** pass using the /dual-track-life-tracker/ path. Checks include asset paths/content types, manifest/icons, offline-worker scope, saving, History, persistence, mode separation, recording/playback, edits/deletion, mobile/desktop themes, and startup failures. No test changes the user's browser data.

Local path tests do not establish that the public website has deployed successfully. The first live GitHub Actions deployment, your managed laptop's browser, and Android installation remain to be verified after merge and Pages setup.

For technical maintenance, see [developer notes](docs/DEVELOPMENT.md). The [deployment workflow](.github/workflows/pages.yml) installs dependencies, tests, builds dist, and deploys static files. The database schema and journal data format are unchanged.
