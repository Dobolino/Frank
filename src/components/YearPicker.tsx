import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../app/store';
import { emptyYear } from '../seed/builders';
import { FrankIcon } from './FrankIcon';

export function YearPicker() {
  const { data, update } = useStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const [yearText, setYearText] = useState('');
  const years = Object.keys(data.years).map(Number).sort((a, b) => b - a);
  const importedYears = useMemo(() => {
    const found = new Set<number>();
    for (const records of [data.transactions, data.investmentTransactions]) {
      for (const record of records ?? []) found.add(Number(record.date.slice(0, 4)));
    }
    return [...found].sort((a, b) => b - a);
  }, [data.transactions, data.investmentTransactions]);
  const hasPlan = Object.hasOwn(data.years, yearText);

  function chooseYear(value: string) {
    if (Object.hasOwn(data.years, value)) {
      update(d => { d.activeYear = Number(value); });
      return;
    }
    setYearText(value === 'new' ? String((years[0] ?? data.activeYear) + 1) : value);
    dialog.current?.showModal();
  }

  function openYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[1-9]\d{3}$/.test(yearText)) return;
    const year = Number(yearText);
    update(d => {
      if (!d.years[year]) d.years[year] = emptyYear(year, d.years[d.activeYear]);
      d.activeYear = year;
    });
    dialog.current?.close();
  }

  return (
    <div className="year-picker">
      <div className="year-select">
        <FrankIcon name="calendar" size={15} />
        <select ref={select} aria-label="Jahr wählen" value={data.activeYear} onChange={e => chooseYear(e.target.value)}>
          {years.map(year => <option key={year} value={year}>{year}</option>)}
          {importedYears.filter(year => !data.years[year]).map(year =>
            <option key={year} value={year}>{year} · Plan anlegen</option>
          )}
          <option value="new">Anderes Jahr anlegen …</option>
        </select>
        <FrankIcon name="down" size={13} />
      </div>
      <dialog ref={dialog} className="year-dialog" aria-label="Planjahr wählen"
        onClose={() => select.current?.focus({ preventScroll: true })}>
        <form onSubmit={openYear}>
          <h2>Planjahr wählen</h2>
          <label>Jahr
            <input type="text" inputMode="numeric" maxLength={4} pattern="[1-9][0-9]{3}" required
              value={yearText} onFocus={e => e.target.select()} onChange={e => setYearText(e.target.value)} />
          </label>
          <p>{hasPlan ? 'Der vorhandene Plan wird geöffnet.' : `Frank übernimmt die Planwerte von ${data.activeYear} als Vorlage für das neue Jahr.`}</p>
          <div>
            <button type="button" onClick={() => dialog.current?.close()}>Abbrechen</button>
            <button type="submit">{hasPlan ? 'Jahr öffnen' : 'Jahr anlegen'}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
