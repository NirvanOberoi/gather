import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, shadows } from '@/theme/tokens';

export function Card({ children, style, onPress, padded = true, accessibilityLabel }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean; accessibilityLabel?: string }) {
  const { colors, dark } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: padded ? 16 : 0,
    borderWidth: dark ? 1 : 0,
    borderColor: colors.border,
    ...(dark ? {} : shadows.card),
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [base, { transform: [{ scale: pressed ? 0.985 : 1 }] }, style]}>
      {children}
    </Pressable>
  );
}
