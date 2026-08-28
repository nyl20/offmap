// Design tokens for the OFFMAP website, in the same `as const` shape as
// apps/mobile/src/constants/theme.ts (Colors/Palette/Spacing) — but new
// values: the website's reference design is a single dark-navy "map app"
// aesthetic, unrelated to mobile's cream/orange corkboard theme, so nothing
// here is reused from theme.ts beyond the pattern itself. No light/dark
// toggle — this is one deliberate dark theme throughout.

export const Colors = {
  background: '#1A2036',
  backgroundAlt: '#1B2138',
  backgroundElevated: '#232A47',
  backgroundElevated2: '#2C3456',
  backgroundSheet: '#1E2440',
  border: 'rgba(255,255,255,0.08)',
  text: '#F4F6FC',
  textSecondary: '#8891B3',
  textTertiary: '#626C93',
} as const;

export const Palette = {
  mint: '#8DE9D5',
  mintSoft: 'rgba(141,233,213,0.16)',
  gold: '#F0A93E',
  goldSoft: 'rgba(240,169,62,0.18)',
  lavender: '#9AA8E8',
  lavenderSoft: 'rgba(154,168,232,0.18)',
  coral: '#E2694F',
  coralSoft: 'rgba(226,105,79,0.18)',
} as const;

export const Fonts = {
  sans: '-apple-system, "SF Pro Display", "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radii = {
  sm: 8,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;
