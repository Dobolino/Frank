import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../app/store';
import { formatChf, parseChf } from '../domain/money';
import type { MonthlyPayslip } from '../domain/monthlyPayslip';
import { isPlanMonth, monthlyPayslipFields, saveMonthlyPayslip, type MonthlyPayslipRecord } from '../domain/monthlyPayslipRecord';
import { baseGrossFor, lohnausweisNet } from '../domain/salaryEngine';
import type { Month } from '../domain/types';
import type { SalaryCertificate } from '../domain/salaryCertificate';
import {
  salaryCertificateFields, validSalaryCertificateRecord,
  type CertificateField, type SalaryCertificateRecord,
} from '../domain/salaryCertificateRecord';
import { readSalaryCertificate } from '../imports/readSalaryCertificate';
import { emptyYear } from '../seed/builders';
import { Button, Card, Money } from './shared';

const inputStyle = 'min-h-11 rounded-lg border border-line bg-bg px-2 text-sm';

function parseAmount(text: string): number | null {
  const plain = text.trim().replace(/['’\s]/g, '');
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(plain)) return null;
  const value = parseChf(plain);
  return Number.isSafeInteger(value) ? value : null;
}

function displayDate(value: string) {
  return value.split('-').reverse().join('.');
}

function CertificateReview({ document, cancel, saved }: {
  document: SalaryCertificate;
  cancel: () => void;
  saved: () => void;
}) {
  const { data, update } = useStore();
  const [yearText, setYearText] = useState(document.year?.toString() ?? '');
  const [from, setFrom] = useState(document.period?.from ?? '');
  const [to, setTo] = useState(document.period?.to ?? '');
  const [amounts, setAmounts] = useState(() => Object.fromEntries(
    salaryCertificateFields.flatMap(({ key }) =>
      document[key] !== undefined ? [[key, formatChf(document[key])]] : []
    )
  ) as Partial<Record<CertificateField, string>>);
  const [applyExpenses, setApplyExpenses] = useState(false);
  const [monthlyText, setMonthlyText] = useState<string | null>(null);
  const [taxChoice, setTaxChoice] = useState('');
  const [error, setError] = useState('');
  const year = Number(yearText);
  const target = data.years[yearText];
  const validYear = /^[1-9]\d{3}$/.test(yearText);
  const flat = parseAmount(amounts.flatExpenses ?? '');
  const fullYear = from === yearText + '-01-01' && to === yearText + '-12-31';
  const proposed = flat !== null && fullYear ? formatChf(Math.round(flat / 12)) : '';
  const monthly = parseAmount(monthlyText ?? proposed);
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const record: SalaryCertificateRecord = {};
    for (const { key, label } of salaryCertificateFields) {
      const text = amounts[key]?.trim();
      if (!text) continue;
      const value = parseAmount(text);
      if (value === null) { setError('Bitte prüfe den Betrag für «' + label + '».'); return; }
      record[key] = value;
    }
    if (from || to) {
      if (from.slice(0, 4) !== yearText || to.slice(0, 4) !== yearText || from > to) {
        setError('Prüfe das Jahr und die beiden Daten des bescheinigten Zeitraums.');
        return;
      }
      record.period = { from, to };
    }
    if (!validYear || !validSalaryCertificateRecord(record)) {
      setError('Zum Übernehmen braucht es ein vierstelliges Jahr und mindestens einen gültigen Betrag.');
      return;
    }
    const useMonthly = applyExpenses && flat !== null && flat > 0;
    if (useMonthly && (monthly === null || monthly < 0 || !taxChoice)) {
      setError('Prüfe den monatlichen Betrag und wähle seine steuerliche Behandlung.');
      return;
    }
    update(d => {
      const plan = d.years[yearText] ?? (d.years[yearText] = emptyYear(year, d.years[d.activeYear]));
      plan.salaryCertificate = record;
      if (useMonthly && monthly !== null) plan.salary.expenseAllowance = { monthly, taxable: taxChoice === 'taxable' };
      d.activeYear = year;
    });
    saved();
  };

  return <form className="space-y-3" onSubmit={save}>
    <label className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
      Jahr des Lohnausweises
      <input className={inputStyle + ' w-24'} inputMode="numeric" required pattern="[1-9][0-9]{3}" maxLength={4}
        placeholder="JJJJ" value={yearText} onChange={e => setYearText(e.target.value)} />
    </label>
    {document.period && <fieldset>
      <legend className="mb-1 text-xs text-muted">Bescheinigter Zeitraum</legend>
      <div className="flex flex-wrap gap-2">
        <label className="text-sm">Von <input type="date" className={inputStyle} value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="text-sm">Bis <input type="date" className={inputStyle} value={to} onChange={e => setTo(e.target.value)} /></label>
      </div>
    </fieldset>}
    {validYear && !target && <p className="text-sm text-muted">Beim Übernehmen legt Frank den Plan für {year} mit den Planwerten von {data.activeYear} als Vorlage an.</p>}
    {target?.salaryCertificate && <p className="text-sm text-warn">Für {year} ist bereits ein Lohnausweis gespeichert. Mit «Ausweis ersetzen» ersetzt du dessen Vergleichswerte.</p>}
    {document.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-warn">
      {document.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
    </ul>}
    <fieldset>
      <legend className="mb-1 text-sm font-semibold">Jahresbeträge in CHF</legend>
      <p className="mb-2 text-xs text-muted">Prüfe die Beträge am Original und ergänze fehlende Werte. Leere Felder werden ausgelassen.</p>
      {salaryCertificateFields.map(({ key, number, label }) =>
        <label className="flex items-center justify-between gap-2 border-t border-line py-1 text-sm" key={key}>
          <span><small className="text-muted">{number} · </small>{label}</span>
          <input className={inputStyle + ' w-28 text-right tabular-nums'} inputMode="decimal" value={amounts[key] ?? ''}
            aria-label={label + ' in CHF'} onChange={e => setAmounts(previous => ({ ...previous, [key]: e.target.value }))} />
        </label>
      )}
    </fieldset>
    {flat !== null && flat > 0 && <fieldset className="space-y-2 rounded-xl bg-panel-2 p-3">
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={applyExpenses} onChange={e => setApplyExpenses(e.target.checked)} />
        Pauschalspesen für alle zwölf Monate in den Lohnplan übernehmen
      </label>
      {applyExpenses && <>
        <p className="text-xs text-muted">{fullYear ? 'Der Vorschlag verteilt die ausgewiesenen Pauschalspesen auf zwölf Monate. Du kannst deinen vereinbarten Monatsbetrag einsetzen.' : 'Ein volles Kalenderjahr ist im Ausweis nicht belegt. Trage deine vereinbarte Monatspauschale ein.'}</p>
        <label className="flex flex-wrap items-center justify-between gap-2 text-sm">Monatspauschale in CHF
          <input className={inputStyle + ' w-28 text-right'} required inputMode="decimal" value={monthlyText ?? proposed} onChange={e => setMonthlyText(e.target.value)} />
        </label>
        <label className="block text-sm">Steuerbehandlung im Plan
          <select className={inputStyle + ' mt-1 block w-full'} required value={taxChoice} onChange={e => setTaxChoice(e.target.value)}>
            <option value="">Behandlung auswählen …</option>
            <option value="exempt">Steuerfrei</option><option value="taxable">Zum steuerbaren Einkommen rechnen</option>
          </select>
        </label>
        {monthly !== null && monthly >= 0 && <p className="text-xs text-muted">Geplante Pauschalspesen im Jahr · CHF <Money value={monthly * 12} /></p>}
        {target?.salary.expenseAllowance && <p className="text-xs text-muted">
          Bisher im Monatsplan · CHF <Money value={target.salary.expenseAllowance.monthly} /> ({target.salary.expenseAllowance.taxable ? 'steuerbar' : 'steuerfrei'}).
        </p>}
      </>}
    </fieldset>}
    {error && <p className="text-sm text-warn" role="alert">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="ghost" onClick={cancel}>Abbrechen</Button>
      <Button type="submit" variant="primary">{target?.salaryCertificate ? 'Ausweis ersetzen' : 'Jahreswerte übernehmen'}</Button>
    </div>
  </form>;
}

const recurringFields = [
  { key: 'baseGross', label: 'Grundlohn' },
  { key: 'pension', label: 'BVG-Abzug' },
  { key: 'flatExpenses', label: 'Pauschalspesen' },
] as const;
type PlanField = (typeof recurringFields)[number]['key'];

function MonthlyReview({ slip, cancel, saved }: { slip: MonthlyPayslip; cancel: () => void; saved: (period: string) => void }) {
  const { data, update } = useStore();
  const [period, setPeriod] = useState(slip.period ?? '');
  const [selected, setSelected] = useState<Partial<Record<PlanField, boolean>>>({});
  const [amounts, setAmounts] = useState<Partial<Record<keyof MonthlyPayslipRecord, string>>>(() => Object.fromEntries(
    monthlyPayslipFields.filter(({ key }) => slip[key] !== undefined).map(({ key }) => [key, formatChf(slip[key]!)])
  ));
  const [taxChoice, setTaxChoice] = useState('');
  const [error, setError] = useState('');
  const year = Number(period.slice(0, 4)), month = Number(period.slice(5)) as Month;
  const validPeriod = isPlanMonth(period, year);
  const target = data.years[String(year)];
  const currentValues = target && validPeriod ? {
    baseGross: baseGrossFor(target.salary, month), pension: target.salary.bvgMonthly,
    flatExpenses: target.salary.expenseAllowance?.monthly ?? 0,
  } : undefined;
  const available = recurringFields.filter(({ key }) => amounts[key]?.trim());
  const useFlat = !!selected.flatExpenses && !!amounts.flatExpenses?.trim();
  const existing = target?.monthlyPayslips?.[period];

  function save(e: FormEvent) {
    e.preventDefault();
    if (!validPeriod) { setError('Wähle den Abrechnungsmonat.'); return; }
    const record: MonthlyPayslipRecord = {};
    for (const { key, label } of monthlyPayslipFields) {
      const text = amounts[key]?.trim();
      if (!text) continue;
      const value = parseAmount(text);
      if (value === null || (value < 0 && key !== 'net' && key !== 'payout')) {
        setError('Bitte prüfe den Betrag für «' + label + '».'); return;
      }
      record[key] = value;
    }
    if (!Object.keys(record).length) { setError('Erfasse mindestens einen Monatsbetrag.'); return; }
    if (useFlat && !taxChoice) { setError('Wähle die steuerliche Behandlung der Pauschalspesen.'); return; }
    update(draft => {
      const plan = draft.years[year] ?? (draft.years[year] = emptyYear(year, draft.years[draft.activeYear]));
      saveMonthlyPayslip(plan, period, record);
      const salary = plan.salary;
      if (selected.baseGross && record.baseGross !== undefined && baseGrossFor(salary, month) !== record.baseGross) {
        salary.changes = salary.changes.filter(change => change.fromMonth !== month);
        if (month === 1) salary.grossMonthly = record.baseGross;
        else salary.changes.push({ fromMonth: month, grossMonthly: record.baseGross });
      }
      if (selected.pension && record.pension !== undefined) salary.bvgMonthly = record.pension;
      if (useFlat && record.flatExpenses !== undefined) salary.expenseAllowance = { monthly: record.flatExpenses, taxable: taxChoice === 'taxable' };
      draft.activeYear = year;
    });
    saved(period);
  }

  return <form className="space-y-3" onSubmit={save}>
    <h3 className="text-sm font-semibold">Monatsabrechnung prüfen</h3>
    <label className="flex flex-wrap items-center justify-between gap-2 text-sm">
      Abrechnungsmonat
      <input type="month" className={inputStyle} required value={period} onChange={e => setPeriod(e.target.value)} />
    </label>
    {validPeriod && !target && <p className="text-sm text-muted">
      Beim Übernehmen legt Frank den Plan für {year} mit den Planwerten von {data.activeYear} als Vorlage an.
    </p>}
    {existing && <p className="text-sm text-warn">Für diesen Monat ist bereits eine Abrechnung gespeichert. Mit «Abrechnung ersetzen» ersetzt du deren Werte.</p>}
    <fieldset>
      <legend className="mb-1 text-sm font-semibold">Abgerechnete Monatsbeträge in CHF</legend>
      <p className="mb-2 text-xs text-muted">Vergleiche die Beträge mit deiner Abrechnung. Leere Felder werden ausgelassen.</p>
      {monthlyPayslipFields.map(({ key, label }) => <label className="flex items-center justify-between gap-2 border-t border-line py-1 text-sm" key={key}>
        <span>{label}</span><input aria-label={label + ' in CHF'} inputMode="decimal" className={inputStyle + ' w-28 text-right tabular-nums'}
          value={amounts[key] ?? ''} onChange={e => setAmounts(s => ({ ...s, [key]: e.target.value }))} />
      </label>)}
    </fieldset>
    {available.length > 0 && <details className="rounded-xl bg-panel-2 px-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Lohnplan zusätzlich anpassen (optional) ›</summary>
      <div className="space-y-2 pb-3">
        {available.map(({ key, label }) => <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm" key={key}>
          <input type="checkbox" checked={!!selected[key]} onChange={e => setSelected(s => ({ ...s, [key]: e.target.checked }))} />
          <span>{label} in den Lohnplan übernehmen<small className="block text-muted">{key === 'baseGross'
            ? 'Ab Abrechnungsmonat bis zur nächsten Lohnänderung' : 'Monatsbetrag für das ganze Planjahr'}
            {currentValues && <> · Bisher CHF <Money value={currentValues[key]} /></>}</small></span>
        </label>)}
        {useFlat && <label className="block text-sm">Steuerbehandlung der Pauschalspesen
          <select className={inputStyle + ' mt-1 block w-full'} required value={taxChoice} onChange={e => setTaxChoice(e.target.value)}>
            <option value="">Behandlung auswählen …</option>
            <option value="exempt">Steuerfrei</option><option value="taxable">Zum steuerbaren Einkommen rechnen</option>
          </select>
        </label>}
      </div>
    </details>}
    {error && <p role="alert" className="text-sm text-warn">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="ghost" onClick={cancel}>Abbrechen</Button>
      <Button type="submit" variant="primary">{existing ? 'Abrechnung ersetzen' : 'Monatsabrechnung übernehmen'}</Button>
    </div>
  </form>;
}

export function SalaryCertificateImport({ onMonthlySaved }: { onMonthlySaved?: (period: string) => void }) {
  const { model } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | null>(null);
  const [ocr, setOcr] = useState('');
  const [pending, setPending] = useState<SalaryCertificate | MonthlyPayslip | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const record = model.plan.salaryCertificate;
  useEffect(() => () => active.current?.abort(), []);

  const cancelRead = () => {
    active.current?.abort();
    active.current = null;
    setReading(false);
    setOcr('');
  };

  const load = async (file: File) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setOcr('');
    setReading(true);
    setPending(null);
    setError('');
    setNotice('');
    try {
      const parsed = await readSalaryCertificate(file, {
        signal: controller.signal,
        onOcr: (page: number, total: number) => {
          if (!controller.signal.aborted) setOcr('Texterkennung auf diesem Gerät · Seite ' + page + ' von ' + total);
        },
      });
      if (controller.signal.aborted) return;
      setPending(parsed);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Das Lohndokument konnte nicht gelesen werden.');
    } finally {
      if (active.current === controller && !controller.signal.aborted) { active.current = null; setReading(false); }
    }
  };
  const totals = model.salary.totals;
  const planned: Partial<Record<CertificateField, number>> = {
    gross: totals.gross,
    social: model.plan.tax.ktgDeductible ? totals.social : totals.socialWithoutKtg,
    pension: totals.bvg,
    net: lohnausweisNet(model.salary, model.plan.tax.ktgDeductible, model.plan.salary.expenseAllowance?.taxable ?? false),
    flatExpenses: totals.expenses,
  };

  return <Card className="mt-4" title="Lohnausweis & Monatsabrechnung" action={
    <Button onClick={() => fileInput.current?.click()}>PDF oder CSV wählen</Button>
  }>
    <input className="hidden" ref={fileInput} type="file" aria-label="Lohnausweis-Datei"
      accept=".pdf,.csv,application/pdf,text/csv" onChange={e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void load(file);
      }} />
    {reading && <div className="flex flex-wrap items-center justify-between gap-2">
      <p role="status" className="text-sm text-muted">{ocr || 'Lohndokument wird gelesen …'}</p>
      <Button variant="ghost" onClick={cancelRead}>Abbrechen</Button>
    </div>}
    {error && <p role="alert" className="text-sm text-warn">{error}</p>}
    {notice && <p role="status" className="mb-2 text-sm text-accent">{notice}</p>}
    {pending && ('kind' in pending ? <MonthlyReview slip={pending} cancel={() => setPending(null)} saved={period => {
      setPending(null);
      onMonthlySaved?.(period);
      setNotice('Monatsabrechnung übernommen.');
    }} /> : <CertificateReview document={pending} cancel={() => setPending(null)} saved={() => {
      setPending(null);
      setNotice('Geprüfte Jahreswerte übernommen.');
    }} />)}
    {!pending && !reading && (record ? <>
      <table className="w-full table-fixed text-sm">
        <caption className="pb-2 text-left text-sm text-muted">Jahresvergleich {model.plan.year} in CHF{record.period && ' · ' + displayDate(record.period.from) + ' – ' + displayDate(record.period.to)}</caption>
        <thead><tr className="text-left text-xs text-muted">
          <th scope="col" className="w-1/2 font-medium">Ziffer</th>
          <th scope="col" className="text-right font-medium">Ausweis</th><th scope="col" className="text-right font-medium">Jahresplan</th>
        </tr></thead>
        <tbody>{salaryCertificateFields.filter(({ key }) => record[key] !== undefined).map(({ key, number, label }) =>
          <tr key={key} className="border-t border-line">
            <th scope="row" className="py-2 text-left text-xs font-normal"><span className="text-muted">{number} · </span>{label}</th>
            <td className="break-words text-right font-semibold"><Money value={record[key]!} /></td>
            <td className="break-words text-right text-muted">{planned[key] !== undefined ? <Money value={planned[key]} /> : '–'}</td>
          </tr>
        )}</tbody>
      </table>
    </> : <p className="text-sm text-muted">Importiere deinen Jahreslohnausweis oder die Abrechnung für einen einzelnen Monat. Du prüfst die Werte vor dem Übernehmen. Die Datei bleibt auf deinem Gerät.</p>)}
    {!pending && !reading && <details className="mt-2 text-xs text-muted">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-info">Unterstützte PDF- und CSV-Dateien ›</summary>
      <p>Wähle einen einzelnen Schweizer Jahreslohnausweis oder eine Monatsabrechnung als PDF. Frank liest Formularfelder und Text und kann bei Scans eine lokale Texterkennung verwenden.</p>
      <p className="mt-1">In einer CSV verwendest du eine Zeile pro Ziffer und die Spalten <code>Ziffer;Betrag;Jahr</code>. Für CHF 1'200 Pauschalspesen im Jahr 2025 lautet die Zeile <code>13.2;1200.00;2025</code>.</p>
    </details>}
  </Card>;
}
