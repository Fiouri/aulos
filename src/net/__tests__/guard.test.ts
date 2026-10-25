import {
  assertRequestAllowed,
  CleartextBlockedError,
  isPrivateHost,
  isRequestAllowed,
  parseHttpUrl,
} from '../guard';

describe('isPrivateHost', () => {
  it.each([
    ['10.0.0.0', true],
    ['10.255.255.255', true],
    ['9.255.255.255', false],
    ['11.0.0.0', false],
    ['172.16.0.0', true],
    ['172.31.255.255', true],
    ['172.15.255.255', false],
    ['172.32.0.0', false],
    ['192.168.0.0', true],
    ['192.168.255.255', true],
    ['192.167.255.255', false],
    ['192.169.0.0', false],
    ['100.64.0.0', true],
    ['100.127.255.255', true],
    ['100.63.255.255', false],
    ['100.128.0.0', false],
    ['169.254.0.0', true],
    ['169.254.255.255', true],
    ['169.253.255.255', false],
    ['169.255.0.0', false],
    ['127.0.0.0', true],
    ['127.255.255.255', true],
    ['126.255.255.255', false],
    ['128.0.0.0', false],
    ['8.8.8.8', false],
  ])('IPv4 %s → %s', (host, expected) => {
    expect(isPrivateHost(host)).toBe(expected);
  });

  it('rejects malformed IPv4', () => {
    for (const host of [
      '192.168.1',
      '192.168.1.256',
      '192.168.1.1.1',
      '192.168.-1.1',
      '1e1.0.0.1',
    ]) {
      expect(isPrivateHost(host)).toBe(false);
    }
  });

  it.each([
    ['fe80::1', true],
    ['fe80::1%wlan0', true],
    ['febf:ffff::', true],
    ['fe7f::1', false],
    ['fec0::1', false],
    ['fd00::1', true],
    ['fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', true],
    ['fc00::1', false],
    ['fe00::', false],
    ['::1', true],
    ['0:0:0:0:0:0:0:1', true],
    ['::2', false],
    ['::', false],
    ['2001:4860:4860::8888', false],
    ['[fd12:3456::1]', true],
    ['FE80::ABCD', true],
    ['fe80::1::2', false],
    ['fe80:1:2:3:4:5:6:7:8', false],
  ])('IPv6 %s → %s', (host, expected) => {
    expect(isPrivateHost(host)).toBe(expected);
  });

  it('accepts Tailscale MagicDNS names only', () => {
    expect(isPrivateHost('desktop.tail1234.ts.net')).toBe(true);
    expect(isPrivateHost('DESKTOP.TAIL1234.TS.NET')).toBe(true);
    expect(isPrivateHost('desktop.tail1234.ts.net.')).toBe(true);
    expect(isPrivateHost('ts.net')).toBe(false);
    expect(isPrivateHost('evil-ts.net')).toBe(false);
    expect(isPrivateHost('ts.net.example.com')).toBe(false);
    expect(isPrivateHost('archive.org')).toBe(false);
    expect(isPrivateHost('localhost')).toBe(false);
  });

  it('ignores case and a trailing dot on addresses', () => {
    expect(isPrivateHost('192.168.1.10.')).toBe(true);
    expect(isPrivateHost(' 10.1.2.3 ')).toBe(true);
    expect(isPrivateHost('8.8.8.8.')).toBe(false);
    expect(isPrivateHost('')).toBe(false);
  });
});

describe('request guard', () => {
  it('parses scheme, host and port', () => {
    expect(parseHttpUrl('http://192.168.1.5:4120/api/health')).toEqual({
      scheme: 'http',
      host: '192.168.1.5',
      port: 4120,
    });
    expect(parseHttpUrl('HTTPS://Archive.org/x')).toEqual({
      scheme: 'https',
      host: 'Archive.org',
      port: null,
    });
    expect(parseHttpUrl('http://[fe80::1]:4121/api')).toEqual({
      scheme: 'http',
      host: 'fe80::1',
      port: 4121,
    });
    expect(parseHttpUrl('http://user@10.0.0.2/')?.host).toBe('10.0.0.2');
    expect(parseHttpUrl('ftp://10.0.0.2/')).toBeNull();
    expect(parseHttpUrl('http:///nohost')).toBeNull();
  });

  it('allows HTTPS anywhere and HTTP only to private hosts', () => {
    expect(isRequestAllowed('https://archive.org/metadata/x')).toBe(true);
    expect(isRequestAllowed('http://192.168.1.5:4120/api/health')).toBe(true);
    expect(isRequestAllowed('http://100.101.102.103:4120/api/events')).toBe(true);
    expect(isRequestAllowed('http://pc.tail1234.ts.net:4120/api')).toBe(true);
    expect(isRequestAllowed('http://archive.org/metadata/x')).toBe(false);
    expect(isRequestAllowed('http://8.8.8.8/')).toBe(false);
    // A private-looking name that is really a public host must not pass.
    expect(isRequestAllowed('http://192.168.1.5.evil.com/')).toBe(false);
    expect(isRequestAllowed('file:///data/x.mp3')).toBe(false);
  });

  it('throws a typed error for blocked cleartext', () => {
    expect(() => assertRequestAllowed('http://example.com/')).toThrow(CleartextBlockedError);
    expect(() => assertRequestAllowed('http://10.0.2.2:4125/api/health')).not.toThrow();
  });
});
