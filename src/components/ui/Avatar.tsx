import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme/ThemeProvider';
import { avatarGradients } from '@/theme/tokens';
import { Text } from './Text';
import { Icon } from './Icon';

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function Avatar({ name, uri, size = 40, seed, ai, ring }: { name: string; uri?: string | null; size?: number; seed?: string; ai?: boolean; ring?: boolean }) {
  const { colors } = useTheme();
  const g = avatarGradients[hash(seed ?? name) % avatarGradients.length];
  const style = { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' as const, borderWidth: ring ? 2 : 0, borderColor: colors.surface };
  if (ai) {
    return (
      <LinearGradient accessibilityLabel="Gather AI" colors={colors.aiGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[style, { alignItems: 'center', justifyContent: 'center' }]}>
        <Icon name="sparkles" size={size * 0.5} color="#fff" />
      </LinearGradient>
    );
  }
  if (uri) return <Image accessibilityLabel={name} source={{ uri }} style={style} contentFit="cover" transition={150} />;
  return (
    <LinearGradient accessibilityLabel={name} colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[style, { alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: size * 0.38, lineHeight: size * 0.48 }} color="#fff">{initials(name)}</Text>
    </LinearGradient>
  );
}

export function AvatarStack({ people, size = 28, max = 4 }: { people: { id: string; name: string; uri?: string | null }[]; size?: number; max?: number }) {
  const { colors } = useTheme();
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <View style={{ flexDirection: 'row' }}>
      {shown.map((p, i) => (
        <View key={p.id} style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}>
          <Avatar name={p.name} uri={p.uri} size={size} seed={p.id} ring />
        </View>
      ))}
      {extra > 0 ? (
        <View style={{ marginLeft: -size * 0.3, width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="tiny" color="muted">+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}
