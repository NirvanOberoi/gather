import React from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { typography, type TypographyVariant } from '@/theme/tokens';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: 'text' | 'muted' | 'subtle' | 'primary' | 'onPrimary' | 'danger' | 'success' | 'accent' | string;
  align?: TextStyle['textAlign'];
}

export function Text({ variant = 'body', color = 'text', align, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const map: Record<string, string> = {
    text: colors.text, muted: colors.textMuted, subtle: colors.textSubtle, primary: colors.primary,
    onPrimary: colors.onPrimary, danger: colors.danger, success: colors.success, accent: colors.accent,
  };
  return <RNText {...rest} maxFontSizeMultiplier={1.6} style={[typography[variant], { color: map[color] ?? color, textAlign: align }, style]} />;
}
