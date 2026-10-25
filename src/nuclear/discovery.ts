import { abortError } from '@/net/errors';

import { createJamClient, jamBaseUrl } from './client';

/** Ports Nuclear Jam binds, first free one wins (http_api/mod.rs). */
export const JAM_PORTS = [4120, 4121, 4122, 4123, 4124, 4125, 4126, 4127, 4128, 4129] as const;
export const DEFAULT_JAM_PORT = 4120;
export const PROBE_TIMEOUT_MS = 400;
export const PROBE_CONCURRENCY = 32;

export interface FoundPc {
  host: string;
  port: number;
}

/** A /24 that can be scanned: a private IPv4 that is not Tailscale's CGNAT range. */
export function scannableSubnet(ipv4: string): string | null {
  const parts = ipv4.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return null;
  }
  const [a = 0, b = 0, c = 0] = parts;
  const lan = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  return lan ? `${a}.${b}.${c}` : null;
}

/** Every address of the phone's /24 except its own, in order. */
export function subnetHosts(ipv4: string): string[] {
  const subnet = scannableSubnet(ipv4);
  if (!subnet) return [];
  const own = Number(ipv4.split('.')[3]);
  return Array.from({ length: 254 }, (_, i) => i + 1)
    .filter((n) => n !== own)
    .map((n) => `${subnet}.${n}`);
}

/** GET /api/health on host:port answers { status: "ok" } within the probe timeout. */
export type Probe = (host: string, port: number, signal: AbortSignal) => Promise<boolean>;

export function healthProbe(doFetch: typeof fetch = fetch): Probe {
  return async (host, port, signal) => {
    try {
      const client = createJamClient({
        baseUrl: jamBaseUrl(host, port),
        fetch: doFetch,
        timeoutMs: PROBE_TIMEOUT_MS,
      });
      await client.health({ signal });
      return true;
    } catch {
      return false;
    }
  };
}

export interface DiscoveryOptions {
  ipv4: string;
  probe: Probe;
  signal?: AbortSignal;
  ports?: readonly number[];
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  onFound?: (pc: FoundPc) => void;
}

/**
 * Probes every host of the phone's /24 on the Jam ports, 32 requests at a time. Resolves with
 * the PCs that answered, in address order; rejects with an AbortError when cancelled.
 */
export async function discoverPcs(options: DiscoveryOptions): Promise<FoundPc[]> {
  const {
    ipv4,
    probe,
    signal,
    ports = JAM_PORTS,
    concurrency = PROBE_CONCURRENCY,
    onProgress,
    onFound,
  } = options;
  const targets = subnetHosts(ipv4).flatMap((host) => ports.map((port) => ({ host, port })));
  const found: FoundPc[] = [];
  let next = 0;
  let done = 0;
  onProgress?.(0, targets.length);

  const worker = async () => {
    for (;;) {
      if (signal?.aborted) return;
      const target = targets[next];
      next += 1;
      if (!target) return;
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        if (await probe(target.host, target.port, controller.signal)) {
          found.push(target);
          onFound?.(target);
        }
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
      done += 1;
      onProgress?.(done, targets.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  if (signal?.aborted) throw abortError();
  const order = (pc: FoundPc) => Number(pc.host.split('.')[3]) * 100_000 + pc.port;
  return found.sort((a, b) => order(a) - order(b));
}

/**
 * "host", "host:port", "[ipv6]:port" or a bare IPv6 address from the manual entry field; the
 * port defaults to 4120. Null for anything else.
 */
export function parseHostEntry(text: string): FoundPc | null {
  const entry = text
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '');
  if (entry === '') return null;
  const bracketed = entry.match(/^\[([0-9a-fA-F:.%a-zA-Z]+)\](?::(\d{1,5}))?$/);
  if (bracketed) return withPort(bracketed[1] ?? '', bracketed[2]);
  if ((entry.match(/:/g) ?? []).length > 1) return withPort(entry, undefined);
  const plain = entry.match(/^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/);
  if (!plain) return null;
  return withPort(plain[1] ?? '', plain[2]);
}

function withPort(host: string, port: string | undefined): FoundPc | null {
  const number = port === undefined ? DEFAULT_JAM_PORT : Number(port);
  if (host === '' || !Number.isInteger(number) || number < 1 || number > 65_535) return null;
  return { host, port: number };
}
