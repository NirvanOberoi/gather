import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { DEFAULT_PRIVACY, EMPTY_PREFERENCES, type Preferences, type PrivacySettings } from '@shared/preferences.ts';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Button, Icon, Input, Notice, ProgressBar, Text } from '@/components/ui';
import { DemoBanner } from '@/components/common/DemoBanner';
import { ActivitiesSection, BudgetSection, ExtrasSection, FoodSection, PrivacyMatrix, PrivacyToggles } from '@/features/preferences/PreferenceSections';
import { backend } from '@/services/backend';
import { useSession } from '@/state/session';
import { validateUsername } from '@/domain/permissions';
import { errorMessage, toast } from '@/state/toast';

const STEPS = [
  { title: 'Make it yours', sub: 'How friends will find and recognize you.' },
  { title: 'What do you like doing?', sub: 'Pick as many as you want. You can skip anything.' },
  { title: 'Food talk', sub: 'Helps Gather suggest places everyone can eat at.' },
  { title: 'Budget, distance & time', sub: 'So suggestions actually fit your life.' },
  { title: 'Anything to avoid?', sub: 'Optional — and accessibility needs stay private unless you share them.' },
  { title: 'You’re in control', sub: 'Choose what Gather AI can use and what friends can see. Unshared = unknown, never assumed.' },
];

export default function Onboarding() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useSession((s) => s.profile);
  const mode = useSession((s) => s.mode);
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [avatar, setAvatar] = useState<string | null>(profile?.avatarUrl ?? null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFERENCES);
  const [privacy, setPrivacy] = useState<PrivacySettings>(DEFAULT_PRIVACY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    backend().settings.getPreferences().then(setPrefs).catch(() => {});
    backend().settings.getPrivacy().then(setPrivacy).catch(() => {});
  }, []);

  const pickAvatar = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!r.canceled && r.assets[0]) setAvatar(r.assets[0].uri);
  };

  const next = async () => {
    if (step === 0) {
      const u = username.trim().toLowerCase();
      const v = validateUsername(u);
      if (!displayName.trim()) return setUsernameError('Add your first name or nickname.');
      if (!v.ok) return setUsernameError(v.error);
      setSaving(true);
      try {
        if (!(await backend().profiles.isUsernameAvailable(u))) return setUsernameError('That username is taken — try another.');
        setUsernameError(null);
      } catch (e) {
        return setUsernameError(errorMessage(e));
      } finally {
        setSaving(false);
      }
    }
    if (step < STEPS.length - 1) return setStep(step + 1);
    // Finish
    setSaving(true);
    try {
      if (avatar && avatar !== profile?.avatarUrl) await backend().profiles.uploadAvatar(avatar).catch((e) => toast.error(`Photo not saved: ${errorMessage(e)}`));
      await backend().settings.savePreferences(prefs);
      await backend().settings.savePrivacy(privacy);
      const p = await backend().profiles.update({ displayName: displayName.trim(), username: username.trim().toLowerCase(), onboardedAt: new Date().toISOString() });
      useSession.getState().setProfile(p);
      await useSession.getState().refreshProfile();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <DemoBanner />
      <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {step > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => setStep(step - 1)} hitSlop={12}>
              <Icon name="chevron-back" size={24} color={colors.text} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <ProgressBar value={(step + 1) / STEPS.length} />
          </View>
          <Text variant="caption" color="muted">{step + 1}/{STEPS.length}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Animated.View key={step} entering={FadeInRight.duration(260)} exiting={FadeOutLeft.duration(160)}>
          <Text variant="title">{STEPS[step].title}</Text>
          <Text variant="body" color="muted" style={{ marginTop: 6, marginBottom: 20 }}>{STEPS[step].sub}</Text>
          {step === 0 ? (
            <View style={{ gap: 18 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Add a profile photo" onPress={pickAvatar} style={{ alignSelf: 'center', alignItems: 'center', gap: 8 }}>
                <Avatar name={displayName || '?'} uri={avatar} size={104} />
                <View style={{ position: 'absolute', right: 0, bottom: 26, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.background }}>
                  <Icon name="camera" size={16} color="#fff" />
                </View>
                <Text variant="caption" color="primary">{avatar ? 'Change photo' : 'Add a photo (optional)'}</Text>
              </Pressable>
              <Input label="Name" value={displayName} onChangeText={setDisplayName} placeholder="What friends call you" maxLength={40} autoComplete="given-name" />
              <Input
                label="Username"
                icon="at"
                value={username}
                onChangeText={(t) => { setUsername(t.toLowerCase().replace(/[^a-z0-9_.]/g, '')); setUsernameError(null); }}
                placeholder="yourname"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                error={usernameError}
                hint="Friends search for this. Letters, numbers, _ and ."
              />
              {mode === 'demo' ? <Notice tone="warning" text="Demo mode: your profile is stored only on this device." /> : null}
            </View>
          ) : null}
          {step === 1 ? <ActivitiesSection prefs={prefs} set={setPrefs} /> : null}
          {step === 2 ? <FoodSection prefs={prefs} set={setPrefs} /> : null}
          {step === 3 ? <BudgetSection prefs={prefs} set={setPrefs} /> : null}
          {step === 4 ? <ExtrasSection prefs={prefs} set={setPrefs} /> : null}
          {step === 5 ? (
            <View style={{ gap: 16 }}>
              <PrivacyMatrix privacy={privacy} set={setPrivacy} />
              <Notice text="Gather AI only sees group-level summaries — it never tells friends what you specifically chose. You can change all of this later in Privacy." />
              <PrivacyToggles privacy={privacy} set={setPrivacy} />
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: insets.bottom + 16, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', gap: 10 }}>
        {step > 0 && step < STEPS.length - 1 ? <Button title="Skip" variant="ghost" onPress={() => setStep(step + 1)} /> : null}
        <Button title={step === STEPS.length - 1 ? 'Start gathering' : 'Continue'} icon={step === STEPS.length - 1 ? 'sparkles' : undefined} variant={step === STEPS.length - 1 ? 'ai' : 'primary'} size="lg" onPress={next} loading={saving} style={{ flex: 1 }} testID="onboarding-next" />
      </View>
    </View>
  );
}
