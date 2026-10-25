import {
  isConfidentMatch,
  matchKey,
  pickMatch,
  primaryArtistName,
  primaryCredit,
  type MatchFields,
} from '../match';

const target: MatchFields = {
  title: 'Ráiny Súnday',
  artist: 'Vassilis Tsitsanis, Sotiria Bellou',
  durationMs: 192_000,
};

describe('Send to PC matcher', () => {
  it('normalises titles and artists and finds the primary artist', () => {
    expect(matchKey('  Café — del  MAR! ')).toBe('cafe del mar');
    expect(primaryArtistName('Grey Falcon, Echo')).toBe('Grey Falcon');
    expect(primaryArtistName('A feat. B')).toBe('A');
    expect(primaryArtistName('Simon & Garfunkel')).toBe('Simon');
    expect(primaryArtistName(null)).toBeNull();
    expect(
      primaryCredit([
        { name: 'Guest', roles: ['featured'] },
        { name: 'Main', roles: ['main'] },
      ]),
    ).toBe('Main');
    expect(primaryCredit([{ name: 'Only', roles: [] }])).toBe('Only');
    expect(primaryCredit([])).toBeNull();
  });

  it('needs title, primary artist and a duration within 3 s when known', () => {
    const same = {
      title: 'rainy sunday',
      artist: 'Vassilis Tsitsanis',
      durationMs: 194_900,
    };
    expect(isConfidentMatch(target, same)).toBe(true);
    expect(isConfidentMatch(target, { ...same, durationMs: 195_100 })).toBe(false);
    expect(isConfidentMatch(target, { ...same, durationMs: null })).toBe(true);
    expect(isConfidentMatch(target, { ...same, artist: 'Someone Else' })).toBe(false);
    expect(isConfidentMatch(target, { ...same, artist: null })).toBe(false);
    expect(isConfidentMatch(target, { ...same, title: 'Rainy Sunday (Live)' })).toBe(
      false,
    );
  });

  it('matches a target without an artist only when both durations are known', () => {
    const noArtist = { ...target, artist: null };
    expect(isConfidentMatch(noArtist, { ...target, durationMs: 193_000 })).toBe(true);
    expect(isConfidentMatch({ ...noArtist, durationMs: null }, target)).toBe(false);
  });

  it('picks the confident candidate closest in duration, else returns all candidates', () => {
    const candidates = [
      {
        id: 'live',
        title: 'Rainy Sunday (Live)',
        artist: 'Vassilis Tsitsanis',
        durationMs: 192_000,
      },
      {
        id: 'far',
        title: 'Rainy Sunday',
        artist: 'Vassilis Tsitsanis',
        durationMs: 194_500,
      },
      {
        id: 'near',
        title: 'Rainy Sunday',
        artist: 'Vassilis Tsitsanis',
        durationMs: 191_000,
      },
    ];
    expect(pickMatch(target, candidates, (c) => c)).toEqual({ match: candidates[2] });
    const unsure = pickMatch({ ...target, title: 'Island Road' }, candidates, (c) => c);
    expect(unsure).toEqual({ candidates });
    expect(pickMatch(target, [], (c: MatchFields) => c)).toEqual({ candidates: [] });
  });
});
