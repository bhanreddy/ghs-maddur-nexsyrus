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
    return `rgba(207,161,65,${alpha})`;
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
      // Primary brand color – Deep Navy (from logo circle background)
      primary: '#002448',
      primaryLight: '#003060',
      primaryDark: '#001832',
      // Secondary color – Gold (from logo text, border & icons)
      secondary: '#CFA141',
      // Accent color – Gold trim (logo ring & lettering)
      accent: '#CFA141',
      // Backgrounds – subtle navy-tinted neutrals
      background: '#F5F7FA',
      surface: '#FFFFFF',
      card: '#FFFFFF',
      // Text colors – navy-slate palette
      textPrimary: '#062341',
      textStrong: '#001832',
      textSecondary: '#3D5166',
      textMuted: '#6B7D8F',
      text: '#062341',
      textTertiary: '#6B7D8F',
      // Borders – navy-tinted
      border: '#D4DEE8',
      borderLight: '#E8EEF4',
      // Semantic colors
      danger: '#EF4444',
      success: '#10B981',
      warning: '#F59E0B',
      info: '#003D6B',
      notification: '#EF4444',
      // Navigation – navy pill tints
      navPill: '#EEF2F7',
      navIconActive: '#002448',
      navIconInactive: '#8A96A3',
      // Header/Footer backgrounds (with transparency for glass effect)
      headerBg: 'rgba(245,247,250, 0.88)',
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
      alertBgInfo: '#EEF4FA',
      alertBorderInfo: '#B8CDE0',
      alertIconInfo: '#003D6B',
      alertTextInfo: '#002448',
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
      // Primary – gold for dark mode legibility on navy surfaces
      primary: '#CFA141',
      primaryLight: '#E0B84D',
      primaryDark: '#B8892E',
      // Secondary – muted steel blue
      secondary: '#6B8FAF',
      // Accent – lighter gold trim
      accent: '#E0B84D',
      // Dark backgrounds – deep navy tones (from logo)
      background: '#000E1A',
      surface: '#001832',
      card: '#062341',
      // Light text for dark backgrounds
      textPrimary: '#E8EDF2',
      textStrong: '#F5F7FA',
      textSecondary: '#9AAFC2',
      textMuted: '#6B8399',
      text: '#E8EDF2',
      textTertiary: '#6B8399',
      // Darker borders – navy-ink
      border: '#1A3450',
      borderLight: '#243D58',
      // Lighter semantic colors for dark mode
      danger: '#F87171',
      success: '#34D399',
      warning: '#FBBF24',
      info: '#6B8FAF',
      notification: '#F87171',
      // Navigation – gold tint on navy
      navPill: 'rgba(207,161,65, 0.12)',
      navIconActive: '#CFA141',
      navIconInactive: '#4A6278',
      // Header/Footer with dark navy glass effect
      headerBg: 'rgba(0,14,26, 0.88)',
      footerBg: 'rgba(6,35,65, 0.92)',
      // Alert colors (dark mode)
      alertBg: 'rgba(234,179,8, 0.1)',
      alertBorder: 'rgba(234,179,8, 0.2)',
      alertIcon: '#FBBF24',
      alertText: '#FEF08A',
      alertBgDanger: 'rgba(239,68,68, 0.1)',
      alertBorderDanger: 'rgba(239,68,68, 0.2)',
      alertIconDanger: '#F87171',
      alertTextDanger: '#FECACA',
      alertBgInfo: 'rgba(107,143,175, 0.12)',
      alertBorderInfo: 'rgba(107,143,175, 0.25)',
      alertIconInfo: '#6B8FAF',
      alertTextInfo: '#B8CDE0',
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
  name: "Chaitanya Vidyaniketan School Nancharla",

  // Short line under the school name on the header ribbon (gold text)
  tagline: "Where learning never ends",

  // Motto / core values shown in the first info column of the ribbon (letterhead)
  motto: "Knowledge is path to success",

  // The school logo used in headers and reports
  // Ensure the image exists in assets/images/
  logo: require('../../assets/images/icon.png'),

  // Optional: School Address for reports
  address: "Chaitanya Vidyaniketan School ,Nancharla , Nancharla, Dist Mahabubnagar, Telangana-501111",

  // Optional: Contact info for reports
  contact: "9492275900",

  // Optional: School email for letterhead / reports
  email: "chaitanyavidyanithan@gmail.com",

  // Website or Email
  website: "www.nexsyrus.com",

  // CBSE Affiliation No (if applicable)
  cbseAffiliationNo: "NA",

  // School Code (if applicable)
  schoolCode: "CVS",

  /**
   * Colour theme for ribbon / letterhead chrome (SchoolRibbon, etc.).
   * Adjust `ribbonGradient` stops for your brand; `accent` drives gold trim; `ribbonTagline` sets tagline text.
   */
  theme: {
    /** Stripes and soft dividers – gold from logo lettering */
    accent: '#CFA141',
    /** Four-stop diagonal ribbon – deep navy (logo circle background) */
    ribbonGradient: ['#001832', '#002448', '#003060', '#002848'] as const,
    /** Optional stops for expo-linear-gradient (length must match ribbonGradient) */
    ribbonGradientLocations: [0, 0.30, 0.65, 1] as const,
    /** Main title on the ribbon – gold lettering like the logo */
    ribbonTitle: '#CFA141',
    /** Tagline under the school name on the ribbon */
    ribbonTagline: '#FFFFFF',
    /** Scrolling marquee dot separator */
    marqueeSeparator: 'rgba(207,161,65,0.85)',
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
