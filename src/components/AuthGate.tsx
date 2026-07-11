import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { ThemeContext } from '../context/ThemeContext';
import LogoLoader from './LogoLoader';

export function AuthGate({ children }: { children: React.ReactNode }) {
    const { loading, authChecked } = useAuth();
    // Default fallback colors in case theme isn't fully ready
    const theme = useContext(ThemeContext)?.theme || {
        colors: { background: '#FFFFFF', primary: '#4F46E5', text: '#000000' }
    };

    return (
        <View style={{ flex: 1 }}>
            {/* Always render children so Expo Router doesn't unmount the Stack and crash */}
            {children}

            {(loading || !authChecked) && (
                <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: theme.colors.background }]}>
                    <LogoLoader size={60} color={theme.colors.primary} />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        zIndex: 99999,
        elevation: 99999,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
