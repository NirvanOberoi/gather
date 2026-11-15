import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, Divider, Header, Notice, Screen, SkeletonList, ToggleRow } from '@/components/ui';
import { useNotificationSettings, qk } from '@/hooks/data';
import { backend } from '@/services/backend';
import { toast } from '@/state/toast';
import type { NotificationSettings } from '@/types/models';

const ROWS: { key: keyof NotificationSettings; title: string; subtitle: string; icon: string }[] = [
  { key: 'friendRequests', title: 'Friend requests', subtitle: 'New requests and acceptances', icon: 'person-add-outline' },
  { key: 'groupAdds', title: 'Added to a group', subtitle: 'When a friend adds you to a chat', icon: 'chatbubbles-outline' },
  { key: 'messages', title: 'New messages', subtitle: 'Unread badges in Chats', icon: 'chatbubble-outline' },
  { key: 'mentions', title: 'Mentions', subtitle: 'When someone @mentions you', icon: 'at-outline' },
  { key: 'polls', title: 'Polls', subtitle: 'New polls and results', icon: 'stats-chart-outline' },
  { key: 'plans', title: 'Plans', subtitle: 'Invitations and updates', icon: 'calendar-outline' },
  { key: 'reminders', title: 'Reminders', subtitle: 'The day before a confirmed plan', icon: 'alarm-outline' },
];

export default function NotificationSettingsScreen() {
  const q = useNotificationSettings();
  return (
    <Screen>
      <Header title="Notifications" />
      <Notice text="This version delivers in-app notifications. Push notifications are planned once the core experience is stable — these settings will apply to them too." />
      {q.data ? <Editor initial={q.data} /> : <SkeletonList rows={5} avatar={false} />}
    </Screen>
  );
}

function Editor({ initial }: { initial: NotificationSettings }) {
  const qc = useQueryClient();
  const [s, setS] = useState<NotificationSettings>(initial);
  const update = async (next: NotificationSettings) => {
    setS(next);
    try {
      await backend().settings.saveNotificationSettings(next);
      qc.invalidateQueries({ queryKey: qk.notifSettings });
    } catch (e) {
      toast.error(e);
    }
  };
  return (
        <Card style={{ paddingVertical: 4, marginTop: 16 }}>
          {ROWS.map((r, i) => (
            <React.Fragment key={r.key}>
              {i ? <Divider /> : null}
              <ToggleRow icon={r.icon as never} title={r.title} subtitle={r.subtitle} value={s[r.key]} onChange={(v) => update({ ...s, [r.key]: v })} />
            </React.Fragment>
          ))}
        </Card>
  );
}
