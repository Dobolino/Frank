import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from '../app/store';
import type { AppData } from '../domain/types';

type Undo = { year: number; label: string; restore: (data: AppData) => void };

export function useDeletionNotice(year: number) {
  const { update } = useStore();
  const [pending, setPending] = useState<Undo | null>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const statusId = useId();
  useEffect(() => setPending(null), [year]);
  useEffect(() => { if (pending) undoButton.current?.focus(); }, [pending]);

  const notice = pending?.year === year && (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-panel-2 px-3 text-sm">
      <span id={statusId} role="status">«{pending.label}» gelöscht.</span>
      <button type="button" ref={undoButton} aria-describedby={statusId} className="min-h-11 shrink-0 rounded-lg px-2 font-medium text-accent" onClick={() => {
        update(draft => { if (draft.activeYear === year) pending.restore(draft); });
        setPending(null);
      }}>Rückgängig</button>
    </div>
  );
  return { notice, remember: (label: string, restore: Undo['restore']) => setPending({ year, label, restore }) };
}
