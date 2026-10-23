import { FlashList } from '@shopify/flash-list';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { useDbQuery } from '@/db/useDbQuery';
import { listArtists } from '@/library/queries';

import { AppText } from '../AppText';
import { Spacing } from '../theme';
import { ArtistRow } from './rows';

export function ArtistsSection({ header }: { header: ReactElement }) {
  const { t } = useTranslation();
  const artists = useDbQuery(listArtists) ?? [];
  return (
    <FlashList
      data={artists}
      keyExtractor={(a) => a.name}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <AppText variant="secondary" style={styles.empty}>
          {t('library.nothingHere')}
        </AppText>
      }
      renderItem={({ item, index }) => <ArtistRow artist={item} testID={`artist-${index}`} />}
    />
  );
}

const styles = StyleSheet.create({
  empty: { padding: Spacing.lg, textAlign: 'center' },
});
