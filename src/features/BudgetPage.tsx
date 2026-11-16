import { useState } from 'react';
import { useStore } from '../app/store';
import { Badge, Button, Card, Money, MoneyInput, PageHeader, Select, TextInput, Toggle, Warnings, cx } from './shared';
import { CATEGORY_LABELS, MONTHS, monthName, type BudgetCategory, type BudgetItem, type Frequency, type Month, type TaxTag } from '../domain/types';
import { itemAmount, monthlyAmount, yearlyAmount } from '../domain/budgetEngine';
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

export function BudgetPage() {
  const { model, updateYear, data } = useStore();
  const [onlyAccount, setOnlyAccount] = useState<string>('');

  const accountOptions = [{ value: '', label: 'Lohnkonto' }, ...data.accounts.filter((a) => a.type !== 'checking').map((a) => ({ value: a.id, label: a.name }))];

  const edit = (id: string, fn: (item: BudgetItem) => void) =>
    updateYear((plan) => {
      const item = plan.budget.find((b) => b.id === id);
      if (item) fn(item);
    });

  const addItem = (category: BudgetCategory) =>
    updateYear((plan) => {
      plan.budget.push({ id: uid('b'), category, name: 'Neuer Posten', amount: 0, frequency: { kind: 'monthly' } });
    });

  const visible = (b: BudgetItem) => !onlyAccount || (b.accountId ?? '') === onlyAccount;

  return (
    <>
      <PageHeader
        title={`Budget ${model.plan.year}`}
        subtitle="Beträge pro Fälligkeit. Monats- und Jahreswerte werden immer aus denselben Zahlen berechnet."
        action={
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">Filter Konto</span>
            <Select value={onlyAccount} onChange={setOnlyAccount} options={[{ value: '', label: 'alle' }, ...accountOptions.slice(1)]} ariaLabel="Nach Konto filtern" />
          </div>
        }
      />
      <Warnings items={model.warnings.filter((w) => w.includes('Steuerrückstellung'))} />

      <div className="mt-4 space-y-4">
        {model.summary.categories.map((cat) => (
          <Card
            key={cat.category}
            title={CATEGORY_LABELS[cat.category]}
            action={
              <div className="num text-sm text-muted">
                <Money value={cat.monthly} /> / Mt · <Money value={cat.yearly} decimals={false} /> / Jahr
              </div>
            }
          >
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`Budget ${CATEGORY_LABELS[cat.category]}`}>
              <table className="block w-full table-fixed text-sm sm:table sm:min-w-[1004px]">
                <thead className="hidden sm:table-header-group">
                  <tr className="text-left text-xs text-muted">
                    <th className="sticky left-0 z-10 w-44 bg-panel pb-2 font-normal">Posten</th>
                    <th className="w-32 pb-2 text-right font-normal">Betrag</th>
                    <th className="w-56 pb-2 pl-3 font-normal">Fälligkeit</th>
                    <th className="w-40 pb-2 font-normal">Bezahlt von</th>
                    <th className="w-24 pb-2 text-right font-normal">pro Monat</th>
                    <th className="w-20 pb-2 text-right font-normal">pro Jahr</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="block sm:table-row-group">
                  {cat.items.filter(visible).map((item) => (
                    <ItemRow key={item.id} item={item} edit={edit} accountOptions={accountOptions} />
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="ghost" className="mt-2" onClick={() => addItem(cat.category)}>
              + Posten
            </Button>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-muted">Total Ausgaben</div>
            <div className="num text-xl font-semibold">
              <Money value={model.summary.expensesMonthly} /> <span className="text-sm text-muted">/ Mt</span>
            </div>
            <div className="num text-muted"><Money value={model.summary.expensesYearly} /> / Jahr</div>
          </div>
          <div>
            <div className="text-muted">Einnahmen</div>
            <div className="num text-xl font-semibold"><Money value={model.summary.incomeMonthly} /> <span className="text-sm text-muted">/ Mt</span></div>
            <div className="num text-muted"><Money value={model.summary.incomeYearly} /> / Jahr inkl. 13. Lohn</div>
          </div>
          <div>
            <div className="text-muted">Rest</div>
            <div className={cx('num text-xl font-semibold', model.summary.saldoMonthly >= 0 ? 'text-accent' : 'text-danger')}>
              <Money value={model.summary.saldoMonthly} /> <span className="text-sm text-muted">/ Mt</span>
            </div>
            <div className="num text-muted">Jahresüberschuss <Money value={model.summary.surplusYearly} /></div>
          </div>
        </div>
      </Card>
    </>
  );
}

function ItemRow({
  item,
  edit,
  accountOptions,
}: {
  item: BudgetItem;
  edit: (id: string, fn: (i: BudgetItem) => void) => void;
  accountOptions: { value: string; label: string }[];
}) {
  const { updateYear, data, model } = useStore();
  const [open, setOpen] = useState(false);
  const hasChildren = !!item.children && item.children.length > 0;
  const auto = item.autoFromTax && item.taxTag === 'taxProvision';
  const f = item.frequency;

  return (
    <>
      <tr className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line/60 py-3 align-middle sm:table-row sm:py-0">
        <td className="col-span-2 min-w-0 bg-panel py-1.5 sm:sticky sm:left-0 sm:z-10 sm:pr-2">
          <div className="flex items-center gap-2">
            <TextInput value={item.name} onChange={(v) => edit(item.id, (i) => void (i.name = v))} className="w-full min-w-0 border-transparent bg-transparent hover:border-line" ariaLabel="Name" />
            {item.taxTag === 'pillar3a' && <Badge tone="info">3a</Badge>}
            {item.taxTag === 'insurance' && <Badge tone="info">Abzug</Badge>}
            {auto && <Badge tone="good">auto</Badge>}
            {item.goalId && <Badge tone="good">Ziel</Badge>}
          </div>
        </td>
        <td className="col-span-2 flex items-center justify-between gap-2 py-1.5 text-right sm:table-cell">
          <span className="text-xs text-muted sm:hidden">Betrag pro Fälligkeit</span>
          {hasChildren || auto ? (
            <span className="num pr-2.5 text-muted" title={auto ? 'Aus der Steuerberechnung' : 'Summe der Unterposten'}>
              <Money value={itemAmount(item)} />
            </span>
          ) : (
            <MoneyInput value={item.amount} onChange={(v) => edit(item.id, (i) => void (i.amount = v))} ariaLabel={`Betrag ${item.name}`} />
          )}
        </td>
        <td className={cx("col-span-2 py-1.5 sm:table-cell sm:pl-3", !open && "hidden")} >
          <span className="mb-1 block text-xs text-muted sm:hidden">Fälligkeit</span>
          <div className="flex flex-wrap items-center gap-1">
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
        </td>
        <td className={cx("col-span-2 py-1.5 sm:table-cell", !open && "hidden")}>
          <span className="mb-1 block text-xs text-muted sm:hidden">Bezahlt von</span>
          <Select className="w-full" value={item.accountId ?? ''} options={accountOptions} onChange={(v) => edit(item.id, (i) => void (i.accountId = v || undefined))} ariaLabel="Konto" />
        </td>
        <td className="num hidden py-1.5 text-right sm:table-cell"><Money value={monthlyAmount(item)} /></td>
        <td className="num hidden py-1.5 text-right text-muted sm:table-cell"><Money value={yearlyAmount(item)} decimals={false} /></td>
        <td className="col-span-2 flex items-center justify-between gap-2 py-1.5 text-right sm:table-cell">
          <span className="text-left text-xs text-muted sm:hidden"><Money value={monthlyAmount(item)} /> / Mt<br /><Money value={yearlyAmount(item)} decimals={false} /> / Jahr</span>
          <Button variant="ghost" onClick={() => setOpen(!open)} title="Details" ariaLabel={`Details ${item.name}`} className="px-2">
            <span className="sm:hidden">{open ? 'Schliessen' : 'Details'}</span><span className="hidden sm:inline">{open ? '▾' : '⋯'}</span>
          </Button>
        </td>
      </tr>
      {open && (
        <tr className="block sm:table-row">
          <td colSpan={7} className="block pb-3 sm:table-cell">
            <div className="grid gap-4 rounded-xl bg-panel-2 p-4 md:grid-cols-2">
              <div className="space-y-3">
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
          </td>
        </tr>
      )}
    </>
  );
}
