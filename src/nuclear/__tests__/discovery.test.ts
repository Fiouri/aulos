/**
 * @jest-environment node
 */
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { migrate } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { isAbortError } from '../../net/errors';
import {
  discoverPcs,
  healthProbe,
  JAM_PORTS,
  parseHostEntry,
  scannableSubnet,
  subnetHosts,
} from '../discovery';
import {
  forgetPairing,
  lastUsedPairing,
  listPairings,
  markPairingUsed,
  markSecurityNoticeSeen,
  renamePairing,
  savePairing,
  securityNoticeSeen,
} from '../pairings';

describe('discovery', () => {
  it('scans only a LAN /24, never Tailscale or public addresses', () => {
    expect(scannableSubnet('192.168.1.23')).toBe('192.168.1');
    expect(scannableSubnet('10.0.5.9')).toBe('10.0.5');
    expect(scannableSubnet('172.20.1.2')).toBe('172.20.1');
    expect(scannableSubnet('100.101.102.103')).toBeNull();
    expect(scannableSubnet('8.8.8.8')).toBeNull();
    expect(scannableSubnet('0.0.0.0')).toBeNull();
    const hosts = subnetHosts('192.168.1.23');
    expect(hosts).toHaveLength(253);
    expect(hosts[0]).toBe('192.168.1.1');
    expect(hosts).not.toContain('192.168.1.23');
    expect(hosts.at(-1)).toBe('192.168.1.254');
  });

  it('probes /api/health on every Jam port with a fake fetch and lists the PCs found', async () => {
    const asked: string[] = [];
    const fetch = jest.fn(async (url: unknown) => {
      asked.push(String(url));
      if (String(url) === 'http://192.168.1.40:4121/api/health') {
        return new Response(JSON.stringify({ status: 'ok' }));
      }
      if (String(url) === 'http://192.168.1.7:4120/api/health') {
        return new Response('<html>router</html>');
      }
      throw new TypeError('Network request failed');
    });
    const progress: number[] = [];
    const found = await discoverPcs({
      ipv4: '192.168.1.23',
      probe: healthProbe(fetch as unknown as typeof globalThis.fetch),
      onProgress: (done) => progress.push(done),
    });
    expect(found).toEqual([{ host: '192.168.1.40', port: 4121 }]);
    expect(asked).toHaveLength(253 * JAM_PORTS.length);
    expect(progress.at(-1)).toBe(253 * JAM_PORTS.length);
  });

  it('runs at most 32 probes at once', async () => {
    let running = 0;
    let peak = 0;
    await discoverPcs({
      ipv4: '10.0.0.5',
      ports: [4120],
      probe: async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setImmediate(resolve));
        running -= 1;
        return false;
      },
    });
    expect(peak).toBe(32);
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    let probes = 0;
    const result = discoverPcs({
      ipv4: '10.0.0.5',
      signal: controller.signal,
      probe: async () => {
        probes += 1;
        if (probes === 40) controller.abort();
        await new Promise((resolve) => setImmediate(resolve));
        return false;
      },
    });
    const error = await result.catch((e: unknown) => e);
    expect(isAbortError(error)).toBe(true);
    expect(probes).toBeLessThan(80);
  });

  it('parses manual host entries', () => {
    expect(parseHostEntry('192.168.1.40')).toEqual({ host: '192.168.1.40', port: 4120 });
    expect(parseHostEntry(' 100.101.102.103:4122 ')).toEqual({
      host: '100.101.102.103',
      port: 4122,
    });
    expect(parseHostEntry('desktop.tail1234.ts.net')).toEqual({
      host: 'desktop.tail1234.ts.net',
      port: 4120,
    });
    expect(parseHostEntry('http://192.168.1.40:4121/api')).toEqual({
      host: '192.168.1.40',
      port: 4121,
    });
    expect(parseHostEntry('[fe80::1]:4123')).toEqual({ host: 'fe80::1', port: 4123 });
    expect(parseHostEntry('fd00::5')).toEqual({ host: 'fd00::5', port: 4120 });
    expect(parseHostEntry('')).toBeNull();
    expect(parseHostEntry('pc:99999')).toBeNull();
    expect(parseHostEntry('bad host')).toBeNull();
  });
});

describe('pairings', () => {
  let db: NodeDb;
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
  });
  afterEach(() => db.close());

  it('saves, renames, orders by last use and forgets PCs', async () => {
    const desk = await savePairing(db, 'Desk', 'http://192.168.1.40:4120', 100);
    const laptop = await savePairing(db, '  ', 'http://100.101.102.103:4120', 200);
    expect(laptop.name).toBe('http://100.101.102.103:4120');
    expect((await lastUsedPairing(db))?.id).toBe(laptop.id);

    await markPairingUsed(db, desk.id, 300);
    expect((await lastUsedPairing(db))?.name).toBe('Desk');
    expect((await listPairings(db)).map((p) => p.id)).toEqual([desk.id, laptop.id]);

    // Pairing the same URL again keeps one row and its name.
    const again = await savePairing(db, 'Other name', 'http://192.168.1.40:4120', 400);
    expect(again).toEqual({
      id: desk.id,
      name: 'Desk',
      baseUrl: 'http://192.168.1.40:4120',
      lastSeenAt: 400,
    });

    await renamePairing(db, laptop.id, ' Laptop ');
    await renamePairing(db, laptop.id, '   ');
    expect((await listPairings(db)).find((p) => p.id === laptop.id)?.name).toBe('Laptop');

    await forgetPairing(db, desk.id);
    expect((await listPairings(db)).map((p) => p.name)).toEqual(['Laptop']);
  });

  it('remembers that the security notice was shown', async () => {
    expect(await securityNoticeSeen(db)).toBe(false);
    await markSecurityNoticeSeen(db);
    expect(await securityNoticeSeen(db)).toBe(true);
  });
});
