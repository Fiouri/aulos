import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { Spacing, useColors } from './theme';

interface TextPromptProps {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/** Single-line text dialog (Android has no Alert.prompt). Blank input cannot be confirmed. */
export function TextPrompt({ visible, onCancel, ...body }: TextPromptProps) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessible={false} />
        {/* Mounted per opening, so the field starts from initialValue every time. */}
        {visible && <PromptBody {...body} onCancel={onCancel} />}
      </View>
    </Modal>
  );
}

function PromptBody({
  title,
  initialValue = '',
  placeholder,
  confirmLabel,
  onConfirm,
  onCancel,
}: Omit<TextPromptProps, 'visible'>) {
  const { t } = useTranslation();
  const colors = useColors();
  const [value, setValue] = useState(initialValue);
  const valid = value.trim().length > 0;
  const confirm = () => {
    if (valid) onConfirm(value.trim());
  };

  return (
    <View style={[styles.dialog, { backgroundColor: colors.background }]}>
      <AppText variant="heading">{title}</AppText>
      <TextInput
        testID="prompt-input"
        autoFocus
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        onSubmitEditing={confirm}
        returnKeyType="done"
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
      />
      <View style={styles.actions}>
        <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} />
        <Button testID="prompt-confirm" label={confirmLabel} onPress={confirm} disabled={!valid} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', padding: Spacing.lg },
  dialog: { borderRadius: 20, padding: Spacing.lg, gap: Spacing.md },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
    fontSize: 16,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
});
