import { useState } from 'react';
import { useStore } from '../app/store';
import { Button, cx } from './shared';
import { findMunicipality, searchMunicipalities } from '../params/taxData';
import { buildStartData } from '../seed/startData';
import { demoData } from '../seed/demo';

const parse = (v: string): number => {
  const n = Number(v.replace(/['’\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

function NumberField({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
      <div className="mt-1 flex items-center rounded-lg border border-line bg-panel-2 px-3">
        <span className="text-sm text-muted">CHF</span>
        <input
          inputMode="decimal"
          className="w-full bg-transparent px-2 py-2.5 text-right outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
        />
      </div>
    </label>
  );
}

/** Erster Start: fünf Fragen statt Demo-Daten. */
export function Onboarding() {
  const { finishSetup } = useStore();
  const [query, setQuery] = useState('');
  const [bfsId, setBfsId] = useState<number | null>(null);
  const [gross, setGross] = useState('');
  const [rent, setRent] = useState('');
  const [health, setHealth] = useState('');
  const [p3a, setP3a] = useState('');
  const [bvg, setBvg] = useState('');
  const [busy, setBusy] = useState(false);
  const muni = bfsId === null ? undefined : findMunicipality(bfsId);
  const hits = muni ? [] : searchMunicipalities(query, 8);

  const values = { gross: parse(gross), rent: parse(rent || '0'), health: parse(health || '0'), p3a: parse(p3a || '0'), bvg: parse(bvg || '0') };
  const valid = !!muni && values.gross > 0 && Object.values(values).every((v) => !Number.isNaN(v));

  const start = async () => {
    if (!valid || !muni) return;
    setBusy(true);
    await finishSetup(
      buildStartData({ bfsId: muni.bfsId, grossMonthly: values.gross, rent: values.rent, healthInsurance: values.health, pillar3a: values.p3a, bvg: values.bvg }),
    );
    setBusy(false);
  };

  return (
    <main className="mx-auto max-w-md px-5 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="text-2xl font-semibold tracking-tight">
        Frank<span className="text-accent">.</span>
      </div>
      <p className="mt-2 text-muted">Fünf Angaben, dann rechnet Frank Budget, Lohn und Steuern mit deinen Zahlen. Alles bleibt auf diesem Gerät.</p>

      <div className="mt-6 space-y-5">
        <div>
          <span className="text-sm">1. Wohnort</span>
          {muni ? (
            <div className="mt-1 flex items-center justify-between rounded-lg border border-accent/40 bg-panel-2 px-3 py-2.5">
              <span>
                {muni.name} <span className="text-muted">· {muni.canton}</span>
              </span>
              <button className="text-sm text-muted" onClick={() => setBfsId(null)}>
                ändern
              </button>
            </div>
          ) : (
            <>
              <input
                className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2.5"
                placeholder="PLZ oder Gemeinde"
                aria-label="PLZ oder Gemeinde suchen"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {hits.length > 0 && (
                <ul className="mt-1 divide-y divide-line rounded-lg border border-line">
                  {hits.map((m) => (
                    <li key={`${m.bfsId}-${m.zip ?? ''}-${m.place ?? ''}`}>
                      <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm" onClick={() => setBfsId(m.bfsId)}>
<span className="min-w-0">
                    <span className="block truncate">{m.zip ? `${m.zip} ${m.place}` : m.name}</span>
                    {m.zip && m.place !== m.name && <span className="block truncate text-xs text-muted">Gemeinde {m.name}</span>}
                  </span>
                  <span className="shrink-0 text-muted">{m.canton}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <NumberField label="2. Bruttolohn pro Monat" hint="ohne 13. Monatslohn" value={gross} onChange={setGross} />
        <NumberField label="3. Miete pro Monat" hint="inkl. Nebenkosten" value={rent} onChange={setRent} />
        <NumberField label="4. Krankenkasse pro Monat" hint="Grundversicherung" value={health} onChange={setHealth} />
        <NumberField label="5. Säule 3a pro Monat" hint="0, wenn du nicht einzahlst" value={p3a} onChange={setP3a} />
        <NumberField label="Pensionskasse pro Monat (optional)" hint="Abzug «BVG» auf deiner Lohnabrechnung" value={bvg} onChange={setBvg} />
      </div>

      <div className="mt-8 space-y-3">
        <Button variant="primary" className={cx('w-full justify-center py-3', !valid && 'opacity-50')} onClick={() => void start()}>
          {busy ? 'Speichere …' : 'Los geht’s'}
        </Button>
        {!valid && <p className="text-center text-xs text-muted">Wohnort und Bruttolohn sind nötig.</p>}
        <button className="block w-full py-2 text-center text-sm text-muted" onClick={() => void finishSetup(demoData())}>
          Erst mit Beispieldaten ansehen
        </button>
        <a className="block py-2 text-center text-sm text-accent" href="#sync">Vorhandenen Frank-Datenstand von einem Gerät übernehmen</a>
      </div>
    </main>
  );
}
