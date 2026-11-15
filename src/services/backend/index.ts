/**
 * Backend selection. Live (Supabase) is only available when EXPO_PUBLIC_SUPABASE_* are set;
 * demo mode is always available and is clearly labelled throughout the UI.
 */
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DemoBackend } from '../demo/DemoBackend';
import type { Backend, BackendMode } from './types';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const isLiveConfigured = /^https?:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;

const MODE_KEY = 'gather.backendMode';

let demo: DemoBackend | null = null;
let live: Backend | null = null;
let current: Backend | null = null;

function getDemo() {
  if (!demo) {
    const d = new DemoBackend(AsyncStorage, { simulate: true, latencyMs: 180 });
    // Never lose the last change when the app is backgrounded or the tab is closed.
    AppState.addEventListener('change', (s) => s !== 'active' && d.flush());
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('pagehide', () => d.flush());
    demo = d;
  }
  return demo;
}

function getLive(): Backend {
  if (!isLiveConfigured) throw new Error('Supabase is not configured');
  if (!live) {
    // Lazy require keeps the Supabase client out of demo-only sessions.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LiveBackend } = require('../supabase/LiveBackend') as typeof import('../supabase/LiveBackend');
    live = new LiveBackend(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return live;
}

export async function loadPreferredMode(): Promise<BackendMode> {
  try {
    const v = await AsyncStorage.getItem(MODE_KEY);
    if (v === 'live' && isLiveConfigured) return 'live';
    if (v === 'demo') return 'demo';
  } catch {
    /* ignore */
  }
  return isLiveConfigured ? 'live' : 'demo';
}

export async function setBackendMode(mode: BackendMode): Promise<Backend> {
  current = mode === 'live' ? getLive() : getDemo();
  await AsyncStorage.setItem(MODE_KEY, mode).catch(() => {});
  return current;
}

export function backend(): Backend {
  if (!current) current = isLiveConfigured ? getLive() : getDemo();
  return current;
}

export type { Backend, BackendMode };
