/** One ordered, encrypted data channel between two browsers on a local network. */
export const MAX_SYNC_BYTES = 32 * 1024 * 1024;
const CHUNK = 16 * 1024;
const HIGH_WATER = 256 * 1024;
const MAX_CODE = 24 * 1024;
const MAX_SDP = 32 * 1024;
const TRANSFER_TIMEOUT = 60_000;
const CHANNEL = 'frank-sync-v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

type Role = 'offer' | 'answer';
type Callbacks = {
  onOpen: () => void;
  onMessage: (payload: string) => void;
  onClose: (reason: string) => void;
};

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function boundedRead(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader();
  const result = new Uint8Array(limit);
  let count = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return result.subarray(0, count);
      if (next.value.length > limit - count) {
        await reader.cancel();
        throw new Error('Der Verbindungscode ist zu gross.');
      }
      result.set(next.value, count);
      count += next.value.length;
    }
  } finally { reader.releaseLock(); }
}

async function writeCode(sdp: string, role: Role, id: string) {
  const bytes = encoder.encode(sdp);
  if (bytes.length > MAX_SDP) throw new Error('Der Browser hat einen zu grossen Verbindungscode erzeugt.');
  const zip = typeof CompressionStream !== 'undefined';
  const packed = zip
    ? await boundedRead(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')), MAX_SDP)
    : bytes;
  const code = ['FRANK1', role === 'offer' ? 'O' : 'A', id, zip ? 'Z' : 'T', base64(packed)].join('.');
  if (code.length > MAX_CODE) throw new Error('Der Verbindungscode ist zu gross.');
  return code;
}

async function readCode(input: string, role: Role) {
  if (input.length > MAX_CODE * 2) throw new Error('Der Verbindungscode ist zu lang.');
  const code = input.replace(/\s/g, '');
  const match = /^FRANK1\.([OA])\.([A-Za-z0-9_-]{16})\.([ZT])\.([A-Za-z0-9_-]+)$/.exec(code);
  if (code.length > MAX_CODE || !match || match[1] !== (role === 'offer' ? 'O' : 'A')) {
    throw new Error(role === 'offer' ? 'Bitte den Einladungscode vom anderen Gerät einfügen.' : 'Bitte den Antwortcode vom anderen Gerät einfügen.');
  }
  if (match[3] === 'Z' && typeof DecompressionStream === 'undefined') {
    throw new Error('Bitte verwende für diesen Verbindungscode eine aktuelle Browserversion.');
  }
  try {
    const binary = atob(match[4]!.replaceAll('-', '+').replaceAll('_', '/'));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const full = match[3] === 'Z'
      ? await boundedRead(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')), MAX_SDP)
      : bytes;
    const sdp = decoder.decode(full);
    const media = sdp.match(/^m=.+/gm) ?? [];
    if (!/^v=0\r?\n/.test(sdp) || media.length !== 1 || !/^m=application\s/.test(media[0]!)
      || !/^a=fingerprint:sha-256 /mi.test(sdp) || !/^a=candidate:.+ typ host\b/mi.test(sdp)) throw new Error();
    return { id: match[2]!, sdp };
  } catch {
    throw new Error('Der Verbindungscode ist unvollständig oder ungültig. Kopiere ihn nochmals.');
  }
}

function waitUntil(target: EventTarget, event: string, ready: () => boolean, signal: AbortSignal, ms: number, timeoutText: string) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      target.removeEventListener(event, check);
      signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const check = () => { if (ready()) finish(); };
    const abort = () => finish(new Error('Die Verbindung wurde beendet.'));
    const timer = setTimeout(() => finish(new Error(timeoutText)), ms);
    target.addEventListener(event, check);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else check();
  });
}

export class DeviceLink {
  private readonly pc: RTCPeerConnection;
  private readonly stop = new AbortController();
  private readonly events = new EventTarget();
  private pairingTimer?: ReturnType<typeof setTimeout>;
  private receiveTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private id?: string;
  private channel?: RTCDataChannel;
  private opened = false;
  private nextOutbound = 0;
  private acknowledged = 0;
  private nextInbound = 1;
  private incoming?: { id: number; bytes: Uint8Array; offset: number };
  private sends = Promise.resolve();

  constructor(private readonly callbacks: Callbacks) {
    if (typeof RTCPeerConnection === 'undefined') throw new Error('Dieser Browser unterstützt keine direkte Geräteverbindung.');
    this.pc = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' });
    this.pc.ondatachannel = e => this.bind(e.channel);
    this.pc.onconnectionstatechange = () => {
      const status = this.pc.connectionState;
      clearTimeout(this.reconnectTimer);
      if (status === 'failed' || status === 'closed') this.shutdown('Die Verbindung zum anderen Gerät wurde getrennt.');
      if (status === 'disconnected') {
        this.reconnectTimer = setTimeout(() => this.shutdown('Die Netzwerkverbindung wurde unterbrochen.'), 10_000);
      }
    };
    this.pairingTimer = setTimeout(() => this.shutdown('Der Verbindungscode ist abgelaufen. Starte die Verbindung erneut.'), 10 * 60_000);
  }

  async createOffer(): Promise<string> {
    if (this.id || this.stop.signal.aborted) throw new Error('Starte eine neue Verbindung.');
    this.id = base64(crypto.getRandomValues(new Uint8Array(12)));
    this.bind(this.pc.createDataChannel(CHANNEL, { ordered: true }));
    return this.localCode('offer');
  }

  async createAnswer(offerCode: string): Promise<string> {
    const offer = await readCode(offerCode, 'offer');
    if (this.id || this.stop.signal.aborted) throw new Error('Starte eine neue Verbindung.');
    await this.setRemote('offer', offer.sdp);
    this.id = offer.id;
    return this.localCode('answer');
  }

  async acceptAnswer(answerCode: string): Promise<void> {
    const answer = await readCode(answerCode, 'answer');
    if (this.pc.signalingState !== 'have-local-offer' || answer.id !== this.id) {
      throw new Error('Der Antwortcode gehört zu einer anderen Einladung.');
    }
    await this.setRemote('answer', answer.sdp);
    clearTimeout(this.pairingTimer);
    if (!this.opened) {
      this.pairingTimer = setTimeout(() => this.shutdown('Beide Geräte müssen im selben erreichbaren Netzwerk sein. Prüfe WLAN und lokalen Netzwerkzugriff.'), 35_000);
    }
  }

  private async setRemote(type: Role, sdp: string) {
    try { await this.pc.setRemoteDescription({ type, sdp }); }
    catch { throw new Error('Der Browser konnte den Verbindungscode nicht übernehmen. Starte die Kopplung erneut.'); }
  }

  private async localCode(role: Role): Promise<string> {
    const description = role === 'offer' ? await this.pc.createOffer() : await this.pc.createAnswer();
    await this.pc.setLocalDescription(description);
    await waitUntil(this.pc, 'icegatheringstatechange', () => this.pc.iceGatheringState === 'complete', this.stop.signal, 15_000,
      'Das lokale Netzwerk antwortet nicht. Prüfe die Netzwerkfreigabe im Browser.');
    const sdp = this.pc.localDescription?.sdp;
    if (!sdp || !/^a=candidate:.+ typ host\b/mi.test(sdp)) {
      throw new Error('Der Browser hat keine lokale Netzwerkadresse freigegeben. Prüfe den lokalen Netzwerkzugriff.');
    }
    return writeCode(sdp, role, this.id!);
  }

  private bind(channel: RTCDataChannel) {
    if (this.channel || channel.label !== CHANNEL || !channel.ordered || channel.maxRetransmits !== null || channel.maxPacketLifeTime !== null) {
      channel.close();
      return;
    }
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = HIGH_WATER / 2;
    const open = () => {
      if (this.opened || this.stop.signal.aborted) return;
      this.opened = true;
      clearTimeout(this.pairingTimer);
      this.callbacks.onOpen();
    };
    channel.onopen = open;
    channel.onclose = () => this.shutdown('Das andere Gerät hat die Verbindung beendet.');
    channel.onerror = () => this.shutdown('Die Übertragung wurde unterbrochen.');
    channel.onmessage = e => {
      try { this.receive(e.data); }
      catch { this.shutdown('Die Übertragung war unvollständig oder ungültig. Bitte erneut verbinden.'); }
    };
    if (channel.readyState === 'open') queueMicrotask(open);
  }

  private receive(data: unknown) {
    if (data instanceof ArrayBuffer) {
      const incoming = this.incoming;
      if (!incoming || !data.byteLength || data.byteLength > CHUNK || data.byteLength > incoming.bytes.length - incoming.offset) {
        throw new Error();
      }
      incoming.bytes.set(new Uint8Array(data), incoming.offset);
      incoming.offset += data.byteLength;
      this.watchIncoming();
      return;
    }
    if (typeof data !== 'string' || data.length > 60) throw new Error();
    const match = /^(begin|end|ack) ([1-9]\d{0,9})(?: (0|[1-9]\d{0,8}))?$/.exec(data);
    if (!match) throw new Error();
    const id = Number(match[2]);
    if (match[1] === 'begin') {
      const size = Number(match[3]);
      if (this.incoming || id !== this.nextInbound || !Number.isSafeInteger(size) || size > MAX_SYNC_BYTES) throw new Error();
      this.incoming = { id, bytes: new Uint8Array(size), offset: 0 };
      this.watchIncoming();
    } else if (match[3] !== undefined) throw new Error();
    else if (match[1] === 'ack') {
      if (id !== this.nextOutbound || id !== this.acknowledged + 1) throw new Error();
      this.acknowledged = id;
      this.events.dispatchEvent(new Event('ack'));
    } else {
      const incoming = this.incoming;
      if (!incoming || incoming.id !== id || incoming.offset !== incoming.bytes.length) throw new Error();
      this.incoming = undefined;
      clearTimeout(this.receiveTimer);
      const payload = decoder.decode(incoming.bytes);
      this.nextInbound++;
      this.channel!.send('ack ' + id);
      this.callbacks.onMessage(payload);
    }
  }

  private watchIncoming() {
    clearTimeout(this.receiveTimer);
    this.receiveTimer = setTimeout(() => this.shutdown('Die Datenübertragung ist abgelaufen. Bitte erneut verbinden.'), TRANSFER_TIMEOUT);
  }

  /** Resolves after the other browser has received the complete UTF-8 message. */
  send(payload: string): Promise<void> {
    const channel = this.channel;
    if (!channel || channel.readyState !== 'open') return Promise.reject(new Error('Die Geräte sind noch nicht verbunden.'));
    if (payload.length > MAX_SYNC_BYTES) return Promise.reject(new Error('Der Datenstand ist für die Direktübertragung zu gross.'));
    const bytes = encoder.encode(payload);
    if (bytes.length > MAX_SYNC_BYTES) return Promise.reject(new Error('Der Datenstand ist für die Direktübertragung zu gross.'));
    const task = this.sends.then(async () => {
      const id = ++this.nextOutbound;
      channel.send('begin ' + id + ' ' + bytes.length);
      for (let i = 0; i < bytes.length; i += CHUNK) {
        if (channel.bufferedAmount > HIGH_WATER) {
          await waitUntil(channel, 'bufferedamountlow', () => channel.bufferedAmount <= HIGH_WATER / 2, this.stop.signal, TRANSFER_TIMEOUT,
            'Die Übertragung stockt. Bitte prüfe die Netzwerkverbindung.');
        }
        channel.send(bytes.subarray(i, i + CHUNK));
      }
      channel.send('end ' + id);
      await waitUntil(this.events, 'ack', () => this.acknowledged === id, this.stop.signal, TRANSFER_TIMEOUT,
        'Das andere Gerät hat den Empfang nicht bestätigt.');
    }).catch(() => {
      this.shutdown('Die Übertragung wurde unterbrochen. Bitte erneut verbinden.');
      throw new Error('Das andere Gerät konnte den Empfang nicht bestätigen.');
    });
    this.sends = task.catch(() => {});
    return task;
  }

  close() { this.shutdown(); }

  private shutdown(reason?: string) {
    if (this.stop.signal.aborted) return;
    this.stop.abort();
    clearTimeout(this.pairingTimer);
    clearTimeout(this.receiveTimer);
    clearTimeout(this.reconnectTimer);
    this.incoming = undefined;
    this.channel?.close();
    this.pc.close();
    if (reason) this.callbacks.onClose(reason);
  }
}
