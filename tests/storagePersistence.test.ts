import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoData } from '../src/seed/demo';
import { latestRecovery, loadData, saveData, STORAGE_KEY } from '../src/storage/storage';

let entries: Map<string, string>;
let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> };

beforeEach(() => {
  entries = new Map();
  storage = {
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { entries.set(key, value); }),
  };
  let queue = Promise.resolve<unknown>(undefined);
  vi.stubGlobal('localStorage', { ...storage, get length() { return entries.size; }, key: (index: number) => [...entries.keys()][index] ?? null });
  vi.stubGlobal('navigator', { locks: { request: (_name: string, fn: () => unknown) => {
    const result = queue.then(fn);
    queue = result.catch(() => undefined);
    return result;
  } } });
});
afterEach(() => vi.unstubAllGlobals());

describe('Speichern ohne Datenverlust', () => {
  it('unterscheidet fehlende Daten von defekten und neueren Daten', () => {
    expect(loadData()).toEqual({ status: 'empty', raw: null });
    for (const raw of ['{defekt', JSON.stringify({ ...demoData(), schemaVersion: 999 })]) {
      entries.set(STORAGE_KEY, raw);
      expect(loadData()).toMatchObject({ status: 'error', raw });
      expect(entries.get(STORAGE_KEY)).toBe(raw);
    }
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('schreibt bei verweigertem Lesen keine Startdaten', () => {
    storage.getItem.mockImplementation(() => { throw new Error('Zugriff verweigert'); });
    expect(loadData()).toMatchObject({ status: 'error', message: 'Zugriff verweigert' });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('lehnt einen veralteten Stand ab und erhält neuere Daten', async () => {
    const oldRaw = JSON.stringify(demoData());
    const latest = demoData();
    latest.profile.municipality = 'Neuer Stand';
    const latestRaw = JSON.stringify(latest);
    entries.set(STORAGE_KEY, latestRaw);
    expect(await saveData(demoData(), oldRaw)).toEqual({ status: 'conflict' });
    expect(entries.get(STORAGE_KEY)).toBe(latestRaw);
  });

  it('lässt von zwei gleichzeitigen Schreibversuchen nur den ersten durch', async () => {
    const first = demoData();
    const second = demoData();
    second.profile.municipality = 'Zweiter Tab';
    const results = await Promise.all([saveData(first, null), saveData(second, null)]);
    expect(results.map((r) => r.status)).toEqual(['saved', 'conflict']);
    expect(JSON.parse(entries.get(STORAGE_KEY)!)).toEqual(first);
  });

  it('sichert beim bewussten Ersetzen den exakten vorherigen Inhalt', async () => {
    const raw = '{ursprüngliche, beschädigte Daten';
    entries.set(STORAGE_KEY, raw);
    const next = demoData();
    expect(await saveData(next, raw, { preservePrevious: true })).toMatchObject({ status: 'saved' });
    const recovery = [...entries.entries()].find(([key]) => key.startsWith('frank.recovery.'));
    expect(recovery?.[1]).toBe(raw);
    expect(JSON.parse(entries.get(STORAGE_KEY)!)).toEqual(next);
  });

  it('macht die letzte Wiederherstellungskopie wieder zugänglich', () => {
    entries.set('frank.recovery.100.id', 'älter');
    entries.set('frank.recovery.200.id', 'neuer');
    entries.set(STORAGE_KEY, 'aktuell');
    expect(latestRecovery()).toBe('neuer');
  });

  it('erhält das Original, wenn die Wiederherstellungskopie nicht gespeichert werden kann', async () => {
    const raw = JSON.stringify(demoData());
    entries.set(STORAGE_KEY, raw);
    storage.setItem.mockImplementation(() => { throw new Error('Speicher voll'); });
    expect(await saveData(demoData(), raw, { preservePrevious: true })).toMatchObject({ status: 'error' });
    expect(entries.get(STORAGE_KEY)).toBe(raw);
  });

  it('führt nach einem bewussten Neuladen keine alten Schreibaufträge aus', async () => {
    expect(await saveData(demoData(), null, { stillCurrent: () => false })).toEqual({ status: 'cancelled' });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('verhindert unsynchronisierte Schreibvorgänge ohne Web Locks', async () => {
    vi.stubGlobal('navigator', {});
    expect(await saveData(demoData(), null)).toMatchObject({ status: 'error' });
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
