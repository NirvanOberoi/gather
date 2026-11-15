import React from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { IconButton } from './Button';

export function Screen({ children, scroll = true, padded = true, style, refreshing, onRefresh, keyboard, edges = ['top'] }: {
  children: React.ReactNode; scroll?: boolean; padded?: boolean; style?: StyleProp<ViewStyle>; refreshing?: boolean; onRefresh?: () => void; keyboard?: boolean; edges?: ('top' | 'bottom')[];
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad: ViewStyle = { paddingTop: edges.includes('top') ? insets.top : 0, paddingBottom: edges.includes('bottom') ? insets.bottom : 0 };
  const inner = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[{ paddingHorizontal: padded ? 20 : 0, paddingBottom: 40 }, style]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingHorizontal: padded ? 20 : 0 }, style]}>{children}</View>
  );
  const body = <View style={[{ flex: 1, backgroundColor: colors.background }, pad]}>{inner}</View>;
  if (!keyboard) return body;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {body}
    </KeyboardAvoidingView>
  );
}

export function Header({ title, subtitle, back = true, right, large }: { title: string; subtitle?: string; back?: boolean; right?: React.ReactNode; large?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 4, marginHorizontal: -8 }}>
      {back ? <IconButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} color={colors.text} /> : <View style={{ width: 8 }} />}
      <View style={{ flex: 1 }}>
        <Text variant={large ? 'title' : 'heading'} numberOfLines={1} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text variant="caption" color="muted" numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 12 }}>
      <Text variant="heading" accessibilityRole="header">{title}</Text>
      {action ? (
        <Text variant="caption" color="primary" style={{ fontFamily: 'PlusJakartaSans_700Bold' }} onPress={onAction} accessibilityRole="button" suppressHighlighting>
          {action}
        </Text>
      ) : null}
    </View>
  );
}
