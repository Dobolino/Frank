import { useMemo, useState } from 'react';
import { useStore } from '../app/store';
import { Card, Money, MoneyInput, Select, cx, todayYm } from './shared';
import { chf, formatChf, type Rappen } from '../domain/money';
import { addMonths, monthsBetween } from '../domain/goalsEngine';
import { onlyMonthlyItems, runRadar, upcomingBills, type RadarLevel, type RadarYear } from '../domain/radarEngine';
import { MONTH_NAMES, type RadarSettings } from '../domain/types';

const DEFAULT_BUFFER = chf(500);

const ymLabel = (ym: string, withYear = false): string => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1]}${withYear ? ` ${y}` : ''}`;
};

const LEVEL_TEXT: Record<RadarLevel, string> = {
  green: 'Alles im grünen Bereich',
  yellow: 'Wird knapp',
  red: 'Lücke in Sicht',
};

const LEVEL_COLOR: Record<RadarLevel, string> = {
  green: 'var(--color-accent)',
  yellow: 'var(--color-warn)',
  red: 'var(--color-danger)',
};

export function RadarCard() {
  const { data, update, modelFor, model } = useStore();
  const today = todayYm();
  const settings: RadarSettings = data.settings?.radar ?? { buffer: DEFAULT_BUFFER };
  const savingsAccounts = data.accounts.filter((a) => a.type === 'savings');

  const [oneOff, setOneOff] = useState<Rappen>(0);
  const [oneOffYm, setOneOffYm] = useState(today);
  const [paidFrom, setPaidFrom] = useState<'savings' | 'main'>('savings');

  const getYear = (year: number): RadarYear | null => {
    const m = modelFor(year);
    return m ? { year, items: m.budget, salaryMonths: m.salary.months, allocations: m.plan.extrasAllocation } : null;
  };

  // Standard: Sparkonto mit den meisten zugeordneten Posten
  const account =
    savingsAccounts.find((a) => a.id === settings.accountId) ??
    [...savingsAccounts].sort(
      (a, b) => model.budget.filter((i) => i.accountId === b.id).length - model.budget.filter((i) => i.accountId === a.id).length,
    )[0];

  const setRadar = (patch: Partial<RadarSettings>) =>
    update((d) => {
      d.settings = { ...d.settings, radar: { ...(d.settings?.radar ?? { buffer: DEFAULT_BUFFER }), ...patch } };
    });

  const computed = useMemo(() => {
    if (!account) return null;
    const known = settings.balance !== undefined && settings.asOfYm !== undefined && settings.asOfYm <= today;
    let startYm = today;
    let startBalance = 0;
    if (known) {
      startYm = settings.asOfYm!;
      startBalance = settings.balance!;
    } else {
      // Ohne Kontostand: Stand aus der Jahresplanung (Startguthaben 1.1. + Verlauf bis heute)
      const [y, m] = today.split('-').map(Number) as [number, number];
      const cf = modelFor(y)?.cashflow.find((c) => c.account.id === account.id);
      startBalance = m > 1 ? (cf?.months[m - 2]?.balanceEnd ?? 0) : (cf?.startBalance ?? 0);
    }
    const skip = monthsBetween(startYm, today);
    const base = { account, accounts: data.accounts, getYear, startYm, startBalance, buffer: settings.buffer, months: 12 + skip };
    const slice = <T extends { points: unknown[] }>(r: T) => ({ ...r, points: r.points.slice(skip) });
    const main = runRadar(base);
    const alt =
      oneOff > 0 && paidFrom === 'savings'
        ? runRadar({ ...base, oneOffs: [{ ym: oneOffYm, amount: oneOff, accountId: account.id }] })
        : null;
    return { known, main: slice(main), alt: alt ? slice(alt) : null };
  }, [account, settings, today, data.accounts, oneOff, oneOffYm, paidFrom, modelFor]);

  if (!account || !computed) {
    return (
      <Card title="Finanz-Radar">
        <p className="text-sm text-muted">Lege ein Sparkonto an und ordne ihm Budgetposten zu, dann zeigt der Radar die nächsten 12 Monate.</p>
      </Card>
    );
  }

  const { main, alt } = computed;
  // Ampel nach Neuberechnung des Minimums ab heute
  const shown = alt ?? main;
  const min = Math.min(...shown.points.map((p) => p.balanceEnd));
  const minPoint = shown.points.find((p) => p.balanceEnd === min)!;
  const level: RadarLevel = min < 0 ? 'red' : min < settings.buffer ? 'yellow' : 'green';
  const mainMin = Math.min(...main.points.map((p) => p.balanceEnd));
  const mainLevel: RadarLevel = mainMin < 0 ? 'red' : mainMin < settings.buffer ? 'yellow' : 'green';

  const upcoming = upcomingBills(getYear, today, 2, chf(200));
  const monthlyOnly = onlyMonthlyItems(model.budget, account.id);
  const currentOrder = model.transfers.find((t) => t.account.id === account.id)?.standingOrder ?? 0;
  // Ohne echten Kontostand keine Ampel und keine Tipps – sonst wäre jede Aussage geraten.
  const hasBalance = computed.known || (model.plan.startBalances[account.id] ?? 0) !== 0;
  // Rot: Rate, damit das Konto im Plus bleibt. Gelb: einmalig aufstocken bis zum Puffer.
  const tipMonthly = hasBalance && mainLevel === 'red' ? main.catchUpMonthly : 0;
  const tipOnce = hasBalance && mainLevel === 'yellow' ? settings.buffer - mainMin : 0;

  // Auswirkung der einmaligen Ausgabe auf das Jahr
  const oneOffYear = Number(oneOffYm.slice(0, 4));
  const yearModel = modelFor(oneOffYear) ?? model;
  const surplusAfter = yearModel.summary.surplusYearly - oneOff;
  const restAfter = yearModel.summary.saldoMonthly - oneOff;

  return (
    <Card
      title={`Finanz-Radar · ${account.name}`}
      action={
        hasBalance ? (
          <div className="flex items-center gap-2">
            <Lights level={level} />
            <span className="text-sm" style={{ color: LEVEL_COLOR[level] }}>{LEVEL_TEXT[level]}</span>
          </div>
        ) : (
          <span className="text-sm text-muted">Kontostand eintragen für die Ampel</span>
        )
      }
    >
      <Sparkline points={main.points} alt={alt?.points} buffer={settings.buffer} level={mainLevel} altLevel={level} />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted">Kontostand heute</span>
            <MoneyInput
              value={main.points[0] ? main.points[0].balanceEnd - main.points[0].inflow + main.points[0].outflow : 0}
              onChange={(v) => setRadar({ balance: v, asOfYm: today })}
              ariaLabel="Kontostand heute"
            />
          </div>
          {!computed.known && <p className="text-xs text-muted">Geschätzt aus der Planung – trage den echten Stand ein.</p>}
          {computed.known && settings.asOfYm !== today && (
            <p className="text-xs text-muted">Stand von {ymLabel(settings.asOfYm!, true)}, seither hochgerechnet.</p>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted">Puffer (gelb darunter)</span>
            <MoneyInput value={settings.buffer} onChange={(v) => setRadar({ buffer: v })} ariaLabel="Puffer" />
          </div>
          {savingsAccounts.length > 1 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">Konto</span>
              <Select className="min-w-0 max-w-full" ariaLabel="Sparkonto im Finanz-Radar" value={account.id} options={savingsAccounts.map((a) => ({ value: a.id, label: a.name }))} onChange={(id) => setRadar({ accountId: id, balance: undefined, asOfYm: undefined })} />
            </div>
          )}
          <div className="pt-1 text-xs text-muted">
            Tiefster Stand: <Money value={minPoint.balanceEnd} decimals={false} /> im {ymLabel(minPoint.ym, true)}
          </div>
        </div>

        <div className="min-w-0 space-y-2 text-sm">
          <div className="text-xs font-semibold tracking-wide text-muted uppercase">Bald fällig</div>
          {upcoming.length === 0 && <p className="text-muted">Keine grösseren Rechnungen in den nächsten zwei Monaten.</p>}
          {upcoming.map((b) => (
            <div key={b.ym + b.name} className="flex justify-between gap-2">
              <span>
                <span className="text-muted">{ymLabel(b.ym)}</span> · {b.name}
              </span>
              <Money value={b.amount} decimals={false} />
            </div>
          ))}
          {tipMonthly > 0 && (
            <div className="mt-2 rounded-xl border border-danger/30 bg-danger/5 p-3 text-danger">
              Im {ymLabel(minPoint.ym, true)} reicht das Geld nicht. Lege ab jetzt <strong>CHF {formatChf(tipMonthly, { decimals: false })}</strong> pro
              Monat mehr zurück (Dauerauftrag CHF {formatChf(currentOrder + tipMonthly, { decimals: false })}), dann bleibt {account.name} im Plus.
            </div>
          )}
          {tipOnce > 0 && (
            <div className="mt-2 rounded-xl border border-warn/30 bg-warn/5 p-3 text-warn">
              Im {ymLabel(minPoint.ym, true)} sinkt der Stand unter deinen Puffer. Einmalig <strong>CHF {formatChf(Math.ceil(tipOnce / 1000) * 1000, { decimals: false })}</strong>{' '}
              aufstocken (z. B. aus dem 13. Lohn) – dann bleibt die Ampel grün.
            </div>
          )}
          {monthlyOnly && (
            <p className="mt-2 rounded-xl bg-panel-2 p-3 text-xs text-muted">
              Alle Posten auf diesem Konto sind monatlich erfasst – so gibt es keine Dellen. Trage Jahresrechnungen (z. B. Autoversicherung,
              Serafe, MFK) im Budget als «jährlich» mit Fälligkeitsmonat ein, dann erkennt der Radar Engpässe.
            </p>
          )}
        </div>

        <div className="min-w-0 space-y-2 text-sm">
          <div className="text-xs font-semibold tracking-wide text-muted uppercase">Was wäre wenn …</div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted">Einmalige Ausgabe</span>
            <span className="num font-semibold">CHF {formatChf(oneOff, { decimals: false })}</span>
          </div>
          <input
            type="range"
            min={0}
            max={3000}
            step={50}
            value={oneOff / 100}
            onChange={(e) => setOneOff(chf(Number(e.target.value)))}
            className="w-full accent-[var(--color-accent)]"
            aria-label="Betrag der einmaligen Ausgabe"
          />
          <div className="flex flex-wrap gap-2">
            <Select
              className="min-w-0 flex-1 basis-32"
              value={oneOffYm}
              options={Array.from({ length: 12 }, (_, i) => addMonths(today, i)).map((ym) => ({ value: ym, label: ymLabel(ym, true) }))}
              onChange={setOneOffYm}
              ariaLabel="Monat der Ausgabe"
            />
            <Select<'savings' | 'main'>
              className="min-w-0 flex-1 basis-32"
              value={paidFrom}
              options={[
                { value: 'savings', label: `von ${account.name}` },
                { value: 'main', label: 'vom Lohnkonto' },
              ]}
              onChange={setPaidFrom}
              ariaLabel="Bezahlt von"
            />
          </div>
          {oneOff > 0 && (
            <div className="space-y-1 rounded-xl bg-panel-2 p-3">
              <ImpactRow label={`Jahresüberschuss ${oneOffYear}`} before={yearModel.summary.surplusYearly} after={surplusAfter} />
              {paidFrom === 'main' ? (
                <ImpactRow label={`Rest im ${ymLabel(oneOffYm)}`} before={yearModel.summary.saldoMonthly} after={restAfter} />
              ) : (
                <ImpactRow label="Tiefster Stand Sparkonto" before={mainMin} after={min} />
              )}
              <div className="flex justify-between text-xs text-muted">
                <span>Sparquote / Steuern</span>
                <span>unverändert</span>
              </div>
              {paidFrom === 'main' && restAfter < 0 && (
                <p className="text-xs text-warn">Der Lohn reicht in diesem Monat nicht – der Rest käme aus den Reserven.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function ImpactRow({ label, before, after }: { label: string; before: Rappen; after: Rappen }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="num">
        <span className="text-muted line-through decoration-muted/60">{formatChf(before, { decimals: false })}</span>{' '}
        <span className={after < 0 ? 'text-danger' : 'text-text'}>{formatChf(after, { decimals: false })}</span>
      </span>
    </div>
  );
}

function Lights({ level }: { level: RadarLevel }) {
  const order: RadarLevel[] = ['red', 'yellow', 'green'];
  return (
    <div className="flex gap-1 rounded-full bg-bg px-1.5 py-1" aria-label={`Ampel: ${LEVEL_TEXT[level]}`} role="img">
      {order.map((l) => (
        <span
          key={l}
          className={cx('h-2.5 w-2.5 rounded-full transition-opacity', l === level ? 'opacity-100' : 'opacity-20')}
          style={{ background: LEVEL_COLOR[l], boxShadow: l === level ? `0 0 8px ${LEVEL_COLOR[l]}` : undefined }}
        />
      ))}
    </div>
  );
}

function Sparkline({
  points,
  alt,
  buffer,
  level,
  altLevel,
}: {
  points: { ym: string; balanceEnd: Rappen; assumed: boolean; bills: { name: string; amount: Rappen }[] }[];
  alt?: { balanceEnd: Rappen }[];
  buffer: Rappen;
  level: RadarLevel;
  altLevel: RadarLevel;
}) {
  const W = 600;
  const H = 120;
  const pad = 8;
  const values = [...points.map((p) => p.balanceEnd), ...(alt ?? []).map((p) => p.balanceEnd), 0, buffer];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(1, points.length - 1);
  const y = (v: number) => pad + ((hi - v) * (H - 2 * pad)) / span;
  const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const mainPath = path(points.map((p) => p.balanceEnd));
  const area = `${mainPath} L${x(points.length - 1)},${y(lo)} L${x(0)},${y(lo)} Z`;
  const color = LEVEL_COLOR[level];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" preserveAspectRatio="none" role="img" aria-label="Kontoverlauf der nächsten 12 Monate">
        <defs>
          <linearGradient id="radar-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {lo < 0 && <rect x={0} y={y(0)} width={W} height={H - y(0)} fill="var(--color-danger)" opacity="0.06" />}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={W} y1={y(buffer)} y2={y(buffer)} stroke="var(--color-warn)" strokeOpacity="0.5" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={area} fill="url(#radar-fill)" />
        <path d={mainPath} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {alt && <path d={path(alt.map((p) => p.balanceEnd))} fill="none" stroke={LEVEL_COLOR[altLevel]} strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
        {points.map((p, i) => (
          <circle key={p.ym} cx={x(i)} cy={y(p.balanceEnd)} r="3" fill={p.balanceEnd < 0 ? 'var(--color-danger)' : p.balanceEnd < buffer ? 'var(--color-warn)' : color}>
            <title>
              {ymLabel(p.ym, true)}: CHF {formatChf(p.balanceEnd)}
              {p.bills.length > 0 ? ` · ${p.bills.map((b) => b.name).join(', ')}` : ''}
              {p.assumed ? ' (Annahme: Vorjahresplan)' : ''}
            </title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        {points.map((p) => (
          <span key={p.ym} className={cx('w-0 flex-1 text-center', p.assumed && 'italic opacity-70')}>
            {ymLabel(p.ym)}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span><span className="mr-1 inline-block h-0.5 w-4 align-middle" style={{ background: color }} />Kontostand</span>
        <span><span className="mr-1 inline-block w-4 border-t border-dashed border-warn/70 align-middle" />Puffer</span>
        {alt && <span><span className="mr-1 inline-block w-4 border-t-2 border-dashed align-middle" style={{ borderColor: LEVEL_COLOR[altLevel] }} />mit einmaliger Ausgabe</span>}
        {points.some((p) => p.assumed) && <span className="italic">kursiv = Annahme aus Vorjahresplan</span>}
      </div>
    </div>
  );
}
