import { useEffect, useState } from 'react';
import {
  hasAccountBinding, prepareAccountRecognition, rememberAccountSources, type AccountRecognitionPreview, type AccountSource,
} from '../domain/accountRecognition';
import { uid } from '../seed/builders';
import { accountTypeLabel } from '../domain/importAccounts';
import type { AppData, ImportAccount } from '../domain/types';

export type ImportKind = 'expenses' | 'invest';
export const unknownBank = 'Unbekanntes Institut';

export interface ImportTarget {
  source: string;
  selected?: ImportAccount;
  proposed: ImportAccount;
  matchedId?: string;
  masked: boolean;
  canRemember: boolean;
  manualReason?: string;
}

export function compatibleAccount(account: ImportAccount, kind: ImportKind) {
  return kind === 'invest' ? account.type === 'depot' : account.type !== 'depot';
}

export function useImportTargets(data: AppData, sources: readonly AccountSource[], kind: ImportKind) {
  const [state, setState] = useState<{
    inputs: readonly AccountSource[]; data: AppData; recognition: AccountRecognitionPreview; targets: ImportTarget[];
  }>();
  useEffect(() => {
    let active = true;
    void prepareAccountRecognition(data, sources).then(recognition => {
      if (!active) return;
      const accounts = (data.importAccounts ?? []).filter(account => compatibleAccount(account, kind));
      const usedNames = new Set(accounts.map(a => a.bankId + '|' + a.name.toLocaleLowerCase()));
      const targets = recognition.sources.map(hint => {
        const bankId = hint.bankId || unknownBank;
        const stem = accountTypeLabel(hint.type);
        let name = stem;
        for (let n = 2; usedNames.has(bankId + '|' + name.toLocaleLowerCase()); n++) name = stem + ' ' + n;
        usedNames.add(bankId + '|' + name.toLocaleLowerCase());
        const proposed: ImportAccount = { id: uid('import'), bankId, name, type: hint.type };
        const ambiguous = !!hint.fingerprint && recognition.sources.some(other => other !== hint && other.fingerprint === hint.fingerprint);
        const known = ambiguous ? undefined : accounts.find(a => a.id === hint.accountId);
        const hasCandidate = accounts.some(a => (!hint.bankId || a.bankId === hint.bankId || a.bankId === unknownBank) && !hasAccountBinding(data, a.id));
        let manualReason: string | undefined;
        if (ambiguous) manualReason = 'Mehrere Quellen haben dieselbe verkürzte Kennung. Bitte das jeweilige Zielkonto wählen.';
        else if (!known && !hint.fingerprint) manualReason = 'Keine eindeutige Kontokennung im Auszug. Wähle das Zielkonto.';
        else if (!known && hasCandidate) manualReason = 'Ein bestehendes Konto könnte zu dieser Quelle gehören. Bitte einmal zuordnen.';
        return { source: hint.source, proposed, selected: known ?? (manualReason ? undefined : proposed),
          matchedId: known?.id, masked: Boolean(hint.masked), canRemember: Boolean(hint.fingerprint), manualReason };
      });
      setState({ inputs: sources, data, recognition, targets });
    });
    return () => { active = false; };
  }, [data, sources, kind]);

  const current = state?.inputs === sources && state.data === data ? state : undefined;
  const select = (source: string, selected?: ImportAccount) => setState(prev => {
    if (!prev || prev.inputs !== sources || prev.data !== data) return prev;
    return { ...prev, targets: prev.targets.map(item => item.source !== source ? item : {
      ...item, selected, proposed: selected?.id === item.proposed.id ? selected : item.proposed,
    }) };
  });
  return { targets: current?.targets ?? [], recognition: current?.recognition, select };
}

/** Also catches an accidental second account after editing the default name. */
export function targetProblem(targets: ImportTarget[], accounts: ImportAccount[] = []) {
  const selected = targets.flatMap(t => t.selected ? [t.selected.id] : []);
  if (new Set(selected).size !== selected.length) return 'Wähle für jede Quelle ein eigenes Konto.';
  const nameKey = (a: ImportAccount) => JSON.stringify([a.bankId.trim().toLocaleLowerCase(), a.type, a.name.trim().toLocaleLowerCase()]);
  const names = new Set(accounts.map(nameKey));
  for (const target of targets) {
    if (target.selected?.id !== target.proposed.id) continue;
    const key = nameKey(target.proposed);
    if (names.has(key)) return 'Dieser Kontoname ist beim Institut bereits vergeben. Wähle das bestehende Konto oder ändere den Namen.';
    names.add(key);
  }
}

/** Commit proposals and learned source identifiers in the same update as their bookings. */
export function saveImportTargets(draft: AppData, recognition: AccountRecognitionPreview, targets: ImportTarget[]) {
  const assignments = new Map<string, string>();
  for (const { source, selected, proposed } of targets) {
    if (!selected) continue;
    if (selected.id === proposed.id && !draft.importAccounts?.some(a => a.id === selected.id)) {
      (draft.importAccounts ??= []).push({ ...selected, name: selected.name.trim(), bankId: selected.bankId.trim() });
    }
    assignments.set(source, selected.id);
  }
  rememberAccountSources(draft, recognition, assignments);
}
