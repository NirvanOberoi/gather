import React, { forwardRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { TextInputInstance } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/tokens';
import { Icon, Text } from '@/components/ui';

const EMOJIS = ['😂', '🙌', '🔥', '❤️', '👀', '😭', '🎉', '👍', '🍕', '🌮', '🎳', '🎬', '🏀', '☕️', '💸', '🤔'];

export const Composer = forwardRef<TextInputInstance, { value: string; onChange: (v: string) => void; onSend: () => void; onPlan: () => void; disabled?: boolean; planning?: boolean }>(
  function Composer({ value, onChange, onSend, onPlan, disabled, planning }, ref) {
    const { colors } = useTheme();
    const [emojiOpen, setEmojiOpen] = useState(false);
    const canSend = value.trim().length > 0 && !disabled;
    return (
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8 }}>
        {emojiOpen ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingBottom: 8 }}>
            {EMOJIS.map((e) => (
              <Pressable key={e} accessibilityRole="button" accessibilityLabel={`Insert ${e}`} onPress={() => onChange(value + e)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22, lineHeight: 28 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Help us plan with Gather AI"
            disabled={planning}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onPlan();
            }}
          >
            <LinearGradient colors={colors.aiGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 44, paddingHorizontal: 12, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 5, opacity: planning ? 0.6 : 1 }}>
              <Icon name="sparkles" size={17} color="#fff" />
              <Text variant="caption" color="#fff" style={{ fontFamily: fonts.bold }}>Plan</Text>
            </LinearGradient>
          </Pressable>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.surfaceAlt, borderRadius: radius.xl, paddingLeft: 14, paddingRight: 4, minHeight: 44 }}>
            <TextInput
              ref={ref}
              value={value}
              onChangeText={onChange}
              placeholder="Message… (try @Gather)"
              placeholderTextColor={colors.textSubtle}
              multiline
              maxLength={4000}
              accessibilityLabel="Message"
              style={{ flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 15, paddingTop: 12, paddingBottom: 11, maxHeight: 120 }}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Emoji" onPress={() => setEmojiOpen((o) => !o)} style={{ width: 38, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={emojiOpen ? 'close-circle-outline' : 'happy-outline'} size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={!canSend}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setEmojiOpen(false);
              onSend();
            }}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: canSend ? colors.primary : colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="arrow-up" size={21} color={canSend ? '#fff' : colors.textSubtle} />
          </Pressable>
        </View>
      </View>
    );
  },
);
