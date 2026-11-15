import { useStore } from '../app/store';
import { Button, Card, Collapsible, Money, MoneyInput, NumberInput, PageHeader, Row, Select, cx } from './shared';
import { MONTHS, monthName, type Month, type SalaryInput } from '../domain/types';
import { totalRate } from '../domain/salaryEngine';
import { lohnausweisNet } from '../domain/salaryEngine';
import { formatPercent } from '../domain/money';

const monthOptions = MONTHS.map((m) => ({ value: m, label: monthName(m) }));

export function SalaryPage() {
  const { model, updateYear } = useStore();
  const s = model.plan.salary;
  const res = model.salary;
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
      <PageHeader title={`Lohn ${model.plan.year}`} subtitle="Brutto → Netto mit Sozialabzügen, BVG, 13. Monatslohn und Bonus." />

      <div className="grid gap-4 lg:grid-cols-3">
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
              <div key={idx} className="flex items-center gap-2 py-1 text-sm">
                <span className="text-muted">ab</span>
                <Select value={c.fromMonth} options={monthOptions} onChange={(m) => set((x) => void (x.changes[idx]!.fromMonth = m))} />
                <MoneyInput value={c.grossMonthly} onChange={(v) => set((x) => void (x.changes[idx]!.grossMonthly = v))} />
                <Button variant="ghost" className="px-2" onClick={() => set((x) => void x.changes.splice(idx, 1))}>×</Button>
              </div>
            ))}
            <Button variant="ghost" onClick={() => set((x) => void x.changes.push({ fromMonth: 7, grossMonthly: x.grossMonthly }))}>+ Lohnerhöhung</Button>
          </div>
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
            <div key={idx} className="flex items-center gap-2 py-1 text-sm">
              <Select value={t.month} options={monthOptions} onChange={(m) => set((x) => void (x.thirteenth[idx]!.month = m))} />
              {t.amount !== undefined ? (
                <MoneyInput value={t.amount} onChange={(v) => set((x) => void (x.thirteenth[idx]!.amount = v))} />
              ) : (
                <NumberInput value={(t.share ?? 0) * 100} step={5} suffix="% Lohn" onChange={(v) => set((x) => void (x.thirteenth[idx]!.share = v / 100))} />
              )}
              <Button variant="ghost" className="px-2" onClick={() => set((x) => void x.thirteenth.splice(idx, 1))}>×</Button>
            </div>
          ))}
          <Button variant="ghost" onClick={() => set((x) => void x.thirteenth.push({ month: 12, share: 0.5 }))}>+ Auszahlung</Button>
          <div className="mt-3 mb-1 border-t border-line pt-3 text-xs text-muted">Bonus</div>
          {s.bonuses.map((b, idx) => (
            <div key={idx} className="flex items-center gap-2 py-1 text-sm">
              <Select value={b.month} options={monthOptions} onChange={(m) => set((x) => void (x.bonuses[idx]!.month = m as Month))} />
              <MoneyInput value={b.gross} onChange={(v) => set((x) => void (x.bonuses[idx]!.gross = v))} />
              <Button variant="ghost" className="px-2" onClick={() => set((x) => void x.bonuses.splice(idx, 1))}>×</Button>
            </div>
          ))}
          <Button variant="ghost" onClick={() => set((x) => void x.bonuses.push({ month: 3, gross: 0 }))}>+ Bonus</Button>
        </Card>
      </div>

      <Card title="Monatsübersicht" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-right text-xs text-muted">
                <th className="pb-2 text-left font-normal">Monat</th>
                <th className="pb-2 font-normal">Brutto</th>
                <th className="pb-2 font-normal">13. / Bonus</th>
                <th className="pb-2 font-normal">Sozialabzüge</th>
                <th className="pb-2 font-normal">BVG</th>
                <th className="pb-2 font-normal">Netto</th>
              </tr>
            </thead>
            <tbody className="num text-right">
              {res.months.map((m) => (
                <tr key={m.month} className={cx('border-t border-line/60', m.extrasNet > 0 && 'bg-info/5')}>
                  <td className="py-1.5 text-left">{monthName(m.month)}</td>
                  <td><Money value={m.baseGross} /></td>
                  <td className="text-info">{m.thirteenthGross + m.bonusGross > 0 ? <Money value={m.thirteenthGross + m.bonusGross} /> : '–'}</td>
                  <td className="text-muted">−<Money value={m.socialTotal} /></td>
                  <td className="text-muted">−<Money value={m.bvg} /></td>
                  <td className="font-semibold"><Money value={m.net} /></td>
                </tr>
              ))}
              <tr className="border-t-2 border-line font-semibold">
                <td className="py-2 text-left">Total</td>
                <td><Money value={res.totals.gross - res.totals.thirteenthGross - res.totals.bonusGross} /></td>
                <td className="text-info"><Money value={res.totals.thirteenthGross + res.totals.bonusGross} /></td>
                <td>−<Money value={res.totals.social} /></td>
                <td>−<Money value={res.totals.bvg} /></td>
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
            <Row strong label="Nettolohn (Ziffer 11)" value={<Money value={lohnausweisNet(res, model.plan.tax.ktgDeductible)} />} />
            <p className="mt-2 text-xs text-muted">Abweichungen von wenigen Franken zum echten Lohnausweis entstehen durch Rundungen des Arbeitgebers.</p>
          </Collapsible>
        </div>
      </Card>
    </>
  );
}
