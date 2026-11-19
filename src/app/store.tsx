import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Context, type ReactNode } from 'react';
import type { AppData, YearPlan } from '../domain/types';
import { buildYearModel, type YearModel } from '../domain/yearModel';
import { summarizePortfolio } from '../domain/investEngine';
import { initialData } from '../seed';
import { downloadJson, downloadRaw, loadData, parseAppData, saveData, STORAGE_KEY, type LoadResult } from '../storage/storage';

interface Store {
  data: AppData;
  /** Ändert die Daten über eine Kopie (unveränderliche Updates). */
  update: (fn: (draft: AppData) => void) => void;
  /** Ändert das aktuell gewählte Jahr. */
  updateYear: (fn: (plan: YearPlan) => void) => void;
  getSyncSnapshot: () => AppData | null;
  applySync: (expected: AppData | null, next: AppData) => Promise<void>;
  replaceAll: (data: AppData) => Promise<boolean>;
  plan: YearPlan;
  model: YearModel;
  modelFor: (year: number) => YearModel | null;
  saveError: boolean;
  /** Erster Start ohne gespeicherte Daten: Einstieg zeigen. */
  firstRun: boolean;
  /** Einstieg abschliessen und die Startdaten speichern. */
  finishSetup: (data: AppData) => Promise<boolean>;
}

// Kontext über Hot-Reloads hinweg behalten (nur Entwicklung), sonst verliert App den Provider.
const StoreContext: Context<Store | null> = import.meta.hot?.data.storeContext ?? createContext<Store | null>(null);
if (import.meta.hot) import.meta.hot.data.storeContext = StoreContext;

interface StorageProblem {
  kind: 'load' | 'conflict' | 'save';
  message: string;
  raw: string | null;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loaded] = useState(loadData);
  const [data, setData] = useState<AppData>(() => loaded.status === 'loaded' ? loaded.data : initialData());
  const [firstRun, setFirstRun] = useState(() => loaded.status === 'empty');
  const [problem, setProblem] = useState<StorageProblem | null>(() => loaded.status === 'error'
    ? { kind: 'load', message: loaded.message, raw: loaded.raw } : null);
  const [importError, setImportError] = useState('');
  const [, markSaved] = useState(0);
  const dataRef = useRef(data);
  const rawRef = useRef(loaded.raw);
  const problemRef = useRef(problem);
  const pending = useRef(0);
  const generation = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const stopSaving = useCallback((next: StorageProblem) => {
    problemRef.current = next;
    setProblem(next);
  }, []);

  const acceptSnapshot = useCallback((snapshot: LoadResult) => {
    if (snapshot.status === 'error') {
      stopSaving({ kind: 'load', message: snapshot.message, raw: snapshot.raw });
      return;
    }
    generation.current += 1;
    const next = snapshot.status === 'loaded' ? snapshot.data : initialData();
    rawRef.current = snapshot.raw;
    dataRef.current = next;
    setFirstRun(snapshot.status === 'empty');
    problemRef.current = null;
    setProblem(null);
    setImportError('');
    setData(next);
  }, [stopSaving]);

  // Remote changes update an idle tab. Unsaved edits are kept for export instead
  // of being silently discarded or written over a newer snapshot.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      const snapshot = loadData();
      if (snapshot.raw === rawRef.current || problemRef.current) return;
      if (pending.current > 0) {
        stopSaving({ kind: 'conflict', message: 'Ein anderer Tab hat die Daten geändert. Deine lokalen Änderungen wurden nicht darüber gespeichert.', raw: snapshot.raw });
      } else {
        acceptSnapshot(snapshot);
      }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pending.current > 0 || (problemRef.current && problemRef.current.kind !== 'load')) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [acceptSnapshot, stopSaving]);

  const commit = useCallback((next: AppData, preservePrevious: boolean | 'sync' = false): Promise<boolean> => {
    if (problemRef.current) return Promise.resolve(false);
    const revision = generation.current;
    dataRef.current = next;
    setData(next);
    pending.current += 1;
    const operation = queue.current.then(async () => {
      if (revision !== generation.current || problemRef.current) return false;
      const result = await saveData(next, rawRef.current, {
        stillCurrent: () => revision === generation.current && !problemRef.current,
        preservePrevious,
      });
      if (revision !== generation.current) return false;
      if (result.status === 'saved') {
        rawRef.current = result.raw;
        // Refresh consumers such as the newly available recovery download.
        markSaved((revision) => revision + 1);
        return true;
      }
      if (result.status === 'conflict') {
        stopSaving({ kind: 'conflict', message: 'Ein anderer Tab hat die Daten geändert. Deine lokalen Änderungen wurden nicht darüber gespeichert.', raw: loadData().raw });
      } else if (result.status === 'error') {
        stopSaving({ kind: 'save', message: result.message, raw: rawRef.current });
      }
      return false;
    }).finally(() => { pending.current -= 1; });
    queue.current = operation;
    return operation;
  }, [stopSaving]);

  const update = useCallback((fn: (draft: AppData) => void) => {
    if (problemRef.current) return;
    const next = structuredClone(dataRef.current);
    fn(next);
    void commit(next);
  }, [commit]);

  const replaceAll = useCallback((next: AppData) => commit(parseAppData(JSON.stringify(next)), true), [commit]);

  const recoverWith = async (next: AppData, message: string) => {
    if (!window.confirm(message)) return;
    generation.current += 1;
    rawRef.current = loadData().raw;
    problemRef.current = null;
    setProblem(null);
    setImportError('');
    await commit(next, true);
  };

  const importRecovery = async (file: File) => {
    try {
      const next = parseAppData(await file.text());
      await recoverWith(next, 'Dieses Backup laden? Die bisher gespeicherten Daten werden vorher als Wiederherstellungskopie im Browser gesichert.');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Import fehlgeschlagen.');
    }
  };

  const updateYear = useCallback(
    (fn: (plan: YearPlan) => void) =>
      update((d) => {
        const plan = d.years[String(d.activeYear)];
        if (plan) fn(plan);
      }),
    [update],
  );

  const models = useMemo(() => {
    const map = new Map<number, YearModel>();
    const depot = summarizePortfolio(data.investments).totalChf;
    for (const plan of Object.values(data.years)) map.set(plan.year, buildYearModel(plan, data.accounts, data.profile, depot));
    return map;
  }, [data.years, data.accounts, data.profile, data.investments]);

  const plan = data.years[String(data.activeYear)] ?? Object.values(data.years)[0]!;
  const model = models.get(plan.year)!;

  const value: Store = {
    data,
    update,
    updateYear,
    getSyncSnapshot: () => firstRun ? null : dataRef.current,
    applySync: async (expected, next) => {
      if ((firstRun ? null : dataRef.current) !== expected) {
        throw new Error('Auf diesem Gerät wurden Daten geändert. Starte den Vergleich erneut.');
      }
      const validated = parseAppData(JSON.stringify(next));
      if (expected !== null && JSON.stringify(expected) === JSON.stringify(validated)) {
        await queue.current;
        if (!problemRef.current && dataRef.current === expected) return;
        throw new Error('Der aktuelle Datenstand hat sich geändert.');
      }
      if (!await commit(validated, 'sync')) throw new Error('Der Datenstand konnte nicht gespeichert werden.');
      setFirstRun(false);
    },
    replaceAll,
    plan,
    model,
    modelFor: (year) => models.get(year) ?? null,
    saveError: problem?.kind === 'save',
    firstRun,
    finishSetup: async (next) => {
      const saved = await replaceAll(next);
      if (saved) setFirstRun(false);
      return saved;
    },
  };
  if (problem) {
    return (
      <main className="mx-auto max-w-xl px-5 py-12">
        <h1 className="text-2xl font-semibold">{problem.kind === 'load' ? 'Gespeicherte Daten prüfen' : 'Änderungen sichern'}</h1>
        <p role="alert" className="mt-4 text-warn">{problem.message}</p>
        <p className="mt-3 text-sm text-muted">Die gespeicherten Daten bleiben erhalten. Lade eine Kopie herunter, bevor du einen anderen Stand lädst.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {problem.raw !== null && <button className="rounded-lg border border-line px-4 py-2" onClick={() => downloadRaw(problem.raw!, 'frank-backup-wiederherstellung.json')}>Gespeicherte Daten herunterladen</button>}
          {problem.kind !== 'load' && <button className="rounded-lg bg-accent px-4 py-2 text-bg" onClick={() => downloadJson(dataRef.current, 'frank-backup-lokale-aenderungen.json')}>Lokale Änderungen herunterladen</button>}
          <button className="rounded-lg border border-line px-4 py-2" onClick={() => {
            if (problem.kind === 'load' || window.confirm('Lokale Änderungen verwerfen und den zuletzt gespeicherten Stand laden? Sichere sie bei Bedarf zuerst als Datei.')) acceptSnapshot(loadData());
          }}>{problem.kind === 'load' ? 'Erneut laden' : 'Gespeicherten Stand laden'}</button>
        </div>
        <label className="mt-6 block text-sm">
          Gültiges Backup wiederherstellen
          <input className="mt-2 block w-full rounded-lg border border-line p-2" type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importRecovery(file);
            event.target.value = '';
          }} />
        </label>
        <button className="mt-6 rounded-lg border border-line px-4 py-2 text-sm" onClick={() => void recoverWith(initialData(), 'Mit Startdaten neu beginnen? Der bisher gespeicherte Inhalt wird vorher als Wiederherstellungskopie gesichert und kann unter «Daten & KI» heruntergeladen werden.')}>Mit Startdaten neu beginnen</button>
        {importError && <p role="alert" className="mt-3 text-danger">{importError}</p>}
      </main>
    );
  }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore ausserhalb des StoreProvider');
  return ctx;
}
