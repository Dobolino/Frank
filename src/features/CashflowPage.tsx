import { useStore } from '../app/store';
import { Badge, Card, Collapsible, Money, MoneyInput, NumberInput, PageHeader, Row, SectionHeader, cx } from './shared';
import { frequencyLabel, monthlyAmount } from '../domain/budgetEngine';
import { monthName } from '../domain/types';
import { uid } from '../seed/builders';

export function CashflowPage({ embedded = false }: { embedded?: boolean }) {
  const { model, updateYear } = useStore();
  const Header = embedded ? SectionHeader : PageHeader;

  return (
    <>
      <Header
        title="Sparkonto & Daueraufträge"
        subtitle="Wie viel du monatlich überweisen musst, damit alle Jahres- und Quartalsrechnungen gedeckt sind."
      />
      {model.cashflow.length === 0 && (
        <Card>
          <p className="text-sm text-muted">Ordne im Budget Posten einem Sparkonto zu («Bezahlt von»), dann erscheint hier der Kontoverlauf.</p>
        </Card>
      )}
      <div className="space-y-4">
        {model.cashflow.map((cf) => {
          const transfer = model.transfers.find((t) => t.account.id === cf.account.id);
          const alloc = model.plan.extrasAllocation.find((a) => a.accountId === cf.account.id);
          const max = Math.max(1, ...cf.months.map((m) => Math.abs(m.balanceEnd)));
          return (
            <Card
              key={cf.account.id}
              title={cf.account.name}
              action={cf.minBalance < 0 ? <Badge tone="bad">Lücke im {monthName(cf.minMonth)}</Badge> : <Badge tone="good">gedeckt</Badge>}
            >
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-1">
                  <div className="rounded-xl bg-panel-2 p-4">
                    <div className="text-xs text-muted">Dauerauftrag pro Monat</div>
                    <div className="num text-3xl font-semibold text-accent"><Money value={cf.standingOrder} decimals={false} /></div>
                    {transfer && <div className="num text-xs text-muted">exakt <Money value={Math.round(transfer.monthlyNeed)} /></div>}
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-2 text-sm">
                    <span className="text-muted">Kontostand 1. Januar</span>
                    <MoneyInput
                      ariaLabel={`Kontostand 1. Januar ${cf.account.name}`}
                      value={cf.startBalance}
                      onChange={(v) => updateYear((p) => void (p.startBalances[cf.account.id] = v))}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted">Anteil 13. Lohn / Bonus</span>
                    <NumberInput
                      ariaLabel={`Anteil 13. Lohn und Bonus ${cf.account.name}`}
                      value={Math.round((alloc?.share ?? 0) * 100)}
                      step={5}
                      suffix="%"
                      onChange={(v) =>
                        updateYear((p) => {
                          const share = Math.max(0, Math.min(100, v)) / 100;
                          const existing = p.extrasAllocation.find((a) => a.accountId === cf.account.id);
                          if (existing) existing.share = share;
                          else p.extrasAllocation.push({ id: uid('x'), accountId: cf.account.id, share });
                        })
                      }
                    />
                  </div>
                  <Row label="Tiefster Stand" value={<Money value={cf.minBalance} />} />
                  <Row label="Stand Ende Jahr" value={<Money value={cf.endBalance} />} />
                  {cf.bufferNeeded > 0 && (
                    <p className="rounded-lg bg-danger/10 p-2 text-xs text-danger">
                      Es fehlen <Money value={cf.bufferNeeded} decimals={false} /> Startguthaben, damit das Konto nie ins Minus fällt.
                    </p>
                  )}
                </div>

                <div className="lg:col-span-2">
                  <div className="flex h-36 items-center gap-1">
                    {cf.months.map((m) => {
                      const h = (Math.abs(m.balanceEnd) / max) * 50;
                      return (
                        <div key={m.month} className="relative flex h-full flex-1 flex-col" title={`${monthName(m.month)}: ${(m.balanceEnd / 100).toFixed(2)}`}>
                          <div className="flex flex-1 items-end">
                            {m.balanceEnd >= 0 && <div className="w-full rounded-t bg-accent/70" style={{ height: `${h * 2}%` }} />}
                          </div>
                          <div className="h-px bg-line" />
                          <div className="flex flex-1 items-start">
                            {m.balanceEnd < 0 && <div className="w-full rounded-b bg-danger/70" style={{ height: `${h * 2}%` }} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-1 flex gap-1">
                    {cf.months.map((m) => (
                      <div key={m.month} className="flex-1 text-center text-[10px] text-muted">{monthName(m.month)}</div>
                    ))}
                  </div>

                  <div className="mt-3">
                    <Collapsible summary="Monat für Monat">
                      <p className="mb-2 text-xs text-muted sm:hidden">Tabelle seitlich scrollen für alle Beträge.</p>
                      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`Monatlicher Kontoverlauf ${cf.account.name}`}>
                        <table className="w-full min-w-[520px] text-sm">
                          <thead>
                            <tr className="text-right text-xs text-muted">
                              <th className="sticky left-0 z-10 bg-panel-2 pb-2 text-left font-normal">Monat</th>
                              <th className="pb-2 font-normal">Eingang</th>
                              <th className="pb-2 font-normal">Rechnungen</th>
                              <th className="pb-2 font-normal">Stand</th>
                            </tr>
                          </thead>
                          <tbody className="num text-right">
                            {cf.months.map((m) => (
                              <tr key={m.month} className="border-t border-line/60 align-top">
                                <td className="sticky left-0 z-10 bg-panel-2 py-1.5 pr-2 text-left">{monthName(m.month)}</td>
                                <td>
                                  <Money value={m.inflowStandingOrder + m.inflowExtras} />
                                  {m.inflowExtras > 0 && <div className="text-xs text-info">inkl. <Money value={m.inflowExtras} /> 13./Bonus</div>}
                                </td>
                                <td className="text-muted">
                                  −<Money value={m.outflow} />
                                  {m.bills.some((b) => b.amount > 1000_00) && (
                                    <div className="text-xs text-warn">{m.bills.filter((b) => b.amount > 1000_00).map((b) => b.name).join(', ')}</div>
                                  )}
                                </td>
                                <td className={cx('font-semibold', m.balanceEnd < 0 && 'text-danger')}><Money value={m.balanceEnd} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Collapsible>
                  </div>
                </div>
              </div>

              {transfer && (
                <div className="mt-4">
                  <Collapsible summary={`Zusammensetzung (${transfer.items.length} Posten)`}>
                    {transfer.items.map((i) => (
                      <Row key={i.id} label={i.name} hint={frequencyLabel(i.frequency)} value={<Money value={monthlyAmount(i)} />} />
                    ))}
                    <Row strong label="Total pro Monat" value={<Money value={Math.round(transfer.monthlyNeed)} />} />
                  </Collapsible>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-muted">
        Tipp: Stelle Jahresrechnungen (Autoversicherung, Serafe, MFK, Steuern) im Budget auf «jährlich» mit dem richtigen Fälligkeitsmonat. Dann zeigt der Kalender, ob der Dauerauftrag rechtzeitig reicht.
      </p>
    </>
  );
}
