import { useStore } from '../app/store';
import { Bar, Badge, Button, Card, Money, MoneyInput, PageHeader, Row, Select, TextInput, todayYm } from './shared';
import { goalStatus } from '../domain/goalsEngine';
import { uid } from '../seed/builders';
import { chf } from '../domain/money';

export function GoalsPage() {
  const { data, model, update, updateYear } = useStore();
  const today = todayYm();
  const savingsAccounts = data.accounts.filter((a) => a.type === 'savings');

  const addGoal = () =>
    update((d) => {
      const [y, m] = today.split('-').map(Number) as [number, number];
      d.goals.push({
        id: uid('g'),
        name: 'Neue Reise',
        emoji: '✈️',
        target: chf(3000),
        saved: 0,
        dueDate: `${y + 1}-${String(m).padStart(2, '0')}`,
        accountId: savingsAccounts[0]?.id,
      });
    });

  return (
    <>
      <PageHeader
        title="Sparziele"
        subtitle="Reisen, Anschaffungen, Notgroschen – mit Monatsrate und Prognose."
        action={<Button variant="primary" onClick={addGoal}>+ Sparziel</Button>}
      />
      {data.goals.length === 0 && (
        <Card>
          <p className="text-sm text-muted">Noch keine Sparziele. Lege z. B. «Reise Japan, CHF 4'000 bis Mai 2027» an – die App rechnet dir die Monatsrate aus und legt sie auf Wunsch als Budgetposten an.</p>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {data.goals.map((g) => {
          const s = goalStatus(g, model.budget, today);
          const set = (fn: (x: typeof g) => void) => update((d) => { const x = d.goals.find((y) => y.id === g.id); if (x) fn(x); });
          const linked = model.budget.some((b) => b.goalId === g.id);
          return (
            <Card
              key={g.id}
              title={<span className="flex items-center gap-2 normal-case"><TextInput className="w-12 text-center" value={g.emoji ?? ''} onChange={(v) => set((x) => void (x.emoji = v))} ariaLabel="Emoji" /><TextInput value={g.name} onChange={(v) => set((x) => void (x.name = v))} ariaLabel="Name" className="text-base font-semibold text-text" /></span>}
              action={s.onTrack ? <Badge tone="good">im Plan</Badge> : <Badge tone="warn">Rate zu tief</Badge>}
            >
              <div className="mb-3">
                <div className="mb-1 flex justify-between text-sm">
                  <span className="num"><Money value={g.saved} decimals={false} /> von <Money value={g.target} decimals={false} /></span>
                  <span className="text-muted">{Math.round(s.progress * 100)} %</span>
                </div>
                <Bar value={s.progress} tone={s.onTrack ? 'good' : 'warn'} />
              </div>
              <div className="grid grid-cols-2 gap-x-4 text-sm">
                <label className="flex items-center justify-between py-1"><span className="text-muted">Ziel</span><MoneyInput value={g.target} onChange={(v) => set((x) => void (x.target = v))} /></label>
                <label className="flex items-center justify-between py-1"><span className="text-muted">Gespart</span><MoneyInput value={g.saved} onChange={(v) => set((x) => void (x.saved = v))} /></label>
                <label className="flex items-center justify-between py-1">
                  <span className="text-muted">Bis</span>
                  <input type="month" value={g.dueDate} onChange={(e) => e.target.value && set((x) => void (x.dueDate = e.target.value))} className="rounded-lg border border-line bg-bg px-2 py-1 text-sm" />
                </label>
                <label className="flex items-center justify-between py-1">
                  <span className="text-muted">Konto</span>
                  <Select value={g.accountId ?? ''} options={[{ value: '', label: '—' }, ...savingsAccounts.map((a) => ({ value: a.id, label: a.name }))]} onChange={(v) => set((x) => void (x.accountId = v || undefined))} />
                </label>
              </div>
              <div className="mt-3 border-t border-line pt-2">
                <Row label="Nötige Rate" hint={`${s.monthsLeft} Monate`} value={<Money value={s.requiredMonthly} decimals={false} />} />
                <Row label={`Budgetiert ${model.plan.year}`} value={<Money value={s.budgetedMonthly} decimals={false} />} />
                <Row label="Erreicht voraussichtlich" value={s.projectedDate ?? '–'} />
              </div>
              <div className="mt-3 flex flex-wrap justify-between gap-2">
                <Button
                  onClick={() =>
                    updateYear((p) => {
                      const existing = p.budget.find((b) => b.goalId === g.id);
                      if (existing) existing.amount = s.requiredMonthly;
                      else
                        p.budget.push({
                          id: uid('b'),
                          category: 'savings',
                          name: `Sparziel: ${g.name}`,
                          amount: s.requiredMonthly,
                          frequency: { kind: 'monthly' },
                          accountId: g.accountId,
                          goalId: g.id,
                        });
                    })
                  }
                >
                  {linked ? 'Budget auf nötige Rate setzen' : 'Als Budgetposten anlegen'}
                </Button>
                <Button variant="danger" onClick={() => update((d) => {
                  d.goals = d.goals.filter((x) => x.id !== g.id);
                  for (const y of Object.values(d.years)) for (const b of y.budget) if (b.goalId === g.id) b.goalId = undefined;
                })}>Löschen</Button>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
