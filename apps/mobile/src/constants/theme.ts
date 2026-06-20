/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#2D201B',
    background: '#FFF8F2',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#FFE3E3',
    textSecondary: '#7D6258',
  },
  dark: {
    text: '#FFF8F2',
    background: '#241814',
    backgroundElement: '#33221D',
    backgroundSelected: '#603326',
    textSecondary: '#E6C9BD',
  },
} as const;

export const Palette = {
  sunflowerGold: '#FFAE6E',
  raspberryRed: '#EC6530',
  vintageBerry: '#8F463A',
  teal: '#23898C',
  frostedBlue: '#8FDDDF',
  blush: '#FFE3E3',
  cream: '#FFF8F2',
  ink: '#2D201B',
  paper: '#FFFFFF',
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
