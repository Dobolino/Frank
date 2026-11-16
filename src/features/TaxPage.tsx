import { useMemo, useState } from 'react';
import { useStore } from '../app/store';
import { Badge, Card, Collapsible, Money, MoneyInput, PageHeader, Row, Select, Toggle, Warnings, cx } from './shared';
import { COMMUTE_LABELS, type CommuteMode, type MealDeduction, type Profile, type TaxProfile, type YearPlan } from '../domain/types';
import { buildYearModel } from '../domain/yearModel';
import { formatPercent, type Rappen } from '../domain/money';
import { CONFESSION_LABELS } from '../params/taxData';
import { LocationCard } from './LocationCard';
import { Pillar3aCard } from './Pillar3aCard';
import { summarizePortfolio } from '../domain/investEngine';
import type { DeductionLine } from '../domain/tax/taxEngine';

const MEAL_OPTIONS: { value: MealDeduction; label: string }[] = [
  { value: 'none', label: 'Kein Abzug' },
  { value: 'full', label: 'Auswärts ohne Verbilligung' },
  { value: 'reduced', label: 'Kantine mit Verbilligung' },
];

function Deductions({ lines }: { lines: DeductionLine[] }) {
  return (
    <>
      {lines.map((d) => (
        <Row key={d.key} label={d.label} hint={d.hint} value={d.amount > 0 ? <>−<Money value={d.amount} /></> : '–'} />
      ))}
    </>
  );
}

export function TaxPage() {
  const { model, updateYear, data } = useStore();
  const { tax, plan, taxParams: params } = model;
  const depot = summarizePortfolio(data.investments);
  const place = !params
    ? 'ohne Wohnort'
    : params.municipality.name.includes(`(${params.canton.code})`)
      ? params.municipality.name
      : `${params.municipality.name} (${params.canton.code})`;
  const kids = data.profile.children?.length ?? 0;
  const family = [data.profile.civilStatus === 'married' ? 'verheiratet' : 'ledig', kids > 0 ? `${kids} ${kids === 1 ? 'Kind' : 'Kinder'}` : ''].filter(Boolean).join(', ');
  const church = data.profile.church === 'none' ? 'ohne Konfession' : CONFESSION_LABELS[data.profile.church];
  const notes = model.warnings.filter((w) => !tax.warnings.includes(w) && /Steuer(füsse|daten)|Wohnort/.test(w));
  const setTax = (fn: (t: TaxProfile) => void) => updateYear((p) => fn(p.tax));

  return (
    <>
      <PageHeader
        title={`Steuern ${plan.year}`}
        subtitle={`Provisorische Berechnung für ${place} · ${family} · ${church}`}
        action={params && <Badge tone={model.taxParamsExact ? 'good' : 'warn'}>Tarif {params.year}</Badge>}
      />
      <Warnings items={[...notes, ...tax.warnings]} />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Ergebnis" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-4">
            <Mini label="Bund" value={tax.federal.tax} />
            <Mini label={`Kanton ${params?.canton.code ?? ''}`} value={tax.canton.cantonTax} />
            <Mini label={`Gemeinde${params ? ` (${Math.round(params.rates.incomeCity * 1000) / 10} %)` : ''}`} value={tax.canton.municipalTax} />
            <Mini label="Total" value={tax.total} accent />
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-panel-2 p-3">
              <div className="text-muted">Rückstellung pro Monat</div>
              <div className="num text-lg font-semibold text-accent"><Money value={model.taxProvisionSuggested} /></div>
              <div className="text-xs text-muted">budgetiert: <Money value={model.taxProvisionBudgeted} /></div>
            </div>
            <div className="rounded-xl bg-panel-2 p-3">
              <div className="text-muted">Durchschnittssatz</div>
              <div className="num text-lg font-semibold">{formatPercent(tax.effectiveRate)}</div>
              <div className="text-xs text-muted">vom Nettoeinkommen</div>
            </div>
            <div className="rounded-xl bg-panel-2 p-3">
              <div className="text-muted">Grenzsteuersatz</div>
              <div className="num text-lg font-semibold">{formatPercent(tax.marginalRate)}</div>
              <div className="text-xs text-muted">von 100 CHF mehr gehen so viel an Steuern</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Collapsible summary={<span>Bund – steuerbar <Money value={tax.federal.taxableIncome} decimals={false} /></span>}>
              <Row label="Einkünfte" value={<Money value={tax.federal.grossIncome} />} />
              <Deductions lines={tax.federal.deductions} />
              <Row strong label="Steuerbares Einkommen" value={<Money value={tax.federal.taxableIncome} />} />
            </Collapsible>
            <Collapsible summary={<span>Kanton/Gemeinde – steuerbar <Money value={tax.canton.taxableIncome} decimals={false} /></span>}>
              <Row label="Einkünfte" value={<Money value={tax.canton.grossIncome} />} />
              <Deductions lines={tax.canton.deductions} />
              <Row strong label="Steuerbares Einkommen" value={<Money value={tax.canton.taxableIncome} />} />
              <Row label="Einfache Steuer" hint="Tarif vor Steuerfuss" value={<Money value={tax.canton.simpleTax} />} />
              <Row label="Kantonssteuer" value={<Money value={tax.canton.cantonTax} />} />
              <Row label="Gemeindesteuer" value={<Money value={tax.canton.municipalTax} />} />
              {tax.canton.churchTax > 0 && <Row label="Kirchensteuer" value={<Money value={tax.canton.churchTax} />} />}
              {tax.canton.personalTax > 0 && <Row label="Personalsteuer" value={<Money value={tax.canton.personalTax} />} />}
              {model.taxInput.wealth > 0 && (
                <>
                  <Row label="Steuerbares Vermögen" hint="nach Freibetrag" value={<Money value={tax.canton.wealthTaxable} decimals={false} />} />
                  <Row label={tax.canton.wealthChurch > 0 ? 'Vermögenssteuer Kanton, Gemeinde, Kirche' : 'Vermögenssteuer Kanton + Gemeinde'} value={<Money value={tax.wealthTaxTotal} />} />
                </>
              )}
            </Collapsible>
          </div>
        </Card>

        <div className="space-y-4">
        <LocationCard />
        <Card title="Angaben">
          <label className="block text-xs text-muted">
            Arbeitsweg
            <Select<CommuteMode>
              className="mt-1 block w-full"
              value={plan.tax.commuteMode}
              options={(Object.keys(COMMUTE_LABELS) as CommuteMode[]).map((k) => ({ value: k, label: COMMUTE_LABELS[k] }))}
              onChange={(v) => setTax((t) => void (t.commuteMode = v))}
            />
          </label>
          {plan.tax.commuteMode !== 'none' && (
            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-muted">Fahrkosten pro Jahr</span>
              <MoneyInput ariaLabel="Fahrkosten pro Jahr" value={plan.tax.commuteCosts} onChange={(v) => setTax((t) => void (t.commuteCosts = v))} />
            </div>
          )}
          <label className="mt-3 block text-xs text-muted">
            Verpflegung
            <Select className="mt-1 block w-full" value={plan.tax.meal} options={MEAL_OPTIONS} onChange={(v) => setTax((t) => void (t.meal = v))} />
          </label>
          {data.profile.civilStatus === 'married' && (
            <div className="mt-3 flex items-center justify-between gap-3 text-sm">
              <span className="text-muted" title="Nettolohn pro Jahr laut Lohnausweis (Ziffer 11)">Nettolohn Partner/in pro Jahr</span>
              <MoneyInput ariaLabel="Nettolohn Partner/in" value={plan.tax.partnerNet ?? 0} onChange={(v) => setTax((t) => void (t.partnerNet = v || undefined))} />
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">Weitere Abzüge</span>
            <MoneyInput ariaLabel="Weitere Abzüge" value={plan.tax.otherDeductions} onChange={(v) => setTax((t) => void (t.otherDeductions = v))} />
          </div>
          {params?.canton.deductions.rentMax ? (
            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-muted" title={`Nur Kantonssteuer, max. CHF ${params.canton.deductions.rentMax}`}>Mieterabzug</span>
              <MoneyInput ariaLabel="Mieterabzug" value={plan.tax.rentDeduction ?? 0} onChange={(v) => setTax((t) => void (t.rentDeduction = v))} />
            </div>
          ) : null}
          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span className="text-muted" title="Konten, Auto, übriges Vermögen – ohne Säule 3a und Pensionskasse">
              {depot.positions.length > 0 ? 'Konten & übriges Vermögen' : 'Vermögen 31.12.'}
            </span>
            <MoneyInput ariaLabel="Vermögen 31.12." value={plan.tax.wealth} onChange={(v) => setTax((t) => void (t.wealth = v))} />
          </div>
          {depot.positions.length > 0 && (
            <div className="mt-2">
              <Toggle
                checked={plan.tax.includeDepot ?? false}
                onChange={(v) => setTax((t) => void (t.includeDepot = v || undefined))}
                label={
                  <span className="text-sm">
                    Depot einrechnen <span className="text-muted">(<Money value={depot.totalChf} decimals={false} />)</span>
                  </span>
                }
              />
              {plan.tax.includeDepot && (
                <p className="mt-1 text-xs text-muted">
                  Steuerbares Vermögen total <Money value={model.taxInput.wealth} decimals={false} />. Frank nimmt den aktuellen Depotwert, massgebend ist der Wert am 31.12.
                </p>
              )}
            </div>
          )}
          <div className="mt-3">
            <Toggle checked={plan.tax.ktgDeductible} onChange={(v) => setTax((t) => void (t.ktgDeductible = v))} label={<span className="text-sm">KTG im Lohnausweis abgezogen</span>} />
          </div>
          <p className="mt-3 text-xs text-muted">
            Säule 3a und Versicherungsprämien kommen aus dem Budget (Posten mit Steuer-Markierung). Dividenden: «Weitere Einkünfte» unten.
          </p>
        </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <OtherIncomeCard />
        <ActualTaxCard />
      </div>

      <div className="mt-4">
        <Pillar3aCard />
      </div>

      <ScenarioCard plan={plan} accounts={data.accounts} profile={data.profile} depotChf={depot.totalChf} baseTotal={tax.total} baseExpenses={model.summary.expensesYearly} baseNet={model.salary.totals.net} />

      <p className="mt-6 text-xs text-muted">
        Quelle: ESTV-Steuerrechner (Tarife, Abzüge, Steuerfüsse). Die Berechnung ist für alle Kantonshauptorte gegen den ESTV-Rechner getestet. Provisorische Schätzung, massgebend ist die Veranlagung.
      </p>
    </>
  );
}

function Mini({ label, value, accent }: { label: string; value: Rappen; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx('num text-lg font-semibold', accent && 'text-accent')}><Money value={value} /></div>
    </div>
  );
}

function OtherIncomeCard() {
  const { model, updateYear } = useStore();
  return (
    <Card title="Weitere Einkünfte">
      {model.plan.otherIncome.length === 0 && <p className="text-sm text-muted">Keine.</p>}
      {model.plan.otherIncome.map((o, idx) => (
        <div key={o.id} className="flex items-center justify-between gap-2 py-1 text-sm">
          <input
            aria-label={`Bezeichnung Einkunft ${idx + 1}`}
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 hover:border-line"
            value={o.name}
            onChange={(e) => updateYear((p) => void (p.otherIncome[idx]!.name = e.target.value))}
          />
          <MoneyInput ariaLabel={`Betrag ${o.name}`} value={o.amount} onChange={(v) => updateYear((p) => void (p.otherIncome[idx]!.amount = v))} />
          <button aria-label={`${o.name} entfernen`} className="px-2 text-muted hover:text-danger" onClick={() => updateYear((p) => void p.otherIncome.splice(idx, 1))}>×</button>
        </div>
      ))}
      <button
        className="mt-2 text-sm text-muted hover:text-text"
        onClick={() => updateYear((p) => void p.otherIncome.push({ id: `inc-${Date.now()}`, name: 'Dividenden', kind: 'dividend', amount: 0 }))}
      >
        + Einkunft
      </button>
      <p className="mt-2 text-xs text-muted">Dividenden brutto (vor 35 % Verrechnungssteuer) erfassen.</p>
    </Card>
  );
}

function ActualTaxCard() {
  const { model, updateYear } = useStore();
  const actual = model.plan.actualTax ?? {};
  const actualTotal = (actual.federal ?? 0) + (actual.cantonMunicipal ?? 0);
  const diff = model.tax.incomeTaxTotal - actualTotal;
  return (
    <Card title="Tatsächliche Steuer (Veranlagung)">
      <div className="flex items-center justify-between gap-3 py-1 text-sm">
        <span className="text-muted">Bund</span>
        <MoneyInput ariaLabel="Veranlagung Bund" value={actual.federal ?? 0} onChange={(v) => updateYear((p) => void (p.actualTax = { ...p.actualTax, federal: v }))} />
      </div>
      <div className="flex items-center justify-between gap-3 py-1 text-sm">
        <span className="text-muted">Kanton + Gemeinde</span>
        <MoneyInput ariaLabel="Veranlagung Kanton und Gemeinde" value={actual.cantonMunicipal ?? 0} onChange={(v) => updateYear((p) => void (p.actualTax = { ...p.actualTax, cantonMunicipal: v }))} />
      </div>
      {actualTotal > 0 && (
        <Row
          strong
          label="Abweichung Schätzung"
          value={<span className={diff > 0 ? 'text-warn' : 'text-accent'}><Money value={diff} signed /></span>}
        />
      )}
      <p className="mt-2 text-xs text-muted">Hilft, die Schätzung über die Jahre zu kalibrieren (z. B. fehlende Abzüge).</p>
    </Card>
  );
}

function ScenarioCard({ plan, accounts, profile, depotChf, baseTotal, baseExpenses, baseNet }: { plan: YearPlan; accounts: Parameters<typeof buildYearModel>[1]; profile: Profile; depotChf: Rappen; baseTotal: Rappen; baseExpenses: Rappen; baseNet: Rappen }) {
  const [raise, setRaise] = useState<Rappen>(0);
  const [bonus, setBonus] = useState<Rappen>(0);
  const [no3a, setNo3a] = useState(false);

  const scenario = useMemo(() => {
    const p: YearPlan = structuredClone(plan);
    p.salary.grossMonthly += raise;
    p.salary.changes = p.salary.changes.map((c) => ({ ...c, grossMonthly: c.grossMonthly + raise }));
    if (bonus > 0) p.salary.bonuses.push({ month: 3, gross: bonus });
    if (no3a) p.budget = p.budget.filter((b) => b.taxTag !== 'pillar3a');
    return buildYearModel(p, accounts, profile, depotChf);
  }, [plan, accounts, profile, depotChf, raise, bonus, no3a]);

  const dNet = scenario.salary.totals.net - baseNet;
  const dTax = scenario.tax.total - baseTotal;
  /** Was effektiv mehr bleibt: mehr Netto minus mehr Steuern (3a-Verzicht zählt als frei verfügbar). */
  const freed3a = no3a ? scenario.summary.expensesYearly - baseExpenses : 0;
  const dAvailable = dNet - dTax - freed3a;

  return (
    <Card title="Szenario-Simulator" className="mt-4">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">Lohnerhöhung brutto / Monat</span>
            <MoneyInput ariaLabel="Lohnerhöhung brutto pro Monat" value={raise} onChange={setRaise} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">Zusätzlicher Bonus brutto</span>
            <MoneyInput ariaLabel="Zusätzlicher Bonus brutto" value={bonus} onChange={setBonus} />
          </div>
          <Toggle checked={no3a} onChange={setNo3a} label="Ohne Säule-3a-Einzahlung" />
        </div>
        <div>
          <Row label="Netto mehr pro Jahr" value={<Money value={dNet} signed />} />
          <Row label="Steuern mehr pro Jahr" value={<span className={dTax > 0 ? 'text-warn' : 'text-accent'}><Money value={dTax} signed /></span>} />
          <Row strong label="Bleibt dir effektiv mehr" value={<span className={dAvailable >= 0 ? 'text-accent' : 'text-danger'}><Money value={dAvailable} signed /></span>} />
          <p className="mt-2 text-xs text-muted">
            Steuerrückstellung neu: <Money value={scenario.taxProvisionSuggested} /> / Monat
            {no3a && ' · ohne 3a fehlt dir das Geld später in der Vorsorge'}.
          </p>
        </div>
      </div>
    </Card>
  );
}
