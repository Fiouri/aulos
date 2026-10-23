import { FlashList } from '@shopify/flash-list';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import type { Playlist } from '@/collections/playlists';
import { useDb } from '@/db/DbProvider';
import type { Album, Artist, Track } from '@/library/queries';
import { currentEntry } from '@/player/queue';
import { searchLibrary, type SearchResults } from '@/search/search';
import { useCollectionsStore } from '@/stores/collections';
import { useLibraryStore } from '@/stores/library';
import { usePlayerStore } from '@/stores/player';
import { AppText } from '@/ui/AppText';
import { IconButton } from '@/ui/IconButton';
import { TabScreen } from '@/ui/Layouts';
import { AlbumRow, ArtistRow, PlaylistRow } from '@/ui/library/rows';
import { Spacing, useColors } from '@/ui/theme';
import { TrackMenu } from '@/ui/TrackMenu';
import { TrackRow } from '@/ui/TrackRow';

/** Results appear this long after the last keystroke. */
const DEBOUNCE_MS = 150;

type Item =
  | { type: 'heading'; title: string }
  | { type: 'song'; track: Track; index: number }
  | { type: 'album'; album: Album; index: number }
  | { type: 'artist'; artist: Artist; index: number }
  | { type: 'playlist'; playlist: Playlist; index: number };

function toItems(
  results: SearchResults,
  t: (key: `search.${'songs' | 'albums' | 'artists' | 'playlists'}`) => string,
): Item[] {
  const items: Item[] = [];
  const group = <T,>(title: string, rows: readonly T[], make: (row: T, index: number) => Item) => {
    if (rows.length === 0) return;
    items.push({ type: 'heading', title });
    rows.forEach((row, index) => items.push(make(row, index)));
  };
  group(t('search.songs'), results.songs, (track, index) => ({ type: 'song', track, index }));
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
      return `s:${item.track.id}`;
    case 'album':
      return `a:${item.album.name}|${item.album.artist ?? ''}`;
    case 'artist':
      return `r:${item.artist.name}`;
    case 'playlist':
      return `p:${item.playlist.id}`;
  }
}

export default function SearchScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const db = useDb();
  const libraryRevision = useLibraryStore((s) => s.revision);
  const collectionsRevision = useCollectionsStore((s) => s.revision);
  const currentTrackId = usePlayerStore((s) => currentEntry(s.queue)?.trackId ?? null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [found, setFound] = useState<{ query: string; results: SearchResults } | null>(null);
  const [menu, setMenu] = useState<Track | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debounced === '') return;
    let active = true;
    void searchLibrary(db, debounced).then((results) => {
      if (active) setFound({ query: debounced, results });
    });
    return () => {
      active = false;
    };
  }, [db, debounced, libraryRevision, collectionsRevision]);

  const results = debounced !== '' && found?.query === debounced ? found.results : null;
  const items = results ? toItems(results, t) : [];
  const songs = results?.songs ?? [];

  return (
    <TabScreen>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('search.title')}
        </AppText>
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
      {debounced === '' ? (
        <AppText variant="secondary" style={styles.message} testID="search-hint">
          {t('search.hint')}
        </AppText>
      ) : results && items.length === 0 ? (
        <AppText variant="secondary" style={styles.message} testID="search-no-results">
          {t('search.noResults', { query: debounced })}
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
                    current={item.track.id === currentTrackId}
                    onPress={() => void usePlayerStore.getState().playTracks(songs, item.index)}
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
