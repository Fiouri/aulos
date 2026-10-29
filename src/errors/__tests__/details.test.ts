import { formatErrorDetails, redact } from '../details';

const base = {
  appVersion: '1.0.0-rc.1',
  androidRelease: '14',
  apiLevel: 34,
  time: new Date('2026-10-29T12:00:00.000Z'),
};

const HERMES_STACK = [
  "TypeError: Cannot read property 'title' of undefined",
  '    at TrackRow (address at index.android.bundle:1:123456)',
  '    at renderWithHooks (address at index.android.bundle:1:98765)',
].join('\n');

function errorWithStack(message: string, stack: string): Error {
  const error = new TypeError(message);
  error.stack = stack;
  return error;
}

describe('formatErrorDetails', () => {
  it('lists version, Android, time, the error and its stack frames', () => {
    const text = formatErrorDetails({
      ...base,
      error: errorWithStack("Cannot read property 'title' of undefined", HERMES_STACK),
    });
    expect(text).toBe(
      [
        'Aulos error report',
        'App version: 1.0.0-rc.1',
        'Android: 14 (API 34)',
        'Time: 2026-10-29T12:00:00.000Z',
        '',
        "TypeError: Cannot read property 'title' of undefined",
        '',
        'Stack:',
        'at TrackRow (address at index.android.bundle:1:123456)',
        'at renderWithHooks (address at index.android.bundle:1:98765)',
      ].join('\n'),
    );
  });

  it('adds the component stack when React gives one', () => {
    const text = formatErrorDetails({
      ...base,
      error: new Error('boom'),
      componentStack: '\n    in TrackRow\n    in SongsSection',
    });
    expect(text).toContain('Component stack:\nin TrackRow\nin SongsSection');
  });

  it('omits empty stacks and names errors without a message', () => {
    const error = new RangeError();
    error.stack = '';
    const text = formatErrorDetails({ ...base, error, componentStack: '  ' });
    expect(text.split('\n').at(-1)).toBe('RangeError');
    expect(text).not.toContain('Stack:');
    expect(text).not.toContain('Component stack:');
  });

  it('describes thrown values that are not errors', () => {
    expect(formatErrorDetails({ ...base, error: 'plain string' })).toContain(
      'Non-error value thrown: plain string',
    );
    expect(formatErrorDetails({ ...base, error: undefined })).toContain(
      'Non-error value thrown: undefined',
    );
  });

  it('keeps long stacks to 40 frames', () => {
    const frames = Array.from(
      { length: 60 },
      (_, i) => `    at f${i} (index.android.bundle:1:${i})`,
    );
    const text = formatErrorDetails({
      ...base,
      error: errorWithStack('deep', ['Error: deep', ...frames].join('\n')),
    });
    expect(text).toContain('at f39 ');
    expect(text).not.toContain('at f40 ');
    expect(text).toContain('… 20 more lines');
  });

  it('caps very long messages', () => {
    const text = formatErrorDetails({ ...base, error: new Error('x'.repeat(2000)) });
    expect(text).toContain(`Error: ${'x'.repeat(500)}`);
    expect(text).not.toContain('x'.repeat(501));
  });

  it('removes personal data from the message and the stacks', () => {
    const error = errorWithStack(
      'Could not play content://media/external/audio/media/42 from /storage/emulated/0/Music/Mine.flac',
      'Error: x\n    at fetch (http://192.168.1.50:4120/api/health)',
    );
    const text = formatErrorDetails({
      ...base,
      error,
      componentStack: 'in Row (owner fiouri@example.com)',
    });
    expect(text).toContain('Could not play <uri> from <path>');
    expect(text).toContain('at fetch (<url>/api/health)');
    expect(text).toContain('in Row (owner <email>)');
    expect(text).not.toMatch(/192\.168|Mine\.flac|example\.com|media\/42/);
  });
});

describe('redact', () => {
  it.each([
    ['PC at 100.64.0.10:4120 refused', 'PC at <ip> refused'],
    ['link fe80::1c2b:3a4d failed', 'link <ip> failed'],
    ['host 2001:db8:85a3:0:0:8a2e:370:7334 down', 'host <ip> down'],
    ['see https://archive.org/details/x', 'see <url>/details/x'],
    ['file:///data/user/0/com.anywecon.aulos/files/a.mp3', '<uri>'],
    ['/data/user/0/com.anywecon.aulos/files/a.mp3 missing', '<path> missing'],
  ])('%s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it('keeps bundle positions, times and versions', () => {
    const text = 'at f (index.android.bundle:1:2345) at 12:34:56 in 1.0.0-rc.1';
    expect(redact(text)).toBe(text);
  });
});
