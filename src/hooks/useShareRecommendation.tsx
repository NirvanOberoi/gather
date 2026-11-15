import React, { useState } from 'react';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { backend } from '@/services/backend';
import { GroupPickerSheet } from '@/components/common/GroupPickerSheet';
import { toast } from '@/state/toast';
import type { Recommendation } from '@/types/models';

/** "Share to a group" flow: pick a group, post the recommendation card into it. */
export function useShareRecommendation() {
  const [rec, setRec] = useState<Recommendation | null>(null);
  const sheet = (
    <GroupPickerSheet
      visible={!!rec}
      onClose={() => setRec(null)}
      onPick={async (groupId) => {
        const r = rec!;
        setRec(null);
        try {
          await backend().messages.send(groupId, { body: `Shared: ${r.title}`, clientId: Crypto.randomUUID(), kind: 'share', payload: { type: 'share', recommendation: r } });
          toast.success('Shared to the group', { label: 'Open', onPress: () => router.push(`/chat/${groupId}`) });
        } catch (e) {
          toast.error(e);
        }
      }}
    />
  );
  return { open: (r: Recommendation) => setRec(r), sheet };
}
