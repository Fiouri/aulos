import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { useDb } from '@/db/DbProvider';
import { useLibraryStore } from '@/stores/library';

import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import { Spacing } from './theme';

/** Track count, last scan, permission states and the Scan button at the top of the Library. */
export function LibraryStatus() {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const permission = useLibraryStore((s) => s.permission);
  const status = useLibraryStore((s) => s.status);
  const error = useLibraryStore((s) => s.error);
  const totalTracks = useLibraryStore((s) => s.totalTracks);
  const lastScan = useLibraryStore((s) => s.lastScan);
  const loaded = useLibraryStore((s) => s.loaded);

  const scanning = status === 'scanning';
  const onScan = () => void useLibraryStore.getState().scan(db);
  const onGrant = () => void useLibraryStore.getState().requestPermission();
  const onOpenSettings = () => void Linking.openSettings();

  const lastScanText = lastScan
    ? t('library.lastScan', {
        date: new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(lastScan.at)),
      })
    : t('library.neverScanned');

  return (
    <View style={styles.container}>
      <Card>
        <View style={styles.countRow}>
          <View style={styles.count}>
            <AppText variant="heading" testID="track-count">
              {loaded ? String(totalTracks) : '–'}
            </AppText>
            <AppText>{t('library.tracks', { count: totalTracks })}</AppText>
          </View>
          {permission !== 'blocked' && (
            <Button
              testID="scan-button"
              variant="secondary"
              label={scanning ? t('library.scanning') : t('library.scan')}
              onPress={onScan}
              busy={scanning}
            />
          )}
        </View>
        <AppText variant="secondary" testID="last-scan">
          {lastScanText}
        </AppText>
        {lastScan && (
          <View style={styles.resultRow}>
            <AppText variant="secondary" testID="last-result">
              {t('library.lastResult', {
                added: lastScan.result.added,
                updated: lastScan.result.updated,
                removed: lastScan.result.removed,
              })}
            </AppText>
            <AppText variant="secondary" testID="scan-duration">
              {t('library.scanDuration', {
                seconds: (lastScan.result.durationMs / 1000).toFixed(1),
              })}
            </AppText>
          </View>
        )}
      </Card>

      {permission === 'denied' && (
        <Card testID="permission-denied">
          <AppText>{t('library.permissionDenied')}</AppText>
          <Button label={t('library.grantAccess')} variant="secondary" onPress={onGrant} />
        </Card>
      )}

      {permission === 'blocked' && (
        <Card testID="permission-blocked">
          <AppText>{t('library.permissionBlocked')}</AppText>
          <Button
            testID="open-settings"
            label={t('library.openSettings')}
            variant="secondary"
            onPress={onOpenSettings}
          />
        </Card>
      )}

      {permission === 'unknown' && loaded && (
        <Card>
          <AppText>{t('library.permissionNeeded')}</AppText>
        </Card>
      )}

      {status === 'error' && error && (
        <AppText variant="error" testID="scan-error">
          {t('library.scanFailed', { message: error })}
        </AppText>
      )}

      {permission === 'granted' && lastScan && totalTracks === 0 && !scanning && (
        <AppText variant="secondary" testID="library-empty">
          {t('library.empty')}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.sm, paddingHorizontal: Spacing.md },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  resultRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
