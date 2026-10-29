import { reloadAppAsync } from 'expo';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { formatErrorDetails } from '@/errors/details';

import { AppText } from './AppText';
import { Button } from './Button';
import { Spacing, useColors } from './theme';

type Caught = { error: unknown; componentStack: string | null };

/** Used until the provider measures the window, when the native metrics are not known yet. */
const NO_INSETS = {
  frame: { x: 0, y: 0, width: 0, height: 0 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

interface State {
  caught: Caught | null;
}

function androidRelease(): string {
  const constants = Platform.constants;
  return 'Release' in constants && typeof constants.Release === 'string'
    ? constants.Release
    : 'unknown';
}

function ErrorScreen({ caught }: { caught: Caught }) {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const details = formatErrorDetails({
      error: caught.error,
      componentStack: caught.componentStack,
      appVersion: Constants.expoConfig?.version ?? 'unknown',
      androidRelease: androidRelease(),
      apiLevel: Number(Platform.Version),
      time: new Date(),
    });
    await Clipboard.setStringAsync(details);
    setCopied(true);
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
      ]}>
      <AppText variant="title" accessibilityRole="header">
        {t('crash.title')}
      </AppText>
      <AppText>{t('crash.body')}</AppText>
      <View style={styles.actions}>
        <Button
          testID="crash-copy"
          variant="secondary"
          label={copied ? t('crash.copied') : t('crash.copy')}
          onPress={() => void copy()}
        />
        <Button
          testID="crash-restart"
          label={t('crash.restart')}
          onPress={() => void reloadAppAsync('Restart from the error screen')}
        />
      </View>
    </ScrollView>
  );
}

/**
 * Last line of defence for the whole app: a render error anywhere below, or a fatal JavaScript
 * error reported to the global handler, shows a friendly screen with "Copy error details" and
 * "Restart" instead of closing the app. A class, because React only offers error boundaries as
 * class components.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { caught: null };

  private previousHandler: ReturnType<typeof ErrorUtils.getGlobalHandler> | null = null;

  static getDerivedStateFromError(error: unknown): State {
    return { caught: { error, componentStack: null } };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.setState({ caught: { error, componentStack: info.componentStack ?? null } });
  }

  componentDidMount() {
    const previous = ErrorUtils.getGlobalHandler();
    this.previousHandler = previous;
    ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      // A failure while the error screen is showing goes to React Native's own handler.
      if (!isFatal || this.state.caught) {
        previous(error, isFatal);
        return;
      }
      this.setState({ caught: { error, componentStack: null } });
    });
  }

  componentWillUnmount() {
    if (this.previousHandler) ErrorUtils.setGlobalHandler(this.previousHandler);
  }

  render() {
    if (!this.state.caught) return this.props.children;
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics ?? NO_INSETS}>
        <ErrorScreen caught={this.state.caught} />
      </SafeAreaProvider>
    );
  }
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  actions: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
});
