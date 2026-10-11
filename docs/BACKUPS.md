# Backup and restore — browser-only guide

No installation, terminal, account, or payment is needed. Use the app in Chrome:

https://justfreshair4me.github.io/dual-track-life-tracker/

## Get this update

1. Open the GitHub pull request, check that it targets **main**, review **Files changed**, and wait for the automated checks to pass.
2. Click **Merge pull request**, then **Confirm merge**.
3. In the repository's **Actions** tab, wait for the newest **Test and deploy GitHub Pages** run on main to show green **build** and **deploy** jobs.
4. Save any draft, close all open tabs/windows of this app (including its installed Android window), and reopen the address while online. This lets the offline app files update. **Do not clear browser data.**
5. Open **Settings**. You should see **Backup & restore**.

## Export a backup

1. Finish any recording and save or clear any draft.
2. Open **Settings → Backup & restore → Export backup**.
3. Keep the app open while it prepares the file. Large recordings take longer.
4. Check Chrome's **Downloads** on Windows, or **Downloads** in Android's Files app. The filename starts with `dual-track-`, includes the backup date, and ends in `.dtbackup`. Chrome may ask you to allow or confirm the download.
5. Confirm that the file exists. The app can request a download but cannot guarantee that your browser actually saved it. Keep another copy outside the phone/browser if you need protection against device loss.

Every backup includes **all Personal and Work entries**, current and original text, metadata, and original audio. There is no automatic backup or synchronization. The file is not encrypted; anyone with the file can read its contents. Store and transfer it privately, following your company's policies. Do not commit backups to the public GitHub repository.

The portable `.dtbackup` file is opened through this app's Import control, rather than double-clicking it. It contains readable structured metadata and original audio bytes, with integrity checks. It is a backup container, not a ZIP archive.

## Restore or transfer between devices

1. Export the destination device's current records first, and verify that the download exists.
2. If transferring, copy the `.dtbackup` file to the other device through a method you are allowed to use, such as a USB cable. No cloud service is required. A backup already includes both modes; you do not need two exports.
3. Close other tabs/windows of this app. On the destination, open **Settings → Backup & restore → Import/restore backup** and choose the file. On Android, choose the file from Downloads using the system file picker.
4. Wait while the app checks the metadata and every recording. Nothing is changed during this check.
5. Review the backup date, Personal/Work entry counts, number and size of recordings, and merge results.
6. Leave **Merge** selected and click **Merge backup** to keep existing entries. Identical records are skipped. If the same entry ID has different contents, both versions are kept and the imported copy receives a new ID. Reimporting the same file skips that same copy too.
7. Check **History** in both modes and play an imported recording. Reload and confirm the entries remain.

**Replace** is optional and removes the destination's existing Personal AND Work records, including entries absent from the backup. It shows a warning and asks for a second explicit confirmation. Canceling that confirmation leaves the records unchanged. Use replacement only when you deliberately want the backup's exact contents and have exported the current data first.

Damaged, unsupported, truncated, or invalid files are rejected before import. If storage runs out during restoration, the database operation rolls back and preserves the existing records. If another tab changed records after you reviewed the file, choose the file again to review the new state. Errors appear beside the backup controls or inside the review window.

## Test with fictional data on Windows and Android

1. Save “Fictional garden walk” in **Personal** and “Fictional Orion meeting” in **Work**. Record a short fictional audio note and check playback.
2. Export, locate the downloaded file, and choose it for import on the same device. Verify the date/counts/audio information before clicking anything. Click **Cancel** once to confirm History is unchanged.
3. Choose the same file again and **Merge** it. The existing identical entries should be skipped, with no extra copies in History.
4. Edit the garden note, then merge the older backup again. History should keep your edited note and add a separate copy of the earlier note. Reimport once more: the earlier copy should not be added again.
5. Transfer the file to the other device and merge it there. Check both modes, original text, audio playback, and persistence after closing and reopening the app.
6. For an invalid-file check, choose an ordinary text or image file if the file picker allows it (on Windows, select **All files** if needed). It should show an error and leave History unchanged.
7. Optional replacement test: **only when every current entry is disposable fictional data**, export first, add another fictional note, import the earlier backup, select **Replace**, and cancel the final warning. Verify the extra note remains. Repeat and confirm replacement only if you intend to remove that extra note. Never test replacement on important records without a verified current backup.

## Limits and practical precautions

- Supported backup limits are 2 GB total, 10,000 entries, and 8 MB of metadata. Audio is processed in 1 MB chunks; original recordings are not converted to memory-heavy base64 strings or loaded into one large JavaScript buffer. The browser still needs disk space and can use its own download buffers. A smaller backup is more practical on a phone with limited space.
- Keep the tab/app open and the phone awake during long operations. Have enough free space for the downloaded file and restored records. Import merging can require additional space for conflicting copies.
- Integrity checks detect accidental file damage. They are not encryption or proof of who created a file; use backups you trust.
- After the application has loaded and cached its files, backup and restore can run offline. File transfer is manual. Browser policies may restrict downloads or file selection on a company-managed device.
- Theme preferences, microphone permissions, and the “last export requested” display are device settings, not journal data, and are not restored. Future attachments are not implemented yet.
- The tests use isolated Chromium profiles and mobile-sized touch emulation. Real Windows/Android download dialogs and file pickers need your manual check; the full 2 GB limit has not been tested on a physical phone.
