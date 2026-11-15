import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppData, YearPlan } from '../domain/types';
import { buildYearModel, type YearModel } from '../domain/yearModel';
import { initialData } from '../seed';
import { loadData, saveData } from '../storage/storage';

interface Store {
  data: AppData;
  /** Ändert die Daten über eine Kopie (unveränderliche Updates). */
  update: (fn: (draft: AppData) => void) => void;
  /** Ändert das aktuell gewählte Jahr. */
  updateYear: (fn: (plan: YearPlan) => void) => void;
  replaceAll: (data: AppData) => void;
  plan: YearPlan;
  model: YearModel;
  modelFor: (year: number) => YearModel | null;
  saveError: boolean;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData() ?? initialData());
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    setSaveError(!saveData(data));
  }, [data]);

  const update = useCallback((fn: (draft: AppData) => void) => {
    setData((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

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
    for (const plan of Object.values(data.years)) map.set(plan.year, buildYearModel(plan, data.accounts));
    return map;
  }, [data.years, data.accounts]);

  const plan = data.years[String(data.activeYear)] ?? Object.values(data.years)[0]!;
  const model = models.get(plan.year)!;

  const value: Store = {
    data,
    update,
    updateYear,
    replaceAll: setData,
    plan,
    model,
    modelFor: (year) => models.get(year) ?? null,
    saveError,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore ausserhalb des StoreProvider');
  return ctx;
}
