import { beforeEach, describe, expect, it } from 'vitest';
import { backupDue, markBackup, snoozeBackup } from '../src/storage/backup';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
});

describe('Backup-Erinnerung', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date('2026-11-16T12:00:00Z');

  it('erinnert, wenn es noch kein Backup gibt', () => {
    expect(backupDue(now)).toBe(true);
  });

  it('erinnert erst nach 30 Tagen wieder', () => {
    markBackup(now);
    expect(backupDue(new Date(now.getTime() + 29 * day))).toBe(false);
    expect(backupDue(new Date(now.getTime() + 31 * day))).toBe(true);
  });

  it('schweigt nach «später» sieben Tage', () => {
    snoozeBackup(7, now);
    expect(backupDue(new Date(now.getTime() + 6 * day))).toBe(false);
    expect(backupDue(new Date(now.getTime() + 8 * day))).toBe(true);
  });
});
