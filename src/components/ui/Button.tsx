import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai' | 'outline';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({ title, onPress, variant = 'primary', size = 'md', icon, iconRight, loading, disabled, full, style, accessibilityHint, testID }: ButtonProps) {
  const { colors } = useTheme();
  const height = size === 'sm' ? 38 : size === 'lg' ? 56 : 48;
  const fg =
    variant === 'primary' || variant === 'ai' || variant === 'danger' ? colors.onPrimary : variant === 'secondary' ? colors.primary : variant === 'outline' ? colors.text : colors.primary;
  const bg =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.primarySoft : 'transparent';
  const inactive = disabled || loading;

  const content = (
    <View style={[styles.row, { height, paddingHorizontal: size === 'sm' ? 14 : 20 }]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 19} color={fg} /> : null}
          <Text variant={size === 'sm' ? 'caption' : 'bodyStrong'} color={fg} style={{ fontFamily: 'PlusJakartaSans_700Bold' }} numberOfLines={1}>
            {title}
          </Text>
          {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 16 : 19} color={fg} /> : null}
        </>
      )}
    </View>
  );

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: variant === 'ai' ? undefined : bg, opacity: inactive ? 0.55 : pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        variant === 'outline' && { borderWidth: 1.5, borderColor: colors.border },
        full && { alignSelf: 'stretch' },
        style,
      ]}
    >
      {variant === 'ai' ? (
        <LinearGradient colors={colors.aiGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.pill }}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color, background, size = 40, badge }: { icon: IconName; onPress?: () => void; label: string; color?: string; background?: string; size?: number; badge?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [{ width: Math.max(size, 44), height: Math.max(size, 44), alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: background ?? 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={size * 0.55} color={color ?? colors.text} />
      </View>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.danger }]}>
          <Text variant="tiny" color="#fff">{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
});
