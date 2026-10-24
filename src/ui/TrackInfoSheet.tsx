import { useTranslation } from 'react-i18next';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isStoredTrack, type TrackItem } from '@/providers/types';

import { AppText } from './AppText';
import { providerName } from './errors';
import { Spacing, useColors } from './theme';

interface TrackInfoSheetProps {
  track: TrackItem | null;
  onClose: () => void;
}

/** Where a track comes from: provider, licence (tappable) and who to credit. */
export function TrackInfoSheet({ track, onClose }: TrackInfoSheetProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const onDevice = track !== null && isStoredTrack(track) && track.localPath !== null;
  const licenseUrl = track?.licenseUrl ?? null;

  return (
    <Modal visible={track !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={[styles.scrim, { backgroundColor: colors.scrim }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      />
      <View
        testID="track-info"
        style={[
          styles.sheet,
          { backgroundColor: colors.background, paddingBottom: insets.bottom + Spacing.md },
        ]}>
        <AppText variant="heading" numberOfLines={2}>
          {track?.title}
        </AppText>
        <View style={styles.row}>
          <AppText variant="secondary">{t('trackInfo.source')}</AppText>
          <AppText testID="track-info-source">
            {track ? providerName(t, track.provider) : ''}
          </AppText>
        </View>
        <View style={styles.row}>
          <AppText variant="secondary">{t('trackInfo.file')}</AppText>
          <AppText>{onDevice ? t('trackInfo.onDevice') : t('trackInfo.streaming')}</AppText>
        </View>
        <View style={styles.row}>
          <AppText variant="secondary">{t('trackInfo.licence')}</AppText>
          {licenseUrl ? (
            <Pressable
              testID="track-info-licence"
              accessibilityRole="link"
              onPress={() => void Linking.openURL(licenseUrl)}>
              <AppText style={{ color: colors.accent }} numberOfLines={2}>
                {licenseUrl}
              </AppText>
            </Pressable>
          ) : (
            <AppText>{t('trackInfo.noLicence')}</AppText>
          )}
        </View>
        <View style={styles.row}>
          <AppText variant="secondary">{t('trackInfo.attribution')}</AppText>
          <AppText testID="track-info-attribution">
            {track?.attribution ?? track?.artist ?? t('common.unknownArtist')}
          </AppText>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1 },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  row: { gap: 2 },
});
