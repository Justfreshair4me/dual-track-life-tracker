import { createBackup, validateBackup, prepareRestore, restoreBackup } from './backup.js';

const $ = id => document.getElementById(id);
const sizeLabel = bytes => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function initBackup({ canOperate, setBusy, afterRestore }) {
  let selected;
  let reviewed;
  let working = false;
  let downloadURL;
  let releaseTimer;
  const status = text => {
    $('backup-status').textContent = text;
    if ($('backup-dialog').open) $('restore-status').textContent = text;
  };
  const progress = label => {
    let chunks = 0;
    let updated = 0;
    return () => {
      chunks++;
      if (Date.now() - updated > 150) { status(`${label} — checked ${chunks} audio chunks. Keep this tab open.`); updated = Date.now(); }
    };
  };
  const busy = value => {
    working = value;
    setBusy(value);
    $('export-backup').disabled = $('backup-file').disabled = $('confirm-restore').disabled = $('cancel-restore').disabled = value;
    document.querySelectorAll('[name=restore-mode]').forEach(input => { input.disabled = value; });
  };
  $('export-backup').disabled = $('backup-file').disabled = false;
  try {
    const last = localStorage.getItem('dual-track-last-export');
    if (last && Number.isFinite(Date.parse(last))) $('last-export').textContent = `Last export requested: ${new Date(last).toLocaleString()}. Confirm that the file exists in Downloads.`;
  } catch { /* Export does not require localStorage. */ }

  $('export-backup').addEventListener('click', async () => {
    if (!canOperate() || working) { status('Save or clear your draft and finish recording before making a backup.'); return; }
    busy(true);
    status('Preparing a complete backup of Personal and Work. Keep this tab open.');
    try {
      const { file, manifest } = await createBackup(progress('Preparing backup'));
      clearTimeout(releaseTimer);
      if (downloadURL) URL.revokeObjectURL(downloadURL);
      downloadURL = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = downloadURL;
      link.download = `dual-track-${manifest.createdAt.replace(/[:.]/g, '-')}.dtbackup`;
      document.body.append(link);
      link.click();
      link.remove();
      releaseTimer = setTimeout(() => { URL.revokeObjectURL(downloadURL); downloadURL = undefined; }, 300000);
      $('last-export').textContent = `Last export requested: ${new Date(manifest.createdAt).toLocaleString()}. Confirm that the file exists in Downloads.`;
      try { localStorage.setItem('dual-track-last-export', manifest.createdAt); } catch { /* Optional preference. */ }
      status(`Backup download requested: ${manifest.entries.length} entries, ${sizeLabel(file.size)}. Check Downloads before relying on it. The file is not encrypted; store it privately.`);
    } catch (error) { status(`Export failed: ${error.message}. Your records were not changed.`); }
    finally { busy(false); }
  });

  $('backup-file').addEventListener('change', async () => {
    const file = $('backup-file').files[0];
    if (!file) return;
    if (!canOperate() || working) { status('Save or clear your draft and finish recording before restoring.'); $('backup-file').value = ''; return; }
    selected = reviewed = undefined;
    busy(true);
    status('Validating the backup and every recording. No records are being changed.');
    try {
      selected = await validateBackup(file, progress('Validating backup'));
      reviewed = await prepareRestore(selected, progress('Comparing existing recordings'));
      const entries = selected.manifest.entries;
      const audio = entries.filter(entry => entry.audio);
      const summary = [
        `Backup date: ${new Date(selected.manifest.createdAt).toLocaleString()}`,
        `${entries.length} entries: ${entries.filter(entry => entry.data.mode === 'personal').length} Personal, ${entries.filter(entry => entry.data.mode === 'work').length} Work.`,
        `Audio included: ${audio.length} original recordings (${sizeLabel(audio.reduce((sum, entry) => sum + entry.audio.size, 0))}). All checksums verified.`,
        `This device currently has ${reviewed.existingCount} entries.`,
        `Merge will add ${reviewed.additions.length}, skip ${reviewed.skipped} identical records, and preserve ${reviewed.conflicts} ID conflicts as separate copies.`
      ];
      $('backup-summary').replaceChildren(...summary.map(text => { const paragraph = document.createElement('p'); paragraph.textContent = text; return paragraph; }));
      $('merge-backup').checked = true;
      $('replace-warning').hidden = true;
      $('confirm-restore').textContent = 'Merge backup';
      $('confirm-restore').className = 'primary';
      $('restore-status').textContent = '';
      $('backup-dialog').showModal();
      status('Backup verified. Review the date, counts, and restore choice before continuing.');
    } catch (error) {
      selected = reviewed = undefined;
      status(`Cannot import: ${error.message} No records were changed.`);
      $('backup-file').value = '';
    } finally { busy(false); }
  });
  document.querySelectorAll('[name=restore-mode]').forEach(input => input.addEventListener('change', () => {
    const replace = $('replace-backup').checked;
    $('replace-warning').hidden = !replace;
    $('confirm-restore').textContent = replace ? 'Replace all saved entries' : 'Merge backup';
    $('confirm-restore').className = replace ? 'danger' : 'primary';
  }));
  $('cancel-restore').addEventListener('click', () => { if (!working) $('backup-dialog').close(); });
  $('backup-dialog').addEventListener('cancel', event => { if (working) event.preventDefault(); });
  $('backup-dialog').addEventListener('close', () => { selected = reviewed = undefined; $('backup-file').value = ''; });
  $('confirm-restore').addEventListener('click', async () => {
    if (!selected || !reviewed || working || !canOperate()) return;
    const replace = $('replace-backup').checked;
    if (replace && !confirm(`Replace ALL ${reviewed.existingCount} saved Personal and Work entries and recordings on this device with the ${selected.records.length} entries in this backup? This removes entries not in the backup. Export your current data first. This cannot be undone without another backup.`)) return;
    busy(true);
    status('Restoring locally. Keep this tab open.');
    try {
      const result = await restoreBackup(selected, reviewed, replace, progress('Rechecking saved recordings'));
      $('backup-dialog').close();
      try { await afterRestore(); }
      catch { status('Restore was saved successfully, but History could not refresh. Reload the app to display the restored entries.'); return; }
      status(`Restore complete. ${result.added} entries ${replace ? 'restored' : 'added'}, ${result.skipped} identical records skipped, ${result.conflicts} conflicts preserved as copies. Personal and Work remain separate.`);
    } catch (error) {
      status(error.name === 'QuotaExceededError' ? 'Not enough device storage. Restore was rolled back; existing entries were preserved. Free space and choose the backup again.' : `Restore failed: ${error.message} Existing entries were preserved. Choose the backup again to retry.`);
    } finally { busy(false); }
  });
}
