import { ViewStyle } from "react-native";

export const ADMIN_THEME = {
    colors: {
        primary: '#2563EB', // Blue
        secondary: '#7C3AED', // Purple
        success: '#10B981', // Emerald
        warning: '#F59E0B', // Amber
        danger: '#EF4444', // Rose
        info: '#3B82F6', // Sky
        background: {
            app: '#F5F3FF', // Violet 50
            surface: '#FFFFFF',
            subtle: '#FAF5FF', // Purple 50
        },
        text: {
            primary: '#111827', // Gray 900
            secondary: '#4B5563', // Gray 600
            muted: '#9CA3AF', // Gray 400
            inverse: '#FFFFFF',
        },
        border: '#DDD6FE', // Violet 200
        icon: '#6B7280',
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
            shadowColor: "#6366F1", // Colored shadow for emphasis
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
