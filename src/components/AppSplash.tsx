/**
 * AppSplash.tsx
 * Custom animated splash screen overlay that shows LogoLoader,
 * then fades out and calls onFinish.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import LogoLoader from './LogoLoader';

interface AppSplashProps {
    onFinish: () => void;
}

const SPLASH_BG = '#E6F4FE';

export default function AppSplash({ onFinish }: AppSplashProps) {
    const opacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const timer = setTimeout(() => {
            Animated.timing(opacity, {
                toValue: 0,
                duration: 400,
                useNativeDriver: true,
            }).start(({ finished }) => {
                if (finished) onFinish();
            });
        }, 2000);

        return () => clearTimeout(timer);
    }, []);

    return (
        <Animated.View style={[styles.container, { opacity }]}>
            <LogoLoader size={80} />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999,
        backgroundColor: SPLASH_BG,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
