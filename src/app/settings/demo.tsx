import React from 'react';
import { View } from 'react-native';
import { Card, Header, Notice, Screen, Text } from '@/components/ui';
import { useSession } from '@/state/session';
import { isLiveConfigured } from '@/services/backend';

const STEPS = [
  'Open Chats → “Weekend Plans”. Five sample friends already said what they want.',
  'Tap ✨ Plan (or type “@Gather what should we do?”). The demo planner reads the chat + shared preferences.',
  'Swipe the recommendation cards. Tap Vote on one — a poll is created and sample friends vote live.',
  'Close the poll, then “Make it a plan”.',
  'In the plan, tap “Add availability”. Friends’ times are pre-filled; Gather finds the overlap.',
  'Use the best time, then Confirm. It appears under Plans → Upcoming.',
  'Try the private assistant from Home: ask for ideas, save one, share it to a group.',
];

export default function AboutDemo() {
  const mode = useSession((s) => s.mode);
  return (
    <Screen>
      <Header title="About demo mode" />
      <Notice tone="warning" text="Everything in demo mode is sample data stored only on this device: the people, messages, places, prices and ratings are fictional. Nothing is sent to any server or AI provider." />
      <Card style={{ marginTop: 16, gap: 10 }}>
        <Text variant="heading">Try the full flow</Text>
        {STEPS.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            <Text variant="bodyStrong" color="primary">{i + 1}.</Text>
            <Text variant="body" style={{ flex: 1 }}>{s}</Text>
          </View>
        ))}
      </Card>
      <Card style={{ marginTop: 16, gap: 8 }}>
        <Text variant="heading">What’s different from live mode</Text>
        <Text variant="body" color="muted">• AI suggestions come from an offline “demo planner”, not the Gather AI model.</Text>
        <Text variant="body" color="muted">• Places are fictional and labelled “Sample place”.</Text>
        <Text variant="body" color="muted">• Sample friends reply, vote and RSVP automatically so you can see realtime updates.</Text>
        <Text variant="body" color="muted">• Accounts, email and password reset require a Supabase project{isLiveConfigured ? ' (configured on this build)' : ' (not configured on this build)'}.</Text>
      </Card>
      <Text variant="caption" color="subtle" style={{ marginTop: 16 }}>Current mode: {mode}</Text>
    </Screen>
  );
}
