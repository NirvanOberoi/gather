import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Text } from './Text';
import { IconButton } from './Button';

/** Bottom sheet built on Modal — works on iOS, Android and web without extra native deps. */
export function Sheet({ visible, onClose, title, children, scroll = true }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; scroll?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay }} />
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, maxHeight: '90%', paddingBottom: insets.bottom + 12 }}>
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, minHeight: 52 }}>
            <Text variant="heading" style={{ flex: 1 }} accessibilityRole="header">{title ?? ''}</Text>
            <IconButton icon="close" label="Close" onPress={onClose} background={colors.surfaceAlt} size={34} />
          </View>
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}>{children}</ScrollView>
          ) : (
            <View style={{ paddingHorizontal: 20 }}>{children}</View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
