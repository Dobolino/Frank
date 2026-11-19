import { useState } from 'react';
import { useStore } from '../app/store';
import { Bar, Badge, Button, Card, Money, MoneyInput, PageHeader, Row, Select, TextInput, todayYm } from './shared';
import { goalStatus, setGoalMonthlyRate } from '../domain/goalsEngine';
import { dueMonths } from '../domain/budgetEngine';
import { uid } from '../seed/builders';
import { chf } from '../domain/money';
import type { SavingsGoal } from '../domain/types';
import { useDeletionNotice } from './DeletionNotice';

export function GoalsPage({ embedded = false }: { embedded?: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const { data, model, update, updateYear } = useStore();
  const { notice, remember } = useDeletionNotice(model.plan.year);
  const today = todayYm();
  const savingsAccounts = data.accounts.filter((a) => a.type === 'savings');

  const addGoal = () => {
    const id = uid('g');
    update((d) => {
      const [y, m] = today.split('-').map(Number) as [number, number];
      d.goals.push({
        id,
        name: 'Neue Reise',
        emoji: '✈️',
        target: chf(3000),
        saved: 0,
        dueDate: `${y + 1}-${String(m).padStart(2, '0')}`,
        accountId: savingsAccounts[0]?.id,
      });
    });
    setEditing(id);
  };

  const removeGoal = (goal: SavingsGoal) => {
    update(draft => {
      const index = draft.goals.findIndex(entry => entry.id === goal.id);
      if (index < 0) return;
      const [removed] = draft.goals.splice(index, 1);
      if (!removed) return;
      const links: { year: number; list: 'budget' | 'extrasAllocation'; id: string }[] = [];
      for (const plan of Object.values(draft.years)) {
        for (const list of ['budget', 'extrasAllocation'] as const) {
          for (const entry of plan[list]) {
            if (entry.goalId === removed.id) {
              links.push({ year: plan.year, list, id: entry.id });
              delete entry.goalId;
            }
          }
        }
      }
      remember(removed.name, current => {
        if (current.goals.some(entry => entry.id === removed.id)) return;
        const restored = { ...removed };
        if (restored.accountId && !current.accounts.some(account => account.id === restored.accountId)) delete restored.accountId;
        current.goals.splice(index, 0, restored);
        for (const link of links) {
          const entry = current.years[link.year]?.[link.list].find(item => item.id === link.id);
          if (entry && !entry.goalId) entry.goalId = restored.id;
        }
      });
      setEditing(null);
    });
  };

  return (
    <>
      {embedded ? (
        <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">Sparziele</h2><Button onClick={addGoal}>+ Sparziel</Button></div>
      ) : <PageHeader title="Sparziele" action={<Button variant="primary" onClick={addGoal}>+ Sparziel</Button>} />}
      {notice}
      {data.goals.length === 0 && (
        <Card>
          <p className="text-sm text-muted">Lege ein Sparziel mit Zielbetrag und Zieldatum an. Frank berechnet die nötige Monatsrate.</p>
        </Card>
      )}
      <div className="grid gap-2">
        {data.goals.map((g) => {
          const s = goalStatus(g, model.budget, today);
          const set = (fn: (x: typeof g) => void) => update((d) => { const x = d.goals.find((y) => y.id === g.id); if (x) fn(x); });
          const linked = model.budget.some((b) => b.goalId === g.id);
          const paused = linked && model.budget.filter((b) => b.goalId === g.id).every((b) => dueMonths(b.frequency).length === 0);
          return (
            <Card key={g.id} className="min-w-0">
              <button className="mb-2 flex min-h-11 w-full items-center justify-between gap-2 text-left" aria-expanded={editing===g.id} onClick={()=>setEditing(editing===g.id?null:g.id)}>
                <span className="min-w-0"><strong className="block truncate">{g.emoji} {g.name}</strong><small className="text-muted">Ziel · {g.dueDate.slice(5)}.{g.dueDate.slice(0,4)}</small></span>
                <span className="flex items-center gap-2">{s.onTrack ? <Badge tone="good">im Plan</Badge> : <Badge tone="warn">{s.overdue ? 'überfällig' : 'Rate zu tief'}</Badge>}<span aria-hidden="true">{editing===g.id?'⌄':'›'}</span></span>
              </button>
              <div className="mb-3">
                <div className="mb-1 flex justify-between text-sm">
                  <span className="num"><Money value={g.saved} decimals={false} /> von <Money value={g.target} decimals={false} /></span>
                  <span className="text-muted">{Math.round(s.progress * 100)} %</span>
                </div>
                <Bar value={s.progress} tone={s.onTrack ? 'good' : 'warn'} />
              </div>
              {editing===g.id && <>
              <div className="my-3 flex min-w-0 gap-2"><TextInput className="w-12 shrink-0 text-center" value={g.emoji ?? ''} onChange={(v) => set((x) => void (x.emoji = v))} ariaLabel="Emoji" /><TextInput value={g.name} onChange={(v) => set((x) => void (x.name = v))} ariaLabel="Name" className="min-w-0 flex-1" /></div>
              <div className="grid grid-cols-1 gap-x-4 text-sm">
                <label className="flex min-w-0 items-center justify-between gap-2 py-1"><span className="text-muted">Ziel</span><MoneyInput value={g.target} onChange={(v) => set((x) => void (x.target = v))} /></label>
                <label className="flex min-w-0 items-center justify-between gap-2 py-1"><span className="text-muted">Gespart</span><MoneyInput value={g.saved} onChange={(v) => set((x) => void (x.saved = v))} /></label>
                <label className="flex min-w-0 items-center justify-between gap-2 py-1">
                  <span className="text-muted">Bis</span>
                  <input type="month" value={g.dueDate} onChange={(e) => e.target.value && set((x) => void (x.dueDate = e.target.value))} className="min-w-0 max-w-full rounded-lg border border-line bg-bg px-2 py-1 text-sm" />
                </label>
                <label className="flex min-w-0 items-center justify-between gap-2 py-1">
                  <span className="text-muted">Konto</span>
                  <Select className="min-w-0 max-w-[65%]" value={g.accountId ?? ''} options={[{ value: '', label: '—' }, ...savingsAccounts.map((a) => ({ value: a.id, label: a.name }))]} onChange={(v) => set((x) => void (x.accountId = v || undefined))} />
                </label>
              </div>
              <div className="mt-3 border-t border-line pt-2">
                <Row label="Nötige Rate" hint={`${s.monthsLeft} Monate`} value={<Money value={s.requiredMonthly} decimals={false} />} />
                <Row label={`Budgetiert ${model.plan.year}`} value={<Money value={s.budgetedMonthly} decimals={false} />} />
                <Row label="Erreicht voraussichtlich" value={s.projectedDate ?? '–'} />
              </div>
              {linked && <p className="mt-3 text-xs text-muted">Die Rate wird auf alle verknüpften Posten verteilt. Unterposten bleiben erhalten; es gilt das hier gewählte Konto. {paused ? 'Ein pausierter Posten beginnt dafür wieder monatlich.' : 'Die Fälligkeiten bleiben erhalten.'}</p>}
              <div className="mt-3 flex flex-wrap justify-between gap-2">
                <Button
                  onClick={() =>
                    updateYear((p) => {
                      setGoalMonthlyRate(p.budget, g, s.requiredMonthly, uid('b'));
                    })
                  }
                >
                  {linked ? 'Budget auf nötige Rate setzen' : 'Als Budgetposten anlegen'}
                </Button>
                <Button variant="danger" onClick={() => removeGoal(g)}>Löschen</Button>
              </div>
              </>}
            </Card>
          );
        })}
      </div>
    </>
  );
}
