import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Icon, Text } from '@/components/ui';
import { addDaysISO, minutesLabel, todayISOInZone } from '@/domain/time';

export function DayPicker({ value, onChange, tz, days = 21 }: { value: string; onChange: (d: string) => void; tz: string; days?: number }) {
  const { colors } = useTheme();
  const today = todayISOInZone(tz);
  const list = Array.from({ length: days }, (_, i) => addDaysISO(today, i));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {list.map((d) => {
        const on = d === value;
        const date = new Date(`${d}T12:00:00Z`);
        return (
          <Pressable key={d} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={date.toDateString()} onPress={() => onChange(d)}
            style={{ width: 56, paddingVertical: 10, borderRadius: radius.lg, alignItems: 'center', gap: 2, backgroundColor: on ? colors.primary : colors.surface, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}>
            <Text variant="tiny" color={on ? '#fff' : 'muted'}>{d === today ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</Text>
            <Text variant="heading" color={on ? '#fff' : 'text'}>{date.getUTCDate()}</Text>
            <Text variant="tiny" color={on ? '#fff' : 'subtle'}>{date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** 30-minute step time picker; `allowNextDay` lets end times run past midnight. */
export function TimeStepper({ label, minutes, onChange, allowNextDay }: { label: string; minutes: number; onChange: (m: number) => void; allowNextDay?: boolean }) {
  const { colors } = useTheme();
  const max = allowNextDay ? 1440 : 1410;
  const step = (d: number) => onChange(Math.min(max, Math.max(0, minutes + d)));
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text variant="caption" color="muted">{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, height: 50 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} earlier`} onPress={() => step(-30)} style={{ width: 44, height: 50, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="remove" size={18} color={colors.primary} />
        </Pressable>
        <Text variant="bodyStrong" align="center" style={{ flex: 1 }} accessibilityLiveRegion="polite">{minutes === 1440 ? '12 AM (next day)' : minutesLabel(minutes)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} later`} onPress={() => step(30)} style={{ width: 44, height: 50, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="add" size={18} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}
