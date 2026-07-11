/**
 * Global School Configuration
 * Edit this file to change the school branding across the entire app.
 *
 * This configuration is used in:
 * - App Headers (Admin, Staff, Student)
 * - Login/Logout Screens
 * - Report Cards & Certificates
 * - PDF Generation
 * - App-wide theming (colors, typography, spacing, shapes)
 */

import type { SchoolTheme } from '../theme/types';
import { defaultDarkTheme, defaultLightTheme } from '../theme/types';

/**
 * Build `rgba(...)` from `#RRGGBB` / `#RGB` for ribbon overlays and dividers.
 *
 * Marked as a Reanimated worklet so it can be called from inside `useAnimatedStyle`
 * on the UI thread (the scroll-driven dashboard headers do this). Reanimated 4 throws
 * a hard "tried to synchronously call a non-worklet function on the UI thread" error
 * otherwise, which blanks every dashboard after login. It remains a normal function
 * when called from the JS thread (PDFs, welcome screen, ribbon, etc.).
 */
export function schoolColorWithAlpha(hex: string, alpha: number): string {
  'worklet';
  let h = hex.trim().replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    return `rgba(124,58,237,${alpha})`;
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * App-wide theme configuration.
 * This is the SINGLE SOURCE OF TRUTH for all visual styling.
 * 
 * To customize your school's appearance, modify the values below.
 * The app will automatically use these values throughout all screens and components.
 * 
 * Both light and dark themes are defined here. The app respects user preference.
 */
export const schoolTheme: { light: SchoolTheme; dark: SchoolTheme } = {
  light: {
    ...defaultLightTheme,
    colors: {
      ...defaultLightTheme.colors,
      // Primary brand color – Blue
      primary: '#2563EB',
      primaryLight: '#818CF8',
      primaryDark: '#4338CA',
      // Secondary color – Purple
      secondary: '#7C3AED',
      // Accent color – Violet highlight
      accent: '#9333EA',
      // Backgrounds – soft purple-tinted neutrals
      background: '#F5F3FF',
      surface: '#FFFFFF',
      card: '#FAFAFF',
      // Text colors – cool slate with purple undertone
      textPrimary: '#1E1B4B',
      textStrong: '#0F0A2E',
      textSecondary: '#6B7280',
      textMuted: '#9CA3AF',
      text: '#1E1B4B',
      textTertiary: '#A78BFA',
      // Borders – lavender-gray
      border: '#DDD6FE',
      borderLight: '#EDE9FE',
      // Semantic colors
      danger: '#EF4444',
      success: '#10B981',
      warning: '#F59E0B',
      info: '#7C3AED',
      notification: '#EF4444',
      // Navigation – purple pill tints
      navPill: '#EDE9FE',
      navIconActive: '#7C3AED',
      navIconInactive: '#A78BFA',
      // Header/Footer backgrounds (with transparency for glass effect)
      headerBg: 'rgba(245,243,255, 0.92)',
      footerBg: 'rgba(250,250,255, 0.94)',
      // Alert colors
      alertBg: '#F5F3FF',
      alertBorder: '#DDD6FE',
      alertIcon: '#7C3AED',
      alertText: '#5B21B6',
      alertBgDanger: '#FEF2F2',
      alertBorderDanger: '#FECACA',
      alertIconDanger: '#EF4444',
      alertTextDanger: '#991B1B',
      alertBgInfo: '#F5F3FF',
      alertBorderInfo: '#DDD6FE',
      alertIconInfo: '#7C3AED',
      alertTextInfo: '#5B21B6',
    },
    typography: {
      fontFamily: 'System',
      fontFamilyBold: 'System',
      fontSizeXS: 11,
      fontSizeSM: 13,
      fontSizeMD: 15,
      fontSizeLG: 17,
      fontSizeXL: 20,
      fontSizeXXL: 24,
      fontSizeXXXL: 28,
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 24,
      xxl: 32,
    },
    shape: {
      borderRadiusXS: 6,
      borderRadiusSM: 8,
      borderRadiusMD: 12,
      borderRadiusLG: 16,
      borderRadiusXL: 20,
      borderRadiusFull: 9999,
    },
    shadows: {
      none: {
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
      },
      sm: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
      },
      md: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 6,
      },
      lg: {
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.1,
        shadowRadius: 24,
        elevation: 12,
      },
    },
  },
  dark: {
    ...defaultDarkTheme,
    colors: {
      ...defaultDarkTheme.colors,
      // Primary – lighter blue-violet for dark mode legibility
      primary: '#818CF8',
      primaryLight: '#A5B4FC',
      primaryDark: '#6366F1',
      // Secondary – lighter purple
      secondary: '#A78BFA',
      // Accent – bright violet for dark backgrounds
      accent: '#C084FC',
      // Dark backgrounds – deep purple-indigo tones
      background: '#1E1B4B',
      surface: '#2E1065',
      card: '#312E81',
      // Light text for dark backgrounds
      textPrimary: '#EDE9FE',
      textStrong: '#F5F3FF',
      textSecondary: '#C4B5FD',
      textMuted: '#A78BFA',
      text: '#EDE9FE',
      textTertiary: '#8B5CF6',
      // Darker borders – purple-slate
      border: '#4C1D95',
      borderLight: '#5B21B6',
      // Lighter semantic colors for dark mode
      danger: '#F87171',
      success: '#34D399',
      warning: '#FBBF24',
      info: '#A78BFA',
      notification: '#F87171',
      // Navigation – purple tint
      navPill: 'rgba(124,58,237, 0.2)',
      navIconActive: '#C084FC',
      navIconInactive: '#7C3AED',
      // Header/Footer with dark purple glass effect
      headerBg: 'rgba(30,27,75, 0.92)',
      footerBg: 'rgba(46,16,101, 0.94)',
      // Alert colors (dark mode)
      alertBg: 'rgba(124,58,237, 0.12)',
      alertBorder: 'rgba(167,139,250, 0.3)',
      alertIcon: '#C084FC',
      alertText: '#EDE9FE',
      alertBgDanger: 'rgba(239,68,68, 0.1)',
      alertBorderDanger: 'rgba(239,68,68, 0.2)',
      alertIconDanger: '#F87171',
      alertTextDanger: '#FECACA',
      alertBgInfo: 'rgba(124,58,237, 0.12)',
      alertBorderInfo: 'rgba(124,58,237, 0.25)',
      alertIconInfo: '#A78BFA',
      alertTextInfo: '#DDD6FE',
    },
    typography: {
      fontFamily: 'System',
      fontFamilyBold: 'System',
      fontSizeXS: 11,
      fontSizeSM: 13,
      fontSizeMD: 15,
      fontSizeLG: 17,
      fontSizeXL: 20,
      fontSizeXXL: 24,
      fontSizeXXXL: 28,
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 24,
      xxl: 32,
    },
    shape: {
      borderRadiusXS: 6,
      borderRadiusSM: 8,
      borderRadiusMD: 12,
      borderRadiusLG: 16,
      borderRadiusXL: 20,
      borderRadiusFull: 9999,
    },
    shadows: {
      none: {
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
      },
      sm: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      },
      md: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 6,
      },
      lg: {
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
        elevation: 12,
      },
    },
  },
};

export const SCHOOL_CONFIG = {
  // The official name of the school displayed in headers and reports
  name: "Vikas Model School Balampet",

  // Short line under the school name on the header ribbon
  tagline: "Arise Awake Stop Not till you reach the Goal",

  // Motto / core values shown in the first info column of the ribbon (letterhead)
  motto: "Wisdom, Knowledge and Victory",

  // The school logo used in headers and reports
  // Ensure the image exists in assets/images/
  logo: require('../../assets/images/icon.png'),

  // Optional: School Address for reports
  address: "Vikas Model School ,Balampet, Mandal Doulathabad, Dist Vikarabad, Telangana-509336",

  // Optional: Contact info for reports
  contact: "9848981191",

  // Optional: School email for letterhead / reports
  email: "vmsbalampet@gmail.com",

  // Website or Email
  website: "www.nexsyrus.com",

  // CBSE Affiliation No (if applicable)
  cbseAffiliationNo: "NA",

  // School Code (if applicable)
  schoolCode: "VMS",

  /**
   * Colour theme for ribbon / letterhead chrome (SchoolRibbon, etc.).
   * Blue-to-purple gradient with violet accents.
   */
  theme: {
    /** Violet stripes, dividers, and accent trim */
    accent: '#9333EA',
    /** Tagline text – warm gold accent for contrast on purple ribbon */
    ribbonTagline: '#FEF08A',
    /** Four-stop diagonal ribbon – indigo through deep purple */
    ribbonGradient: ['#4338CA', '#6366F1', '#7C3AED', '#9333EA'] as const,
    /** Optional stops for expo-linear-gradient (length must match ribbonGradient) */
    ribbonGradientLocations: [0, 0.30, 0.65, 1] as const,
    /** Main title on the ribbon */
    ribbonTitle: '#FFFFFF',
    /** Scrolling marquee dot separator */
    marqueeSeparator: 'rgba(255,255,255,0.85)',
    /** Letterhead / info column body */
    ribbonBody: 'rgba(255,255,255,0.92)',
    ribbonBodyMuted: 'rgba(255,255,255,0.9)',
    /**
     * Icons over the ribbon / unsafe area (`expo-status-bar`).
     * Use `light` on dark gradients, `dark` if you switch to a light ribbon.
     */
    statusBarOnRibbon: 'light' as 'light' | 'dark',
  },
};
