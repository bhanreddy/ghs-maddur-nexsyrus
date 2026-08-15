import { ViewStyle } from "react-native";

export const ADMIN_THEME = {
    colors: {
        primary: '#002448', // Deep Navy (logo circle)
        secondary: '#CFA141', // Gold (logo lettering)
        success: '#10B981', // Emerald
        warning: '#F59E0B', // Amber
        danger: '#EF4444', // Rose
        info: '#003D6B', // Navy blue
        background: {
            app: '#F5F7FA', // Navy-tinted neutral
            surface: '#FFFFFF',
            subtle: '#EEF2F7',
        },
        text: {
            primary: '#062341', // Navy
            secondary: '#3D5166', // Muted navy
            muted: '#6B7D8F', // Soft slate
            inverse: '#FFFFFF',
        },
        border: '#D4DEE8', // Navy-tinted border
        icon: '#3D5166',
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
            shadowColor: "#002448", // Colored shadow for emphasis
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
