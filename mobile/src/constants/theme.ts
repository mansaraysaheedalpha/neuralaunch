// src/constants/theme.ts
//
// NeuraLaunch design system — single source of truth for every color,
// spacing, radius, and typography value in the mobile app.
//
// Derived from the web app's CSS custom properties (globals.css) so
// both surfaces feel like the same product. HSL values are converted
// to hex for React Native compatibility.

// ---------------------------------------------------------------------------
// Palette — exact matches to the web app's HSL custom properties
// ---------------------------------------------------------------------------

export const palette = {
  // Core brand
  purple: {
    50:  '#f3eeff',
    100: '#e0d4ff',
    200: '#c5a8ff',
    400: '#8b5cf6',
    500: '#7c3aed', // primary light mode (hsl 259 92% 62%)
    600: '#6d28d9',
    700: '#5b21b6',
    900: '#1a0a3e', // primary-foreground dark mode
  },

  // Neutrals — light mode
  light: {
    background:        '#f7f8fa', // hsl(210 20% 98%)
    foreground:        '#2e3440', // hsl(210 10% 23%)
    card:              '#ffffff', // hsl(0 0% 100%)
    cardForeground:    '#2e3440',
    muted:             '#f0f4f8', // hsl(210 40% 96.1%)
    mutedForeground:   '#6b7b95', // hsl(215 25% 55%)
    border:            '#dfe5ee', // hsl(214.3 31.8% 91.4%)
    input:             '#dfe5ee',
  },

  // Neutrals — dark mode
  dark: {
    background:        '#151b2d', // hsl(222 47% 11%)
    foreground:        '#f0f4f8', // hsl(210 40% 98%)
    card:              '#1c2340', // hsl(222 47% 14%)
    cardForeground:    '#f0f4f8',
    muted:             '#222d45', // hsl(217 32% 17%)
    mutedForeground:   '#a3b1c9', // hsl(215 20% 75%)
    border:            '#2e3d5c', // hsl(217 32% 27%)
    input:             '#2e3d5c',
  },

  // Semantic
  destructive:       '#ef4444',
  destructiveMuted:  'rgba(239, 68, 68, 0.1)',
  success:           '#22c55e',
  successMuted:      'rgba(34, 197, 94, 0.1)',
  warning:           '#f59e0b',
  warningMuted:      'rgba(245, 158, 11, 0.1)',

  // Transparency helpers
  primaryAlpha10:    'rgba(124, 58, 237, 0.1)',
  primaryAlpha20:    'rgba(124, 58, 237, 0.2)',
  primaryAlpha5:     'rgba(124, 58, 237, 0.05)',
} as const;

// ---------------------------------------------------------------------------
// Semantic color tokens — switch on color scheme
// ---------------------------------------------------------------------------

export type ColorScheme = 'light' | 'dark';

export function colors(scheme: ColorScheme) {
  const n = scheme === 'dark' ? palette.dark : palette.light;
  const primary = scheme === 'dark' ? '#a78bfa' : palette.purple[500]; // brighter in dark
  const primaryForeground = scheme === 'dark' ? palette.purple[900] : '#ffffff';

  return {
    primary,
    primaryForeground,
    primaryAlpha10: palette.primaryAlpha10,
    primaryAlpha20: palette.primaryAlpha20,
    primaryAlpha5:  palette.primaryAlpha5,

    background:        n.background,
    foreground:        n.foreground,
    card:              n.card,
    cardForeground:    n.cardForeground,
    muted:             n.muted,
    mutedForeground:   n.mutedForeground,
    border:            n.border,
    input:             n.input,

    destructive:       palette.destructive,
    destructiveMuted:  palette.destructiveMuted,
    success:           palette.success,
    successMuted:      palette.successMuted,
    warning:           palette.warning,
    warningMuted:      palette.warningMuted,

    // Component-specific tokens
    separator:         n.border,
    placeholder:       n.mutedForeground,
    overlay:           scheme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)',
  } as const;
}

// ---------------------------------------------------------------------------
// Spacing scale — 4px base, matches Tailwind's default
// ---------------------------------------------------------------------------

export const spacing = {
  px:  1,
  0.5: 2,
  1:   4,
  1.5: 6,
  2:   8,
  2.5: 10,
  3:   12,
  3.5: 14,
  4:   16,
  5:   20,
  6:   24,
  7:   28,
  8:   32,
  9:   36,
  10:  40,
  12:  48,
  14:  56,
  16:  64,
  20:  80,
  24:  96,
} as const;

// ---------------------------------------------------------------------------
// Border radius — matches the web app's --radius-* tokens
// ---------------------------------------------------------------------------

export const radius = {
  sm:   6,   // 0.375rem
  md:   8,   // 0.5rem
  lg:   12,  // 0.75rem
  xl:   16,  // 1rem
  '2xl': 24, // 1.5rem
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Typography — system fonts with the same visual hierarchy as Geist Sans
// ---------------------------------------------------------------------------

export const typography = {
  // Font families — system defaults for maximum native feel
  sans: undefined as string | undefined, // system default
  mono: 'monospace',

  // Size scale
  size: {
    '2xs': 10,
    xs:    11,
    sm:    13,
    base:  15,
    lg:    17,
    xl:    20,
    '2xl': 24,
    '3xl': 30,
  },

  // Line heights (multipliers)
  leading: {
    none:    1,
    tight:   1.25,
    snug:    1.375,
    normal:  1.5,
    relaxed: 1.625,
    loose:   1.8,
  },

  // Font weights
  weight: {
    normal:   '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
  },

  // Tracking (letter spacing)
  tracking: {
    tight:  -0.3,
    normal: 0,
    wide:   0.5,
    widest: 1.5,
  },
} as const;

// ---------------------------------------------------------------------------
// Shadows — platform-specific, premium feel
// ---------------------------------------------------------------------------

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
} as const;

// ---------------------------------------------------------------------------
// Animation durations — consistent motion language
// ---------------------------------------------------------------------------

export const animation = {
  fast:   150,
  normal: 250,
  slow:   400,
} as const;

// ---------------------------------------------------------------------------
// Icon sizing scale — always pass one of these to Lucide icons. Never
// pass a raw number. Keeps iconography visually consistent across
// meta rows, buttons, tab bars, headers, and CTAs.
// ---------------------------------------------------------------------------

export const iconSize = {
  xs: 11, // inline-with-caption text (meta-row labels)
  sm: 14, // small buttons, inline actions, ChevronDown on toggles
  md: 18, // medium buttons, input-row icons, empty-state inline
  lg: 22, // tab bar icons, header icons
  xl: 40, // centred empty/error state hero icons
} as const;

export type IconSize = keyof typeof iconSize;
