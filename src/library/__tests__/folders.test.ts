import { mediaAudio } from '../../../test/fixtures';
import { isFolderExcluded, listFolders, parseExcludedFolders } from '../folders';

describe('library folders', () => {
  it('lists distinct folders with track counts', () => {
    expect(
      listFolders([
        mediaAudio('1', { folder: 'Music/B/' }),
        mediaAudio('2', { folder: 'Music/A' }),
        mediaAudio('3', { folder: 'Music/B/' }),
        mediaAudio('4', { folder: null }),
      ]),
    ).toEqual([
      { path: 'Music/A/', trackCount: 1 },
      { path: 'Music/B/', trackCount: 2 },
    ]);
  });

  it('excludes a folder and everything below it, but not siblings with a shared prefix', () => {
    const excluded = ['Music/Podcasts/'];
    expect(isFolderExcluded('Music/Podcasts/', excluded)).toBe(true);
    expect(isFolderExcluded('Music/Podcasts/2024/', excluded)).toBe(true);
    expect(isFolderExcluded('Music/PodcastsOld/', excluded)).toBe(false);
    expect(isFolderExcluded(null, excluded)).toBe(false);
  });

  it('parses the stored list defensively', () => {
    expect(parseExcludedFolders(['Music/A', 3, '', 'Music/B/'])).toEqual(['Music/A/', 'Music/B/']);
    expect(parseExcludedFolders('Music/A')).toEqual([]);
    expect(parseExcludedFolders(undefined)).toEqual([]);
  });
});
