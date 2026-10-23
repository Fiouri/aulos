import { FlashList } from '@shopify/flash-list';
import { useCallback, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import type { Db } from '@/db/types';
import { useDbQuery } from '@/db/useDbQuery';
import { ALBUM_SORTS, hasAlbumYears, listAlbums, type AlbumSort } from '@/library/queries';

import { AppText } from '../AppText';
import { Spacing } from '../theme';
import { AlbumRow } from './rows';
import { Toolbar, ToolbarButton } from './Toolbar';

export function AlbumsSection({ header }: { header: ReactElement }) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<AlbumSort>('name');
  const load = useCallback(
    async (db: Db) => ({ albums: await listAlbums(db, sort), years: await hasAlbumYears(db) }),
    [sort],
  );
  const data = useDbQuery(load);
  // Year sorting is offered only when the library has year tags.
  const sorts = ALBUM_SORTS.filter((s) => s !== 'year' || data?.years);
  const nextSort = () => setSort(sorts[(sorts.indexOf(sort) + 1) % sorts.length] ?? 'name');

  return (
    <FlashList
      data={data?.albums ?? []}
      keyExtractor={(a) => `${a.name}\u0000${a.artist ?? ''}`}
      ListHeaderComponent={
        <>
          {header}
          <Toolbar>
            <ToolbarButton
              testID="albums-sort"
              icon="sort"
              label={t('library.sort.label', { order: t(`library.sort.${sort}`) })}
              onPress={nextSort}
            />
          </Toolbar>
        </>
      }
      ListEmptyComponent={
        <AppText variant="secondary" style={styles.empty}>
          {t('library.nothingHere')}
        </AppText>
      }
      renderItem={({ item, index }) => <AlbumRow album={item} testID={`album-${index}`} />}
    />
  );
}

const styles = StyleSheet.create({
  empty: { padding: Spacing.lg, textAlign: 'center' },
});
