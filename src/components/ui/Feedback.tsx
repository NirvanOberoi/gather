import React, { useEffect, useState } from 'react';
import { Animated, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { Button } from './Button';

export function Skeleton({ width = '100%', height = 16, rounded = 8, style }: { width?: DimensionValue; height?: number; rounded?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const [v] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View accessibilityLabel="Loading" style={[{ width, height, borderRadius: rounded, backgroundColor: colors.skeleton, opacity: v }, style]} />;
}

export function SkeletonList({ rows = 4, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <View style={{ gap: 18, paddingVertical: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {avatar ? <Skeleton width={48} height={48} rounded={24} /> : null}
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="85%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function EmptyState({ icon, title, body, action, onAction, compact }: { icon: IconName; title: string; body?: string; action?: string; onAction?: () => void; compact?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: compact ? 20 : 44, paddingHorizontal: 24, gap: 10 }}>
      <LinearGradient colors={[colors.primarySoft, colors.surfaceAlt]} style={{ width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Icon name={icon} size={36} color={colors.primary} />
      </LinearGradient>
      <Text variant="heading" align="center">{title}</Text>
      {body ? <Text variant="body" color="muted" align="center">{body}</Text> : null}
      {action && onAction ? <Button title={action} onPress={onAction} style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong.';
  return <EmptyState icon="cloud-offline-outline" title="Couldn’t load this" body={msg} action={onRetry ? 'Try again' : undefined} onAction={onRetry} />;
}

export function ProgressBar({ value, height = 6, color }: { value: number; height?: number; color?: string }) {
  const { colors } = useTheme();
  const [w] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(w, { toValue: Math.max(0, Math.min(1, value)), useNativeDriver: false, friction: 9 }).start();
  }, [value, w]);
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }} style={{ height, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
      <Animated.View style={{ height, borderRadius: radius.pill, backgroundColor: color ?? colors.primary, width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

export function Notice({ text, tone = 'info', icon }: { text: string; tone?: 'info' | 'warning' | 'success' | 'danger'; icon?: IconName }) {
  const { colors } = useTheme();
  const [bg, fg] =
    tone === 'warning' ? [colors.warningSoft, colors.warning] : tone === 'success' ? [colors.successSoft, colors.success] : tone === 'danger' ? [colors.dangerSoft, colors.danger] : [colors.primarySoft, colors.primary];
  return (
    <View accessibilityRole="text" style={{ flexDirection: 'row', gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: bg, alignItems: 'flex-start' }}>
      <Icon name={icon ?? (tone === 'warning' ? 'alert-circle' : tone === 'success' ? 'checkmark-circle' : tone === 'danger' ? 'warning' : 'information-circle')} size={17} color={fg} />
      <Text variant="caption" color={fg} style={{ flex: 1 }}>{text}</Text>
    </View>
  );
}
