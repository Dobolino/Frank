import { useState } from 'react';
import type { expensePeriod } from '../domain/expensePeriod';
import { formatChf } from '../domain/money';
import { CATEGORY_LABELS, MONTHS, type Transaction } from '../domain/types';
import { CATEGORY_COLORS } from './charts';
import { Select } from './shared';

export function periodLabel(period: string) {
  if (period.length === 4) return period;
  return new Intl.DateTimeFormat('de-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(period + '-01T12:00:00Z'),
  );
}
const options = [
  { value: 'budget', label: 'Budget-Balken' },
  { value: 'comparison', label: 'Soll / Ist' },
  { value: 'flow', label: 'Geldfluss' },
  { value: 'calendar', label: 'Kalender' },
] as const;
export type ExpenseChartMode = (typeof options)[number]['value'];
const mask = '••••';
const dayLevels = ['Keine Ausgaben', 'Geringe Ausgaben', 'Mittlere Ausgaben', 'Hohe Ausgaben', 'Sehr hohe Ausgaben'];

function SpendingCalendar({
  period,
  spending,
  hidden,
  setPeriod,
}: {
  period: string;
  spending: Transaction[];
  hidden: boolean;
  setPeriod: (period: string) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<number>();
  const monthly = period.length === 7;
  const year = Number(period.slice(0, 4)),
    month = Number(period.slice(5));
  const cells = monthly ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 12;
  const sums = Array<number>(cells).fill(0);
  for (const t of spending) {
    const index = Number(monthly ? t.date.slice(8) : t.date.slice(5, 7)) - 1;
    sums[index] = (sums[index] ?? 0) - t.amount;
  }
  const max = Math.max(...sums, 1);
  if (!monthly)
    return (
      <div className="ex-yeargrid">
        {MONTHS.map((m) => {
          const key = period + '-' + String(m).padStart(2, '0');
          const sum = sums[m - 1]!;
          return (
            <button type="button" key={m} onClick={() => setPeriod(key)} aria-label={periodLabel(key) + ' öffnen'}>
              <span>{periodLabel(key).split(' ')[0]}</span>
              <b>{hidden ? mask : sum ? formatChf(sum, { decimals: false }) : '–'}</b>
              <i aria-hidden="true" style={{ width: (100 * sum) / max + '%' }} />
            </button>
          );
        })}
      </div>
    );
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const heatLevel = (sum: number) => Math.ceil(Math.sqrt(sum / max) * 4);
  const dayDescription = (day: number) => {
    const sum = sums[day]!;
    const label = hidden ? dayLevels[heatLevel(sum)] : formatChf(sum, { prefix: true });
    return (day + 1) + '. ' + periodLabel(period) + ' · ' + label;
  };
  return (
    <>
      <div className="ex-calendar">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
          <small key={d}>{d}</small>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={'space' + i} />
        ))}
        {sums.map((value, i) => {
          return (
            <button
              key={i}
              type="button"
              aria-label={dayDescription(i)}
              aria-pressed={selectedDay === i}
              onClick={() => setSelectedDay(i)}
              className={'ex-heat-' + heatLevel(value)}
            >
              <time dateTime={period + '-' + String(i + 1).padStart(2, '0')}>{i + 1}</time>
            </button>
          );
        })}
      </div>
      <p className="ex-caption" aria-live="polite">
        {selectedDay === undefined
          ? 'Tippe auf einen Tag, um seine Ausgaben zu sehen.'
          : dayDescription(selectedDay)}
      </p>
    </>
  );
}

export function ExpenseChart({
  period,
  summary,
  hidden,
  hasPlan,
  singleAccount,
  setPeriod,
  mode,
  setMode,
}: {
  period: string;
  summary: ReturnType<typeof expensePeriod>;
  hidden: boolean;
  hasPlan: boolean;
  singleAccount: boolean;
  setPeriod: (period: string) => void;
  mode: ExpenseChartMode;
  setMode: (value: ExpenseChartMode) => void;
}) {
  const { rows, spent, planned, unassigned, income } = summary;
  const groups = [
    ...Object.entries(CATEGORY_LABELS).map(([key, name]) => ({
      name,
      color: CATEGORY_COLORS[key as keyof typeof CATEGORY_COLORS],
      total: rows.reduce((sum, r) => sum + (r.category === key ? r.spent : 0), 0),
    })),
    {
      name: 'Ohne Budgetgruppe',
      color: '#8994a9',
      total: unassigned + rows.reduce((sum, r) => sum + (r.category === 'other' ? r.spent : 0), 0),
    },
  ].filter((g) => g.total > 0);
  const ratio = planned > 0 ? Math.min(100, (100 * spent) / planned) : 0;
  let cursor = 0;
  const ribbons = groups.map((g, i) => {
    const thickness = (g.total / spent) * 72;
    const start = cursor;
    cursor += thickness;
    const height = Math.max(106, groups.length * 27),
      y = (height - 72) / 2 + start,
      target = ((i + 0.5) * height) / groups.length;
    const destWidth = (g.total / Math.max(...groups.map((group) => group.total))) * 18;
    return (
      <path
        key={g.name}
        fill={g.color}
        fillOpacity=".82"
        d={`M1 ${y} C37 ${y} 53 ${target - destWidth / 2} 87 ${target - destWidth / 2} V${target + destWidth / 2} C53 ${target + destWidth / 2} 37 ${y + thickness} 1 ${y + thickness}Z`}
      />
    );
  });
  return (
    <section className="ex-card ex-visual">
      <header className="ex-card-head">
        <h2>{period.length === 4 ? 'Jahresausgaben' : 'Monatsausgaben'}</h2>
        <Select ariaLabel="Grafik auswählen" value={mode} onChange={setMode} options={[...options]} />
      </header>
      <div className="ex-graph-body" key={mode}>
        {hidden && <span className="sr-only">Beträge ausgeblendet.</span>}
        {mode === 'calendar' ? (
          <SpendingCalendar key={period} period={period} spending={summary.spending} hidden={hidden} setPeriod={setPeriod} />
        ) : mode === 'flow' ? (
          groups.length ? (
            <>
              <p className="ex-caption mb-3">Anteile an deinen erfassten Ausgaben</p>
              <div className="ex-flow">
                <svg
                  aria-hidden="true"
                  viewBox={`0 0 88 ${Math.max(106, groups.length * 27)}`}
                  preserveAspectRatio="none"
                >
                  {ribbons}
                </svg>
                <ul>
                  {groups.map((g) => (
                    <li key={g.name}>
                      <span>{g.name}</span>
                      <b>{hidden ? mask : Math.round((100 * g.total) / spent) + ' %'}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="ex-caption">Für diesen Zeitraum sind keine Ausgaben erfasst.</p>
          )
        ) : mode === 'comparison' ? (
          <>
            <div className="ex-twin">
              <span>Budgetposten</span>
              <span>Ist / Plan in CHF</span>
            </div>
            {!hasPlan && <p className="ex-caption">Für {period.slice(0, 4)} fehlt der Budgetplan.</p>}
            {rows.length === 0 && !unassigned && <p className="ex-caption">Keine Posten für diesen Zeitraum.</p>}
            <ul className="ex-comparison">
              {rows.map((r) => (
                <li key={r.name}>
                  <div>
                    <span>{r.name}</span>
                    <span>
                      {hidden ? mask : formatChf(r.spent) + ' / ' + formatChf(r.planned)}
                    </span>
                  </div>
                  <div aria-hidden="true" className="ex-rule">
                    <i
                      style={{
                        width: (r.spent ? Math.min(100, (100 * r.spent) / Math.max(r.planned, 1)) : 0) + '%',
                        background: r.category === 'other' ? 'var(--color-muted)' : CATEGORY_COLORS[r.category],
                      }}
                    />
                  </div>
                </li>
              ))}
              {unassigned > 0 && (
                <li>
                  <div>
                    <span>Ohne Budgetposten</span>
                    <span>{hidden ? mask : formatChf(unassigned) + ' / –'}</span>
                  </div>
                </li>
              )}
            </ul>
          </>
        ) : (
          <>
            <div className="ex-amounts">
              <div>
                <small>Erfasste Ausgaben</small>
                <strong>
                  {hidden ? mask : <>{formatChf(spent)} <em>CHF</em></>}
                </strong>
              </div>
              <div className="ex-limit">
                <small>{singleAccount ? 'Plan aller Konten' : 'Laut Budgetplan'}</small>
                <b>{hasPlan ? hidden ? mask : formatChf(planned, { decimals: false, prefix: true }) : 'Kein Plan'}</b>
              </div>
            </div>
            {hasPlan && (
              <div className="ex-progress" aria-hidden="true">
                <i style={{ width: ratio + '%', background: spent > planned ? 'var(--color-warn)' : undefined }} />
              </div>
            )}
            <div className="ex-spentfoot">
              <span>Eingänge</span>
              <b>{hidden ? mask : formatChf(income, { prefix: true })}</b>
            </div>
            {hasPlan && (
              <div className="ex-balance">
                <span>{spent > planned ? 'Über Plan' : 'Plan minus erfasste Ausgaben'}</span>
                <b>{hidden ? mask : formatChf(Math.abs(planned - spent), { prefix: true })}</b>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
