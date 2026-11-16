import { PageHeader } from './shared';
import { CashflowPage } from './CashflowPage';
import { GoalsPage } from './GoalsPage';

/** Sparkonto, Daueraufträge und Sparziele auf einer Seite. */
export function SavingsPage() {
  return (
    <>
      <PageHeader title="Sparen" subtitle="Daueraufträge für Jahresrechnungen und deine Sparziele." />
      <CashflowPage embedded />
      <GoalsPage embedded />
    </>
  );
}
