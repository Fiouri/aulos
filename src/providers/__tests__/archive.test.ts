/**
 * @jest-environment node
 */
import { archiveFixture, fixtureHttpJson } from '../../../test/archiveFixtures';
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { migrate } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { IntegrityError, StorageLimitError } from '../../downloads/errors';
import type { FileOps, TransferRequest } from '../../downloads/transfer';
import { createHttpCache } from '../../net/cache';
import { InvalidResponseError, NotFoundError } from '../../net/errors';
import { createArchiveApi, searchQuery, searchUrl } from '../archive/api';
import {
  audioTracks,
  fileUrl,
  itemToAlbum,
  makeProviderRef,
  parseLength,
  parseProviderRef,
  parseTrackNo,
  text,
} from '../archive/mapping';
import { createArchiveProvider } from '../archive/provider';
import { metadataResponseSchema, type ItemMetadata } from '../archive/schemas';
import type { SourceProvider } from '../types';

jest.mock('expo-file-system', () => ({}));

function item(identifier: string): ItemMetadata {
  const parsed = metadataResponseSchema.parse(archiveFixture(`metadata-${identifier}.json`));
  if (Array.isArray(parsed) || !parsed.metadata || !parsed.files) throw new Error('fixture');
  return { identifier, metadata: parsed.metadata, files: parsed.files };
}

const GERAKINA = 'IGeorgakopoulouBTsitsanisIGerakinaCa1940';
const EXALOT = 'exalot-cosmic-voyager';
const EKTAKTH = 'EKTAKTH1882013TSITSANISXIOTISZAMPETAS';

describe('Internet Archive mapping', () => {
  it('reads lengths, track numbers and list values', () => {
    expect(parseLength('200.28')).toBe(200_280);
    expect(parseLength('03:20')).toBe(200_000);
    expect(parseLength('1:02:03')).toBe(3_723_000);
    expect(parseLength('0')).toBeNull();
    expect(parseLength('n/a')).toBeNull();
    expect(parseLength(undefined)).toBeNull();
    expect(parseTrackNo('01')).toBe(1);
    expect(parseTrackNo('3/12')).toBe(3);
    expect(parseTrackNo('A1')).toBeNull();
    expect(text(['Ann', 'Bob'])).toBe('Ann, Bob');
    expect(text('  ')).toBeNull();
    expect(text(1940)).toBe('1940');
  });

  it('maps a 78 transfer: WAV original with MP3, FLAC and Ogg derivatives, one track', () => {
    const { album, tracks } = itemToAlbum(item(GERAKINA));
    expect(album).toEqual({
      provider: 'archive',
      ref: GERAKINA,
      name: 'Ioanna Georgakopoulou and Vassilis Tsitsanis - I Gerakina',
      artist: 'Ioanna Georgakopoulou and Vassilis Tsitsanis',
      year: 1940,
      licenseUrl: null,
    });
    expect(tracks).toEqual([
      {
        provider: 'archive',
        providerRef: `${GERAKINA}/I_Georgakopoulou_B_Tsitsanis-I_Gerakina-ca1940.wav`,
        // A single-track item without a title tag takes the item title.
        title: 'Ioanna Georgakopoulou and Vassilis Tsitsanis - I Gerakina',
        artist: 'Ioanna Georgakopoulou and Vassilis Tsitsanis',
        album: 'Ioanna Georgakopoulou and Vassilis Tsitsanis - I Gerakina',
        albumArtist: 'Ioanna Georgakopoulou and Vassilis Tsitsanis',
        trackNo: 1,
        discNo: null,
        durationMs: 200_000,
        albumRef: GERAKINA,
        licenseUrl: null,
        attribution: 'Ioanna Georgakopoulou and Vassilis Tsitsanis',
      },
    ]);
  });

  it('maps a tagged netlabel album in track order with its licence', () => {
    const { album, tracks } = itemToAlbum(item(EXALOT));
    expect(album.licenseUrl).toBe('http://creativecommons.org/licenses/by-sa/3.0/');
    expect(tracks.map((t) => [t.trackNo, t.title])).toEqual([
      [1, 'Cosmic Voyager'],
      [2, 'Distant Dark'],
      [3, 'Crystal Water and the Sky'],
      [4, 'Lost Hong'],
      [5, 'Death Will Come Too Late'],
      [6, 'Light-Blue Aster'],
      [7, 'Crystal Band'],
      [8, 'Black Steel'],
      [9, 'Tears of Silence'],
    ]);
    expect(tracks[0]).toMatchObject({
      artist: 'Exalot',
      album: 'Cosmic Voyager',
      durationMs: 472_110,
      attribution: 'Exalot',
      licenseUrl: 'http://creativecommons.org/licenses/by-sa/3.0/',
    });
  });

  it('skips non-audio files and items without anything playable', () => {
    // A RAR labelled "Flac", JPEGs, a torrent and metadata: nothing to play.
    expect(itemToAlbum(item('baltsa-from-greece')).tracks).toEqual([]);
    // Spectrogram and PNG derivatives of the MP3 are not tracks.
    const groups = audioTracks(item(EKTAKTH).files);
    expect(groups.map((g) => g.files.map((f) => f.name))).toEqual([
      [
        'EKTAKTH 18-8-2013 TSITSANIS-XIOTIS-ZAMPETAS.mp3',
        'EKTAKTH 18-8-2013 TSITSANIS-XIOTIS-ZAMPETAS.ogg',
      ],
    ]);
  });

  it('falls back when fields are missing', () => {
    const { tracks } = itemToAlbum({
      identifier: 'bare-item',
      metadata: {},
      files: [
        { name: 'side_a.mp3', source: 'original', format: 'VBR MP3' },
        { name: 'side_b.mp3', source: 'original', format: 'MP3', length: 'unknown' },
        { name: 'notes.txt', source: 'original', format: 'Text' },
      ],
    });
    expect(tracks.map((t) => [t.title, t.artist, t.album, t.trackNo, t.durationMs])).toEqual([
      ['side a', null, 'bare-item', null, null],
      ['side b', null, 'bare-item', null, null],
    ]);
  });
});

describe('Internet Archive file names', () => {
  it('percent-encodes every path segment of a file URL', () => {
    expect(fileUrl(EKTAKTH, 'EKTAKTH 18-8-2013 TSITSANIS-XIOTIS-ZAMPETAS.mp3')).toBe(
      `https://archive.org/download/${EKTAKTH}/EKTAKTH%2018-8-2013%20TSITSANIS-XIOTIS-ZAMPETAS.mp3`,
    );
    expect(fileUrl('item', 'Disc 1/Τραγούδι #1?.mp3')).toBe(
      'https://archive.org/download/item/Disc%201/%CE%A4%CF%81%CE%B1%CE%B3%CE%BF%CF%8D%CE%B4%CE%B9%20%231%3F.mp3',
    );
  });

  it('refuses traversal segments and invalid identifiers', () => {
    expect(() => fileUrl('item', '../other/x.mp3')).toThrow(InvalidResponseError);
    expect(() => fileUrl('item', 'a//b.mp3')).toThrow(InvalidResponseError);
    expect(() => fileUrl('../etc', 'x.mp3')).toThrow(InvalidResponseError);
    expect(() => fileUrl('item?x=1', 'x.mp3')).toThrow(InvalidResponseError);
  });

  it('splits provider refs at the first slash only', () => {
    const ref = makeProviderRef('item-1', 'Disc 1/01 Song.mp3');
    expect(ref).toBe('item-1/Disc 1/01 Song.mp3');
    expect(parseProviderRef(ref)).toEqual({ identifier: 'item-1', fileName: 'Disc 1/01 Song.mp3' });
    expect(parseProviderRef('no-slash')).toBeNull();
    expect(parseProviderRef('bad id/x.mp3')).toBeNull();
  });

  it('escapes Lucene syntax in a search and requires playable audio', () => {
    expect(searchQuery('  Tsitsanis  (live)  ')).toBe(
      '(Tsitsanis AND \\(live\\)) AND mediatype:(audio) AND format:("VBR MP3" OR "MP3")',
    );
    expect(searchQuery('   ')).toBeNull();
    expect(searchUrl('x', 20)).toBe(
      'https://archive.org/advancedsearch.php?q=x&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year&fl%5B%5D=licenseurl&rows=20&page=1&output=json',
    );
  });
});

describe('Internet Archive provider', () => {
  let db: NodeDb;
  let http: ReturnType<typeof fixtureHttpJson>;
  let transfers: TransferRequest[];
  let files: FileOps & { removed: string[]; digest: string };
  let provider: SourceProvider;

  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
    http = fixtureHttpJson();
    transfers = [];
    files = {
      removed: [],
      digest: '',
      size: () => 2_862_080,
      remove(uri) {
        files.removed.push(uri);
      },
      md5: async () => files.digest,
      ensureDir: () => undefined,
    };
    provider = createArchiveProvider({
      api: createArchiveApi(
        http,
        createHttpCache(db, () => 0),
      ),
      transfer: async (request) => {
        transfers.push(request);
        request.onProgress(1000, null);
      },
      files,
      userAgent: 'Aulos/test',
    });
  });
  afterEach(() => db.close());

  it('returns items as albums and the tracks of the top items', async () => {
    const result = await provider.search('tsitsanis', { types: ['tracks', 'albums'], limit: 20 });
    expect(result.albums.slice(0, 3).map((a) => 'ref' in a && a.ref)).toEqual([
      'lph333',
      GERAKINA,
      EKTAKTH,
    ]);
    expect(result.tracks.map((t) => t.providerRef)).toEqual([
      'lph333/333.mp3',
      `${GERAKINA}/I_Georgakopoulou_B_Tsitsanis-I_Gerakina-ca1940.wav`,
      `${EKTAKTH}/EKTAKTH 18-8-2013 TSITSANIS-XIOTIS-ZAMPETAS.mp3`,
    ]);
  });

  it('skips a top item it cannot read instead of failing the search', async () => {
    const result = await provider.search('cosmic voyager exalot', {
      types: ['tracks', 'albums'],
      limit: 20,
    });
    expect(result.albums).toHaveLength(2);
    expect(result.tracks).toHaveLength(9);
  });

  it('caches searches and item metadata', async () => {
    await provider.search('tsitsanis', { types: ['tracks', 'albums'], limit: 20 });
    const first = http.urls.length;
    await provider.search('Tsitsanis', { types: ['tracks', 'albums'], limit: 20 });
    await provider.album?.(GERAKINA);
    expect(http.urls.length).toBe(first);
  });

  it('resolves the MP3 derivative for streaming', async () => {
    await expect(
      provider.resolveStream(`${GERAKINA}/I_Georgakopoulou_B_Tsitsanis-I_Gerakina-ca1940.wav`),
    ).resolves.toEqual({
      url: `https://archive.org/download/${GERAKINA}/I_Georgakopoulou_B_Tsitsanis-I_Gerakina-ca1940.mp3`,
      mime: 'audio/mpeg',
    });
    await expect(provider.resolveStream(`${GERAKINA}/missing.mp3`)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(provider.resolveStream('aulos-fixture-missing-item/x.mp3')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('downloads the chosen format to a hashed name and verifies its MD5', async () => {
    files.digest = '95ED833DCA23BE730B09F3A918D6BE14';
    const progress: number[] = [];
    const file = await provider.download?.(
      `${GERAKINA}/I_Georgakopoulou_B_Tsitsanis-I_Gerakina-ca1940.wav`,
      'file:///data/downloads/0123abcd',
      (p) => progress.push(p.bytesTotal ?? -1),
      { format: 'flac', resume: false, maxBytes: 100_000_000 },
    );
    expect(file).toEqual({
      uri: 'file:///data/downloads/0123abcd.flac',
      bytes: 2_862_080,
      format: 'flac',
      verified: true,
    });
    expect(transfers[0]).toMatchObject({
      url: `https://archive.org/download/${GERAKINA}/I_Georgakopoulou_B_Tsitsanis-I_Gerakina-ca1940.flac`,
      fileUri: 'file:///data/downloads/0123abcd.flac',
      resume: false,
      headers: { 'User-Agent': 'Aulos/test' },
    });
    // The total comes from the metadata size when the server does not send one.
    expect(progress).toEqual([11_534_271]);
  });

  it('falls back to MP3 when the item has no file in the chosen format', async () => {
    files.digest = '08ca133de769cf4818ae17d8ea21ff89';
    const file = await provider.download?.(
      `${EXALOT}/01.cosmicVoyager.mp3`,
      'file:///d/x',
      () => undefined,
      { format: 'flac', resume: true, maxBytes: 100_000_000 },
    );
    expect(file?.format).toBe('mp3');
    expect(transfers[0]).toMatchObject({ fileUri: 'file:///d/x.mp3', resume: true });
  });

  it('deletes a download whose MD5 does not match', async () => {
    files.digest = 'ffffffffffffffffffffffffffffffff';
    await expect(
      provider.download?.(`${EXALOT}/01.cosmicVoyager.mp3`, 'file:///d/x', () => undefined, {
        format: 'mp3',
        resume: false,
        maxBytes: 100_000_000,
      }),
    ).rejects.toBeInstanceOf(IntegrityError);
    expect(files.removed).toEqual(['file:///d/x.mp3']);
  });

  it('refuses a file larger than the storage limit allows before transferring', async () => {
    const error = await provider
      .download?.('lph333/333.mp3', 'file:///d/x', () => undefined, {
        format: 'mp3',
        resume: false,
        maxBytes: 50_000_000,
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageLimitError);
    expect((error as StorageLimitError).bytesNeeded).toBe(62_582_281);
    expect(transfers).toEqual([]);
  });
});
