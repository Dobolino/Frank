import type { AppData } from '../domain/types';
import { parseAppData } from '../storage/storage';

export interface Checkpoint { id: string; data: AppData }

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('frank.devices', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('checkpoints');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getCheckpoint(): Promise<Checkpoint | null> {
  const db = await database();
  try {
    return await new Promise((resolve,reject) => {
      const request = db.transaction('checkpoints').objectStore('checkpoints').get('last');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entry = request.result;
        if (!entry || typeof entry.id !== 'string') return resolve(null);
        try { resolve({ id: entry.id, data: parseAppData(JSON.stringify(entry.data)) }); }
        catch { resolve(null); }
      };
    });
  } finally { db.close(); }
}

export async function setCheckpoint(entry: Checkpoint) {
  const db = await database();
  try {
    await new Promise<void>((resolve,reject) => {
      const tx = db.transaction('checkpoints','readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Vergleichsstand konnte nicht gespeichert werden.'));
      tx.objectStore('checkpoints').put(entry,'last');
    });
  } finally { db.close(); }
}
