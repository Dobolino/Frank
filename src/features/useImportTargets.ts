import { useEffect, useState } from 'react';
import {
  hasAccountBinding, prepareAccountRecognition, rememberAccountSources,
  type AccountRecognitionPreview, type AccountSource,
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
  suggestion?: string;
}

export function compatibleAccount(account: ImportAccount, kind: ImportKind) {
  return kind === 'invest' ? account.type === 'depot' : account.type !== 'depot';
}

export function buildImportTargets(data: AppData, recognition: AccountRecognitionPreview, kind: ImportKind) {
  const accounts = (data.importAccounts ?? []).filter(account => compatibleAccount(account, kind));
  const usedNames = new Set(accounts.map(a => a.bankId + '|' + a.name.toLocaleLowerCase()));
  function newAccount(bankId: string, type: ImportAccount['type']): ImportAccount {
    const stem = accountTypeLabel(type);
    let name = stem;
    for (let n = 2; usedNames.has(bankId + '|' + name.toLocaleLowerCase()); n++) name = stem + ' ' + n;
    usedNames.add(bankId + '|' + name.toLocaleLowerCase());
    return { id: uid('import'), bankId, name, type };
  }
  const targets = recognition.sources.map((hint): ImportTarget => {
    const bankId = hint.bankId || unknownBank;
    const proposed = newAccount(bankId, hint.type);
    const peers = accounts.filter(a => a.bankId === bankId);
    const ambiguous = !!hint.fingerprint && recognition.sources.some(other => other !== hint && other.fingerprint === hint.fingerprint);
    const known = ambiguous ? undefined : accounts.find(a => a.id === hint.accountId);
    const hasCandidate = accounts.some(a => (!hint.bankId || a.bankId === hint.bankId || a.bankId === unknownBank) && !hasAccountBinding(data, a.id));
    // This export identifies Yuh, but carries no account identifier. Suggest the
    // sole suitable Yuh account only for the file being reviewed.
    const yuhStatement = !hint.source && bankId === 'yuh' && recognition.sources.length === 1;
    let manualReason: string | undefined;
    if (ambiguous) manualReason = 'Mehrere Quellen haben dieselbe verkürzte Kennung. Bitte das jeweilige Zielkonto wählen.';
    else if (yuhStatement && peers.length > 1) manualReason = 'Dieser Yuh-Auszug enthält keine Kontonummer. Wähle das passende Yuh-Konto.';
    else if (!known && !hint.fingerprint && !yuhStatement) manualReason = 'Keine eindeutige Kontokennung im Auszug. Wähle das Zielkonto.';
    else if (!known && hasCandidate && !yuhStatement) manualReason = 'Ein bestehendes Konto könnte zu dieser Quelle gehören. Bitte einmal zuordnen.';
    return { source: hint.source, proposed, selected: known ?? (manualReason ? undefined : yuhStatement ? peers[0] ?? proposed : proposed),
      matchedId: known?.id, masked: Boolean(hint.masked), canRemember: Boolean(hint.fingerprint), manualReason,
      suggestion: yuhStatement ? 'Yuh gibt in dieser Datei keine Kontonummer an. Die Auswahl gilt für diesen Auszug.' : undefined };
  });
  const banks = new Set(recognition.sources.map(hint => hint.bankId || unknownBank));
  const groupBank = banks.size === 1 ? [...banks][0]! : unknownBank;
  const groupAccount = targets.find(t => t.proposed.type === 'bank' && t.proposed.bankId === groupBank)?.proposed
    ?? newAccount(groupBank, 'bank');
  const known = new Set(targets.map(t => t.matchedId));
  const singleKnown = known.size === 1 && targets[0]?.matchedId;
  const shared: ImportTarget = {
    source: '', proposed: { ...groupAccount, id: uid('import') },
    selected: singleKnown ? accounts.find(a => a.id === singleKnown) : undefined,
    masked: false, canRemember: false,
  };
  if (!shared.selected && !accounts.some(a => a.bankId === groupBank || groupBank === unknownBank)) shared.selected = shared.proposed;
  return { targets, shared };
}

export function useImportTargets(data: AppData, sources: readonly AccountSource[], kind: ImportKind) {
  const [state, setState] = useState<{
    inputs: readonly AccountSource[]; data: AppData; recognition: AccountRecognitionPreview; targets: ImportTarget[]; shared: ImportTarget;
  }>();
  useEffect(() => {
    let active = true;
    void prepareAccountRecognition(data, sources).then(recognition => {
      if (active) setState({ inputs: sources, data, recognition, ...buildImportTargets(data, recognition, kind) });
    });
    return () => { active = false; };
  }, [data, sources, kind]);

  const current = state?.inputs === sources && state.data === data ? state : undefined;
  function select(source: string | null, selected?: ImportAccount) {
    setState(prev => {
      if (!prev || prev.inputs !== sources || prev.data !== data) return prev;
      const chosen = (item: ImportTarget) => ({ ...item, selected, proposed: selected?.id === item.proposed.id ? selected : item.proposed });
      if (source === null) return { ...prev, shared: chosen(prev.shared) };
      const editedOwnDraft = selected && prev.targets.find(t=>t.source === source)?.proposed.id === selected.id;
      return { ...prev, targets: prev.targets.map(item => {
        if (item.source === source) return chosen(item);
        if (editedOwnDraft && selected.id === item.selected?.id) {
          return { ...item, selected };
        }
        return item;
      }) };
    });
  }
  return { targets: current?.targets ?? [], shared: current?.shared, recognition: current?.recognition, select };
}

export function targetProblem(targets: ImportTarget[], accounts: ImportAccount[] = []) {
  const selected = targets.flatMap(t => t.selected ? [t.selected] : []);
  const unique = new Map(selected.map(a => [a.id, a]));
  const keyOf = (a: ImportAccount) => JSON.stringify([a.bankId.trim().toLocaleLowerCase(), a.type, a.name.trim().toLocaleLowerCase()]);
  const names = new Set(accounts.map(keyOf));
  for (const account of unique.values()) {
    if (accounts.some(a=>a.id === account.id)) continue;
    const key = keyOf(account);
    if (names.has(key)) return 'Dieser Kontoname ist beim Institut bereits vergeben. Wähle das bestehende Konto oder ändere den Namen.';
    names.add(key);
  }
}

export function saveImportTargets(draft: AppData, recognition: AccountRecognitionPreview, targets: ImportTarget[]) {
  const assignments = new Map<string, string>();
  for (const { source, selected } of targets) {
    if (!selected) continue;
    if (!draft.importAccounts?.some(a => a.id === selected.id)) {
      (draft.importAccounts ??= []).push({ ...selected, name: selected.name.trim(), bankId: selected.bankId.trim() });
    }
    assignments.set(source, selected.id);
  }
  for (const accountId of new Set(assignments.values())) {
    const account = draft.importAccounts?.find(a => a.id === accountId);
    if (!account || account.lastFour) continue;
    const hints = recognition.sources.filter(hint=>assignments.get(hint.source) === accountId);
    // Do not label a combined account with just one of its card numbers.
    const suffixes = new Set(hints.map(hint => hint.fingerprint && hint.type === account.type
      ? hint.source.replace(/\s/g,'').match(/\d{4}$/)?.[0] : undefined));
    const suffix = suffixes.size === 1 ? [...suffixes][0] : undefined;
    const known = new Set(hints.map(hint=>hint.fingerprint));
    const otherBindings = Object.entries(draft.accountRecognition?.bindings ?? {}).some(([fp,id]) => id === accountId && !known.has(fp));
    if (suffix && !otherBindings) account.lastFour = suffix;
  }
  rememberAccountSources(draft, recognition, assignments);
}
