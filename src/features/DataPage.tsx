import { lazy, Suspense, useRef, useState } from 'react';
import { useStore } from '../app/store';
import { Button, Card, PageHeader, todayYm } from './shared';
import { downloadJson, downloadRaw, latestRecovery, parseAppData } from '../storage/storage';
import { initialData, hasPersonalSeed } from '../seed';
import { buildAiSummary } from '../domain/aiSummary';
import { lastBackup, saveBackup } from '../storage/backup';
const AccountManager = lazy(() => import('./ImportAccountManager').then(m => ({ default: m.AccountsCard })));

function AccountsCard({ standalone = false }: { standalone?: boolean }) {
  return <Suspense fallback={<p role="status" className="text-sm text-muted">Konten werden geladen …</p>}>
    <AccountManager standalone={standalone} />
  </Suspense>;
}

export function AccountsPage() {
  return <><PageHeader title="Konten & Karten" /><AccountsCard standalone /></>;
}

export function DataPage() {
  const { data, replaceAll, model } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const recovery = latestRecovery();
  const [last, setLast] = useState(lastBackup);
  const summary = buildAiSummary(model, data.goals, todayYm());

  const onImport = async (file: File) => {
    try {
      const parsed = parseAppData(await file.text());
      if (!window.confirm(`Backup mit ${Object.keys(parsed.years).length} Jahr(en) laden? Die aktuellen Daten werden ersetzt.`)) return;
      if (!await replaceAll(parsed)) return;
      setMessage({ ok: true, text: 'Backup geladen.' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Import fehlgeschlagen.' });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setMessage({ ok: true, text: 'Zusammenfassung kopiert – füge sie in Claude oder einen anderen Assistenten ein.' });
    } catch {
      setMessage({ ok: false, text: 'Kopieren nicht möglich – Text bitte manuell markieren.' });
    }
  };

  return (
    <>
      <PageHeader title="Daten & KI" subtitle="Alles bleibt lokal in deinem Browser. Backups als JSON-Datei." />
      {message && (
        <div className={`mb-4 rounded-xl border px-4 py-2.5 text-sm ${message.ok ? 'border-accent/30 bg-accent/5 text-accent' : 'border-danger/30 bg-danger/5 text-danger'}`}>
          {message.text}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <AccountsCard />
        <a className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-accent md:col-span-2" href="#sync">Geräte verbinden und Daten abgleichen ›</a>

        <Card title="Backup">
          <p className="mb-2 text-sm text-muted">
            Die Daten liegen nur auf diesem Gerät. Auf dem iPhone: «Sichern», dann «In Dateien sichern» und einen Ordner in iCloud Drive wählen.
          </p>
          <p className="mb-4 text-xs text-muted">
            Letztes Backup: {last ? last.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'noch keines'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={async () => {
                const result = await saveBackup(data);
                if (result === 'cancelled') return;
                setLast(lastBackup());
                setMessage({ ok: true, text: result === 'shared' ? 'Backup gesichert.' : 'Backup heruntergeladen.' });
              }}
            >
              Sichern
            </Button>
            <Button onClick={() => downloadJson(data, `frank-backup-${new Date().toISOString().slice(0, 10)}.json`)}>Als Datei laden</Button>
            <Button onClick={() => fileRef.current?.click()}>Import …</Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImport(f);
                e.target.value = '';
              }}
            />
          </div>
          {recovery !== null && (
            <div className="mt-4">
              <Button onClick={() => downloadRaw(recovery, 'frank-backup-wiederherstellung.json')}>Vorherigen Stand herunterladen</Button>
              <p className="mt-2 text-xs text-muted">Sicherung vor dem letzten Import oder Zurücksetzen.</p>
            </div>
          )}
          <div className="mt-6 border-t border-line pt-4">
            <Button
              variant="danger"
              onClick={async () => {
                if (window.confirm('Alle Änderungen verwerfen und die Startdaten neu laden? Vorher ein Backup machen!')) {
                  if (!await replaceAll(initialData())) return;
                  setMessage({ ok: true, text: 'Startdaten neu geladen.' });
                }
              }}
            >
              Auf Startdaten zurücksetzen
            </Button>
            <p className="mt-2 text-xs text-muted">Startdaten: {hasPersonalSeed() ? 'persönliche Daten (personal.local.ts)' : 'Demo-Daten'}</p>
          </div>
        </Card>

        <Card title="KI-Zusammenfassung" action={<Button onClick={copy}>Kopieren</Button>}>
          <p className="mb-3 text-sm text-muted">
            Die Zusammenfassung enthält deine Beträge sowie die Namen deiner Budgetposten und Sparziele. Prüfe persönliche Angaben vor dem Teilen. Die App sendet den Text nicht automatisch.
          </p>
          <pre className="max-h-96 overflow-auto rounded-xl bg-bg p-3 text-xs whitespace-pre-wrap text-muted">{summary}</pre>
        </Card>
      </div>
    </>
  );
}
