import { Fragment, useState } from 'react';
import { useStore } from '../app/store';
import { Badge, Button, Money, MoneyInput, Segmented, Select, TextInput, Toggle, Warnings, cx, usePref } from './shared';
import { CATEGORY_COLORS, MonthlyOutflowChart } from './charts';
import { formatPercent, sum } from '../domain/money';
import './budgetPage.css';
import { CATEGORY_LABELS, MONTHS, monthName, type BudgetCategory, type BudgetItem, type Frequency, type Month, type TaxTag } from '../domain/types';
import { frequencyLabel, itemAmount, monthlyAmount, totalsByCategory, yearlyAmount, yearlyByTaxTag, type CategoryTotal } from '../domain/budgetEngine';
import { uid } from '../seed/builders';
import { FIXED_COST_PRESETS, hasFixedCost, type FixedCostPreset } from '../domain/fixedCostPresets';
import { useDeletionNotice } from './DeletionNotice';

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

const PERIODS = ['month', 'year'] as const;
const CHARTS = ['bar', 'ring'] as const;

function BudgetAllocation({ categories }: { categories: CategoryTotal[] }) {
  const [chart, setChart] = usePref('budget.allocation', 'bar' as 'bar' | 'ring', CHARTS);
  const included = categories.filter(category => category.yearly > 0);
  const total = sum(categories.map(category => category.yearly));
  const available = total > 0 && !categories.some(category => category.yearly < 0);
  // Every segment is drawn from its share of the unrounded yearly total.
  let offset = 0;
  const parts = included.map(({ category, yearly }) => {
    const start = offset;
    const share = available ? yearly / total : 0;
    offset += share;
    return { category, start, share };
  });

  return (
    <section aria-label="Budgetaufteilung" className="budget-allocation">
      <div className="budget-allocation-head">
        <h3>Budgetaufteilung</h3>
        <Select ariaLabel="Grafik zur Budgetaufteilung" value={chart} onChange={setChart}
          options={[{ value: 'bar', label: 'Balken' }, { value: 'ring', label: 'Ring' }]} />
      </div>
      {available ? (
        <div key={chart} className={cx('budget-share', chart === 'ring' && 'budget-share-ring')}>
          {chart === 'ring' ? (
            <svg viewBox="0 0 100 100" aria-hidden="true">
              {parts.map(({ category, share, start }) => (
                <circle key={category} cx="50" cy="50" r="37" fill="none" pathLength="100" strokeWidth="12"
                  stroke={CATEGORY_COLORS[category]} transform="rotate(-90 50 50)"
                  strokeDasharray={`${100 * share} ${100 * (1 - share)}`} strokeDashoffset={-100 * start} />
              ))}
            </svg>
          ) : (
            <div className="budget-share-track" aria-hidden="true">
              {parts.map(({ category, share }) => <span key={category} style={{ flex: share, backgroundColor: CATEGORY_COLORS[category] }} />)}
            </div>
          )}
          <ul className="budget-share-legend">
            {parts.map(({ category, share }) => (
              <li key={category}>
                <i aria-hidden style={{ backgroundColor: CATEGORY_COLORS[category] }} />
                {CATEGORY_LABELS[category]} <span>{formatPercent(share, 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : <p className="text-xs text-muted">{total === 0 && included.length === 0 ? 'Lege deinen ersten Budgetposten an.' : 'Eine Anteilsgrafik erfordert positive Kategoriesummen.'}</p>}
    </section>
  );
}

const ALL_ACCOUNTS = 'all';
const CHECKING = 'checking-account';

export function BudgetPage() {
  const { model, updateYear, data } = useStore();
  const [period, setPeriod] = usePref('budget.period', 'month' as 'month' | 'year', PERIODS);
  const [onlyAccount, setOnlyAccount] = useState(ALL_ACCOUNTS);
  const [openId, setOpenId] = useState<string | null>(null);
  const { notice, remember } = useDeletionNotice(model.plan.year);
  const accountOptions = [{ value: '', label: 'Lohnkonto' }, ...data.accounts.filter(a => a.type !== 'checking').map(a => ({ value: a.id, label: a.name }))];
  const filterOptions = [{ value: ALL_ACCOUNTS, label: 'Alle Konten' }, { value: CHECKING, label: 'Lohnkonto' }, ...accountOptions.slice(1)];
  const defaultAccount = onlyAccount === ALL_ACCOUNTS || onlyAccount === CHECKING ? undefined : onlyAccount;
  const checkingIds = new Set(data.accounts.filter(a => a.type === 'checking').map(a => a.id));
  const visibleItems = onlyAccount === ALL_ACCOUNTS ? model.budget : model.budget.filter(item => onlyAccount === CHECKING
    ? !item.accountId || checkingIds.has(item.accountId)
    : item.accountId === onlyAccount);
  const groups = totalsByCategory(visibleItems);
  const annual = period === 'year';
  const s = model.summary;
  const allowance = annual ? model.salary.totals.expenses : (model.plan.salary.expenseAllowance?.monthly ?? 0);
  const payout = annual ? model.salary.totals.net : model.salary.regularNet;
  const income = (annual ? s.incomeYearly : s.incomeMonthly) - allowance;
  const planned = annual ? s.expensesYearly : s.expensesMonthly;
  const provision = yearlyByTaxTag(model.budget, 'taxProvision');

  const edit = (id: string, fn: (item: BudgetItem) => void) =>
    updateYear(plan => {
      const item = plan.budget.find(b => b.id === id);
      if (item) fn(item);
    });

  const visibleFixed = visibleItems.filter(item => item.category === 'fixed');
  const missingCosts = Object.values(FIXED_COST_PRESETS)
    .filter(preset => !hasFixedCost(model.budget, preset))
    .map(preset => ({ preset, afterId: visibleFixed.find(item => item.name === preset.baseName)?.id }));

  const addItem = (category: BudgetCategory, preset?: FixedCostPreset, afterId?: string) => {
    const id = uid('b');
    updateYear(plan => {
      if (preset && hasFixedCost(plan.budget, preset)) return;
      const added: BudgetItem = { id, category, name: preset?.name ?? 'Neuer Posten', amount: 0, frequency: { kind: 'monthly' } };
      if (defaultAccount) added.accountId = defaultAccount;
      if (preset?.taxTag) added.taxTag = preset.taxTag;
      const anchor = afterId ? plan.budget.findIndex(item => item.id === afterId) : -1;
      plan.budget.splice(anchor < 0 ? plan.budget.length : anchor + 1, 0, added);
      setOpenId(id);
    });
  };

  const costButtons = (afterId?: string) => missingCosts.filter(cost => cost.afterId === afterId).map(({ preset }) => (
    <li key={preset.name}>
      <Button variant="ghost" className="budget-add" onClick={() => addItem('fixed', preset, afterId)}>+ {preset.name}</Button>
    </li>
  ));

  const removeItem = (item: BudgetItem) => {
    updateYear(plan => {
      if (plan.year !== model.plan.year) return;
      const index = plan.budget.findIndex(entry => entry.id === item.id);
      if (index < 0) return;
      // Keep the stored item, including the inputs of an automatic tax provision.
      const [removed] = plan.budget.splice(index, 1);
      if (!removed) return;
      const year = plan.year;
      remember(removed.name, draft => {
        const budget = draft.years[year]?.budget;
        if (!budget || budget.some(entry => entry.id === removed.id)) return;
        const restored = { ...removed };
        if (restored.goalId && !draft.goals.some(goal => goal.id === restored.goalId)) delete restored.goalId;
        if (restored.accountId && !draft.accounts.some(account => account.id === restored.accountId)) delete restored.accountId;
        budget.splice(index, 0, restored);
      });
      setOpenId(null);
    });
  };

  return (
    <div className="budget-page">
      <header className="budget-heading">
        <div><p>Finanzplan {model.plan.year}</p><h1>Budget</h1></div>
        <Segmented value={period} onChange={setPeriod} ariaLabel="Budgetzeitraum"
          options={[{ value: 'month', label: 'Monat' }, { value: 'year', label: 'Jahr' }]} />
      </header>
      <div className="budget-layout">
        <div className="budget-plan-column">
          <section className="budget-card budget-plan">
            <h2 className="budget-card-heading">{annual ? 'Jahresplan' : 'Regulärer Monat'} <span>CHF</span></h2>
            <div className="budget-money-grid">
              <div><span>Einnahmen</span><Money value={income} /></div>
              <div><span>Verplant</span><Money value={planned} /></div>
              <div><span>Planrest</span><Money className={income >= planned ? 'text-accent' : 'text-danger'} value={income - planned} /></div>
            </div>
            <details className="budget-calculation">
              <summary>Wie ergibt sich der Planrest?</summary>
              <p>Nettolohn {annual && model.otherIncomeYearly !== 0 && <>und weitere Einnahmen </>}von CHF <Money value={income} /> abzüglich CHF <Money value={planned} /> verplant.
              {' '}Darin enthalten sind CHF <Money value={annual ? provision : Math.round(provision / 12)} /> Steuerrückstellung. Spesen werden separat ausbezahlt.</p>
            </details>
            <BudgetAllocation categories={s.categories} />
          </section>
          <a className="budget-income budget-card" href="#salary">
            <h2 className="budget-card-heading">Einnahmen <span>Lohn &amp; Spesen bearbeiten ›</span></h2>
            <div className="budget-money-grid">
              <div><span>Nettolohn</span><Money value={payout - allowance} /></div>
              <div><span>+ Spesen</span><Money className="text-info" value={allowance} /></div>
              <div><span>Auszahlung</span><Money value={payout} /></div>
            </div>
          </a>
          <Warnings items={model.warnings.filter(w => w.includes('Steuerrückstellung'))} />
        </div>
        <section className="budget-groups" aria-label="Budgetgruppen">
          <div className="budget-groups-head"><div><h2>Budgetgruppen</h2><p>CHF pro {annual ? 'Jahr' : 'Monat'}</p></div>
            <Select ariaLabel="Budgetgruppen nach Konto filtern" value={onlyAccount} onChange={setOnlyAccount} options={filterOptions} />
          </div>
          {notice}
          {groups.map(cat => (
            <details className="budget-group" key={cat.category} open={cat.category === 'fixed' ? true : undefined}>
              <summary>
                <i aria-hidden style={{ backgroundColor: CATEGORY_COLORS[cat.category] }} />
                <span>{CATEGORY_LABELS[cat.category]}</span>
                <Money value={annual ? cat.yearly : cat.monthly} />
                <span className="budget-chevron" aria-hidden>›</span>
              </summary>
              <div className="budget-group-body">
                <ul>
                  {cat.items.map(item => (
                    <Fragment key={item.id}>
                      <ItemRow item={item} annual={annual} open={openId === item.id}
                        toggle={() => setOpenId(openId === item.id ? null : item.id)} edit={edit} remove={removeItem} accountOptions={accountOptions} />
                      {cat.category === 'fixed' && costButtons(item.id)}
                    </Fragment>
                  ))}
                  {cat.category === 'fixed' && costButtons()}
                </ul>
                <Button variant="ghost" className="budget-add" onClick={() => addItem(cat.category)}>+ Posten</Button>
              </div>
            </details>
          ))}
          <a className="budget-actuals" href="#expenses">Buchungen und Soll/Ist ansehen <span aria-hidden>↗</span></a>
        </section>
        <section className="budget-card budget-outflow">
          <h2 className="budget-card-heading">Abflüsse pro Monat <span>{model.plan.year} · CHF</span></h2>
          <MonthlyOutflowChart items={model.budget} />
        </section>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  annual,
  open,
  toggle,
  edit,
  remove,
  accountOptions,
}: {
  item: BudgetItem;
  annual: boolean;
  open: boolean;
  toggle: () => void;
  edit: (id: string, fn: (i: BudgetItem) => void) => void;
  remove: (item: BudgetItem) => void;
  accountOptions: { value: string; label: string }[];
}) {
  const { data, model } = useStore();
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
        <Money value={annual ? yearlyAmount(item) : monthlyAmount(item)} className="shrink-0" />
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
                  <Button variant="danger" onClick={() => remove(item)}>
                    Posten löschen
                  </Button>
                </div>
              </div>
            </div>
      )}
    </li>
  );
}
