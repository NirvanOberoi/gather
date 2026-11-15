import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme, useThemePreference } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Avatar, Button, Card, Chip, Divider, Icon, Input, ListRow, Pill, Screen, Segmented, Sheet, Text } from '@/components/ui';
import { DemoBanner } from '@/components/common/DemoBanner';
import { prefsSummary } from '@/features/preferences/PreferenceSections';
import { useFriends, usePlans, usePreferences, useSaved, useSubscription, qk } from '@/hooks/data';
import { backend } from '@/services/backend';
import { useSession } from '@/state/session';
import { toast } from '@/state/toast';

export default function Profile() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const profile = useSession((s) => s.profile);
  const mode = useSession((s) => s.mode);
  const signOut = useSession((s) => s.signOut);
  const friends = useFriends();
  const plans = usePlans();
  const saved = useSaved();
  const prefs = usePreferences();
  const sub = useSubscription();
  const themePref = useThemePreference((s) => s.preference);
  const setThemePref = useThemePreference((s) => s.setPreference);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '', city: '' });
  const [busy, setBusy] = useState(false);
  const summary = prefs.data ? prefsSummary(prefs.data) : [];

  const openEdit = () => {
    setForm({ displayName: profile?.displayName ?? '', bio: profile?.bio ?? '', city: profile?.city ?? '' });
    setEditing(true);
  };
  const save = async () => {
    setBusy(true);
    try {
      const p = await backend().profiles.update({ displayName: form.displayName.trim(), bio: form.bio.trim() || null, city: form.city.trim() || null });
      useSession.getState().setProfile(p);
      setEditing(false);
      toast.success('Profile updated');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const changePhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (r.canceled || !r.assets[0]) return;
    try {
      await backend().profiles.uploadAvatar(r.assets[0].uri);
      await useSession.getState().refreshProfile();
      qc.invalidateQueries({ queryKey: qk.me });
      toast.success('Photo updated');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Screen padded={false}>
      <DemoBanner />
      <View style={{ paddingHorizontal: 20 }}>
        <View style={{ alignItems: 'center', marginTop: 20, gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Change profile photo" onPress={changePhoto}>
            <Avatar name={profile?.displayName || '?'} uri={profile?.avatarUrl} seed={profile?.id} size={96} />
            <View style={{ position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.background }}>
              <Icon name="camera" size={14} color="#fff" />
            </View>
          </Pressable>
          <Text variant="title">{profile?.displayName}</Text>
          <Text variant="body" color="muted">@{profile?.username}{profile?.city ? ` · ${profile.city}` : ''}</Text>
          {profile?.bio ? <Text variant="body" align="center">{profile.bio}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {sub.data?.tier === 'premium' ? <Pill label="Gather Plus" tone="primary" icon="diamond" /> : null}
            {mode === 'demo' ? <Pill label="Demo account" tone="sample" icon="flask" /> : null}
          </View>
          <Button title="Edit profile" size="sm" variant="outline" icon="create-outline" onPress={openEdit} />
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          {[
            { label: 'Friends', value: friends.data?.length ?? '–', onPress: () => router.push('/friends') },
            { label: 'Plans', value: plans.data?.length ?? '–', onPress: () => router.push('/(tabs)/plans') },
            { label: 'Saved', value: saved.data?.length ?? '–', onPress: () => router.push('/saved') },
          ].map((s) => (
            <Card key={s.label} onPress={s.onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
              <Text variant="heading">{String(s.value)}</Text>
              <Text variant="caption" color="muted">{s.label}</Text>
            </Card>
          ))}
        </View>

        <Card style={{ marginTop: 16, gap: 10 }} onPress={() => router.push('/settings/preferences')}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="bodyStrong" style={{ flex: 1 }}>My preferences</Text>
            <Text variant="caption" color="primary">Edit</Text>
          </View>
          {summary.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{summary.slice(0, 10).map((s) => <Chip key={s} label={s} size="sm" />)}</View>
          ) : (
            <Text variant="caption" color="muted">Add interests and budget so Gather can tailor suggestions.</Text>
          )}
        </Card>

        <Pressable accessibilityRole="button" onPress={() => router.push('/premium')} style={{ marginTop: 16, borderRadius: radius.xl, overflow: 'hidden' }}>
          <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.primarySoft, borderRadius: radius.xl }}>
            <Icon name="diamond" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" color="primary">Gather Plus</Text>
              <Text variant="caption" color="muted">More AI planning, detailed itineraries & more</Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.primary} />
          </View>
        </Pressable>

        <Card style={{ marginTop: 16, paddingVertical: 4 }}>
          <ListRow icon="people-outline" title="Friends" subtitle="Requests, search, blocked" onPress={() => router.push('/friends')} />
          <Divider />
          <ListRow icon="heart-outline" title="Saved places & ideas" onPress={() => router.push('/saved')} />
          <Divider />
          <ListRow icon="sparkles-outline" title="Private AI assistant" onPress={() => router.push('/assistant')} />
          <Divider />
          <ListRow icon="shield-checkmark-outline" title="Privacy dashboard" subtitle="What friends & AI can see" onPress={() => router.push('/settings/privacy')} />
          <Divider />
          <ListRow icon="notifications-outline" title="Notifications" onPress={() => router.push('/settings/notifications')} />
          <Divider />
          <ListRow icon="settings-outline" title="Account" subtitle="Email, password, delete account" onPress={() => router.push('/settings/account')} />
        </Card>

        <Text variant="label" color="muted" style={{ marginTop: 22, marginBottom: 10 }}>Appearance</Text>
        <Segmented value={themePref} onChange={setThemePref} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />

        {mode === 'demo' ? <ListRow icon="flask-outline" title="About demo mode" onPress={() => router.push('/settings/demo')} /> : null}
        <Button title={mode === 'demo' ? 'Exit demo' : 'Sign out'} variant="ghost" icon="log-out-outline" onPress={signOut} style={{ marginTop: 12 }} />
        <Text variant="tiny" color="subtle" align="center" style={{ marginTop: 8 }}>Gather v1.0.0 · Less planning. More doing.</Text>
      </View>

      <Sheet visible={editing} onClose={() => setEditing(false)} title="Edit profile">
        <View style={{ gap: 14 }}>
          <Input label="Name" value={form.displayName} onChangeText={(displayName) => setForm({ ...form, displayName })} maxLength={40} />
          <Input label="Bio" value={form.bio} onChangeText={(bio) => setForm({ ...form, bio })} maxLength={160} multiline placeholder="A line about you" />
          <Input label="City (optional, shown on your profile)" value={form.city} onChangeText={(city) => setForm({ ...form, city })} maxLength={60} placeholder="General area only" />
          <Button title="Save" onPress={save} loading={busy} full />
        </View>
      </Sheet>
    </Screen>
  );
}
