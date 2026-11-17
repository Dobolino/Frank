import { PageHeader } from './shared';
import { CashflowPage } from './CashflowPage';
import { GoalsPage } from './GoalsPage';
import { RadarCard } from './RadarCard';

/** Sparkonto-Radar, Daueraufträge und Sparziele auf einer Seite. */
export function SavingsPage() {
  return (
    <>
      <PageHeader title="Sparen" subtitle="Sparkonto-Radar, Daueraufträge für Jahresrechnungen und deine Sparziele." />
      <div className="mt-4">
        <RadarCard />
      </div>
      <CashflowPage embedded />
      <GoalsPage embedded />
    </>
  );
}
