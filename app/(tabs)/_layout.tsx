import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';

import { useColors } from '@/ui/theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.surface}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t('tabs.library')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="library_music" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Label>{t('tabs.search')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="search" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>{t('tabs.settings')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
