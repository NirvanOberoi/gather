import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, type ThemeColors } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemePrefState {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  hydrate: () => Promise<void>;
}

const KEY = 'gather.theme';
export const useThemePreference = create<ThemePrefState>((set) => ({
  preference: 'system',
  setPreference: (preference) => {
    set({ preference });
    AsyncStorage.setItem(KEY, preference).catch(() => {});
  },
  hydrate: async () => {
    try {
      const v = await AsyncStorage.getItem(KEY);
      if (v === 'light' || v === 'dark' || v === 'system') set({ preference: v });
    } catch {
      /* storage unavailable — keep default */
    }
  },
}));

interface Theme {
  colors: ThemeColors;
  dark: boolean;
}

const ThemeContext = createContext<Theme>({ colors: lightColors, dark: false });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const pref = useThemePreference((s) => s.preference);
  const dark = pref === 'system' ? system === 'dark' : pref === 'dark';
  const value = useMemo(() => ({ colors: dark ? darkColors : lightColors, dark }), [dark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
