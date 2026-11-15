import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Divider, Header, Input, ListRow, Notice, Screen, Sheet, Text } from '@/components/ui';
import { backend } from '@/services/backend';
import { useSession } from '@/state/session';
import { confirm } from '@/lib/confirm';
import { errorMessage, toast } from '@/state/toast';
import { validateEmail, validatePassword, validateUsername } from '@/domain/permissions';

export default function Account() {
  const user = useSession((s) => s.user);
  const profile = useSession((s) => s.profile);
  const mode = useSession((s) => s.mode);
  const signOut = useSession((s) => s.signOut);
  const [sheet, setSheet] = useState<'email' | 'password' | 'username' | 'delete' | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (s: typeof sheet) => { setSheet(s); setValue(s === 'username' ? profile?.username ?? '' : ''); setError(null); };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (sheet === 'email') {
        const v = validateEmail(value); if (!v.ok) throw new Error(v.error);
        await backend().auth.updateEmail(value.trim());
        toast.success('Check your new inbox to confirm the change');
      } else if (sheet === 'password') {
        const v = validatePassword(value); if (!v.ok) throw new Error(v.error);
        await backend().auth.updatePassword(value);
        toast.success('Password updated');
      } else if (sheet === 'username') {
        const u = value.trim().toLowerCase();
        const v = validateUsername(u); if (!v.ok) throw new Error(v.error);
        const p = await backend().profiles.update({ username: u });
        useSession.getState().setProfile(p);
        toast.success('Username updated');
      } else if (sheet === 'delete') {
        if (value !== 'DELETE') throw new Error('Type DELETE to confirm.');
        await backend().auth.deleteAccount();
      }
      setSheet(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Account" />
      {mode === 'demo' ? <Notice tone="warning" text="Demo account: email and password changes need a live Supabase project. Deleting resets the demo." /> : null}
      <Card style={{ paddingVertical: 4, marginTop: 14 }}>
        <ListRow icon="mail-outline" title="Email" subtitle={user?.email ?? '—'} onPress={mode === 'live' ? () => open('email') : undefined} />
        <Divider />
        <ListRow icon="at-outline" title="Username" subtitle={`@${profile?.username}`} onPress={() => open('username')} />
        <Divider />
        <ListRow icon="key-outline" title="Change password" onPress={mode === 'live' ? () => open('password') : undefined} />
      </Card>
      <Card style={{ paddingVertical: 4, marginTop: 14 }}>
        <ListRow icon="log-out-outline" title={mode === 'demo' ? 'Exit demo' : 'Sign out'} onPress={() => confirm('Sign out?', 'You can sign back in any time.', 'Sign out', signOut)} />
        <Divider />
        <ListRow icon="trash-outline" title="Delete account" subtitle="Permanently delete your account and personal data" danger onPress={() => open('delete')} />
      </Card>
      <Sheet visible={!!sheet} onClose={() => setSheet(null)} title={sheet === 'delete' ? 'Delete account' : sheet === 'email' ? 'Change email' : sheet === 'password' ? 'Change password' : 'Change username'}>
        <View style={{ gap: 12 }}>
          {sheet === 'delete' ? (
            <Text variant="body" color="muted">This permanently deletes your profile, preferences, friendships, messages, votes, availability, saved places and private AI chats. Group plans you organized stay with the group without your name. This can’t be undone. Type DELETE to confirm.</Text>
          ) : null}
          <Input
            value={value}
            onChangeText={setValue}
            secureTextEntry={sheet === 'password'}
            secureToggle={sheet === 'password'}
            autoCapitalize="none"
            placeholder={sheet === 'delete' ? 'DELETE' : sheet === 'email' ? 'new@email.com' : sheet === 'password' ? 'New password' : 'username'}
          />
          {error ? <Notice tone="danger" text={error} /> : null}
          <Button title={sheet === 'delete' ? 'Delete my account' : 'Save'} variant={sheet === 'delete' ? 'danger' : 'primary'} onPress={submit} loading={busy} full />
        </View>
      </Sheet>
    </Screen>
  );
}
