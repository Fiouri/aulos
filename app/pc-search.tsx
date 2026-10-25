import { FlashList } from '@shopify/flash-list';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import type { JamTrack } from '@/nuclear/schemas';
import { usePcStore } from '@/stores/pc';
import { AppText } from '@/ui/AppText';
import { formatDurationMs } from '@/ui/format';
import { IconButton } from '@/ui/IconButton';
import { DetailScreen } from '@/ui/Layouts';
import { ListRow } from '@/ui/ListRow';
import { Spacing, useColors } from '@/ui/theme';
import { showToast } from '@/ui/toast';

const DEBOUNCE_MS = 400;

function subtitle(track: JamTrack): string {
  return [track.artists.map((a) => a.name).join(', '), formatDurationMs(track.durationMs ?? null)]
    .filter(Boolean)
    .join(' · ');
}

/** Search with Nuclear's providers on the PC; results go to the PC queue. */
export default function PcSearchScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; tracks: JamTrack[] } | null>(null);

  useEffect(() => {
    const text = query.trim();
    if (text === '') return;
    let active = true;
    const timer = setTimeout(() => {
      void usePcStore
        .getState()
        .search(text)
        .then((found) => {
          if (active) setResults({ query: text, tracks: found.tracks ?? [] });
        });
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const shown = results?.query === query.trim() ? results : null;

  const add = async (track: JamTrack) => {
    if (await usePcStore.getState().addToQueue([track])) {
      showToast(t('pc.added', { title: track.title }));
    }
  };

  return (
    <DetailScreen>
      <View style={styles.header}>
        <TextInput
          testID="pc-search-input"
          value={query}
          onChangeText={setQuery}
          placeholder={t('pc.searchPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        />
      </View>
      <FlashList
        data={shown?.tracks ?? []}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(track, index) => `${index}:${track.source.provider}:${track.source.id}`}
        ListEmptyComponent={
          shown ? (
            <AppText variant="secondary" style={styles.empty} testID="pc-search-empty">
              {t('search.noResults', { query: shown.query })}
            </AppText>
          ) : null
        }
        renderItem={({ item, index }) => (
          <ListRow
            testID={`pc-result-${index}`}
            title={item.title}
            subtitle={subtitle(item)}
            onPress={() => void add(item)}
            trailing={
              <IconButton
                testID={`pc-result-add-${index}`}
                icon="add"
                label={t('pc.addToPcQueue')}
                onPress={() => void add(item)}
              />
            }
          />
        )}
      />
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  header: { padding: Spacing.md },
  input: { borderWidth: 1, borderRadius: 24, minHeight: 48, paddingHorizontal: Spacing.md },
  empty: { padding: Spacing.lg, textAlign: 'center' },
});
