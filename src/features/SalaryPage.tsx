import { lazy, Suspense, useRef, useState } from 'react';
import { useStore } from '../app/store';
import { Badge, Button, Card, Collapsible, Money, MoneyInput, NumberInput, PageHeader, Row, Segmented, Select, Toggle, cx } from './shared';
import { MONTHS, monthName, type Month, type SalaryInput } from '../domain/types';
import { totalRate, lohnausweisNet } from '../domain/salaryEngine';
import { formatChf, formatPercent } from '../domain/money';
import { monthlyPayslipFields } from '../domain/monthlyPayslipRecord';
const SalaryCertificateImport = lazy(() => import('./SalaryCertificateImport').then(m => ({ default: m.SalaryCertificateImport })));

const monthOptions = MONTHS.map((m) => ({ value: m, label: monthName(m) }));

export function SalaryPage() {
  const { model, updateYear } = useStore();
  const s = model.plan.salary;
  const res = model.salary;
  const spesen = s.expenseAllowance?.monthly ?? 0;
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const payslips = model.plan.monthlyPayslips ?? {};
  const savedPeriods = Object.keys(payslips).sort().reverse();
  const [month, setMonth] = useState<Month>(() => (savedPeriods[0] ? Number(savedPeriods[0].slice(5)) : new Date().getMonth() + 1) as Month);
  const editor = useRef<HTMLDetailsElement>(null);
  const selected = res.months[month - 1]!;
  const annual = period === 'year';
  const selectedPeriod = `${model.plan.year}-${String(month).padStart(2, '0')}`;
  const actual = annual ? undefined : payslips[selectedPeriod];
  function showPayslip(ym: string) {
    if (!ym) return;
    setMonth(Number(ym.slice(5)) as Month);
    setPeriod('month');
  }
  const payout = annual ? res.totals.net : selected.net;
  const expenses = annual ? res.totals.expenses : selected.expenses;
  const minimum = Math.min(0, ...res.months.map(m => m.net));
  const maximum = Math.max(0, ...res.months.map(m => m.net));
  const scale = Math.max(1, maximum - minimum);
  const selectedMonth = new Intl.DateTimeFormat('de-CH', { month: 'long' }).format(new Date(model.plan.year, month - 1, 1));
  const editSalary = () => {
    if (!editor.current) return;
    editor.current.open = true;
    editor.current.scrollIntoView({ block: 'start' });
    editor.current.querySelector<HTMLInputElement>('input[aria-label="Bruttolohn"]')?.focus({ preventScroll: true });
  };
  const set = (fn: (s: SalaryInput) => void) => updateYear((p) => fn(p.salary));
  const rate = (key: keyof SalaryInput['rates'], label: string) => (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-muted">{label}</span>
      <NumberInput
        value={Math.round(s.rates[key] * 100000) / 1000}
        step={0.01}
        suffix="%"
        onChange={(v) => set((x) => void (x.rates[key] = v / 100))}
        ariaLabel={label}
      />
    </div>
  );

  return (
    <>
      <PageHeader title="Einnahmen & Lohn" subtitle={`Lohnplan ${model.plan.year}`} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Segmented ariaLabel="Lohnzeitraum" value={period} onChange={setPeriod}
          options={[{ value: 'month', label: 'Monat' }, { value: 'year', label: 'Jahr' }]} />
        <Button variant="primary" onClick={editSalary}>Lohn &amp; Spesen ändern</Button>
      </div>
      <div className="grid items-start gap-3 md:grid-cols-2">
        <Card>
          <h2 className="text-sm text-muted">{annual ? 'Auszahlung im Jahr' : actual ? `Geplante Auszahlung im ${selectedMonth}` : `Auszahlung im ${selectedMonth}`}</h2>
          <p className="my-2 flex flex-wrap items-baseline gap-2 text-accent">
            <strong className="break-all text-4xl font-semibold tracking-tight"><Money value={payout} /></strong>
            <span className="text-sm font-semibold">CHF</span>
          </p>
          <div className="mt-3 border-t border-line pt-2">
            <Row label="Nettolohn" value={<Money value={payout - expenses} />} />
            <Row label="Spesenvergütung" value={<span className="font-semibold text-info"><Money value={expenses} signed /></span>} />
          </div>
        </Card>
        <Card title={`Auszahlungen ${model.plan.year}`}>
          <div className="flex items-end gap-0.5" aria-label="Monat für die Auszahlung wählen">
            {res.months.map(m => {
              const extras = m.thirteenthGross > 0 || m.bonusGross > 0;
              const label = `${monthName(m.month)} · ${formatChf(m.net, { prefix: true })}${extras ? ' inkl. 13. Lohn oder Bonus' : ''}`;
              return <button key={m.month} type="button" className="min-w-0 flex-1 rounded focus-visible:outline-2 focus-visible:outline-accent"
                title={label} aria-label={label} aria-pressed={!annual && month === m.month}
                onClick={() => { setMonth(m.month); setPeriod('month'); }}>
                <span className="relative mx-auto block h-20 w-3/5">
                  <span aria-hidden="true" className={cx('absolute inset-x-0 rounded-sm', m.net < 0 ? 'bg-danger' : extras ? 'bg-info' : 'bg-accent')}
                    style={{ height: `${100 * Math.abs(m.net) / scale}%`, bottom: `${100 * (Math.min(0, m.net) - minimum) / scale}%` }} />
                </span>
                <span aria-hidden="true" className={cx('mt-1 block border-b-2 pb-1 text-[10px] sm:text-xs',
                  !annual && month === m.month ? 'border-accent text-text' : 'border-transparent text-muted')}>{monthName(m.month).slice(0, 1)}</span>
              </button>;
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span><i className="mr-1 inline-block size-2 rounded-full bg-accent" />Regulär</span>
            {minimum < 0 && <span><i className="mr-1 inline-block size-2 rounded-full bg-danger" />Negative Auszahlung</span>}
            {res.months.some(m => m.thirteenthGross > 0 || m.bonusGross > 0) &&
              <span><i className="mr-1 inline-block size-2 rounded-full bg-info" />Mit 13. Lohn oder Bonus</span>}
          </div>
        </Card>
      </div>
      {savedPeriods.length > 0 && (
        <Card title="Gespeicherte Monatsabrechnung" className="mt-4" action={
          <Select ariaLabel="Gespeicherte Monatsabrechnung wählen" value={actual ? selectedPeriod : ''} onChange={showPayslip}
            options={[
              ...(!actual ? [{ value: '', label: 'Monat wählen …' }] : []),
              ...savedPeriods.map(ym => ({ value: ym, label: monthName(Number(ym.slice(5)) as Month) + ' ' + model.plan.year })),
            ]}/>
        }>
          {actual ? <div className="text-sm">
            {monthlyPayslipFields.map(({key, label}) => actual[key] !== undefined &&
              <Row key={key} label={label} strong={key === 'payout'} value={<span><Money value={actual[key]}/> CHF</span>}/>)}
          </div> : <p className="text-sm text-muted">Wähle eine gespeicherte Abrechnung, um ihre Beträge zu sehen.</p>}
        </Card>
      )}
      <Suspense fallback={<p role="status" className="py-3 text-sm text-muted">Lohnimport wird geöffnet …</p>}>
        <SalaryCertificateImport key={model.plan.year} onMonthlySaved={showPayslip} />
      </Suspense>
      <details ref={editor} className="mt-4 scroll-mt-24 rounded-2xl border border-line bg-panel">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold">
          Lohn, Spesen und Abzüge bearbeiten <span aria-hidden="true" className="text-muted">⌄</span>
        </summary>
        <div className="grid items-start gap-3 border-t border-line p-3 md:grid-cols-2">
          <Card title="Grundlohn">
            <div className="flex items-center justify-between gap-3 py-1 text-sm">
              <span className="text-muted">Brutto pro Monat</span>
              <MoneyInput value={s.grossMonthly} onChange={(v) => set((x) => void (x.grossMonthly = v))} ariaLabel="Bruttolohn" />
            </div>
            <div className="flex items-center justify-between gap-3 py-1 text-sm">
              <span className="text-muted">BVG pro Monat</span>
              <MoneyInput value={s.bvgMonthly} onChange={(v) => set((x) => void (x.bvgMonthly = v))} ariaLabel="BVG" />
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-1 text-xs text-muted">Lohnänderungen unter dem Jahr</div>
              {s.changes.map((c, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 py-1 text-sm">
                  <span className="text-muted">ab</span>
                  <Select ariaLabel={`Lohnänderung ${idx + 1}: ab Monat`} value={c.fromMonth} options={monthOptions} onChange={(m) => set((x) => void (x.changes[idx]!.fromMonth = m))} />
                  <MoneyInput ariaLabel={`Lohnänderung ${idx + 1}: Bruttolohn`} value={c.grossMonthly} onChange={(v) => set((x) => void (x.changes[idx]!.grossMonthly = v))} />
                  <Button variant="ghost" ariaLabel={`Lohnänderung ${idx + 1} löschen`} className="px-2" onClick={() => set((x) => void x.changes.splice(idx, 1))}>×</Button>
                </div>
              ))}
              <Button variant="ghost" onClick={() => set((x) => void x.changes.push({ fromMonth: 7, grossMonthly: x.grossMonthly }))}>+ Lohnerhöhung</Button>
            </div>
          </Card>

          <Card
            title="Spesen"
            action={
              <Badge tone={spesen === 0 ? 'default' : s.expenseAllowance?.taxable ? 'warn' : 'good'}>
                {spesen === 0 ? 'keine erfasst' : s.expenseAllowance?.taxable ? 'wird versteuert' : 'steuerfrei'}
              </Badge>
            }
          >
            <div className="flex items-center justify-between gap-3 py-1 text-sm">
              <span className="text-muted" title="Pauschalspesen gemäss Lohnausweis Ziffer 13.2 – ohne AHV/ALV/BVG">Pauschalspesen pro Monat</span>
              <MoneyInput
                value={spesen}
                onChange={(v) => set((x) => void (x.expenseAllowance = { monthly: v, taxable: x.expenseAllowance?.taxable ?? false }))}
                ariaLabel="Pauschalspesen"
              />
            </div>
            <Row label="Spesen im Jahr" value={<Money value={res.totals.expenses} />} />
            {spesen > 0 && (
              <div className="py-1">
                <Toggle
                  checked={!s.expenseAllowance!.taxable}
                  onChange={(v) => set((x) => void (x.expenseAllowance = { ...x.expenseAllowance!, taxable: !v }))}
                  label={<span className="text-sm">Pauschalspesen in der Steuerprognose als steuerfrei behandeln</span>}
                />
              </div>
            )}
            <p className="mt-2 text-xs text-muted">
              Frank führt Pauschalspesen separat vom Monatslohn. Die steuerliche Behandlung richtet sich nach deiner Abrechnung und den geltenden Spesenregeln.
              Erfasste effektive Spesen siehst du in der gespeicherten Monatsabrechnung oder im Lohnausweis unter Ziffer 13.1.
            </p>
          </Card>
          <Card title="Sozialabzüge">
            {rate('ahv', 'AHV/IV/EO')}
            {rate('alv', 'ALV')}
            {rate('nbuv', 'NBUV')}
            {rate('ktg', 'KTG')}
            <Row strong label="Total" value={formatPercent(totalRate(s.rates), 2)} />
          </Card>

          <Card title="13. Lohn & Bonus">
            <div className="mb-1 text-xs text-muted">13. Monatslohn</div>
            {s.thirteenth.map((t, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2 py-1 text-sm">
                <Select ariaLabel={`13. Lohn ${idx + 1}: Monat`} value={t.month} options={monthOptions} onChange={(m) => set((x) => void (x.thirteenth[idx]!.month = m))} />
                {t.amount !== undefined ? (
                  <MoneyInput ariaLabel={`13. Lohn ${idx + 1}: Betrag`} value={t.amount} onChange={(v) => set((x) => void (x.thirteenth[idx]!.amount = v))} />
                ) : (
                  <NumberInput ariaLabel={`13. Lohn ${idx + 1}: Anteil in Prozent`} value={(t.share ?? 0) * 100} step={5} suffix="% Lohn" onChange={(v) => set((x) => void (x.thirteenth[idx]!.share = v / 100))} />
                )}
                <Button variant="ghost" ariaLabel={`13. Lohn ${idx + 1} löschen`} className="px-2" onClick={() => set((x) => void x.thirteenth.splice(idx, 1))}>×</Button>
              </div>
            ))}
            <Button variant="ghost" onClick={() => set((x) => void x.thirteenth.push({ month: 12, share: 0.5 }))}>+ Auszahlung</Button>
            <div className="mt-3 mb-1 border-t border-line pt-3 text-xs text-muted">Bonus</div>
            {s.bonuses.map((b, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2 py-1 text-sm">
                <Select ariaLabel={`Bonus ${idx + 1}: Monat`} value={b.month} options={monthOptions} onChange={(m) => set((x) => void (x.bonuses[idx]!.month = m))} />
                <MoneyInput ariaLabel={`Bonus ${idx + 1}: Bruttobetrag`} value={b.gross} onChange={(v) => set((x) => void (x.bonuses[idx]!.gross = v))} />
                <Button variant="ghost" ariaLabel={`Bonus ${idx + 1} löschen`} className="px-2" onClick={() => set((x) => void x.bonuses.splice(idx, 1))}>×</Button>
              </div>
            ))}
            <Button variant="ghost" onClick={() => set((x) => void x.bonuses.push({ month: 3, gross: 0 }))}>+ Bonus</Button>
          </Card>
        </div>
      </details>

      <details className="mt-3 rounded-2xl border border-line bg-panel">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold">
          Monatsabrechnungen und Lohnausweis <span aria-hidden="true" className="text-muted">⌄</span>
        </summary>
        <div className="border-t border-line p-4">
          <p className="mb-3 text-xs text-muted lg:hidden">↔ Die Tabelle lässt sich seitlich scrollen.</p>
          <div className="overflow-x-auto" role="region" aria-label="Monatsübersicht Lohn" tabIndex={0}>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-right text-xs text-muted">
                  <th className="sticky left-0 z-10 bg-panel pb-2 pr-3 text-left font-normal">Monat</th>
                  <th className="pb-2 font-normal">Brutto</th>
                  <th className="pb-2 font-normal">13. / Bonus</th>
                  <th className="pb-2 font-normal">Sozialabzüge</th>
                  <th className="pb-2 font-normal">BVG</th>
                  {res.totals.expenses > 0 && <th className="pb-2 font-normal">Spesen</th>}
                  <th className="pb-2 font-normal">Auszahlung</th>
                </tr>
              </thead>
              <tbody className="num text-right">
                {res.months.map((m) => (
                  <tr key={m.month} className={cx('border-t border-line/60', m.extrasNet > 0 && 'bg-info/5')}>
                    <td className="sticky left-0 z-10 bg-panel py-1.5 pr-3 text-left">{monthName(m.month)}</td>
                    <td><Money value={m.baseGross} /></td>
                    <td className="text-info">{m.thirteenthGross + m.bonusGross > 0 ? <Money value={m.thirteenthGross + m.bonusGross} /> : '–'}</td>
                    <td className="text-muted">−<Money value={m.socialTotal} /></td>
                    <td className="text-muted">−<Money value={m.bvg} /></td>
                    {res.totals.expenses > 0 && <td className="text-muted">+<Money value={m.expenses} /></td>}
                    <td className="font-semibold"><Money value={m.net} /></td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line font-semibold">
                  <td className="sticky left-0 z-10 bg-panel py-2 pr-3 text-left">Total</td>
                  <td><Money value={res.totals.gross - res.totals.thirteenthGross - res.totals.bonusGross} /></td>
                  <td className="text-info"><Money value={res.totals.thirteenthGross + res.totals.bonusGross} /></td>
                  <td>−<Money value={res.totals.social} /></td>
                  <td>−<Money value={res.totals.bvg} /></td>
                  {res.totals.expenses > 0 && <td>+<Money value={res.totals.expenses} /></td>}
                  <td className="text-accent"><Money value={res.totals.net} /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Collapsible summary={<span>Lohnausweis-Werte für die Steuererklärung</span>}>
              <Row label="Bruttolohn total (Ziffer 8)" value={<Money value={res.totals.gross} />} />
              <Row label="AHV/IV/EO/ALV/NBUV (Ziffer 9)" value={<>−<Money value={model.plan.tax.ktgDeductible ? res.totals.social : res.totals.socialWithoutKtg} /></>} />
              <Row label="BVG ordentlich (Ziffer 10.1)" value={<>−<Money value={res.totals.bvg} /></>} />
              <Row strong label="Nettolohn (Ziffer 11)" value={<Money value={lohnausweisNet(res, model.plan.tax.ktgDeductible, s.expenseAllowance?.taxable ?? false)} />} />
              {res.totals.expenses > 0 && (
                <Row
                  label="Pauschalspesen (Ziffer 13.2)"
                  hint={s.expenseAllowance?.taxable ? 'wird versteuert' : 'steuerfrei'}
                  value={<Money value={res.totals.expenses} />}
                />
              )}
              <p className="mt-2 text-xs text-muted">Abweichungen von wenigen Franken zum echten Lohnausweis entstehen durch Rundungen des Arbeitgebers.</p>
            </Collapsible>
          </div>
        </div>
      </details>
    </>
  );
}
