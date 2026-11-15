import React from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Avatar, Icon, Text } from '@/components/ui';
import type { Message, Profile } from '@/types/models';
import { dayLabel } from '@/domain/time';

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Highlights @mentions inside a message body. */
function Body({ text, mine }: { text: string; mine: boolean }) {
  const { colors } = useTheme();
  const parts = text.split(/(@[a-zA-Z0-9_.]{3,20})/g);
  return (
    <Text variant="body" color={mine ? colors.onPrimary : colors.bubbleTheirsText}>
      {parts.map((p, i) =>
        p.startsWith('@') ? (
          <Text key={i} variant="bodyStrong" color={mine ? '#E3DEFF' : colors.primary}>{p}</Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

export function MessageBubble({ message, mine, sender, firstInGroup, lastInGroup, onRetry, children }: {
  message: Message; mine: boolean; sender: Profile | null; firstInGroup: boolean; lastInGroup: boolean; onRetry?: () => void; children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const r = radius.xl;
  const shape = mine
    ? { borderTopLeftRadius: r, borderBottomLeftRadius: r, borderTopRightRadius: firstInGroup ? r : 6, borderBottomRightRadius: lastInGroup ? r : 6 }
    : { borderTopRightRadius: r, borderBottomRightRadius: r, borderTopLeftRadius: firstInGroup ? r : 6, borderBottomLeftRadius: lastInGroup ? r : 6 };
  const name = sender?.displayName || sender?.username || 'Deleted user';
  const content = children ?? <Body text={message.body} mine={mine} />;
  return (
    <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8, marginTop: firstInGroup ? 10 : 2 }}>
      {!mine ? <View style={{ width: 30 }}>{lastInGroup ? <Avatar name={name} uri={sender?.avatarUrl} size={30} seed={sender?.id} /> : null}</View> : null}
      <View style={{ maxWidth: '78%', alignItems: mine ? 'flex-end' : 'flex-start' }}>
        {!mine && firstInGroup ? (
          <Text variant="tiny" color="muted" style={{ marginLeft: 12, marginBottom: 3 }}>
            {name}{sender?.isSample ? ' · sample' : ''}
          </Text>
        ) : null}
        {mine ? (
          <LinearGradient colors={colors.bubbleMine} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[shape, { paddingHorizontal: 14, paddingVertical: 9, opacity: message.status === 'sending' ? 0.7 : 1 }]}>
            {content}
          </LinearGradient>
        ) : (
          <View style={[shape, { paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.bubbleTheirs, borderWidth: 1, borderColor: colors.border }]}>{content}</View>
        )}
        {lastInGroup || message.status === 'failed' ? (
          message.status === 'failed' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Message failed. Tap to retry." onPress={onRetry} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <Icon name="alert-circle" size={13} color={colors.danger} />
              <Text variant="tiny" color="danger">Not sent · tap to retry</Text>
            </Pressable>
          ) : (
            <Text variant="tiny" color="subtle" style={{ marginTop: 3, marginHorizontal: 6 }}>
              {message.status === 'sending' ? 'Sending…' : timeLabel(message.createdAt)}
            </Text>
          )
        ) : null}
      </View>
    </View>
  );
}

export function SystemMessage({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', marginVertical: 10 }}>
      <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, maxWidth: '85%' }}>
        <Text variant="tiny" color="muted" align="center">{text}</Text>
      </View>
    </View>
  );
}

export function DayDivider({ iso }: { iso: string }) {
  const label = dayLabel(iso);
  return (
    <View style={{ alignItems: 'center', marginTop: 18, marginBottom: 4 }}>
      <Text variant="tiny" color="subtle">{label}</Text>
    </View>
  );
}
