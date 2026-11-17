import { useState } from 'react';
import { useStore } from '../app/store';
import { Badge, Button, Card, Money, MoneyInput, PageHeader, Segmented, Select, Stat, TextInput, Toggle, Warnings, cx, usePref } from './shared';
import { CATEGORY_COLORS, MonthlyOutflowChart } from './charts';
import { ActualsCard } from './ActualsCard';
import { CATEGORY_LABELS, MONTHS, monthName, type BudgetCategory, type BudgetItem, type Frequency, type Month, type TaxTag } from '../domain/types';
import { frequencyLabel, itemAmount, monthlyAmount } from '../domain/budgetEngine';
import { uid } from '../seed/builders';

type FreqKind = Frequency['kind'];

const FREQ_OPTIONS: { value: FreqKind; label: string }[] = [
  { value: 'monthly', label: 'monatlich' },
  { value: 'quarterly', label: 'quartalsweise' },
  { value: 'yearly', label: 'jährlich' },
  { value: 'custom', label: 'bestimmte Monate' },
];

const TAG_OPTIONS: { value: TaxTag | ''; label: string }[] = [
  { value: '', label: '—' },
  { value: 'insurance', label: 'Versicherungsprämie (Steuerabzug)' },
  { value: 'pillar3a', label: 'Säule 3a (Steuerabzug)' },
  { value: 'taxProvision', label: 'Steuerrückstellung' },
];

function changeFrequency(kind: FreqKind, current: Frequency): Frequency {
  switch (kind) {
    case 'monthly':
      return { kind };
    case 'yearly':
      return { kind, month: current.kind === 'yearly' ? current.month : 1 };
    case 'quarterly':
      return { kind, months: [3, 6, 9, 12] };
    case 'custom':
      return { kind, months: current.kind === 'custom' ? current.months : [6, 12] };
  }
}

const VIEWS = ['plan', 'actual', 'year'] as const;
type View = (typeof VIEWS)[number];

export function BudgetPage() {
  const { model, updateYear, data } = useStore();
  const [view, setView] = usePref<View>('budget.view', 'plan', VIEWS);
  const [onlyAccount, setOnlyAccount] = useState<string>('');
  const [openId, setOpenId] = useState<string | null>(null);

  const accountOptions = [{ value: '', label: 'Lohnkonto' }, ...data.accounts.filter((a) => a.type !== 'checking').map((a) => ({ value: a.id, label: a.name }))];

  const edit = (id: string, fn: (item: BudgetItem) => void) =>
    updateYear((plan) => {
      const item = plan.budget.find((b) => b.id === id);
      if (item) fn(item);
    });

  const addItem = (category: BudgetCategory) => {
    const id = uid('b');
    updateYear((plan) => {
      plan.budget.push({ id, category, name: 'Neuer Posten', amount: 0, frequency: { kind: 'monthly' } });
    });
    setOpenId(id);
  };

  const visible = (b: BudgetItem) => !onlyAccount || (b.accountId ?? '') === onlyAccount;
  const s = model.summary;

  return (
    <>
      <PageHeader title={`Budget ${model.plan.year}`} />
      <Segmented
        className="mt-4"
        ariaLabel="Ansicht"
        value={view}
        onChange={setView}
        options={[
          { value: 'plan', label: 'Plan' },
          { value: 'actual', label: 'Ist' },
          { value: 'year', label: 'Jahr' },
        ]}
      />
      <Warnings items={model.warnings.filter((w) => w.includes('Steuerrückstellung'))} />

      {view === 'year' && (
        <Card title="Ausgaben übers Jahr" className="mt-4">
          <MonthlyOutflowChart items={model.budget} />
        </Card>
      )}

      {view === 'actual' && (
        <div className="mt-4">
          <ActualsCard />
        </div>
      )}

      {view === 'plan' && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            <Stat label="Ausgaben" sub="pro Monat" value={<Money value={s.expensesMonthly} decimals={false} />} />
            <Stat label="Einnahmen" sub="pro Monat" value={<Money value={s.incomeMonthly} decimals={false} />} />
            <Stat label="Rest" sub="pro Monat" value={<Money value={s.saldoMonthly} decimals={false} />} tone={s.saldoMonthly >= 0 ? 'good' : 'bad'} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <span className="text-xs text-muted">Beträge pro Monat. Tippe auf einen Posten zum Bearbeiten.</span>
            <Select value={onlyAccount} onChange={setOnlyAccount} options={[{ value: '', label: 'alle Konten' }, ...accountOptions.slice(1)]} ariaLabel="Nach Konto filtern" />
          </div>

          <div className="mt-3 space-y-4">
            {s.categories.map((cat) => {
              const items = cat.items.filter(visible);
              if (onlyAccount && items.length === 0) return null;
              return (
                <Card
                  key={cat.category}
                  title={
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[cat.category] }} />
                      {CATEGORY_LABELS[cat.category]}
                    </span>
                  }
                  action={
                    <div className="num text-sm text-muted">
                      <Money value={cat.monthly} decimals={false} /> / Mt
                    </div>
                  }
                >
                  <ul className="-mx-2">
                    {items.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        open={openId === item.id}
                        toggle={() => setOpenId(openId === item.id ? null : item.id)}
                        edit={edit}
                        accountOptions={accountOptions}
                      />
                    ))}
                  </ul>
                  <Button variant="ghost" className="mt-2" onClick={() => addItem(cat.category)}>
                    + Posten
                  </Button>
                </Card>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">
            Im Jahr: Ausgaben <Money value={s.expensesYearly} decimals={false} />, Einnahmen inkl. 13. Lohn <Money value={s.incomeYearly} decimals={false} />, Überschuss{' '}
            <Money value={s.surplusYearly} decimals={false} />.
          </p>
        </>
      )}
    </>
  );
}

function ItemRow({
  item,
  open,
  toggle,
  edit,
  accountOptions,
}: {
  item: BudgetItem;
  open: boolean;
  toggle: () => void;
  edit: (id: string, fn: (i: BudgetItem) => void) => void;
  accountOptions: { value: string; label: string }[];
}) {
  const { updateYear, data, model } = useStore();
  const hasChildren = !!item.children && item.children.length > 0;
  const auto = item.autoFromTax && item.taxTag === 'taxProvision';
  const f = item.frequency;
  const account = item.accountId ? data.accounts.find((a) => a.id === item.accountId)?.name : undefined;

  return (
    <li className="border-t border-line/60 first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className={cx('flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-panel-2', open && 'bg-panel-2')}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate">{item.name}</span>
            {item.taxTag === 'pillar3a' && <Badge tone="info">3a</Badge>}
            {item.taxTag === 'insurance' && <Badge tone="info">Abzug</Badge>}
            {auto && <Badge tone="good">auto</Badge>}
            {item.goalId && <Badge tone="good">Ziel</Badge>}
          </span>
          {(f.kind !== 'monthly' || account) && (
            <span className="block truncate text-xs text-muted">
              {f.kind !== 'monthly' && (
                <>
                  {frequencyLabel(f)} · <Money value={itemAmount(item)} decimals={false} />
                </>
              )}
              {f.kind !== 'monthly' && account && ' · '}
              {account}
            </span>
          )}
        </span>
        <Money value={monthlyAmount(item)} decimals={false} className="shrink-0" />
        <span aria-hidden className={cx('shrink-0 text-muted transition-transform', open && 'rotate-90')}>›</span>
      </button>
      {open && (
            <div className="mx-2 mb-3 grid gap-4 rounded-xl bg-panel-2 p-4 md:grid-cols-2">
              <div className="space-y-3">
                <label className="block text-xs text-muted">
                  Name
                  <TextInput className="mt-1 block w-full" value={item.name} onChange={(v) => edit(item.id, (i) => void (i.name = v))} />
                </label>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block text-xs text-muted">
                    Betrag pro Fälligkeit
                    <div className="mt-1">
                      {hasChildren || auto ? (
                        <span className="num inline-block py-1.5 text-sm text-text" title={auto ? 'Aus der Steuerberechnung' : 'Summe der Unterposten'}>
                          <Money value={itemAmount(item)} />
                        </span>
                      ) : (
                        <MoneyInput value={item.amount} onChange={(v) => edit(item.id, (i) => void (i.amount = v))} ariaLabel={`Betrag ${item.name}`} />
                      )}
                    </div>
                  </label>
                  <div className="text-xs text-muted">
                    Fälligkeit
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Select value={f.kind} options={FREQ_OPTIONS} onChange={(k) => edit(item.id, (i) => void (i.frequency = changeFrequency(k, i.frequency)))} ariaLabel="Häufigkeit" />
                      {f.kind === 'yearly' && (
                        <Select
                          value={f.month}
                          options={MONTHS.map((m) => ({ value: m, label: monthName(m) }))}
                          onChange={(m) => edit(item.id, (i) => void (i.frequency = { kind: 'yearly', month: m }))}
                          ariaLabel="Fälligkeitsmonat"
                        />
                      )}
                    </div>
                  </div>
                </div>
                <label className="block text-xs text-muted">
                  Bezahlt von
                  <Select className="mt-1 block w-full" value={item.accountId ?? ''} options={accountOptions} onChange={(v) => edit(item.id, (i) => void (i.accountId = v || undefined))} ariaLabel="Konto" />
                </label>
                {(f.kind === 'custom' || f.kind === 'quarterly') && (
                  <div>
                    <div className="mb-1 text-xs text-muted">Fällig in</div>
                    <div className="flex flex-wrap gap-1">
                      {MONTHS.map((m) => {
                        const on = f.months.includes(m);
                        return (
                          <button
                            key={m}
                            aria-pressed={on}
                            onClick={() =>
                              edit(item.id, (i) => {
                                const months = on ? f.months.filter((x) => x !== m) : [...f.months, m].sort((a, b) => a - b);
                                i.frequency = { kind: 'custom', months: months as Month[] };
                              })
                            }
                            className={cx('rounded-md px-2 py-1 text-xs', on ? 'bg-accent text-bg' : 'bg-bg text-muted hover:text-text')}
                          >
                            {monthName(m)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <label className="block text-xs text-muted">
                  Steuerliche Bedeutung
                  <Select
                    className="mt-1 block w-full"
                    value={item.taxTag ?? ''}
                    options={TAG_OPTIONS}
                    onChange={(v) => edit(item.id, (i) => void (i.taxTag = (v || undefined) as TaxTag | undefined))}
                  />
                </label>
                {item.taxTag === 'taxProvision' && (
                  <Toggle
                    checked={!!item.autoFromTax}
                    onChange={(v) => edit(item.id, (i) => void (i.autoFromTax = v))}
                    label={<span>Automatisch aus Steuerberechnung (<Money value={model.taxProvisionSuggested} /> / Mt)</span>}
                  />
                )}
                {data.goals.length > 0 && (
                  <label className="block text-xs text-muted">
                    Sparziel
                    <Select
                      className="mt-1 block w-full"
                      value={item.goalId ?? ''}
                      options={[{ value: '', label: '—' }, ...data.goals.map((g) => ({ value: g.id, label: g.name }))]}
                      onChange={(v) => edit(item.id, (i) => void (i.goalId = v || undefined))}
                    />
                  </label>
                )}
                <label className="block text-xs text-muted">
                  Notiz
                  <TextInput className="mt-1 block w-full" value={item.note ?? ''} onChange={(v) => edit(item.id, (i) => void (i.note = v || undefined))} />
                </label>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted">Unterposten (z. B. einzelne Abos)</div>
                <div className="space-y-1">
                  {(item.children ?? []).map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <TextInput
                        className="min-w-0 flex-1"
                        value={c.name}
                        onChange={(v) => edit(item.id, (i) => void (i.children!.find((x) => x.id === c.id)!.name = v))}
                        ariaLabel="Unterposten"
                      />
                      <MoneyInput ariaLabel={`Betrag ${c.name}`} value={c.amount} onChange={(v) => edit(item.id, (i) => void (i.children!.find((x) => x.id === c.id)!.amount = v))} />
                      <Button variant="ghost" className="px-2" onClick={() => edit(item.id, (i) => void (i.children = i.children!.filter((x) => x.id !== c.id)))} title="Entfernen" ariaLabel={`${c.name} entfernen`}>
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  className="mt-1"
                  onClick={() => edit(item.id, (i) => void (i.children = [...(i.children ?? []), { id: uid('s'), name: 'Neu', amount: 0 }]))}
                >
                  + Unterposten
                </Button>
                <div className="mt-6 text-right">
                  <Button variant="danger" onClick={() => updateYear((p) => void (p.budget = p.budget.filter((b) => b.id !== item.id)))}>
                    Posten löschen
                  </Button>
                </div>
              </div>
            </div>
      )}
    </li>
  );
}
