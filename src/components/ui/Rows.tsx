import React from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';

export function ListRow({ icon, iconColor, title, subtitle, onPress, right, danger, chevron = true, left }: {
  icon?: IconName; iconColor?: string; title: string; subtitle?: string; onPress?: () => void; right?: React.ReactNode; danger?: boolean; chevron?: boolean; left?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, minHeight: 56 }}>
      {left}
      {icon ? (
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: danger ? colors.dangerSoft : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={19} color={danger ? colors.danger : (iconColor ?? colors.primary)} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" color={danger ? 'danger' : 'text'}>{title}</Text>
        {subtitle ? <Text variant="caption" color="muted">{subtitle}</Text> : null}
      </View>
      {right}
      {onPress && chevron && !right ? <Icon name="chevron-forward" size={18} color={colors.textSubtle} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  );
}

export function ToggleRow({ title, subtitle, value, onChange, icon, disabled }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; icon?: IconName; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <ListRow
      icon={icon}
      title={title}
      subtitle={subtitle}
      chevron={false}
      right={
        <Switch
          accessibilityLabel={title}
          value={value}
          disabled={disabled}
          onValueChange={onChange}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor="#fff"
          {...({ activeThumbColor: '#fff' } as object)}
        />
      }
    />
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />;
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: active ? colors.surface : 'transparent', alignItems: 'center' }}
          >
            <Text variant="caption" color={active ? 'text' : 'muted'} style={{ fontFamily: 'PlusJakartaSans_700Bold' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
