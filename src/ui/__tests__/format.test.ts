import { formatBytes, formatDuration } from '../format';

describe('format', () => {
  it('formats byte sizes in binary units', () => {
    expect(formatBytes(950)).toBe('950 B');
    expect(formatBytes(2 * 1024)).toBe('2 KB');
    expect(formatBytes(12.34 * 1024 * 1024)).toBe('12.3 MB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2 GB');
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB');
  });

  it('formats durations', () => {
    expect(formatDuration(185)).toBe('3:05');
    expect(formatDuration(3723)).toBe('1:02:03');
  });
});
