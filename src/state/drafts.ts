/** Small hand-off store for passing rich objects between screens (avoids huge URL params). */
import { create } from 'zustand';
import type { Recommendation } from '@/types/models';

interface DraftState {
  /** AI message id → poll created from its cards (so card votes land in one poll). */
  aiPolls: Record<string, string>;
  linkAiPoll: (messageId: string, pollId: string) => void;
  planPlace: Recommendation | null;
  pollRecommendations: Recommendation[];
  setPlanPlace: (r: Recommendation | null) => void;
  setPollRecommendations: (r: Recommendation[]) => void;
}

export const useDrafts = create<DraftState>((set, get) => ({
  aiPolls: {},
  linkAiPoll: (messageId, pollId) => set({ aiPolls: { ...get().aiPolls, [messageId]: pollId } }),
  planPlace: null,
  pollRecommendations: [],
  setPlanPlace: (planPlace) => set({ planPlace }),
  setPollRecommendations: (pollRecommendations) => set({ pollRecommendations }),
}));
