import React, { forwardRef, useState } from 'react';
import { Pressable, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/tokens';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  icon?: IconName;
  secureToggle?: boolean;
}

export const Input = forwardRef<TextInputInstance, InputProps>(function Input({ label, error, hint, icon, secureToggle, style, secureTextEntry, ...rest }, ref) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text variant="caption" color="muted" style={{ fontFamily: fonts.semibold }}>{label}</Text> : null}
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 16, borderRadius: radius.lg,
          backgroundColor: colors.surface, borderWidth: 1.5, borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
        }}
      >
        {icon ? <Icon name={icon} size={18} color={colors.textSubtle} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.primary}
          secureTextEntry={hidden}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          accessibilityLabel={label ?? rest.placeholder}
          style={[{ flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 15, paddingVertical: 12 }, style]}
          {...rest}
        />
        {secureToggle ? (
          <Pressable accessibilityRole="button" accessibilityLabel={hidden ? 'Show password' : 'Hide password'} hitSlop={10} onPress={() => setHidden((h) => !h)}>
            <Icon name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textSubtle} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text variant="caption" color="danger" accessibilityLiveRegion="polite">{error}</Text> : hint ? <Text variant="caption" color="subtle">{hint}</Text> : null}
    </View>
  );
});
