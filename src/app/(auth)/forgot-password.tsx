import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, EmptyState, Header, Input, Notice, Screen, Text } from '@/components/ui';
import { backend } from '@/services/backend';
import { validateEmail } from '@/domain/permissions';
import { errorMessage } from '@/state/toast';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async () => {
    const v = validateEmail(email);
    if (!v.ok) return setError(v.error);
    setLoading(true);
    setError(null);
    try {
      await backend().auth.requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Screen keyboard>
      <Header title="" />
      {sent ? (
        <EmptyState icon="mail-open-outline" title="Check your inbox" body="If an account exists for that email, we sent a link to reset your password." />
      ) : (
        <View style={{ gap: 18, marginTop: 8 }}>
          <Text variant="title">Reset password</Text>
          <Text variant="body" color="muted">We’ll email you a secure link to choose a new password.</Text>
          <Input label="Email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
          {error ? <Notice text={error} tone="danger" /> : null}
          <Button title="Send reset link" size="lg" onPress={submit} loading={loading} full />
        </View>
      )}
    </Screen>
  );
}
