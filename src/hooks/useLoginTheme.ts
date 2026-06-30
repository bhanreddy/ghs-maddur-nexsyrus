/**
 * useLoginTheme — Maps the app-wide SchoolTheme into a flat design-token
 * object consumed by every login screen (student, staff, admin, driver, accounts).
 *
 * The returned tokens (`C.*`) are intentionally concise so the StyleSheet
 * factories stay readable.
 */

import { useTheme } from './useTheme';

export const useLoginTheme = () => {
  const { theme, isDark } = useTheme();
  const c = theme.colors;
  const s = theme.shadows;

  return {
    isDark,

    // ── Backgrounds ───────────────────────────────────────────────────────
    bg: c.background,
    surface: c.surface,
    surfaceAlt: isDark ? c.card : '#FFF5F0',

    // ── Accent family ─────────────────────────────────────────────────────
    accent: c.primary,
    accentLight: isDark ? 'rgba(212,175,55,0.12)' : '#FFF8ED',
    accentDark: c.primaryDark,
    accentDeep: isDark ? c.primaryDark : '#2D0810',
    accentGlow: isDark ? 'rgba(212,175,55,0.10)' : 'rgba(93,16,29,0.08)',
    accentBorder: isDark ? 'rgba(212,175,55,0.25)' : 'rgba(93,16,29,0.18)',

    // ── Ink (text) hierarchy ──────────────────────────────────────────────
    ink: c.textStrong,
    inkMid: c.textPrimary,
    inkSoft: c.textSecondary,
    inkGhost: c.textMuted,

    // ── Borders ───────────────────────────────────────────────────────────
    borderNeutral: c.border,

    // ── Semantic ──────────────────────────────────────────────────────────
    error: c.danger,

    // ── Shadow helpers ────────────────────────────────────────────────────
    shadow: {
      color: isDark ? '#000000' : s.md.shadowColor,
      md: {
        shadowColor: s.md.shadowColor,
        shadowOffset: s.md.shadowOffset,
        shadowOpacity: s.md.shadowOpacity,
        shadowRadius: s.md.shadowRadius,
        elevation: s.md.elevation,
      },
      lg: {
        shadowColor: s.lg.shadowColor,
        shadowOffset: s.lg.shadowOffset,
        shadowOpacity: s.lg.shadowOpacity,
        shadowRadius: s.lg.shadowRadius,
        elevation: s.lg.elevation,
      },
    },
  } as const;
};

export type LoginTheme = ReturnType<typeof useLoginTheme>;
