import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { BUDGET_LABEL, CATEGORY_LABEL, PREFERENCE_CATEGORIES, type Preferences, type PrivacySettings } from '@shared/preferences.ts';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Button, Chip, Input, Text, ToggleRow } from '@/components/ui';
import {
  ACCESSIBILITY_OPTIONS, ACTIVITY_OPTIONS, BUDGET_OPTIONS, CUISINE_OPTIONS, DIETARY_OPTIONS, DISLIKE_OPTIONS, DISTANCE_OPTIONS, RESTAURANT_STYLES, TIME_OPTIONS,
} from './options';

const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function ChipGroup({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => <Chip key={o} label={cap(o)} selected={value.includes(o)} onPress={() => onChange(toggle(value, o))} />)}
    </View>
  );
}

function Label({ children }: { children: string }) {
  return <Text variant="label" color="muted" style={{ marginTop: 18, marginBottom: 10 }}>{children}</Text>;
}

type Setter = (p: Preferences) => void;

export function ActivitiesSection({ prefs, set }: { prefs: Preferences; set: Setter }) {
  const { colors } = useTheme();
  const [custom, setCustom] = useState('');
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {ACTIVITY_OPTIONS.map((o) => {
          const on = prefs.activities.includes(o.value);
          return (
            <Pressable
              key={o.value}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              onPress={() => set({ ...prefs, activities: toggle(prefs.activities, o.value) })}
              style={({ pressed }) => ({
                width: '31%', minWidth: 96, flexGrow: 1, paddingVertical: 14, alignItems: 'center', gap: 6, borderRadius: radius.lg,
                backgroundColor: on ? colors.primarySoft : colors.surface, borderWidth: 1.5, borderColor: on ? colors.primary : colors.border, transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              <Text style={{ fontSize: 26, lineHeight: 32 }}>{o.emoji}</Text>
              <Text variant="caption" align="center" color={on ? 'primary' : 'text'} style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Label>Something else?</Label>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Input value={custom} onChangeText={setCustom} placeholder="e.g. pickleball, anime, poetry slams" maxLength={30} onSubmitEditing={() => { if (custom.trim()) { set({ ...prefs, customInterests: Array.from(new Set([...prefs.customInterests, custom.trim().toLowerCase()])).slice(0, 20) }); setCustom(''); } }} />
        </View>
        <Button title="Add" size="sm" variant="secondary" onPress={() => { if (custom.trim()) { set({ ...prefs, customInterests: Array.from(new Set([...prefs.customInterests, custom.trim().toLowerCase()])).slice(0, 20) }); setCustom(''); } }} />
      </View>
      {prefs.customInterests.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {prefs.customInterests.map((c) => <Chip key={c} label={`${cap(c)}  ✕`} selected onPress={() => set({ ...prefs, customInterests: prefs.customInterests.filter((x) => x !== c) })} />)}
        </View>
      ) : null}
    </View>
  );
}

export function FoodSection({ prefs, set }: { prefs: Preferences; set: Setter }) {
  return (
    <View>
      <Label>Favorite cuisines</Label>
      <ChipGroup options={CUISINE_OPTIONS} value={prefs.cuisines} onChange={(cuisines) => set({ ...prefs, cuisines })} />
      <Label>Dietary needs</Label>
      <ChipGroup options={DIETARY_OPTIONS} value={prefs.dietary} onChange={(dietary) => set({ ...prefs, dietary })} />
      <Label>Restaurant vibe</Label>
      <ChipGroup options={RESTAURANT_STYLES} value={prefs.restaurantStyles} onChange={(restaurantStyles) => set({ ...prefs, restaurantStyles })} />
    </View>
  );
}

export function BudgetSection({ prefs, set }: { prefs: Preferences; set: Setter }) {
  const { colors } = useTheme();
  return (
    <View>
      <Label>Usual budget per outing</Label>
      <View style={{ gap: 8 }}>
        {BUDGET_OPTIONS.map((o) => {
          const on = prefs.budget === o.value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              onPress={() => set({ ...prefs, budget: on ? null : o.value })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: on ? colors.primarySoft : colors.surface, borderWidth: 1.5, borderColor: on ? colors.primary : colors.border }}
            >
              <Text style={{ fontSize: 22, lineHeight: 28 }}>{o.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" color={on ? 'primary' : 'text'}>{o.label}</Text>
                <Text variant="caption" color="muted">{o.sub}</Text>
              </View>
              {on ? <Text variant="caption" color="primary">✓</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <Label>How far will you usually go?</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {DISTANCE_OPTIONS.map((d) => (
          <Chip key={d.value} label={`${d.label} · ${d.sub}`} selected={prefs.maxDistanceKm === d.value} onPress={() => set({ ...prefs, maxDistanceKm: prefs.maxDistanceKm === d.value ? null : d.value })} />
        ))}
      </View>
      <Label>Best times for you</Label>
      <ChipGroup options={TIME_OPTIONS} value={prefs.preferredTimes} onChange={(preferredTimes) => set({ ...prefs, preferredTimes })} />
    </View>
  );
}

export function ExtrasSection({ prefs, set }: { prefs: Preferences; set: Setter }) {
  return (
    <View>
      <Label>Things you’d rather skip</Label>
      <ChipGroup options={DISLIKE_OPTIONS} value={prefs.dislikedActivities} onChange={(dislikedActivities) => set({ ...prefs, dislikedActivities })} />
      <Label>Accessibility (private by default)</Label>
      <ChipGroup options={ACCESSIBILITY_OPTIONS} value={prefs.accessibility} onChange={(accessibility) => set({ ...prefs, accessibility })} />
    </View>
  );
}

export function PrivacyMatrix({ privacy, set }: { privacy: PrivacySettings; set: (p: PrivacySettings) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surfaceAlt }}>
        <Text variant="label" color="muted" style={{ flex: 1 }}>Category</Text>
        <Text variant="label" color="muted" style={{ width: 70, textAlign: 'center' }}>AI</Text>
        <Text variant="label" color="muted" style={{ width: 70, textAlign: 'center' }}>Friends</Text>
      </View>
      {PREFERENCE_CATEGORIES.map((c) => (
        <View key={c} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 52, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text variant="caption" style={{ flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{CATEGORY_LABEL[c]}</Text>
          {(['aiShare', 'friendsShare'] as const).map((k) => {
            const on = privacy[k][c];
            return (
              <Pressable
                key={k}
                accessibilityRole="switch"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${k === 'aiShare' ? 'Gather AI can use' : 'Friends can see'} ${CATEGORY_LABEL[c]}`}
                onPress={() => set({ ...privacy, [k]: { ...privacy[k], [c]: !on } })}
                style={{ width: 70, alignItems: 'center', justifyContent: 'center', height: 44 }}
              >
                <View style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : colors.surfaceAlt, borderWidth: on ? 0 : 1.5, borderColor: colors.border }}>
                  {on ? <Text variant="caption" color="#fff">✓</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function PrivacyToggles({ privacy, set }: { privacy: PrivacySettings; set: (p: PrivacySettings) => void }) {
  return (
    <View>
      <ToggleRow icon="search-outline" title="Findable by username" subtitle="Friends can search for you" value={privacy.discoverable} onChange={(discoverable) => set({ ...privacy, discoverable })} />
      <ToggleRow icon="person-add-outline" title="Allow friend requests" value={privacy.allowFriendRequests} onChange={(allowFriendRequests) => set({ ...privacy, allowFriendRequests })} />
      <ToggleRow icon="stats-chart-outline" title="Show my name on poll votes" subtitle="Off = your vote counts but stays anonymous" value={privacy.showVoteIdentity} onChange={(showVoteIdentity) => set({ ...privacy, showVoteIdentity })} />
      <ToggleRow icon="chatbox-ellipses-outline" title="Keep private AI chat history" subtitle="Off = assistant chats aren’t saved" value={privacy.storePrivateAiHistory} onChange={(storePrivateAiHistory) => set({ ...privacy, storePrivateAiHistory })} />
    </View>
  );
}

export function prefsSummary(p: Partial<Preferences>): string[] {
  const out: string[] = [];
  if (p.activities?.length) out.push(...p.activities.slice(0, 6).map(cap));
  if (p.customInterests?.length) out.push(...p.customInterests.slice(0, 3).map(cap));
  if (p.cuisines?.length) out.push(...p.cuisines.slice(0, 4).map((c) => `${cap(c)} food`));
  if (p.dietary?.length) out.push(...p.dietary.map(cap));
  if (p.budget) out.push(`Budget ${BUDGET_LABEL[p.budget]}`);
  if (p.maxDistanceKm) out.push(`≤ ${p.maxDistanceKm} km`);
  return out;
}
