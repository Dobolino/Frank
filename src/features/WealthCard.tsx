import { useState } from 'react';
import { useStore } from '../app/store';
import { Button, Card, Money, MoneyInput, cx } from './shared';
import { summarizePortfolio } from '../domain/investEngine';
import { snapshotTotal, upsertSnapshot, wealthTrend } from '../domain/wealthHistory';
import { MONTH_NAMES, type WealthSnapshot } from '../domain/types';
import { todayYm } from './shared';

/** Farben aus derselben geprüften Reihe wie die Ausgaben-Grafiken (Slots 1–3). */
const SERIES = [
  { key: 'accounts', label: 'Konten', color: '#3987e5' },
  { key: 'depot', label: 'Depot', color: '#d95926' },
  { key: 'pillar3a', label: 'Säule 3a', color: '#199e70' },
] as const;

const label = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

/** Vermögen über die Zeit: monatlich Stand erfassen, gestapelte Balken zeigen die Entwicklung. */
export function WealthCard() {
  const { data, update } = useStore();
  const history = data.wealthHistory ?? [];
  const trend = wealthTrend(history);
  const depotNow = summarizePortfolio(data.investments).totalChf;
  const month = todayYm();
  const current = history.find((s) => s.month === month);
  const last = trend.latest;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WealthSnapshot>(() => ({
    month,
    accounts: current?.accounts ?? last?.accounts ?? 0,
    depot: depotNow || current?.depot || last?.depot || 0,
    pillar3a: current?.pillar3a ?? last?.pillar3a ?? 0,
  }));
  const [active, setActive] = useState<number | null>(null);

  const shown = history.slice(-12);
  const max = Math.max(1, ...shown.map(snapshotTotal));
  const sel = active === null ? null : shown[active];

  const save = () => {
    update((d) => void (d.wealthHistory = upsertSnapshot(d.wealthHistory, { ...draft, month })));
    setEditing(false);
  };

  return (
    <Card
      title="Vermögen über die Zeit"
      action={!editing && <Button onClick={() => setEditing(true)}>{current ? 'Stand anpassen' : 'Stand erfassen'}</Button>}
    >
      {editing && (
        <div className="mb-4 space-y-2 rounded-xl bg-panel-2 p-3 text-sm">
          <div className="text-xs text-muted">Stand {label(month)}</div>
          {SERIES.map((s) => (
            <label key={s.key} className="flex items-center justify-between gap-3">
              <span className="text-muted">{s.label}{s.key === 'depot' && depotNow > 0 ? ' (aus Anlagen)' : ''}</span>
              <MoneyInput ariaLabel={s.label} value={draft[s.key]} onChange={(v) => setDraft({ ...draft, [s.key]: v })} />
            </label>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditing(false)}>Abbrechen</Button>
            <Button variant="primary" onClick={save}>Speichern</Button>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-muted">Erfasse einmal pro Monat deinen Stand. Nach zwei Einträgen siehst du, ob dein Vermögen wächst.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-xs text-muted">{sel ? label(sel.month) : 'Aktuell'}</div>
              <div className="num text-2xl font-semibold"><Money value={snapshotTotal(sel ?? last!)} decimals={false} /></div>
            </div>
            <div className="text-right text-sm">
              {trend.change !== null && !sel && (
                <div className={trend.change >= 0 ? 'text-accent' : 'text-danger'}>
                  <Money value={trend.change} decimals={false} signed /> seit letztem Eintrag
                </div>
              )}
              {trend.changeYear !== null && !sel && (
                <div className="text-muted">
                  <Money value={trend.changeYear} decimals={false} signed /> dieses Jahr
                </div>
              )}
              {sel && (
                <div className="text-xs text-muted">
                  {SERIES.map((s) => (
                    <div key={s.key}>{s.label} <Money value={sel[s.key]} decimals={false} /></div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex h-36 items-end gap-1.5" role="img" aria-label="Vermögen pro Monat">
            {shown.map((s, idx) => {
              const total = snapshotTotal(s);
              return (
                <button
                  key={s.month}
                  type="button"
                  aria-label={`${label(s.month)}: ${Math.round(total / 100)} Franken`}
                  className="flex h-full flex-1 items-end"
                  onClick={() => setActive(active === idx ? null : idx)}
                  onMouseEnter={() => setActive(idx)}
                  onMouseLeave={() => setActive(null)}
                >
                  <div
                    className={cx('flex w-full flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]', active !== null && active !== idx && 'opacity-40')}
                    style={{ height: `${(total / max) * 100}%` }}
                  >
                    {SERIES.filter((x) => s[x.key] > 0).map((x) => (
                      <div key={x.key} style={{ height: `${(s[x.key] / total) * 100}%`, background: x.color }} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex gap-1.5 text-center text-[10px] text-muted">
            {shown.map((s) => (
              <span key={s.month} className="flex-1 truncate">{label(s.month).split(' ')[0]}</span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 text-xs text-muted">
            {SERIES.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
