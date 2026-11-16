import { useState } from 'react';
import { useStore } from '../app/store';
import { Button } from './shared';
import { backupDue, lastBackup, saveBackup, snoozeBackup } from '../storage/backup';

/** Hinweis auf der Übersicht, wenn das letzte Backup älter als 30 Tage ist. */
export function BackupReminder() {
  const { data } = useStore();
  const [due, setDue] = useState(backupDue);
  if (!due) return null;
  const last = lastBackup();

  return (
    <div role="status" className="mb-4 rounded-2xl border border-warn/30 bg-warn/5 p-4 text-sm">
      <div className="font-semibold text-warn">{last ? 'Backup ist über 30 Tage alt' : 'Noch kein Backup'}</div>
      <p className="mt-1 text-muted">
        Deine Daten liegen nur auf diesem Gerät. Löschst du die App oder die Website-Daten, sind sie weg. Sichere sie in iCloud Drive: «Sichern», dann «In Dateien sichern».
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={async () => {
            if ((await saveBackup(data)) !== 'cancelled') setDue(false);
          }}
        >
          Sichern
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            snoozeBackup();
            setDue(false);
          }}
        >
          In 7 Tagen erinnern
        </Button>
      </div>
    </div>
  );
}
