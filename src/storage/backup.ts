import type { AppData } from '../domain/types';
import { downloadJson } from './storage';

/**
 * Backup-Status dieses Geräts. Liegt bewusst ausserhalb der Finanzdaten:
 * er gehört zum Gerät, nicht ins Backup selbst.
 */
const KEY = 'frank.backup.v1';
const DAY = 24 * 60 * 60 * 1000;
/** Nach so vielen Tagen ohne Backup erinnert Frank. */
export const REMIND_AFTER_DAYS = 30;

interface BackupState {
  last?: string;
  snoozeUntil?: string;
}

function read(): BackupState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BackupState) : {};
  } catch {
    return {};
  }
}

function write(state: BackupState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ohne Speicher erinnert Frank beim nächsten Start erneut */
  }
}

export function lastBackup(): Date | null {
  const last = read().last;
  return last ? new Date(last) : null;
}

/** Erinnern, wenn noch nie oder vor mehr als 30 Tagen gesichert wurde und nicht «später» gewählt ist. */
export function backupDue(now = new Date()): boolean {
  const s = read();
  if (s.snoozeUntil && new Date(s.snoozeUntil) > now) return false;
  return !s.last || now.getTime() - new Date(s.last).getTime() > REMIND_AFTER_DAYS * DAY;
}

export function snoozeBackup(days = 7, now = new Date()): void {
  write({ ...read(), snoozeUntil: new Date(now.getTime() + days * DAY).toISOString() });
}

export function markBackup(now = new Date()): void {
  write({ last: now.toISOString() });
}

export const backupFilename = (now = new Date()) => `frank-backup-${now.toISOString().slice(0, 10)}.json`;

/**
 * Backup über den Teilen-Dialog des Systems (iPhone: «In Dateien sichern» → iCloud Drive).
 * Ohne Teilen-Funktion lädt der Browser die Datei herunter.
 */
export async function saveBackup(data: AppData): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const name = backupFilename();
  const file = new File([JSON.stringify(data, null, 2)], name, { type: 'application/json' });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Frank Backup' });
      markBackup();
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Teilen nicht möglich: auf Download ausweichen
    }
  }
  downloadJson(data, name);
  markBackup();
  return 'downloaded';
}
