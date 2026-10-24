import { FlashList } from '@shopify/flash-list';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import type { Playlist } from '@/collections/playlists';
import type { Artist } from '@/library/queries';
import { LOCAL_PROVIDER } from '@/library/providers';
import { isAbortError } from '@/net/errors';
import { currentEntry } from '@/player/queue';
import { providers } from '@/providers/appProviders';
import {
  isRemoteAlbum,
  isStoredTrack,
  type AlbumItem,
  type SearchResult,
  type SearchType,
  type TrackItem,
} from '@/providers/types';
import { useCollectionsStore } from '@/stores/collections';
import { useLibraryStore } from '@/stores/library';
import { useNetworkStore } from '@/stores/network';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { AppText } from '@/ui/AppText';
import { Chips, type Chip } from '@/ui/Chips';
import { providerErrorMessage, providerName } from '@/ui/errors';
import { IconButton } from '@/ui/IconButton';
import { TabScreen } from '@/ui/Layouts';
import { AlbumRow, ArtistRow, PlaylistRow } from '@/ui/library/rows';
import { Spacing, useColors } from '@/ui/theme';
import { TrackMenu } from '@/ui/TrackMenu';
import { TrackRow } from '@/ui/TrackRow';
import { useTrackActions } from '@/ui/useTrackActions';

/** Results appear this long after the last keystroke: instant for the library, gentler on a
 * remote service. */
const DEBOUNCE_MS = { local: 150, remote: 400 } as const;
const RESULT_LIMIT = 50;
const ALL_TYPES: readonly SearchType[] = ['tracks', 'albums', 'artists', 'playlists'];

type Item =
  | { type: 'heading'; title: string }
  | { type: 'song'; track: TrackItem; index: number }
  | { type: 'album'; album: AlbumItem; index: number }
  | { type: 'artist'; artist: Artist; index: number }
  | { type: 'playlist'; playlist: Playlist; index: number };

function toItems(
  results: SearchResult,
  t: (key: `search.${'songs' | 'albums' | 'artists' | 'playlists'}`) => string,
): Item[] {
  const items: Item[] = [];
  const group = <T,>(title: string, rows: readonly T[], make: (row: T, index: number) => Item) => {
    if (rows.length === 0) return;
    items.push({ type: 'heading', title });
    rows.forEach((row, index) => items.push(make(row, index)));
  };
  group(t('search.songs'), results.tracks, (track, index) => ({ type: 'song', track, index }));
  group(t('search.albums'), results.albums, (album, index) => ({ type: 'album', album, index }));
  group(t('search.artists'), results.artists, (artist, index) => ({
    type: 'artist',
    artist,
    index,
  }));
  group(t('search.playlists'), results.playlists, (playlist, index) => ({
    type: 'playlist',
    playlist,
    index,
  }));
  return items;
}

function itemKey(item: Item): string {
  switch (item.type) {
    case 'heading':
      return `h:${item.title}`;
    case 'song':
      return `s:${item.track.provider}:${item.track.providerRef}`;
    case 'album':
      return isRemoteAlbum(item.album)
        ? `a:${item.album.provider}:${item.album.ref}`
        : `a:${item.album.key}`;
    case 'artist':
      return `r:${item.artist.name}`;
    case 'playlist':
      return `p:${item.playlist.id}`;
  }
}

type Found =
  | { source: string; query: string; results: SearchResult }
  | { source: string; query: string; error: unknown };

/**
 * One search box for every searchable provider: the library (default, offline, accent-blind)
 * and the remote sources switched on in Settings → Sources.
 */
export default function SearchScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const actions = useTrackActions();
  const libraryRevision = useLibraryStore((s) => s.revision);
  const collectionsRevision = useCollectionsStore((s) => s.revision);
  const disabledProviders = useSettingsStore((s) => s.disabledProviders);
  const online = useNetworkStore((s) => s.status.online);
  const currentTrackId = usePlayerStore((s) => currentEntry(s.queue)?.trackId ?? null);
  const [chosenSource, setSource] = useState(LOCAL_PROVIDER);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [menu, setMenu] = useState<TrackItem | null>(null);

  const searchable = providers()
    .withCapability('search')
    .filter((p) => !disabledProviders.includes(p.id));
  const source = searchable.some((p) => p.id === chosenSource) ? chosenSource : LOCAL_PROVIDER;
  const remote = source !== LOCAL_PROVIDER;
  const chips: Chip<string>[] = searchable.map((p) => ({
    value: p.id,
    label: providerName(t, p.id),
  }));

  useEffect(() => {
    const timer = setTimeout(
      () => setDebounced(query.trim()),
      remote ? DEBOUNCE_MS.remote : DEBOUNCE_MS.local,
    );
    return () => clearTimeout(timer);
  }, [query, remote]);

  useEffect(() => {
    if (debounced === '' || (remote && !online)) return;
    const provider = providers().get(source);
    if (!provider) return;
    const controller = new AbortController();
    provider
      .search(debounced, { types: ALL_TYPES, limit: RESULT_LIMIT, signal: controller.signal })
      .then(
        (results) => setFound({ source, query: debounced, results }),
        (error: unknown) => {
          if (!isAbortError(error)) setFound({ source, query: debounced, error });
        },
      );
    return () => controller.abort();
  }, [source, remote, online, debounced, libraryRevision, collectionsRevision]);

  const current = found?.source === source && found.query === debounced ? found : null;
  const results = current && 'results' in current ? current.results : null;
  const error = current && 'error' in current ? current.error : null;
  const items = results ? toItems(results, t) : [];
  const songs = results?.tracks ?? [];

  const message = (() => {
    if (debounced === '') {
      return { id: 'search-hint', text: remote ? t('search.remoteHint') : t('search.hint') };
    }
    if (remote && !online) return { id: 'search-offline', text: t('errors.offline') };
    if (error !== null) return { id: 'search-error', text: providerErrorMessage(t, error) };
    if (results && items.length === 0) {
      return { id: 'search-no-results', text: t('search.noResults', { query: debounced }) };
    }
    return null;
  })();

  return (
    <TabScreen>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('search.title')}
        </AppText>
        {chips.length > 1 && (
          <Chips chips={chips} value={source} onChange={setSource} testIDPrefix="search-source" />
        )}
        <View
          style={[styles.field, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <TextInput
            testID="search-input"
            value={query}
            onChangeText={setQuery}
            placeholder={t('search.placeholder')}
            placeholderTextColor={colors.textSecondary}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={[styles.input, { color: colors.text }]}
          />
          {query.length > 0 && (
            <IconButton
              testID="search-clear"
              icon="close"
              label={t('search.clear')}
              onPress={() => setQuery('')}
            />
          )}
        </View>
      </View>
      {message ? (
        <AppText variant="secondary" style={styles.message} testID={message.id}>
          {message.text}
        </AppText>
      ) : (
        <FlashList
          data={items}
          extraData={currentTrackId}
          keyboardShouldPersistTaps="handled"
          getItemType={(item) => item.type}
          keyExtractor={itemKey}
          renderItem={({ item }) => {
            switch (item.type) {
              case 'heading':
                return (
                  <AppText variant="heading" style={styles.heading}>
                    {item.title}
                  </AppText>
                );
              case 'song':
                return (
                  <TrackRow
                    track={item.track}
                    testID={`search-song-${item.index}`}
                    current={isStoredTrack(item.track) && item.track.id === currentTrackId}
                    onPress={() => void actions.play(songs, item.index)}
                    onMore={() => setMenu(item.track)}
                  />
                );
              case 'album':
                return <AlbumRow album={item.album} testID={`search-album-${item.index}`} />;
              case 'artist':
                return <ArtistRow artist={item.artist} testID={`search-artist-${item.index}`} />;
              case 'playlist':
                return (
                  <PlaylistRow playlist={item.playlist} testID={`search-playlist-${item.index}`} />
                );
            }
          }}
        />
      )}
      <TrackMenu track={menu} onClose={() => setMenu(null)} />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  header: { padding: Spacing.md, gap: Spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 24,
    paddingLeft: Spacing.md,
  },
  input: { flex: 1, minHeight: 48, fontSize: 16 },
  heading: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  message: { padding: Spacing.lg, textAlign: 'center' },
});
