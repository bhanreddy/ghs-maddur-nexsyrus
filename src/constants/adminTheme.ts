import { ViewStyle } from "react-native";

export const ADMIN_THEME = {
    colors: {
        primary: '#5D101D', // Maroon – logo outer ring
        secondary: '#D4AF37', // Gold – logo inner ring
        success: '#39B54A', // Logo book green
        warning: '#FBB040', // Logo book orange
        danger: '#D11D1D', // Logo top arc red
        info: '#0071BC', // Logo book royal blue
        background: {
            app: '#FFFBF8', // Warm off-white with maroon undertone
            surface: '#FFFFFF',
            subtle: '#FFF5F0',
        },
        text: {
            primary: '#002366', // Navy – logo bottom arc text
            secondary: '#4A3035', // Muted maroon-brown
            muted: '#6B4A52', // Light maroon-gray
            inverse: '#FFFFFF',
        },
        border: '#E8D6CE', // Warm border – maroon tinted
        icon: '#5D101D', // Maroon for active icons
    },
    spacing: {
        xs: 4,
        s: 8,
        m: 16,
        l: 24,
        xl: 32,
        xxl: 48,
    },
    borderRadius: {
        s: 8,
        m: 12,
        l: 16,
        xl: 24,
        full: 9999,
    },
    shadows: {
        sm: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
            elevation: 2,
        } as ViewStyle,
        md: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 4,
        } as ViewStyle,
        lg: {
            shadowColor: "#5D101D", // Maroon colored shadow for brand emphasis
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.15,
            shadowRadius: 20,
            elevation: 10,
        } as ViewStyle,
        none: {
            shadowColor: "transparent",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0,
            shadowRadius: 0,
            elevation: 0,
        } as ViewStyle,
    },
    typography: {
        size: {
            xs: 12,
            s: 14,
            m: 16,
            l: 18,
            xl: 20,
            xxl: 24,
            xxxl: 30,
        },
        weight: {
            regular: '400',
            medium: '500',
            semibold: '600',
            bold: '700',
        } as const,
    }
};
