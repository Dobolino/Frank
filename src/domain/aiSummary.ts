import { formatChf, formatPercent } from './money';
import { CATEGORY_LABELS, type SavingsGoal } from './types';
import { frequencyLabel, monthlyAmount } from './budgetEngine';
import { goalStatus } from './goalsEngine';
import type { YearModel } from './yearModel';

/**
 * Anonymisierte Zusammenfassung für einen KI-Assistenten (keine Namen, keine Kontonummern).
 * Wird nur in die Zwischenablage kopiert – die App sendet nichts ins Internet.
 */
export function buildAiSummary(m: YearModel, goals: SavingsGoal[], today: string): string {
  const c = (r: number) => `CHF ${formatChf(r)}`;
  const lines: string[] = [];
  const canton = m.taxParams ? `Kanton ${m.taxParams.canton.name}, ` : '';
  const status = m.taxInput.married ? 'verheiratet' : 'ledig';
  const n = m.taxInput.children?.length ?? 0;
  const kids = n ? `, ${n} ${n === 1 ? 'Kind' : 'Kinder'}` : '';
  lines.push(`# Meine Finanzen ${m.plan.year} (Schweiz, ${canton}${status}${kids})`);
  lines.push('');
  lines.push('## Einkommen');
  lines.push(`- Nettolohn regulär: ${c(m.salary.regularNet)} pro Monat`);
  lines.push(`- Nettolohn Jahr inkl. 13. Lohn/Bonus: ${c(m.salary.totals.net)}`);
  if (m.otherIncomeYearly > 0) lines.push(`- Weitere Einkünfte (Dividenden etc.): ${c(m.otherIncomeYearly)} pro Jahr`);
  lines.push('');
  lines.push('## Budget pro Monat');
  for (const cat of m.summary.categories) {
    if (cat.items.length === 0) continue;
    lines.push(`### ${CATEGORY_LABELS[cat.category]} – ${c(cat.monthly)}`);
    for (const i of cat.items) {
      const monthly = monthlyAmount(i);
      if (monthly === 0) continue;
      const freq = i.frequency.kind === 'monthly' ? '' : ` (${frequencyLabel(i.frequency)})`;
      lines.push(`- ${i.name}: ${c(monthly)}${freq}`);
    }
  }
  lines.push('');
  lines.push('## Kennzahlen');
  lines.push(`- Ausgaben total: ${c(m.summary.expensesMonthly)} pro Monat`);
  lines.push(`- Rest pro Monat: ${c(m.summary.saldoMonthly)}`);
  lines.push(`- Jahresüberschuss: ${c(m.summary.surplusYearly)}`);
  lines.push(`- Sparquote: ${formatPercent(m.summary.savingsRate)}`);
  lines.push(`- Fixkostenanteil: ${formatPercent(m.summary.fixedShare)}`);
  lines.push(`- Steuern (geschätzt): ${c(m.tax.total)} pro Jahr, Grenzsteuersatz ${formatPercent(m.tax.marginalRate)}`);
  for (const t of m.transfers) lines.push(`- Dauerauftrag ${t.account.type === 'pillar3a' ? 'Säule 3a' : 'Sparkonto'}: ${c(t.standingOrder)} pro Monat`);
  if (goals.length > 0) {
    lines.push('');
    lines.push('## Sparziele');
    for (const g of goals) {
      const s = goalStatus(g, m.budget, today);
      lines.push(`- ${g.name}: ${c(g.saved)} von ${c(g.target)} bis ${g.dueDate}, nötig ${c(s.requiredMonthly)}/Monat, budgetiert ${c(s.budgetedMonthly)}/Monat`);
    }
  }
  lines.push('');
  lines.push('## Meine Frage');
  lines.push('Wo kann ich realistisch sparen, um mehr Geld für Reisen zur Seite zu legen, ohne die Vorsorge zu vernachlässigen? Bitte konkret mit Beträgen.');
  return lines.join('\n');
}
