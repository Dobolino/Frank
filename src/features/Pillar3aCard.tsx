import { useStore } from '../app/store';
import { Bar, Button, Card, Money, Row } from './shared';
import { formatPercent } from '../domain/money';
import { analyzePillar3a, pillar3aReminderDue } from '../domain/pillar3a';

/** Säule-3a-Rechner: Steuerersparnis und was bis zum Maximum fehlt. */
export function Pillar3aCard() {
  const { model, updateYear, data } = useStore();
  const a = analyzePillar3a(model);
  if (!a) return null;
  const account = data.accounts.find((acc) => acc.type === 'pillar3a')?.id;

  const raiseToMax = () =>
    updateYear((p) => {
      const item = p.budget.find((b) => b.taxTag === 'pillar3a' && b.frequency.kind === 'monthly');
      if (item) item.amount = Math.floor(a.max / 12);
      else
        p.budget.push({
          id: `b-3a-${Date.now().toString(36)}`,
          category: 'savings',
          name: 'Säule 3a',
          amount: Math.floor(a.max / 12),
          frequency: { kind: 'monthly' },
          ...(account ? { accountId: account } : {}),
          taxTag: 'pillar3a',
        });
    });

  return (
    <Card title="Säule 3a">
      <div className="mb-1 flex justify-between text-sm">
        <span>
          <Money value={a.planned} decimals={false} /> von <Money value={a.max} decimals={false} />
        </span>
        <span className="text-muted">{formatPercent(a.max ? a.planned / a.max : 0, 0)}</span>
      </div>
      <Bar value={a.max ? a.planned / a.max : 0} tone={a.gap === 0 ? 'good' : 'warn'} />
      <div className="mt-3">
        <Row label="Steuern gespart mit deiner Einzahlung" value={<Money value={a.savingPlanned} decimals={false} />} />
        {a.gap > 0 ? (
          <>
            <Row label="Fehlt bis zum Maximum" value={<Money value={a.gap} decimals={false} />} />
            <Row
              strong
              label="Zusätzlich gespart beim Maximum"
              hint={`${formatPercent(a.marginalRate, 0)} der Einzahlung`}
              value={<span className="text-accent"><Money value={a.savingExtra} decimals={false} /></span>}
            />
          </>
        ) : (
          <p className="mt-2 text-sm text-accent">Du nutzt das Maximum aus.</p>
        )}
      </div>
      {a.gap > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={raiseToMax}>Budget auf Maximum setzen</Button>
          <span className="text-xs text-muted">
            oder einmalig <Money value={a.gap} decimals={false} /> bis Ende Dezember einzahlen
          </span>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Die Einzahlung muss bis Ende Dezember auf dem 3a-Konto sein, damit sie für dieses Steuerjahr zählt.</p>
    </Card>
  );
}

/** Hinweis auf der Übersicht im November und Dezember. */
export function Pillar3aReminder() {
  const { model } = useStore();
  if (!pillar3aReminderDue(model)) return null;
  const a = analyzePillar3a(model)!;
  return (
    <a href="#tax" role="status" className="mb-4 block rounded-2xl border border-info/30 bg-info/5 p-4 text-sm">
      <div className="font-semibold text-info">Säule 3a: noch <Money value={a.gap} decimals={false} /> bis zum Maximum</div>
      <p className="mt-1 text-muted">
        Zahlst du bis Ende Dezember ein, sparst du rund <Money value={a.savingExtra} decimals={false} /> Steuern.
      </p>
    </a>
  );
}
