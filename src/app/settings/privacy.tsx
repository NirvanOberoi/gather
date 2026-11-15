import React, { useState } from 'react';
import { Share, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { filterPreferences, type PrivacySettings } from '@shared/preferences.ts';
import { Button, Card, Chip, Header, Notice, Screen, SectionHeader, SkeletonList, Text } from '@/components/ui';
import { PrivacyMatrix, PrivacyToggles, prefsSummary } from '@/features/preferences/PreferenceSections';
import { usePreferences, usePrivacy, qk } from '@/hooks/data';
import { backend } from '@/services/backend';
import { toast } from '@/state/toast';

export default function PrivacyDashboard() {
  const q = usePrivacy();
  return q.data ? <Dashboard initial={q.data} /> : <Screen><Header title="Privacy dashboard" /><SkeletonList rows={4} avatar={false} /></Screen>;
}

function Dashboard({ initial }: { initial: PrivacySettings }) {
  const qc = useQueryClient();
  const prefs = usePreferences();
  const [privacy, setPrivacy] = useState<PrivacySettings>(initial);
  const [saving, setSaving] = useState(false);

  const save = async (next: PrivacySettings) => {
    setPrivacy(next);
    setSaving(true);
    try {
      await backend().settings.savePrivacy(next);
      qc.invalidateQueries({ queryKey: qk.privacy });
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const aiView = prefs.data ? prefsSummary(filterPreferences(prefs.data, privacy, 'ai')) : [];
  const friendView = prefs.data ? prefsSummary(filterPreferences(prefs.data, privacy, 'friends')) : [];

  return (
    <Screen>
      <Header title="Privacy dashboard" subtitle={saving ? 'Saving…' : 'Changes save automatically'} />
      {(
        <>
          <Notice text="Nothing you don’t share is ever assumed. Gather AI sees only group-level summaries — it never tells friends what you personally chose." icon="shield-checkmark" />
          <SectionHeader title="Who can use what" />
          <PrivacyMatrix privacy={privacy} set={save} />
          <SectionHeader title="Preview" />
          <Card style={{ gap: 10 }}>
            <Text variant="bodyStrong">Gather AI can use</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{aiView.length ? aiView.map((s) => <Chip key={s} label={s} size="sm" />) : <Text variant="caption" color="muted">Nothing — the AI treats your preferences as unknown.</Text>}</View>
            <Text variant="bodyStrong" style={{ marginTop: 8 }}>Friends can see</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{friendView.length ? friendView.map((s) => <Chip key={s} label={s} size="sm" />) : <Text variant="caption" color="muted">Nothing from your preferences.</Text>}</View>
          </Card>
          <SectionHeader title="Visibility" />
          <Card style={{ paddingVertical: 4 }}>
            <PrivacyToggles privacy={privacy} set={save} />
          </Card>
          <SectionHeader title="Your data" />
          <Card style={{ gap: 10 }}>
            <Text variant="body" color="muted">Precise location is never stored — Explore uses it only for the search you run, rounded to ~1 km. Availability is shared only with that plan’s participants.</Text>
            <Button title="Export my data" icon="download-outline" variant="secondary" onPress={async () => {
              try {
                const data = await backend().settings.exportMyData();
                await Share.share({ message: JSON.stringify(data, null, 2) });
              } catch (e) { toast.error(e); }
            }} />
            <Button title="Delete private AI chats" icon="trash-outline" variant="ghost" onPress={async () => {
              try { await backend().ai.deleteAllPrivate(); qc.invalidateQueries({ queryKey: qk.aiConvs }); toast.success('Private AI chats deleted'); } catch (e) { toast.error(e); }
            }} />
          </Card>
        </>
      )}
    </Screen>
  );
}
