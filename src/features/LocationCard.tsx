import { useState } from 'react';
import { useStore } from '../app/store';
import { Card, Select, cx } from './shared';
import {
  CANTON_NAMES,
  CONFESSION_LABELS,
  TAX_DATA_INFO,
  findMunicipality,
  ratesFor,
  resolveBfsId,
  searchMunicipalities,
  type Confession,
} from '../params/taxData';

const pct = (x: number) => `${Math.round(x * 10_000) / 100} %`;

/** Wohnort und Konfession: bestimmen Kanton, Steuerfüsse und Kirchensteuer. */
export function LocationCard() {
  const { data, update, plan } = useStore();
  const bfsId = resolveBfsId(data.profile);
  const current = bfsId === undefined ? undefined : findMunicipality(bfsId);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const hits = searchMunicipalities(query);
  const rates = bfsId === undefined ? null : ratesFor(plan.year, bfsId);

  const choose = (id: number) => {
    const m = findMunicipality(id);
    if (!m) return;
    update((d) => {
      d.profile = { ...d.profile, bfsId: m.bfsId, municipality: m.name, canton: m.canton };
    });
    setQuery('');
    setOpen(false);
  };

  return (
    <Card title="Wohnort">
      <div className="text-sm">
        {current ? (
          <div>
            <div className="font-semibold">{current.name}</div>
            <div className="text-xs text-muted">
              Kanton {CANTON_NAMES[current.canton] ?? current.canton} · BFS {current.bfsId}
            </div>
          </div>
        ) : (
          <div className="text-warn">Noch kein Wohnort gewählt.</div>
        )}
      </div>

      <div className="relative mt-3">
        <input
          className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
          placeholder="Gemeinde suchen, z. B. Winterthur"
          aria-label="Gemeinde suchen"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) choose(hits[0].bfsId);
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        {open && query && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-panel shadow-lg">
            {hits.length === 0 && <li className="px-3 py-2 text-sm text-muted">Keine Gemeinde gefunden.</li>}
            {hits.map((m) => (
              <li key={m.bfsId}>
                <button
                  type="button"
                  className={cx('flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-panel-2', m.bfsId === bfsId && 'text-accent')}
                  onClick={() => choose(m.bfsId)}
                >
                  <span>{m.name}</span>
                  <span className="text-muted">{m.canton}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="mt-3 block text-xs text-muted">
        Konfession
        <Select<Confession>
          className="mt-1 block w-full"
          value={data.profile.church}
          options={(Object.keys(CONFESSION_LABELS) as Confession[]).map((k) => ({ value: k, label: CONFESSION_LABELS[k] }))}
          onChange={(v) => update((d) => void (d.profile.church = v))}
        />
      </label>

      {rates && (
        <div className="mt-3 rounded-xl bg-panel-2 p-3 text-xs">
          <div className="mb-1 text-muted">Steuerfüsse {rates.year} (Einkommen)</div>
          <div className="flex justify-between"><span>Kanton</span><span className="num">{pct(rates.rates.incomeCanton)}</span></div>
          <div className="flex justify-between"><span>Gemeinde</span><span className="num">{pct(rates.rates.incomeCity)}</span></div>
          {data.profile.church !== 'none' && (
            <div className="flex justify-between"><span>Kirche</span><span className="num">{pct(rates.rates.incomeChurch)}</span></div>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        Steuerfüsse aller Gemeinden aus dem ESTV-Steuerrechner, Stand {TAX_DATA_INFO.generatedAt}.
      </p>
    </Card>
  );
}
