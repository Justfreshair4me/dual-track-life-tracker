import { readAllEntries, withEntryLock, snapshotToken, applyRestore } from './storage.js';

// Binary format: 8-byte signature, uint32 manifest length, SHA-256 manifest
// digest, UTF-8 JSON manifest, then raw audio Blobs in manifest order.
// No base64, compression bombs, or whole-recording ArrayBuffers.
const MAGIC = 'DTLTBK01';
const HEADER = 44;
export const CHUNK_SIZE = 1024 * 1024;
const MAX_METADATA = 8 * 1024 * 1024;
const MAX_FILE = 2 * 1024 * 1024 * 1024;
const MAX_ENTRIES = 10000;
const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
const digest = async bytes => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
const fail = message => { throw new Error(message); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const dataOf = ({ audio, ...data }) => data;
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (plain(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function validateData(data) {
  if (!plain(data) || typeof data.id !== 'string' || !data.id.length || data.id.length > 200 ||
      !['personal', 'work'].includes(data.mode) || !validDate(data.createdAt) || !validDate(data.updatedAt) ||
      typeof data.text !== 'string' || typeof data.originalText !== 'string' ||
      data.text.length > 50000 || data.originalText.length > 50000 || data.schemaVersion !== 1 ||
      !Array.isArray(data.categories) || data.categories.length > 100 ||
      data.categories.some(category => typeof category !== 'string' || category.length > 200) ||
      Object.hasOwn(data, 'audio')) fail('Invalid entry metadata. No records were changed.');
}
async function audioHashes(blob, onProgress) {
  const hashes = [];
  for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE) {
    hashes.push(hex(await digest(await blob.slice(offset, offset + CHUNK_SIZE).arrayBuffer())));
    onProgress?.();
  }
  return hashes;
}
async function describe(entry, onProgress) {
  const data = dataOf(entry);
  validateData(data);
  if (entry.audio && (!(entry.audio instanceof Blob) || !entry.audio.size || !entry.audio.type.startsWith('audio/'))) fail('An entry has unsupported audio. Export was not completed.');
  return { data, audio: entry.audio ? { size: entry.audio.size, type: entry.audio.type,
    hashes: await audioHashes(entry.audio, onProgress) } : null };
}

export async function createBackup(onProgress) {
  const entries = await readAllEntries(); // Blob references, not audio bytes.
  if (entries.length > MAX_ENTRIES) fail('This backup supports up to 10,000 entries. Nothing was changed.');
  if (entries.reduce((sum, entry) => sum + (entry.audio?.size || 0), 0) > MAX_FILE - MAX_METADATA - HEADER) fail('This backup exceeds the 2 GB supported limit. Nothing was changed.');
  const descriptions = [];
  let estimatedMetadata = 256;
  for (const entry of entries) {
    const description = await describe(entry, onProgress);
    estimatedMetadata += encoder.encode(JSON.stringify(description)).length + 1;
    if (estimatedMetadata > MAX_METADATA) fail('Backup metadata exceeds the supported 8 MB limit. Nothing was changed.');
    descriptions.push(description);
  }
  const manifest = { format: 'dual-track-life-tracker', version: 1,
    createdAt: new Date().toISOString(), chunkSize: CHUNK_SIZE, entries: descriptions };
  const metadata = encoder.encode(JSON.stringify(manifest));
  if (metadata.length > MAX_METADATA) fail('Backup metadata exceeds the supported 8 MB limit. Nothing was changed.');
  const header = new Uint8Array(HEADER);
  header.set(encoder.encode(MAGIC));
  new DataView(header.buffer).setUint32(8, metadata.length, true);
  header.set(await digest(metadata), 12);
  const file = new Blob([header, metadata, ...entries.filter(entry => entry.audio).map(entry => entry.audio)], { type: 'application/octet-stream' });
  return { file, manifest };
}

export async function validateBackup(file, onProgress) {
  if (!(file instanceof Blob) || file.size < HEADER || file.size > MAX_FILE) fail('Invalid backup size. Supported backups must be complete and at most 2 GB.');
  const header = new Uint8Array(await file.slice(0, HEADER).arrayBuffer());
  if (new TextDecoder().decode(header.slice(0, 8)) !== MAGIC) fail('This is not a Dual-Track backup, or its header is damaged.');
  const length = new DataView(header.buffer).getUint32(8, true);
  if (!length || length > MAX_METADATA || HEADER + length > file.size) fail('The backup metadata is damaged or incomplete.');
  const bytes = new Uint8Array(await file.slice(HEADER, HEADER + length).arrayBuffer());
  if (hex(await digest(bytes)) !== hex(header.slice(12))) fail('The backup metadata checksum does not match. The file is damaged.');
  let manifest;
  try { manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('The backup metadata cannot be read.'); }
  if (!plain(manifest) || manifest.format !== 'dual-track-life-tracker' || manifest.version !== 1 ||
      manifest.chunkSize !== CHUNK_SIZE || !validDate(manifest.createdAt) || !Array.isArray(manifest.entries) ||
      manifest.entries.length > MAX_ENTRIES) fail('Unsupported backup version or invalid backup metadata.');
  const ids = new Set();
  const records = [];
  let offset = HEADER + length;
  for (const item of manifest.entries) {
    if (!plain(item)) fail('Invalid backup entry.');
    validateData(item.data);
    if (ids.has(item.data.id)) fail('The backup contains duplicate entry IDs and cannot be restored.');
    ids.add(item.data.id);
    let audio = null;
    if (item.audio !== null) {
      const a = item.audio;
      if (!plain(a) || !Number.isSafeInteger(a.size) || a.size <= 0 || a.size > MAX_FILE ||
          typeof a.type !== 'string' || !/^audio\/[a-z0-9.+-]+(?:;[a-z0-9=., -]+)?$/i.test(a.type) || a.type.length > 200 ||
          !Array.isArray(a.hashes) || a.hashes.length !== Math.ceil(a.size / CHUNK_SIZE) ||
          a.hashes.some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) || offset + a.size > file.size) fail('Invalid or truncated recording information.');
      audio = file.slice(offset, offset + a.size, a.type);
      const hashes = await audioHashes(audio, onProgress);
      if (hashes.some((hash, index) => hash !== a.hashes[index])) fail('A recording checksum does not match. The backup is damaged.');
      offset += a.size;
    }
    records.push({ ...item.data, audio });
  }
  if (offset !== file.size) fail('The backup has unexpected extra bytes or incorrect recording lengths.');
  return { manifest, records };
}

export async function prepareRestore(backup, onProgress) {
  const current = await readAllEntries();
  const expected = snapshotToken(current);
  const existing = new Map(current.map(entry => [entry.id, entry]));
  const descriptions = new Map();
  for (const entry of current) descriptions.set(entry.id, await describe(entry, onProgress));
  const signature = await descriptionSignature([...descriptions.values()]);
  const same = async (entry, item) => {
    if (!descriptions.has(entry.id)) descriptions.set(entry.id, await describe(entry, onProgress));
    const prior = descriptions.get(entry.id);
    const { id: firstId, ...first } = prior.data;
    const { id: secondId, ...second } = item.data;
    return canonical(first) === canonical(second) && canonical(prior.audio) === canonical(item.audio);
  };
  const additions = [];
  let skipped = 0;
  let conflicts = 0;
  for (let index = 0; index < backup.records.length; index++) {
    const record = backup.records[index];
    const item = backup.manifest.entries[index];
    let id = record.id;
    if (existing.has(id)) {
      if (await same(existing.get(id), item)) { skipped++; continue; }
      const fingerprint = hex(await digest(encoder.encode(canonical(item))));
      id = 'restored-' + fingerprint;
      let suffix = 0;
      while (existing.has(id) && !await same(existing.get(id), item)) id = 'restored-' + fingerprint + '-' + (++suffix);
      if (existing.has(id)) { skipped++; continue; }
      conflicts++;
    }
    const addition = { ...record, id };
    existing.set(id, addition);
    additions.push(addition);
  }
  return { expected, signature, additions, skipped, conflicts, existingCount: current.length };
}

async function descriptionSignature(descriptions) {
  const signatures = [];
  for (const item of descriptions.sort((a, b) => a.data.id.localeCompare(b.data.id))) {
    signatures.push(hex(await digest(encoder.encode(canonical(item)))));
  }
  return signatures.join(':');
}

export async function restoreBackup(backup, reviewed, replace, onProgress) {
  return withEntryLock(async () => {
    // Recheck the contents reviewed by the user. A different tab's edits stop
    // the restore instead of silently changing the replacement target.
    const current = await readAllEntries();
    if (snapshotToken(current) !== reviewed.expected) fail('Records changed since review. Choose the backup again to review the new state.');
    const descriptions = [];
    for (const entry of current) descriptions.push(await describe(entry, onProgress));
    if (await descriptionSignature(descriptions) !== reviewed.signature) fail('Recordings changed since review. Choose the backup again before restoring.');
    await applyRestore(reviewed.expected, replace ? backup.records : reviewed.additions, replace);
    return { added: replace ? backup.records.length : reviewed.additions.length,
      skipped: replace ? 0 : reviewed.skipped, conflicts: replace ? 0 : reviewed.conflicts };
  });
}
