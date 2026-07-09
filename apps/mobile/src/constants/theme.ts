/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#2D2118',
    background: '#F7F1E9',
    backgroundElement: '#FFFDF8',
    backgroundSelected: '#E1D5C7',
    textSecondary: '#6F655B',
  },
  dark: {
    text: '#F7F1E9',
    background: '#1C1712',
    backgroundElement: '#2A211A',
    backgroundSelected: '#4A392C',
    textSecondary: '#D6C6B6',
  },
} as const;

export const Palette = {
  sunflowerGold: '#F2B442',
  forestMoss: '#659100',
  coolSteel: '#92A6B3',
  bone: '#E1D5C7',
  saddleBrown: '#88522B',
  electricPurple: '#659100',
  plum: '#88522B',
  hotPink: '#F2B442',
  posterOrange: '#F2B442',
  raspberryRed: '#88522B',
  vintageBerry: '#88522B',
  teal: '#659100',
  frostedBlue: '#92A6B3',
  blush: '#E1D5C7',
  cream: '#F7F1E9',
  ink: '#2D2118',
  paper: '#FFFDF8',
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
