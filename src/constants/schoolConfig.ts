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
    return `rgba(212,175,55,${alpha})`;
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
      // Primary brand color – Rich purple (logo outer ring)
      primary: '#6B2FA0',
      primaryLight: '#9B59B6',
      primaryDark: '#4A1A75',
      // Secondary color – Orange/Amber (logo sun motif)
      secondary: '#F5921B',
      // Accent color – Golden amber (logo sun rays)
      accent: '#F9A825',
      // Backgrounds – pure white canvas
      background: '#FFFFFF',
      surface: '#FFFFFF',
      card: '#FFFFFF',
      // Text colors – neutral on white
      textPrimary: '#171717',
      textStrong: '#000000',
      textSecondary: '#525252',
      textMuted: '#737373',
      text: '#171717',
      textTertiary: '#737373',
      // Borders – neutral gray
      border: '#E5E7EB',
      borderLight: '#F3F4F6',
      // Semantic colors
      danger: '#D32F2F',
      success: '#10B981',
      warning: '#F59E0B',
      info: '#6B2FA0',
      notification: '#F5921B',
      // Navigation – neutral pills
      navPill: '#F5F5F5',
      navIconActive: '#6B2FA0',
      navIconInactive: '#737373',
      // Header/Footer backgrounds (with transparency for glass effect)
      headerBg: 'rgba(255,255,255, 0.88)',
      footerBg: 'rgba(255,255,255, 0.92)',
      // Alert colors
      alertBg: '#F3E5F5',
      alertBorder: '#CE93D8',
      alertIcon: '#6B2FA0',
      alertText: '#4A1A75',
      alertBgDanger: '#FEF2F2',
      alertBorderDanger: '#FECACA',
      alertIconDanger: '#D32F2F',
      alertTextDanger: '#991B1B',
      alertBgInfo: '#F3E5F5',
      alertBorderInfo: '#CE93D8',
      alertIconInfo: '#6B2FA0',
      alertTextInfo: '#4A1A75',
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
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
        elevation: 12,
      },
    },
  },
  dark: {
    ...defaultDarkTheme,
    colors: {
      ...defaultDarkTheme.colors,
      // Primary – lighter purple for dark mode legibility
      primary: '#B57EDC',
      primaryLight: '#CE93D8',
      primaryDark: '#9B59B6',
      // Secondary – light orange for dark mode
      secondary: '#FFB74D',
      // Accent – golden amber for dark backgrounds
      accent: '#FFD54F',
      // Dark backgrounds – pure black canvas
      background: '#000000',
      surface: '#000000',
      card: '#000000',
      // Light neutral text on black
      textPrimary: '#FFFFFF',
      textStrong: '#FFFFFF',
      textSecondary: '#A3A3A3',
      textMuted: '#737373',
      text: '#FFFFFF',
      textTertiary: '#737373',
      // Neutral dark borders
      border: '#262626',
      borderLight: '#1A1A1A',
      // Lighter semantic colors for dark mode
      danger: '#F87171',
      success: '#34D399',
      warning: '#FBBF24',
      info: '#B57EDC',
      notification: '#FFB74D',
      // Navigation – neutral dark pills
      navPill: 'rgba(255,255,255, 0.08)',
      navIconActive: '#CE93D8',
      navIconInactive: '#737373',
      // Header/Footer with dark glass effect
      headerBg: 'rgba(0,0,0, 0.88)',
      footerBg: 'rgba(0,0,0, 0.92)',
      // Alert colors (dark mode)
      alertBg: 'rgba(107,47,160, 0.12)',
      alertBorder: 'rgba(107,47,160, 0.25)',
      alertIcon: '#CE93D8',
      alertText: '#E1BEE7',
      alertBgDanger: 'rgba(248,113,113, 0.1)',
      alertBorderDanger: 'rgba(248,113,113, 0.2)',
      alertIconDanger: '#F87171',
      alertTextDanger: '#FECACA',
      alertBgInfo: 'rgba(107,47,160, 0.15)',
      alertBorderInfo: 'rgba(107,47,160, 0.3)',
      alertIconInfo: '#B57EDC',
      alertTextInfo: '#E1BEE7',
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
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 12,
      },
    },
  },
};

export const SCHOOL_CONFIG = {
  // The official name of the school displayed in headers and reports
  name: "Geetanjali High School Maddur",

  // Short line under the school name on the header ribbon (gold text)
  tagline: "Build Your Own Identity",

  // Motto / core values shown in the first info column of the ribbon (letterhead)
  motto: "Thought , Action , Progress",

  // The school logo used in headers and reports
  // Ensure the image exists in assets/images/
  logo: require('../../assets/images/icon.png'),

  // Optional: School Address for reports
  address: "Geetanjali High School Maddur, Narayanapet Road, Maddur, Narayanapet District, Telangana - 509411",

  // Optional: Contact info for reports
  contact: "9573276939",

  // Optional: School email for letterhead / reports
  email: "geetanjalihighschool.vvm@gmail.com",

  // Website or Email
  website: "www.ghsmaddur.in",

  // CBSE Affiliation No (if applicable)
  cbseAffiliationNo: "NA",

  // School Code (if applicable)
  schoolCode: "46117",

  /**
   * Colour theme for ribbon / letterhead chrome (SchoolRibbon, etc.).
   * Extracted from the logo: rich purple ring with golden-orange accents.
   */
  theme: {
    /** Golden-orange stripes, dividers, and trim (logo sun rays) */
    accent: '#F9A825',
    /** Tagline text – warm gold */
    ribbonTagline: '#FFE082',
    /** Four-stop diagonal ribbon – deep purple to medium purple (logo outer ring) */
    ribbonGradient: ['#3D1266', '#6B2FA0', '#7B2FB5', '#9B59B6'] as const,
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

export const SCHOOL_RECOGNITION_LINE = '';
