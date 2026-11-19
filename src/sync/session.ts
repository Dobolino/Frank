import type { AppData } from '../domain/types';
import { newAccountRecognitionKey } from '../domain/accountRecognition';
import { parseAppData } from '../storage/storage';
import { getCheckpoint, setCheckpoint, type Checkpoint } from './checkpoint';
import { ImportSourceConflict } from './importConflicts';
import { reconcile } from './reconcile';

export type Choice = 'merge' | 'local' | 'peer' | 'preferLocal' | 'preferPeer';
export type SyncView =
  | { step: 'connected' | 'requested' | 'invited' | 'working' | 'complete' }
  | { step: 'review'; local: AppData | null; peer: AppData | null; choices: Choice[]; conflicts: string[]; reason?: string }
  | { step: 'approve'; proposed: AppData; choice: Choice }
  | { step: 'failed'; message: string };

interface Callbacks {
  current: () => AppData | null;
  save: (expected: AppData | null, proposed: AppData) => Promise<void>;
  send: (message: string) => Promise<void>;
  change: (state: SyncView) => void;
}

export class SyncSession {
  private step: SyncView['step'] = 'connected';
  private round = '';
  private previous: AppData | null = null;
  private checkpoint: Checkpoint | null = null;
  private candidates = new Map<Choice,AppData>();
  private proposal?: AppData;
  private closed = false;

  constructor(readonly host: boolean, private api: Callbacks) {}

  private view(state: SyncView) {
    if (this.closed) return;
    this.step = state.step;
    this.api.change(state);
  }

  private send(type: string, fields: object = {}) {
    if (this.closed) throw new Error('Verbindung beendet.');
    return this.api.send(JSON.stringify({ type, round: this.round, ...fields }));
  }

  private async capture() {
    this.previous = this.api.current();
    this.checkpoint = await getCheckpoint();
  }

  async begin() {
    if (!this.host || !['connected','complete','failed'].includes(this.step)) return;
    this.view({step:'working'});
    this.round = crypto.randomUUID();
    this.candidates.clear();
    this.proposal = undefined;
    await this.capture();
    this.view({step:'requested'});
    await this.send('request');
  }

  async share() {
    if (this.host || this.step !== 'invited') return;
    this.view({step:'working'});
    await this.capture();
    await this.send('snapshot', { data: this.previous, base: this.checkpoint?.id ?? null });
  }

  async propose(choice: Choice) {
    if (!this.host || this.step !== 'review') return;
    const data = this.candidates.get(choice);
    if (!data) return;
    this.unchanged();
    // The devices must be able to recognise the same new account after independent offline imports.
    this.proposal = data.accountRecognition ? data : {
      ...data, accountRecognition: { key: newAccountRecognitionKey(), bindings: {} },
    };
    this.view({step:'working'});
    await this.send('proposal', { data: this.proposal, choice });
  }

  private unchanged() {
    if (this.closed || this.api.current() !== this.previous)
      throw new Error('Daten wurden während des Vergleichs geändert. Bitte erneut vergleichen.');
  }

  private async apply() {
    this.unchanged();
    if (!this.proposal) throw new Error('Der gemeinsame Stand fehlt.');
    await this.api.save(this.previous,this.proposal);
    // Bind a common ancestor only to a successfully persisted record.
    await setCheckpoint({ id: this.round, data: this.proposal });
  }

  async approve() {
    if (this.host || this.step !== 'approve') return;
    this.view({step:'working'});
    await this.apply();
    await this.send('applied');
  }

  private review(peer: AppData | null, peerBase: unknown) {
    const here = this.previous;
    let choices: Choice[] = [];
    let conflicts: string[] = [];
    let reason: string | undefined;
    if (here) { this.candidates.set('local',here); choices.push('local'); }
    if (peer) { this.candidates.set('peer',peer); choices.push('peer'); }
    if (here && peer && JSON.stringify(here) === JSON.stringify(peer)) {
      this.candidates.set('merge',here);
      choices = ['merge'];
    } else if (here && peer && this.checkpoint && this.checkpoint.id === peerBase) {
      try {
        const result = reconcile(this.checkpoint.data,here,peer);
        conflicts = result.conflicts;
        if (conflicts.length) {
          this.candidates.set('preferLocal',result.data);
          this.candidates.set('preferPeer',reconcile(this.checkpoint.data,here,peer,'peer').data);
          choices = ['preferLocal','preferPeer'];
        } else {
          this.candidates.set('merge',result.data);
          choices = ['merge'];
        }
      } catch (error) {
        reason = error instanceof ImportSourceConflict ? error.message :
          'Die geänderten Verknüpfungen zwischen Konten und Buchungen passen nicht zusammen. Wähle den vollständigen Stand für beide Geräte.';
      }
    }
    if (!choices.length) throw new Error('Richte Frank zuerst auf einem der beiden Geräte ein.');
    this.view({step:'review',local:here,peer,choices,conflicts,reason});
  }

  async message(text: string) {
    if (this.closed) return;
    const msg = JSON.parse(text);
    if (!msg || typeof msg.round !== 'string' || msg.round.length > 80) throw new Error('Ungültige Abgleichanfrage.');
    if (msg.type === 'request' && !this.host && ['connected','complete','failed'].includes(this.step)) {
      this.round = msg.round;
      this.proposal = undefined;
      this.view({step:'invited'});
      return;
    }
    if (msg.round !== this.round) return;
    if (msg.type === 'stop') {
      this.view({step:'failed',message:'Der Abgleich wurde auf dem anderen Gerät beendet. Du kannst erneut vergleichen.'});
    } else if (msg.type === 'snapshot' && this.host && this.step === 'requested') {
      this.unchanged();
      this.review(msg.data === null ? null : parseAppData(JSON.stringify(msg.data)), msg.base);
    } else if (msg.type === 'proposal' && !this.host && this.step === 'working' && !this.proposal) {
      if (!['merge','local','peer','preferLocal','preferPeer'].includes(msg.choice)) throw new Error('Unbekannter Vergleich.');
      this.proposal = parseAppData(JSON.stringify(msg.data));
      this.unchanged();
      this.view({step:'approve',proposed:this.proposal,choice:msg.choice});
    } else if (msg.type === 'applied' && this.host && this.step === 'working' && this.proposal) {
      await this.apply();
      await this.send('finished');
      this.view({step:'complete'});
    } else if (msg.type === 'finished' && !this.host && this.step === 'working' && this.proposal) {
      this.view({step:'complete'});
    }
  }

  async stop(message = 'Abgleich abgebrochen.') {
    if (this.closed) return;
    this.view({step:'failed',message});
    if (this.round) await this.send('stop').catch(() => {});
  }

  close() { this.closed = true; }
}
