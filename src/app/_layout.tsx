import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { queryClient } from '@/lib/query-client';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="event/[id]" options={{ title: 'Event' }} />
          <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
