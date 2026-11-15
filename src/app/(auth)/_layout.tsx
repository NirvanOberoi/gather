import { Stack } from 'expo-router/stack';
import { useTheme } from '@/theme/ThemeProvider';

export default function AuthLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
