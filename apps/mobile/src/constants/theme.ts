/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#EEF4ED',
    background: '#273043',
    backgroundElement: 'rgba(238, 244, 237, 0.08)',
    backgroundSelected: 'rgba(141, 169, 196, 0.22)',
    textSecondary: '#8DA9C4',
  },
  dark: {
    text: '#EEF4ED',
    // background: '#0B2545',
    background: '#273043',
    backgroundElement: 'rgba(238, 244, 237, 0.08)',
    backgroundSelected: 'rgba(141, 169, 196, 0.22)',
    textSecondary: '#8DA9C4',
  },
} as const;

export const Palette = {
  deepNavy: '#273043',
  powderBlue: '#8DA9C4',
  mintCream: '#EEF4ED',
  electricAmber: '#F6AE2D',
  coral: '#FF6B4A',
  inkWash: '#061A32',
  glass: 'rgba(238, 244, 237, 0.08)',
  glassStrong: 'rgba(238, 244, 237, 0.14)',
  glassBlue: 'rgba(141, 169, 196, 0.24)',
  shadowNavy: 'rgba(6, 26, 50, 0.64)',
  sunflowerGold: '#F6AE2D',
  forestMoss: '#8DA9C4',
  coolSteel: '#8DA9C4',
  bone: 'rgba(238, 244, 237, 0.18)',
  saddleBrown: '#F6AE2D',
  electricPurple: '#8DA9C4',
  plum: '#FF6B4A',
  hotPink: '#F6AE2D',
  posterOrange: '#F6AE2D',
  raspberryRed: '#FF6B4A',
  vintageBerry: '#8DA9C4',
  teal: '#8DA9C4',
  frostedBlue: '#8DA9C4',
  blush: 'rgba(141, 169, 196, 0.18)',
  cream: '#0B2545',
  ink: '#EEF4ED',
  paper: '#EEF4ED',
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
