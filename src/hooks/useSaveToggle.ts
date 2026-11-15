import { useQueryClient } from '@tanstack/react-query';
import { backend } from '@/services/backend';
import type { Recommendation } from '@/types/models';
import { toast } from '@/state/toast';
import { qk, useSaved } from './data';

export function useSaveToggle() {
  const qc = useQueryClient();
  const { data } = useSaved();
  const find = (r: Recommendation) => data?.find((s) => (r.placeId && s.recommendation.placeId === r.placeId) || s.recommendation.id === r.id);
  return {
    /** Pass to FlatList `extraData` so memoized rows re-render when saves change. */
    version: data,
    isSaved: (r: Recommendation) => !!find(r),
    toggle: async (r: Recommendation) => {
      try {
        const existing = find(r);
        if (existing) {
          await backend().saved.remove(existing.id);
          toast.info('Removed from Saved');
        } else {
          await backend().saved.save(r);
          toast.success('Saved');
        }
        qc.invalidateQueries({ queryKey: qk.saved });
      } catch (e) {
        toast.error(e);
      }
    },
  };
}
