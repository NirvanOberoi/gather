import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, EmptyState, Header, Input, Notice, Screen, Text } from '@/components/ui';
import { backend } from '@/services/backend';
import { useSession } from '@/state/session';
import { validateEmail, validatePassword } from '@/domain/permissions';
import { errorMessage } from '@/state/toast';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const e = validateEmail(email);
    const p = validatePassword(password);
    const next = { email: e.ok ? undefined : e.error, password: p.ok ? undefined : p.error, form: agree ? undefined : 'Please confirm you’re 13 or older and agree to the terms.' };
    setErrors(next);
    if (next.email || next.password || next.form) return;
    setLoading(true);
    try {
      const r = await backend().auth.signUp(email.trim(), password);
      if (r.needsEmailConfirmation) setSent(true);
      else await useSession.getState().refreshProfile();
    } catch (err) {
      setErrors({ form: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <Screen>
        <Header title="" />
        <EmptyState icon="mail-unread-outline" title="Check your email" body={`We sent a confirmation link to ${email}. Open it on this device to finish creating your account.`} action="Back to sign in" onAction={() => router.replace('/(auth)/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen keyboard>
      <Header title="" />
      <View style={{ gap: 18, marginTop: 8 }}>
        <View style={{ gap: 6 }}>
          <Text variant="title">Create your account</Text>
          <Text variant="body" color="muted">Takes 30 seconds. You choose what to share — always.</Text>
        </View>
        <Input label="Email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={errors.email} placeholder="you@example.com" />
        <Input label="Password" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry secureToggle autoComplete="new-password" error={errors.password} hint="8+ characters with a letter and a number" placeholder="Create a password" />
        <Button
          title={agree ? 'I’m 13+ and agree to the Terms & Privacy Policy' : 'Tap to confirm you’re 13+ and agree to the Terms'}
          icon={agree ? 'checkbox' : 'square-outline'}
          variant="ghost"
          onPress={() => setAgree((a) => !a)}
          style={{ alignSelf: 'flex-start' }}
        />
        {errors.form ? <Notice text={errors.form} tone="danger" /> : null}
        <Button title="Create account" size="lg" onPress={submit} loading={loading} full />
        <Button title="Already have an account? Sign in" variant="ghost" onPress={() => router.replace('/(auth)/sign-in')} />
      </View>
    </Screen>
  );
}
