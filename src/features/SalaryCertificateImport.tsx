import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../app/store';
import { formatChf, parseChf } from '../domain/money';
import { lohnausweisNet } from '../domain/salaryEngine';
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
  const fullYear = document.period?.from === yearText + '-01-01' && document.period?.to === yearText + '-12-31';
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
    if (document.period) record.period = { from: document.period.from, to: document.period.to };
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
      {document.year !== undefined ? <span>{document.year}</span> :
        <input className={inputStyle + ' w-24'} inputMode="numeric" required pattern="[1-9][0-9]{3}" maxLength={4}
          placeholder="JJJJ" value={yearText} onChange={e => setYearText(e.target.value)} />}
    </label>
    {document.period && <p className="text-xs text-muted">Bescheinigter Zeitraum · {displayDate(document.period.from)} – {displayDate(document.period.to)}</p>}
    {validYear && !target && <p className="text-sm text-muted">Beim Übernehmen legt Frank den Plan für {year} mit den Planwerten von {data.activeYear} als Vorlage an.</p>}
    {target?.salaryCertificate && <p className="text-sm text-warn">Für {year} ist bereits ein Lohnausweis gespeichert. Mit «Ausweis ersetzen» ersetzt du dessen Vergleichswerte.</p>}
    {document.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-warn">
      {document.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
    </ul>}
    <fieldset>
      <legend className="mb-1 text-sm font-semibold">Erkannte Jahresbeträge in CHF</legend>
      <p className="mb-2 text-xs text-muted">Prüfe die Beträge am Original. Leere Felder werden ausgelassen.</p>
      {salaryCertificateFields.filter(({ key }) => document[key] !== undefined).map(({ key, number, label }) =>
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

export function SalaryCertificateImport() {
  const { model } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const [pending, setPending] = useState<SalaryCertificate | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const record = model.plan.salaryCertificate;
  useEffect(() => () => { revision.current++; }, []);

  const load = async (file: File) => {
    const current = ++revision.current;
    setReading(true);
    setPending(null);
    setError('');
    setNotice('');
    try {
      const parsed = await readSalaryCertificate(file);
      if (current !== revision.current) return;
      if (!salaryCertificateFields.some(({ key }) => parsed[key] !== undefined)) {
        throw new Error('Keine Jahresbeträge erkannt. Wähle ein PDF mit Text oder eine CSV mit den Ziffern des Lohnausweises.');
      }
      setPending(parsed);
    } catch (cause) {
      if (current === revision.current) setError(cause instanceof Error ? cause.message : 'Der Lohnausweis konnte nicht gelesen werden.');
    } finally {
      if (current === revision.current) setReading(false);
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

  return <Card className="mt-4" title="Lohnausweis" action={
    <Button onClick={() => fileInput.current?.click()}>PDF oder CSV wählen</Button>
  }>
    <input className="hidden" ref={fileInput} type="file" aria-label="Lohnausweis-Datei"
      accept=".pdf,.csv,application/pdf,text/csv" onChange={e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void load(file);
      }} />
    {reading && <p role="status" className="text-sm text-muted">Lohnausweis wird auf diesem Gerät gelesen …</p>}
    {error && <p role="alert" className="text-sm text-warn">{error}</p>}
    {notice && <p role="status" className="mb-2 text-sm text-accent">{notice}</p>}
    {pending && <CertificateReview document={pending} cancel={() => setPending(null)} saved={() => {
      setPending(null);
      setNotice('Geprüfte Jahreswerte übernommen.');
    }} />}
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
    </> : <p className="text-sm text-muted">Lies Jahreslohn, Abzüge und Spesen aus einem Lohnausweis ein. Frank speichert die bestätigten Beträge als Jahresvergleich. Die Datei bleibt auf deinem Gerät.</p>)}
    {!pending && !reading && <details className="mt-2 text-xs text-muted">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-info">Unterstützte PDF- und CSV-Dateien ›</summary>
      <p>Wähle einen einzelnen Schweizer Lohnausweis mit Text oder ausgefüllten PDF-Formularfeldern. Bei einem Bildscan braucht es zuerst eine Texterkennung.</p>
      <p className="mt-1">In einer CSV verwendest du eine Zeile pro Ziffer und die Spalten <code>Ziffer;Betrag;Jahr</code>. Für CHF 1'200 Pauschalspesen im Jahr 2025 lautet die Zeile <code>13.2;1200.00;2025</code>.</p>
    </details>}
  </Card>;
}
