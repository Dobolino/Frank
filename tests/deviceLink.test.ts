import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceLink, MAX_SYNC_BYTES } from '../src/sync/transport';

// Simulate SCTP delivery boundaries to exercise truncation and cancellation, which a
// reliable data channel will not normally produce during a successful browser test.
class Wire extends EventTarget {
  label = 'frank-sync-v1';
  ordered = true;
  maxRetransmits = null;
  maxPacketLifeTime = null;
  readyState = 'open';
  bufferedAmount = 0;
  frames: (string | Uint8Array)[] = [];
  onmessage?: (event: { data: unknown }) => void;
  send(frame: string | Uint8Array) { this.frames.push(frame); }
  close() { this.readyState = 'closed'; }
  deliver(data: unknown) { this.onmessage?.({ data }); }
}
class Peer extends EventTarget {
  static latest: Peer;
  ondatachannel?: (event: { channel: Wire }) => void;
  constructor() { super(); Peer.latest = this; }
  close() {}
}
describe('DeviceLink', () => {
  let link: DeviceLink;
  let wire: Wire;
  const receive = vi.fn(), close = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('RTCPeerConnection', Peer);
    vi.clearAllMocks();
    wire = new Wire();
    link = new DeviceLink({ onOpen: () => {}, onMessage: receive, onClose: close });
    Peer.latest.ondatachannel!({ channel: wire });
  });
  afterEach(() => { link.close(); vi.unstubAllGlobals(); });

  it('liefert erst die vollständige UTF-8-Nachricht und bestätigt deren Empfang', () => {
    const bytes = new TextEncoder().encode('äü');
    wire.deliver('begin 1 4');
    wire.deliver(bytes.slice(0, 1).buffer);
    wire.deliver(bytes.slice(1).buffer);
    expect(receive).not.toHaveBeenCalled();
    wire.deliver('end 1');
    expect(receive).toHaveBeenCalledWith('äü');
    expect(wire.frames).toEqual(['ack 1']);
  });

  it.each(['end 1', 'begin 2 2', 'begin 1 -6', 'begin 1 ' + (MAX_SYNC_BYTES + 1)])(
    'weist unerwartete bzw. zu grosse Nachrichten zurück (%s)', frame => {
      wire.deliver(frame);
      expect(close).toHaveBeenCalledTimes(1);
      expect(receive).not.toHaveBeenCalled();
    });

  it('verwirft eine unvollständige Übertragung ohne Bestätigung', () => {
    wire.deliver('begin 1 5');
    wire.deliver(new Uint8Array([1, 2]).buffer);
    wire.deliver('end 1');
    expect(close).toHaveBeenCalledTimes(1);
    expect(wire.frames).toEqual([]);
    expect(receive).not.toHaveBeenCalled();
  });

  it('wartet beim Senden auf die Empfangsbestätigung und bricht beim Trennen ab', async () => {
    const sent = link.send('Test');
    await Promise.resolve();
    expect(wire.frames[0]).toBe('begin 1 4');
    expect(wire.frames.at(-1)).toBe('end 1');
    wire.deliver('ack 1');
    await sent;
    const second = link.send('Test');
    await Promise.resolve();
    link.close();
    await expect(second).rejects.toThrow(/Empfang/);
    expect(close).not.toHaveBeenCalled();
  });

  it('prüft Rolle und Format vor dem Aufbau einer Verbindung', async () => {
    await expect(link.acceptAnswer('FRANK1.O.0000000000000000.T.dGVzdA')).rejects.toThrow(/Antwortcode/);
    await expect(link.createAnswer('x'.repeat(50_000))).rejects.toThrow(/zu lang/);
    await expect(link.createAnswer('FRANK1.O.0000000000000000.T.dGVzdA')).rejects.toThrow(/ungültig/);
    await expect(link.createAnswer('FRANK1.O.0000000000000000.Z.aaaa')).rejects.toThrow(/ungültig/);
  });
});
