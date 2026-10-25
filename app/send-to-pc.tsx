import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import type { JamTrack } from '@/nuclear/schemas';
import { usePcStore } from '@/stores/pc';
import { AppText } from '@/ui/AppText';
import { formatDurationMs } from '@/ui/format';
import { DetailScreen } from '@/ui/Layouts';
import { ListRow } from '@/ui/ListRow';
import { Spacing } from '@/ui/theme';
import { showToast } from '@/ui/toast';

/** "Send to PC" without a sure match: the PC's search results, for the user to choose. */
export default function SendToPcScreen() {
  const { t } = useTranslation();
  const candidates = usePcStore((s) => s.candidates);

  const choose = async (track: JamTrack) => {
    if (await usePcStore.getState().addToQueue([track])) {
      showToast(t('track.sentToPc', { title: track.title }));
      usePcStore.getState().setCandidates(null);
      router.back();
    }
  };

  if (!candidates) return null;
  return (
    <DetailScreen>
      <FlashList
        data={candidates.tracks}
        keyExtractor={(track, index) => `${index}:${track.source.provider}:${track.source.id}`}
        ListHeaderComponent={
          <AppText variant="secondary" style={styles.hint} testID="send-to-pc-hint">
            {candidates.tracks.length > 0
              ? t('pc.candidatesHint', { title: candidates.title })
              : t('pc.candidatesNone', { title: candidates.title })}
          </AppText>
        }
        renderItem={({ item, index }) => (
          <ListRow
            testID={`send-to-pc-${index}`}
            title={item.title}
            subtitle={[
              item.artists.map((a) => a.name).join(', '),
              formatDurationMs(item.durationMs ?? null),
            ]
              .filter(Boolean)
              .join(' · ')}
            onPress={() => void choose(item)}
          />
        )}
      />
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  hint: { padding: Spacing.md },
});
