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
      // Primary brand color – Deep maroon (logo outer ring)
      primary: '#5D101D',
      primaryLight: '#8B2635',
      primaryDark: '#3D0A14',
      // Secondary color – Royal blue (logo book spine)
      secondary: '#0071BC',
      // Accent color – Gold (logo inner ring)
      accent: '#D4AF37',
      // Backgrounds – warm maroon-tinted neutrals
      background: '#FFFBF8',
      surface: '#FFFFFF',
      card: '#FFFFFF',
      // Text colors – navy and maroon palette
      textPrimary: '#002366',
      textStrong: '#1A0A0E',
      textSecondary: '#4A3035',
      textMuted: '#6B4A52',
      text: '#002366',
      textTertiary: '#6B4A52',
      // Borders – maroon-tinted
      border: '#E8D6CE',
      borderLight: '#F5EBE6',
      // Semantic colors (from logo book graphic & arc text)
      danger: '#D11D1D',
      success: '#39B54A',
      warning: '#FBB040',
      info: '#0071BC',
      notification: '#D11D1D',
      // Navigation – maroon pill tints
      navPill: '#FFF0E8',
      navIconActive: '#5D101D',
      navIconInactive: '#6B4A52',
      // Header/Footer backgrounds (with transparency for glass effect)
      headerBg: 'rgba(255,251,248, 0.88)',
      footerBg: 'rgba(255,255,255, 0.92)',
      // Alert colors
      alertBg: '#FFF5F0',
      alertBorder: '#E8C4B8',
      alertIcon: '#5D101D',
      alertText: '#3D0A14',
      alertBgDanger: '#FEF2F2',
      alertBorderDanger: '#FECACA',
      alertIconDanger: '#D11D1D',
      alertTextDanger: '#991B1B',
      alertBgInfo: '#EFF6FF',
      alertBorderInfo: '#BFDBFE',
      alertIconInfo: '#0071BC',
      alertTextInfo: '#002366',
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
      // Primary – lighter maroon/gold for dark mode legibility
      primary: '#C45A6A',
      primaryLight: '#D4AF37',
      primaryDark: '#8B2635',
      // Secondary – sky blue (logo book)
      secondary: '#29ABE2',
      // Accent – gold for dark backgrounds
      accent: '#E8C547',
      // Dark backgrounds – deep maroon-ink tones
      background: '#1A0A0E',
      surface: '#2D1018',
      card: '#2D1018',
      // Light text for dark backgrounds
      textPrimary: '#F5EBE6',
      textStrong: '#FFFFFF',
      textSecondary: '#D4B8B0',
      textMuted: '#9C8A8F',
      text: '#F5EBE6',
      textTertiary: '#9C8A8F',
      // Darker borders – maroon-ink
      border: '#4A2030',
      borderLight: '#5D2A3A',
      // Lighter semantic colors for dark mode
      danger: '#F87171',
      success: '#4ADE80',
      warning: '#FBB040',
      info: '#29ABE2',
      notification: '#F87171',
      // Navigation – maroon tint
      navPill: 'rgba(93,16,29, 0.25)',
      navIconActive: '#E8C547',
      navIconInactive: '#9C8A8F',
      // Header/Footer with dark maroon glass effect
      headerBg: 'rgba(26,10,14, 0.88)',
      footerBg: 'rgba(45,16,24, 0.92)',
      // Alert colors (dark mode)
      alertBg: 'rgba(93,16,29, 0.15)',
      alertBorder: 'rgba(212,175,55, 0.25)',
      alertIcon: '#E8C547',
      alertText: '#F5EBE6',
      alertBgDanger: 'rgba(248,113,113, 0.1)',
      alertBorderDanger: 'rgba(248,113,113, 0.2)',
      alertIconDanger: '#F87171',
      alertTextDanger: '#FECACA',
      alertBgInfo: 'rgba(41,171,226, 0.12)',
      alertBorderInfo: 'rgba(41,171,226, 0.25)',
      alertIconInfo: '#29ABE2',
      alertTextInfo: '#BFDBFE',
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
  name: "New Master Minds E/M School Gokafasalwad",

  // Short line under the school name on the header ribbon (gold text)
  tagline: "Step in with Confidence and Step out with Success",

  // Motto / core values shown in the first info column of the ribbon (letterhead)
  motto: "Be Confident, Do Confidently",

  // The school logo used in headers and reports
  // Ensure the image exists in assets/images/
  logo: require('../../assets/images/icon.png'),

  // Optional: School Address for reports
  address: "Maddur Road , Gokafasalwad(V) , Doulthabad(M) , Vikarabad(Dist), Telangana 509336",

  // Optional: Contact info for reports
  contact: "6281041195",

  // Optional: School email for letterhead / reports
  email: "newmastermindsenglishmediumsch@gmail.com",

  // Website or Email
  website: "www.nexsyrus.com",

  // CBSE Affiliation No (if applicable)
  cbseAffiliationNo: "NA",

  // School Code (if applicable)
  schoolCode: "NMS",

  /**
   * Colour theme for ribbon / letterhead chrome (SchoolRibbon, etc.).
   * Extracted from the logo: maroon outer ring, gold trim, navy arc text.
   */
  theme: {
    /** Gold stripes, dividers, and trim (logo inner ring) */
    accent: '#D4AF37',
    /** Tagline text – warm gold */
    ribbonTagline: '#FFE082',
    /** Four-stop diagonal ribbon – maroon ring with navy depth (logo outer ring) */
    ribbonGradient: ['#2D0810', '#5D101D', '#7B1A2C', '#002366'] as const,
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