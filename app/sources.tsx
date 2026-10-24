import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { useDb } from '@/db/DbProvider';
import type { DownloadSettings } from '@/downloads/manager';
import { LOCAL_PROVIDER } from '@/library/providers';
import { providers } from '@/providers/appProviders';
import { DOWNLOAD_FORMATS, type DownloadFormat } from '@/providers/types';
import { useDownloadsStore } from '@/stores/downloads';
import { STORAGE_LIMITS, useSettingsStore } from '@/stores/settings';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chips } from '@/ui/Chips';
import { providerName } from '@/ui/errors';
import { formatBytes } from '@/ui/format';
import { Spacing, useColors } from '@/ui/theme';

/** Settings → Sources: which remote providers are on, and how downloads behave. */
export default function SourcesScreen() {
  const { t } = useTranslation();
  const db = useDb();
  const colors = useColors();
  const disabled = useSettingsStore((s) => s.disabledProviders);
  const downloads = useSettingsStore((s) => s.downloads);
  const remote = providers()
    .all()
    .filter((p) => p.id !== LOCAL_PROVIDER);

  const setProvider = async (id: string, enabled: boolean) => {
    providers().setEnabled(id, enabled);
    await useSettingsStore.getState().setProviderEnabled(db, id, enabled);
  };

  const setDownloads = async (patch: Partial<DownloadSettings>) => {
    await useSettingsStore.getState().setDownloadSettings(db, patch);
    await useDownloadsStore.getState().reconsider();
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
      <Card>
        <AppText variant="heading">{t('sources.providers')}</AppText>
        {remote.map((provider) => (
          <View key={provider.id} style={styles.row}>
            <AppText style={styles.fill}>{providerName(t, provider.id)}</AppText>
            <Switch
              testID={`sources-provider-${provider.id}`}
              accessibilityLabel={providerName(t, provider.id)}
              value={!disabled.includes(provider.id)}
              onValueChange={(on) => void setProvider(provider.id, on)}
              trackColor={{ true: colors.accent, false: colors.border }}
            />
          </View>
        ))}
        <AppText variant="secondary">{t('sources.providersHint')}</AppText>
      </Card>

      <Card>
        <AppText variant="heading">{t('sources.downloads')}</AppText>
        <View style={styles.row}>
          <View style={styles.fill}>
            <AppText>{t('sources.wifiOnly')}</AppText>
            <AppText variant="secondary">{t('sources.wifiOnlyHint')}</AppText>
          </View>
          <Switch
            testID="sources-wifi-only"
            accessibilityLabel={t('sources.wifiOnly')}
            value={downloads.wifiOnly}
            onValueChange={(wifiOnly) => void setDownloads({ wifiOnly })}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
        <AppText>{t('sources.limit')}</AppText>
        <Chips
          chips={STORAGE_LIMITS.map((bytes) => ({
            value: String(bytes),
            label: formatBytes(bytes),
          }))}
          value={String(downloads.limitBytes)}
          onChange={(value) => void setDownloads({ limitBytes: Number(value) })}
          testIDPrefix="sources-limit"
        />
        <AppText>{t('sources.format')}</AppText>
        <Chips<DownloadFormat>
          chips={DOWNLOAD_FORMATS.map((format) => ({
            value: format,
            label: t(`sources.formats.${format}`),
          }))}
          value={downloads.format}
          onChange={(format) => void setDownloads({ format })}
          testIDPrefix="sources-format"
        />
        <AppText variant="secondary">{t('sources.formatHint')}</AppText>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.md, gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 48 },
  fill: { flex: 1 },
});
