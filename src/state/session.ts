/**
 * Session state machine: booting → signedOut | onboarding | ready.
 * Handles demo/live mode, persisted sessions and expired-session sign-outs.
 */
import { create } from 'zustand';
import { backend, loadPreferredMode, setBackendMode, type BackendMode } from '@/services/backend';
import type { SessionUser, Unsubscribe } from '@/services/backend/types';
import type { Profile } from '@/types/models';
import { queryClient } from '@/hooks/queryClient';

type Status = 'booting' | 'signedOut' | 'onboarding' | 'ready' | 'recovery';

interface SessionState {
  status: Status;
  mode: BackendMode;
  user: SessionUser | null;
  profile: Profile | null;
  notice: string | null;
  boot: () => Promise<void>;
  startDemo: () => Promise<void>;
  switchToLive: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  setProfile: (p: Profile) => void;
  signOut: () => Promise<void>;
  clearNotice: () => void;
}

let unsubAuth: Unsubscribe | null = null;

function watchAuth(set: (p: Partial<SessionState>) => void, get: () => SessionState) {
  unsubAuth?.();
  unsubAuth = backend().auth.onChange((e) => {
    if (e.type === 'signed_out') {
      queryClient.clear();
      set({
        status: 'signedOut', user: null, profile: null,
        notice: e.reason === 'expired' ? 'Your session expired. Please sign in again.' : e.reason === 'deleted' ? 'Your account and data were deleted.' : get().notice,
      });
    } else if (e.type === 'password_recovery') {
      set({ status: 'recovery' });
    }
  });
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'booting',
  mode: 'demo',
  user: null,
  profile: null,
  notice: null,

  boot: async () => {
    const mode = await loadPreferredMode();
    await setBackendMode(mode);
    set({ mode });
    watchAuth(set, get);
    try {
      const user = await backend().auth.getSession();
      if (!user) return set({ status: 'signedOut' });
      set({ user });
      await get().refreshProfile();
    } catch {
      set({ status: 'signedOut' });
    }
  },

  startDemo: async () => {
    queryClient.clear();
    await setBackendMode('demo');
    set({ mode: 'demo' });
    watchAuth(set, get);
    const user = await backend().auth.signIn('', '');
    set({ user, notice: null });
    await get().refreshProfile();
  },

  switchToLive: async () => {
    queryClient.clear();
    await setBackendMode('live');
    set({ mode: 'live', status: 'signedOut' });
    watchAuth(set, get);
  },

  signIn: async (email, password) => {
    const user = await backend().auth.signIn(email, password);
    set({ user, notice: null });
    await get().refreshProfile();
  },

  refreshProfile: async () => {
    const profile = await backend().profiles.me();
    set({ profile, status: profile.onboardedAt && profile.username ? 'ready' : 'onboarding' });
  },

  setProfile: (profile) => set({ profile }),

  signOut: async () => {
    await backend().auth.signOut();
    queryClient.clear();
    set({ status: 'signedOut', user: null, profile: null });
  },

  clearNotice: () => set({ notice: null }),
}));
