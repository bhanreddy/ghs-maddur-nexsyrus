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
      // Primary brand color – Deep Purple (from logo outer ring)
      primary: '#665990',
      primaryLight: '#665990',
      primaryDark: '#3A1155',
      // Secondary color – Lavender (from logo lower arc)
      secondary: '#F57964',
      // Accent color – Cerulean Blue (from logo globe & hands)
      accent: '#0D8ECF',
      // Backgrounds – subtle purple-tinted neutrals
      background: '#F9F7FC',
      surface: '#FFFFFF',
      card: '#FFFFFF',
      // Text colors – deep purple-slate palette
      textPrimary: '#2D2440',
      textStrong: '#1A0E2E',
      textSecondary: '#6B5F80',
      textMuted: '#9B91AB',
      text: '#2D2440',
      textTertiary: '#9B91AB',
      // Borders – purple-tinted
      border: '#E4DFF0',
      borderLight: '#F0ECF6',
      // Semantic colors
      danger: '#EF4444',
      success: '#10B981',
      warning: '#F59E0B',
      info: '#0D8ECF',
      notification: '#EF4444',
      // Navigation – purple pill tints
      navPill: '#F0EBF7',
      navIconActive: '#4B1A6B',
      navIconInactive: '#9B91AB',
      // Header/Footer backgrounds (with transparency for glass effect)
      headerBg: 'rgba(249,247,252, 0.88)',
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
      alertIconInfo: '#0D8ECF',
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
      // Primary – lighter purple for dark mode legibility
      primary: '#B48FD9',
      primaryLight: '#CDB3E8',
      primaryDark: '#9A6CC4',
      // Secondary – light lavender
      secondary: '#C4B8D8',
      // Accent – brighter cerulean blue
      accent: '#3DB5E8',
      // Dark backgrounds – deep purple-ink tones
      background: '#0D0A14',
      surface: '#1A1526',
      card: '#1A1526',
      // Light text for dark backgrounds
      textPrimary: '#E4DFF0',
      textStrong: '#F3F0F8',
      textSecondary: '#9B91AB',
      textMuted: '#6B5F80',
      text: '#E4DFF0',
      textTertiary: '#6B5F80',
      // Darker borders – purple-ink
      border: '#2A2240',
      borderLight: '#3D3358',
      // Lighter semantic colors for dark mode
      danger: '#F87171',
      success: '#34D399',
      warning: '#FBBF24',
      info: '#3DB5E8',
      notification: '#F87171',
      // Navigation – purple tint
      navPill: 'rgba(180,143,217, 0.15)',
      navIconActive: '#B48FD9',
      navIconInactive: '#4A3F62',
      // Header/Footer with dark purple glass effect
      headerBg: 'rgba(13,10,20, 0.88)',
      footerBg: 'rgba(26,21,38, 0.92)',
      // Alert colors (dark mode)
      alertBg: 'rgba(234,179,8, 0.1)',
      alertBorder: 'rgba(234,179,8, 0.2)',
      alertIcon: '#FBBF24',
      alertText: '#FEF08A',
      alertBgDanger: 'rgba(239,68,68, 0.1)',
      alertBorderDanger: 'rgba(239,68,68, 0.2)',
      alertIconDanger: '#F87171',
      alertTextDanger: '#FECACA',
      alertBgInfo: 'rgba(13,142,207, 0.12)',
      alertBorderInfo: 'rgba(13,142,207, 0.25)',
      alertIconInfo: '#3DB5E8',
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
  name: "Slate School Kosgi",

  // Short line under the school name on the header ribbon (gold text)
  tagline: "You can learn something new everyday , If you listen",

  // Motto / core values shown in the first info column of the ribbon (letterhead)
  motto: "You believe in us we will prove it ",

  // The school logo used in headers and reports
  // Ensure the image exists in assets/images/
  logo: require('../../assets/images/icon.png'),

  // Optional: School Address for reports
  address: "Slate School Kosgi , Hakeempet-Polepally road , Dist Narayanpet. Telangana-509339",

  // Optional: Contact info for reports
  contact: "9573530364",

  // Optional: School email for letterhead / reports
  email: "slateschoolkosgi@gmail.com",

  // Website or Email
  website: "www.nexsyrus.com",

  // CBSE Affiliation No (if applicable)
  cbseAffiliationNo: "NA",

  // School Code (if applicable)
  schoolCode: "SSK",

  /**
   * Colour theme for ribbon / letterhead chrome (SchoolRibbon, etc.).
   * Adjust `ribbonGradient` stops for your brand; `accent` drives gold trim and taglines.
   */
  theme: {
    /** Stripes, tagline text, soft dividers – cerulean blue from logo globe */
    accent: '#0D8ECF',
    /** Four-stop diagonal ribbon – deep purple to lavender (logo ring) */
    ribbonGradient: ['#F57964', '#F57964', '#F57964', '#F57964'] as const,
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
