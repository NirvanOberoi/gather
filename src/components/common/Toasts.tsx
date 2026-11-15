import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/state/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, shadows } from '@/theme/tokens';
import { Icon, Text } from '@/components/ui';

export function Toasts() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  if (!toasts.length) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 90, gap: 8, alignItems: 'center' }}>
      {toasts.map((t) => (
        <Pressable
          key={t.id}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          onPress={() => dismiss(t.id)}
          style={[{ maxWidth: 480, width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderRadius: radius.lg, backgroundColor: '#1E1B33' }, shadows.raised]}
        >
          <Icon name={t.tone === 'success' ? 'checkmark-circle' : t.tone === 'error' ? 'alert-circle' : 'information-circle'} size={19} color={t.tone === 'success' ? '#4ADE80' : t.tone === 'error' ? '#F87171' : colors.secondary} />
          <Text variant="caption" color="#fff" style={{ flex: 1 }}>{t.message}</Text>
          {t.action ? (
            <Text variant="caption" color="#B9AEFF" style={{ fontFamily: 'PlusJakartaSans_700Bold' }} onPress={() => { t.action!.onPress(); dismiss(t.id); }}>
              {t.action.label}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
