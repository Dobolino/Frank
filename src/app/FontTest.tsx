/**
 * Vorübergehende Testseite (?schrifttest): Varianten des Schriftzugs «Frank.», um auf dem iPhone
 * zu sehen, welche Darstellung unscharf wird. Wird nach der Diagnose wieder entfernt.
 */
const VARIANTS: { id: string; note: string; className: string; wrap?: boolean; plainHeader?: boolean }[] = [
  { id: 'A', note: 'wie jetzt', className: 'text-base leading-tight font-semibold tracking-tight' },
  { id: 'B', note: 'ohne enge Laufweite', className: 'text-base leading-tight font-semibold' },
  { id: 'C', note: 'mittlere Stärke (500)', className: 'text-base leading-tight font-medium tracking-tight' },
  { id: 'D', note: 'fett (700)', className: 'text-base leading-tight font-bold tracking-tight' },
  { id: 'E', note: 'grösser (18px)', className: 'text-lg font-semibold tracking-tight' },
  { id: 'F', note: '«Frank» in eigenem span', className: 'text-base leading-tight font-semibold tracking-tight', wrap: true },
  { id: 'G', note: 'Kopfzeile ohne Weichzeichner', className: 'text-base leading-tight font-semibold tracking-tight', plainHeader: true },
  { id: 'H', note: 'normale Zeilenhöhe', className: 'text-base font-semibold tracking-tight' },
];

export function FontTest() {
  return (
    <div className="min-h-screen pb-10">
      {VARIANTS.map((v) => (
        <header key={v.id} className="relative isolate border-b border-line">
          {!v.plainHeader && <div aria-hidden className="absolute inset-0 -z-10 bg-panel/95 backdrop-blur" />}
          <div className={v.plainHeader ? 'bg-panel px-4 py-2.5' : 'px-4 py-2.5'}>
            <div className="flex items-baseline justify-between">
              <div className={v.className}>
                {v.wrap ? <span>Frank</span> : 'Frank'}
                <span className="text-accent">.</span>
              </div>
              <span className="text-sm font-semibold text-accent">{v.id}</span>
            </div>
            <div className="text-[11px] text-muted">{v.note}</div>
          </div>
        </header>
      ))}
      <p className="px-4 pt-4 text-sm text-muted">Welche Buchstaben sind unscharf? Antworte mit den Buchstaben A bis H.</p>
      <div className="px-4 pt-4">
        <button
          className="rounded-lg bg-accent px-4 py-2 text-sm text-bg"
          onClick={() => {
            window.location.hash = '';
            window.location.reload();
          }}
        >
          Zurück zur App
        </button>
      </div>
    </div>
  );
}
