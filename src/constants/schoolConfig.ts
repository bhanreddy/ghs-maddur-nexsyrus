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

/** Build `rgba(...)` from `#RRGGBB` / `#RGB` for ribbon overlays and dividers. */
export function schoolColorWithAlpha(hex: string, alpha: number): string {
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
      // Primary brand color – Deep Navy Blue (from logo)
      primary: '#113053',
      primaryLight: '#1D69A6',
      primaryDark: '#0C223C',
      // Secondary color – Slate Blue (from logo)
      secondary: '#889BAC',
      // Accent color – Amber Gold (from logo)
      accent: '#F09822',
      // Backgrounds – subtle blue-tinted cool gray
      background: '#F4F6F9',
      surface: '#FFFFFF',
      card: '#FFFFFF',
      // Text colors – deep slate navy palette
      textPrimary: '#112233',
      textStrong: '#091420',
      textSecondary: '#475D73',
      textMuted: '#8092A6',
      text: '#112233',
      textTertiary: '#8092A6',
      // Borders – blue-tinted gray
      border: '#D1DCE5',
      borderLight: '#E9EFF4',
      // Semantic colors
      danger: '#EF4444',
      success: '#10B981',
      warning: '#F59E0B',
      info: '#1D69A6',
      notification: '#EF4444',
      // Navigation – soft blue-gray pill tints
      navPill: '#EBF2F7',
      navIconActive: '#113053',
      navIconInactive: '#8092A6',
      // Header/Footer backgrounds (with transparency for glass effect)
      headerBg: 'rgba(244, 246, 249, 0.88)',
      footerBg: 'rgba(255,255,255, 0.92)',
      // Alert colors
      alertBg: '#FEFCE8',
      alertBorder: '#FEF08A',
      alertIcon: '#EAB308',
      alertText: '#854D0E',
      alertBgDanger: '#FEF2F2',
      alertBorderDanger: '#FECACA',
      alertIconDanger: '#EF4444',
      alertTextDanger: '#991B1B',
      alertBgInfo: '#EDF7FC',
      alertBorderInfo: '#B3DFEF',
      alertIconInfo: '#1D69A6',
      alertTextInfo: '#0A5F8A',
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
      // Primary – slate blue for dark mode legibility
      primary: '#889BAC',
      primaryLight: '#A6B7C7',
      primaryDark: '#4F657B',
      // Secondary – light gold
      secondary: '#F2BF71',
      // Accent – amber gold
      accent: '#F09822',
      // Dark backgrounds – deep navy-tinted tones
      background: '#09111C',
      surface: '#111C2B',
      card: '#111C2B',
      // Light text for dark backgrounds
      textPrimary: '#E1E7EE',
      textStrong: '#F1F4F8',
      textSecondary: '#8B9EAF',
      textMuted: '#576C7E',
      text: '#E1E7EE',
      textTertiary: '#576C7E',
      // Darker borders – deep navy border
      border: '#1E2D3F',
      borderLight: '#2C3F54',
      // Lighter semantic colors for dark mode
      danger: '#F87171',
      success: '#34D399',
      warning: '#FBBF24',
      info: '#1D69A6',
      notification: '#F87171',
      // Navigation – slate blue tint
      navPill: 'rgba(136, 155, 172, 0.15)',
      navIconActive: '#889BAC',
      navIconInactive: '#415366',
      // Header/Footer with dark navy glass effect
      headerBg: 'rgba(9, 17, 28, 0.88)',
      footerBg: 'rgba(17, 28, 43, 0.92)',
      // Alert colors (dark mode)
      alertBg: 'rgba(234,179,8, 0.1)',
      alertBorder: 'rgba(234,179,8, 0.2)',
      alertIcon: '#FBBF24',
      alertText: '#FEF08A',
      alertBgDanger: 'rgba(239,68,68, 0.1)',
      alertBorderDanger: 'rgba(239,68,68, 0.2)',
      alertIconDanger: '#F87171',
      alertTextDanger: '#FECACA',
      alertBgInfo: 'rgba(29, 105, 166, 0.12)',
      alertBorderInfo: 'rgba(29, 105, 166, 0.25)',
      alertIconInfo: '#1D69A6',
      alertTextInfo: '#B3DFEF',
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
  name: "Samskruthe School Nawabpet",

  // Short line under the school name on the header ribbon (gold text)
  tagline: "Enlighting young minds",

  // Motto / core values shown in the first info column of the ribbon (letterhead)
  motto: "Education is not Business, it is a Mission",

  // The school logo used in headers and reports
  // Ensure the image exists in assets/images/
  logo: require('../../assets/images/icon.png'),

  // Optional: School Address for reports
  address: "Samskruthe School ,Nawabpet.,Nawabpet,Dist Vikarabad., Telangana-501111",

  // Optional: Contact info for reports
  contact: "9000700973",

  // Optional: School email for letterhead / reports
  email: "pjrsamskruthe@gmail.com",

  // Website or Email
  website: "www.nexsyrus.com",

  // CBSE Affiliation No (if applicable)
  cbseAffiliationNo: "NA",

  // School Code (if applicable)
  schoolCode: "SSNAWABPET",

  /**
   * Colour theme for ribbon / letterhead chrome (SchoolRibbon, etc.).
   * Adjust `ribbonGradient` stops for your brand; `accent` drives gold trim and taglines.
   */
  theme: {
    /** Stripes, tagline text, soft dividers – amber gold from logo */
    accent: '#F09822',
    /** Four-stop diagonal ribbon – deep navy to royal/slate blue */
    ribbonGradient: ['#113053', '#163E6A', '#1D69A6', '#4F657B'] as const,
    /** Optional stops for expo-linear-gradient (length must match ribbonGradient) */
    ribbonGradientLocations: [0, 0.30, 0.65, 1] as const,
    /** Main title on the ribbon */
    ribbonTitle: '#FFFFFF',
    /** Tagline under school name on the ribbon */
    ribbonTagline: '#F09822',
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

export const SCHOOL_RECOGNITION_LINE = 'Recognised by Govt. of Telangana';

