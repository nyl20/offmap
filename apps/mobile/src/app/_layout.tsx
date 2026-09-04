import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Palette } from '@/constants/theme';
import { queryClient } from '@/lib/query-client';

const offmapDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Palette.deepNavy,
    border: Palette.glassStrong,
    card: Palette.deepNavy,
    notification: Palette.sunflowerGold,
    primary: Palette.sunflowerGold,
    text: Palette.mintCream,
  },
};

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={offmapDarkTheme}>
        <AnimatedSplashOverlay />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="event/[id]" options={{ title: 'Event' }} />
          <Stack.Screen name="profile" options={{ title: 'Profile' }} />
          <Stack.Screen name="suggest" options={{ title: 'Suggest an event' }} />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
