import { useCallback, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { Db } from '@/db/types';
import { useDbQuery } from '@/db/useDbQuery';
import { listSongs, SONG_SORTS, type SongSort } from '@/library/queries';
import { usePlayerStore } from '@/stores/player';

import { TrackList } from '../TrackList';
import { Toolbar, ToolbarButton } from './Toolbar';

const nextSort = (sort: SongSort): SongSort =>
  SONG_SORTS[(SONG_SORTS.indexOf(sort) + 1) % SONG_SORTS.length] ?? 'title';

export function SongsSection({ header }: { header: ReactElement }) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<SongSort>('title');
  const load = useCallback((db: Db) => listSongs(db, sort), [sort]);
  const songs = useDbQuery(load) ?? [];

  return (
    <TrackList
      tracks={songs}
      testIDPrefix="song"
      emptyText={t('library.nothingHere')}
      header={
        <>
          {header}
          <Toolbar>
            <ToolbarButton
              testID="songs-sort"
              icon="sort"
              label={t('library.sort.label', { order: t(`library.sort.${sort}`) })}
              onPress={() => setSort(nextSort)}
            />
            <ToolbarButton
              testID="songs-play-all"
              icon="play_arrow"
              label={t('library.playAll')}
              onPress={() => void usePlayerStore.getState().playTracks(songs, 0)}
            />
            <ToolbarButton
              testID="songs-shuffle-all"
              icon="shuffle"
              label={t('library.shuffleAll')}
              onPress={() => void usePlayerStore.getState().shuffleTracks(songs)}
            />
          </Toolbar>
        </>
      }
    />
  );
}
