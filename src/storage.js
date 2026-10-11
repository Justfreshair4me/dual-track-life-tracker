const DB_NAME = 'dual-track-life-tracker';
let database;

export function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const entries = request.result.createObjectStore('entries', { keyPath: 'id' });
      entries.createIndex('mode', 'mode');
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('Close other app tabs, then try again.')); };
  });
  return database;
}

async function transaction(mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', mode);
    const request = operation(tx.objectStore('entries'));
    let result;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error || request.error || new Error('Storage operation failed.'));
  });
}

export const withEntryLock = action => navigator.locks
  ? navigator.locks.request('dual-track-entries', action) : action();
export const saveEntry = entry => withEntryLock(() => transaction('readwrite', store => store.put(entry)));
export const deleteEntry = id => withEntryLock(() => transaction('readwrite', store => store.delete(id)));
export const getEntry = id => transaction('readonly', store => store.get(id));
export const readAllEntries = () => transaction('readonly', store => store.getAll());
export async function listEntries(mode) {
  const entries = await transaction('readonly', store => store.index('mode').getAll(mode));
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Compare a snapshot without reading audio bytes into memory. All current app
// writes share the lock; this also catches ordinary changes from older tabs.
export function snapshotToken(entries) {
  return JSON.stringify(entries.map(({ audio, ...data }) => ({ data,
    audio: audio ? { size: audio.size, type: audio.type } : null
  })).sort((a, b) => a.data.id.localeCompare(b.data.id)));
}

export async function applyRestore(expected, additions, replace) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
    let problem;
    const read = store.getAll();
    read.onsuccess = () => {
      try {
        if (snapshotToken(read.result) !== expected) throw new Error('Records changed in another tab. Review the backup again before restoring.');
        if (replace) store.clear();
        // add(), never put(): an unexpected duplicate aborts the WHOLE restore.
        for (const entry of additions) store.add(entry);
      } catch (error) { problem = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(problem || tx.error || new Error('Restore failed. Existing records were not changed.'));
  });
}
