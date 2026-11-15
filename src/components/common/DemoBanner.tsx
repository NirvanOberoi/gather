import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Icon, Text } from '@/components/ui';

/** Always-visible label so sample data is never mistaken for real data. */
export function DemoBanner() {
  const mode = useSession((s) => s.mode);
  const { colors } = useTheme();
  if (mode !== 'demo') return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Demo mode. Sample data only. Tap for details." onPress={() => router.push('/settings/demo')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 5, backgroundColor: colors.warningSoft }}>
        <Icon name="flask" size={12} color={colors.warning} />
        <Text variant="tiny" color={colors.warning}>DEMO MODE · sample people & places · nothing here is real</Text>
      </View>
    </Pressable>
  );
}
