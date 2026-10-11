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

export const saveEntry = entry => transaction('readwrite', store => store.put(entry));
export const deleteEntry = id => transaction('readwrite', store => store.delete(id));
export const getEntry = id => transaction('readonly', store => store.get(id));
export async function listEntries(mode) {
  const entries = await transaction('readonly', store => store.index('mode').getAll(mode));
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
