/**
 * Cleartext guard. Android's network security config cannot whitelist IP ranges, so cleartext
 * is permitted at the platform level (M3, for Nuclear Jam on the LAN) and this module is the
 * control: every request path calls assertRequestAllowed, which lets `https://` through and
 * `http://` only to private-network hosts.
 */
export class CleartextBlockedError extends Error {
  override name = 'CleartextBlockedError';
  constructor() {
    super('Unencrypted HTTP is only allowed to devices on your own network');
  }
}

const HTTP_URL = /^(https?):\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^/:?#]*)(?::(\d{1,5}))?(?:[/?#]|$)/i;

/** Scheme, host (brackets removed from IPv6) and port of an absolute http(s) URL. */
export function parseHttpUrl(
  url: string,
): { scheme: 'http' | 'https'; host: string; port: number | null } | null {
  const match = url.match(HTTP_URL);
  if (!match) return null;
  const [, scheme = '', rawHost = '', port] = match;
  const host = rawHost.startsWith('[') ? rawHost.slice(1, -1) : rawHost;
  if (host === '') return null;
  return {
    scheme: scheme.toLowerCase() === 'https' ? 'https' : 'http',
    host,
    port: port === undefined ? null : Number(port),
  };
}

function ipv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255) ? octets : null;
}

/** The 8 hextets of an IPv6 address (zone index dropped), or null when it is not one. */
function ipv6(host: string): number[] | null {
  const address = host.split('%')[0] ?? '';
  if (!address.includes(':') || !/^[0-9a-f:]+$/.test(address)) return null;
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string | undefined) =>
    part === undefined || part === '' ? [] : part.split(':');
  const head = parse(halves[0]);
  const tail = parse(halves[1]);
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const filler = Array<string>(halves.length === 1 ? 0 : missing).fill('0');
  const groups = [...head, ...filler, ...tail];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

function isPrivateIpv4([a = -1, b = -1]: number[]): boolean {
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    a === 127
  );
}

function isPrivateIpv6(hextets: number[]): boolean {
  const first = hextets[0] ?? 0;
  if (first >= 0xfe80 && first <= 0xfebf) return true; // fe80::/10 link-local
  if (first >> 8 === 0xfd) return true; // fd00::/8 unique local
  return hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1; // ::1
}

/**
 * Hosts on the user's own networks: RFC 1918 IPv4, Tailscale's CGNAT 100.64/10, link-local
 * 169.254/16, loopback 127/8, IPv6 link-local fe80::/10, unique local fd00::/8 and ::1, and
 * Tailscale MagicDNS names (*.ts.net). Case-insensitive; a trailing dot is ignored.
 */
export function isPrivateHost(host: string): boolean {
  const name = host
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/\.$/, '');
  if (name === '') return false;
  const v4 = ipv4(name);
  if (v4) return isPrivateIpv4(v4);
  const v6 = ipv6(name);
  if (v6) return isPrivateIpv6(v6);
  return name.endsWith('.ts.net') && name.length > '.ts.net'.length;
}

/** HTTPS anywhere; HTTP only to a private host; anything else (and unparsable URLs) refused. */
export function isRequestAllowed(url: string): boolean {
  const parsed = parseHttpUrl(url);
  if (!parsed) return false;
  return parsed.scheme === 'https' || isPrivateHost(parsed.host);
}

export function assertRequestAllowed(url: string): void {
  if (!isRequestAllowed(url)) throw new CleartextBlockedError();
}
