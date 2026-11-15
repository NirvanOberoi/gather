import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Input, Notice, Screen, Text } from '@/components/ui';
import { backend } from '@/services/backend';
import { useSession } from '@/state/session';
import { validatePassword } from '@/domain/permissions';
import { errorMessage, toast } from '@/state/toast';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    const v = validatePassword(password);
    if (!v.ok) return setError(v.error);
    setLoading(true);
    try {
      await backend().auth.updatePassword(password);
      toast.success('Password updated');
      await useSession.getState().refreshProfile();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Screen keyboard>
      <View style={{ gap: 18, marginTop: 40 }}>
        <Text variant="title">Choose a new password</Text>
        <Input label="New password" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry secureToggle hint="8+ characters with a letter and a number" />
        {error ? <Notice text={error} tone="danger" /> : null}
        <Button title="Update password" size="lg" onPress={submit} loading={loading} full />
      </View>
    </Screen>
  );
}
