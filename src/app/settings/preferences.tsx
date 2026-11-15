import React, { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { Preferences } from '@shared/preferences.ts';
import { Button, Header, Screen, Segmented, SkeletonList } from '@/components/ui';
import { ActivitiesSection, BudgetSection, ExtrasSection, FoodSection } from '@/features/preferences/PreferenceSections';
import { usePreferences, qk } from '@/hooks/data';
import { backend } from '@/services/backend';
import { toast } from '@/state/toast';

type Tab = 'activities' | 'food' | 'budget' | 'more';

export default function EditPreferences() {
  const q = usePreferences();
  return q.data ? <Editor initial={q.data} /> : <Screen><Header title="Preferences" /><SkeletonList rows={4} avatar={false} /></Screen>;
}

function Editor({ initial }: { initial: Preferences }) {
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<Preferences>(initial);
  const [tab, setTab] = useState<Tab>('activities');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await backend().settings.savePreferences(prefs);
      qc.invalidateQueries({ queryKey: qk.prefs });
      toast.success('Preferences saved');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen keyboard>
      <Header title="Preferences" subtitle="All optional — share only what you want" right={<Button title="Save" size="sm" onPress={save} loading={saving} />} />
      <View style={{ marginVertical: 12 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'activities', label: 'Activities' }, { value: 'food', label: 'Food' }, { value: 'budget', label: 'Budget' }, { value: 'more', label: 'More' }]} />
      </View>
      {tab === 'activities' ? <ActivitiesSection prefs={prefs} set={setPrefs} /> : null}
      {tab === 'food' ? <FoodSection prefs={prefs} set={setPrefs} /> : null}
      {tab === 'budget' ? <BudgetSection prefs={prefs} set={setPrefs} /> : null}
      {tab === 'more' ? <ExtrasSection prefs={prefs} set={setPrefs} /> : null}
      <Button title="Save preferences" onPress={save} loading={saving} style={{ marginTop: 24 }} full />
    </Screen>
  );
}
