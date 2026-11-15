import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Header, Input, Notice, Screen, Text } from '@/components/ui';
import { useSession } from '@/state/session';
import { validateEmail } from '@/domain/permissions';
import { errorMessage } from '@/state/toast';

export default function SignIn() {
  const signIn = useSession((s) => s.signIn);
  const notice = useSession((s) => s.notice);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const v = validateEmail(email);
    if (!v.ok) return setError(v.error);
    if (!password) return setError('Enter your password.');
    setLoading(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen keyboard>
      <Header title="" />
      <View style={{ gap: 18, marginTop: 8 }}>
        <View style={{ gap: 6 }}>
          <Text variant="title">Welcome back</Text>
          <Text variant="body" color="muted">Sign in to see what your friends are planning.</Text>
        </View>
        {notice ? <Notice text={notice} tone="warning" /> : null}
        <Input label="Email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="you@example.com" />
        <Input label="Password" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry secureToggle autoComplete="password" textContentType="password" placeholder="Your password" onSubmitEditing={submit} returnKeyType="go" />
        {error ? <Notice text={error} tone="danger" /> : null}
        <Button title="Sign in" size="lg" onPress={submit} loading={loading} full />
        <Button title="Forgot password?" variant="ghost" onPress={() => router.push('/(auth)/forgot-password')} />
        <Button title="New here? Create an account" variant="ghost" onPress={() => router.replace('/(auth)/sign-up')} />
      </View>
    </Screen>
  );
}
