// src/constants/theme.ts
//
// NeuraLaunch design system — single source of truth for every color,
// spacing, radius, and typography value in the mobile app.
//
// Palette: electric blue primary (#2563EB) + warm gold secondary
// (#D4A843). Dark mode is the product's default surface; light mode
// mirrors it. No purple anywhere — this product has moved past that.

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export const palette = {
  // Neutrals — light mode
  light: {
    background:      '#F7F8FA',
    foreground:      '#1A2540',
    card:            '#FFFFFF',
    cardForeground:  '#1A2540',
    muted:           '#F0F4F8',
    mutedForeground: '#64748B',
    border:          '#E2E8F0',
    input:           '#E2E8F0',
  },

  // Neutrals — dark mode (the product's default)
  dark: {
    background:      '#0A1628',
    foreground:      '#F7F8FA',
    card:            '#111B2E',
    cardForeground:  '#F7F8FA',
    muted:           '#1A2540',
    mutedForeground: '#94A3B8',
    border:          '#1E293B',
    input:           '#1E293B',
  },

  // Semantic — scheme-invariant hex values
  destructive:      '#EF4444',
  destructiveMuted: 'rgba(239, 68, 68, 0.1)',
  success:          '#10B981',
  successMuted:     'rgba(16, 185, 129, 0.12)',
  warning:          '#F59E0B',
  warningMuted:     'rgba(245, 158, 11, 0.12)',
} as const;

// ---------------------------------------------------------------------------
// Semantic color tokens — switch on color scheme
// ---------------------------------------------------------------------------

export type ColorScheme = 'light' | 'dark';

// Electric blue (#2563EB) is the brand primary in both schemes.
// Warm gold (#D4A843) is the secondary accent — used sparingly for
// high-value moments (recommendation reveal callouts, the Outreach
// Composer, hero sparkles on the recommendation reveal).
const PRIMARY_RGB   = { r: 0x25, g: 0x63, b: 0xEB }; // #2563EB
const SECONDARY_RGB = { r: 0xD4, g: 0xA8, b: 0x43 }; // #D4A843

function alphaOf({ r, g, b }: { r: number; g: number; b: number }, a: number) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function colors(scheme: ColorScheme) {
  const n = scheme === 'dark' ? palette.dark : palette.light;

  return {
    // Brand
    primary:           '#2563EB',
    primaryForeground: '#FFFFFF',
    primaryAlpha5:     alphaOf(PRIMARY_RGB, 0.05),
    primaryAlpha10:    alphaOf(PRIMARY_RGB, 0.10),
    primaryAlpha20:    alphaOf(PRIMARY_RGB, 0.20),

    // Warm gold — secondary accent, used sparingly
    secondary:         '#D4A843',
    secondaryForeground: '#1A2540',
    secondaryAlpha10:  alphaOf(SECONDARY_RGB, 0.10),
    secondaryAlpha20:  alphaOf(SECONDARY_RGB, 0.20),

    // Surface / text
    background:        n.background,
    foreground:        n.foreground,
    card:              n.card,
    cardForeground:    n.cardForeground,
    muted:             n.muted,
    mutedForeground:   n.mutedForeground,
    border:            n.border,
    input:             n.input,

    // Semantic
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
// Border radius
// ---------------------------------------------------------------------------

export const radius = {
  sm:   6,
  md:   8,
  lg:   12,
  xl:   16,
  '2xl': 24,
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const typography = {
  sans: undefined as string | undefined, // system default
  mono: 'monospace',

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

  leading: {
    none:    1,
    tight:   1.25,
    snug:    1.375,
    normal:  1.5,
    relaxed: 1.625,
    loose:   1.8,
  },

  weight: {
    normal:   '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
  },

  tracking: {
    tight:  -0.3,
    normal: 0,
    wide:   0.5,
    widest: 1.5,
  },
} as const;

// ---------------------------------------------------------------------------
// Shadows — scheme-aware. Black shadows at 0.05 opacity are invisible
// on a dark background; we bump opacity + blur radius in dark mode.
// ---------------------------------------------------------------------------

export function shadows(scheme: ColorScheme) {
  const darker = scheme === 'dark';
  return {
    sm: {
      shadowColor:  '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: darker ? 0.28 : 0.05,
      shadowRadius:  darker ? 3    : 2,
      elevation:     1,
    },
    md: {
      shadowColor:  '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: darker ? 0.35 : 0.08,
      shadowRadius:  darker ? 6    : 4,
      elevation:     3,
    },
    lg: {
      shadowColor:  '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: darker ? 0.42 : 0.10,
      shadowRadius:  darker ? 12   : 8,
      elevation:     5,
    },
  } as const;
}

// ---------------------------------------------------------------------------
// Animation durations
// ---------------------------------------------------------------------------

export const animation = {
  fast:   150,
  normal: 250,
  slow:   400,
} as const;

// ---------------------------------------------------------------------------
// Icon sizing scale — always pass one of these to Lucide icons.
// ---------------------------------------------------------------------------

export const iconSize = {
  xs: 11, // inline-with-caption text
  sm: 14, // small buttons, inline actions
  md: 18, // medium buttons, input icons
  lg: 22, // tab bar icons, header icons
  xl: 40, // centred empty/error state hero icons
} as const;

export type IconSize = keyof typeof iconSize;
