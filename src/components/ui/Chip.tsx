import React from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';

export function Chip({ label, selected, onPress, icon, emoji, size = 'md', tone }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; emoji?: string; size?: 'sm' | 'md'; tone?: 'neutral' | 'primary' | 'success' | 'warning' }) {
  const { colors } = useTheme();
  const toneBg = tone === 'success' ? colors.successSoft : tone === 'warning' ? colors.warningSoft : tone === 'primary' ? colors.primarySoft : colors.surfaceAlt;
  const toneFg = tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : tone === 'primary' ? colors.primary : colors.text;
  const bg = selected ? colors.primary : toneBg;
  const fg = selected ? colors.onPrimary : toneFg;
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: size === 'sm' ? 10 : 14, minHeight: size === 'sm' ? 28 : 40, borderRadius: radius.pill, backgroundColor: bg, borderWidth: selected ? 0 : 1, borderColor: selected ? 'transparent' : colors.border }}>
      {emoji ? <Text variant={size === 'sm' ? 'caption' : 'body'}>{emoji}</Text> : null}
      {icon ? <Icon name={icon} size={size === 'sm' ? 13 : 16} color={fg} /> : null}
      <Text variant={size === 'sm' ? 'tiny' : 'caption'} color={fg} style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}>{label}</Text>
      {selected && onPress ? <Icon name="checkmark" size={14} color={fg} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected }}
      accessibilityLabel={label}
      hitSlop={4}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}
    >
      {body}
    </Pressable>
  );
}

export function Pill({ label, tone = 'primary', icon }: { label: string; tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'sample'; icon?: IconName }) {
  const { colors } = useTheme();
  const map = {
    primary: [colors.primarySoft, colors.primary],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
    neutral: [colors.surfaceAlt, colors.textMuted],
    sample: [colors.warningSoft, colors.warning],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: bg }}>
      {icon ? <Icon name={icon} size={11} color={fg} /> : null}
      <Text variant="tiny" color={fg}>{label}</Text>
    </View>
  );
}
