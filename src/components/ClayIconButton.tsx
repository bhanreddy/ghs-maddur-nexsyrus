import React from 'react';
import { Pressable, Platform, ViewStyle, StyleProp } from 'react-native';
import { schoolColorWithAlpha } from '../constants/schoolConfig';

/* ------------------------------------------------------------------ */
/* Claymorphic icon puck — raised, gradient-lit, tactile on press.     */
/* Shared across every header (Staff, Admin, Student) so all portals   */
/* get an identical, premium icon-button treatment.                    */
/* ------------------------------------------------------------------ */

interface ClayIconButtonProps {
    onPress: () => void;
    accessibilityLabel?: string;
    /** Renders a dark, deep-set puck (for dark surfaces/themes) instead of a pearl-light one. */
    isDark: boolean;
    /** Brand tint driving the colored shadow — keeps the glow on-brand instead of generic gray/black. */
    accent: string;
    /** Circular avatar-style puck vs. rounded-square squircle. */
    round?: boolean;
    size?: number;
    style?: StyleProp<ViewStyle>;
    children: React.ReactNode;
}

export default function ClayIconButton({
    onPress,
    accessibilityLabel,
    isDark,
    accent,
    round = false,
    size = 42,
    style,
    children,
}: ClayIconButtonProps) {
    const tint = isDark ? '#05030A' : accent;
    const radius = round ? size / 2 : Math.round(size * 0.36);

    const restShadow = [
        `0 10px 18px -6px ${schoolColorWithAlpha(tint, isDark ? 0.55 : 0.38)}`,
        `0 2px 5px ${schoolColorWithAlpha(tint, isDark ? 0.4 : 0.22)}`,
        `inset 0 1.5px 2px ${isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.95)'}`,
        `inset 0 -6px 10px ${schoolColorWithAlpha(tint, isDark ? 0.5 : 0.16)}`,
    ].join(', ');

    const pressedShadow = [
        `inset 0 3px 7px ${schoolColorWithAlpha(tint, isDark ? 0.6 : 0.34)}`,
        `inset 0 -1px 2px ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)'}`,
    ].join(', ');

    const gradient = isDark
        ? 'linear-gradient(160deg, #2A2140 0%, #170F26 100%)'
        : 'linear-gradient(160deg, #FFFFFF 0%, #F1ECFA 100%)';

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            hitSlop={6}
            style={({ pressed }) => [
                {
                    width: size,
                    height: size,
                    borderRadius: radius,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isDark ? '#1E1830' : '#FFFFFF',
                },
                Platform.OS === 'web'
                    ? ({
                        cursor: 'pointer',
                        backgroundImage: gradient,
                        boxShadow: pressed ? pressedShadow : restShadow,
                        transform: pressed ? [{ translateY: 1 }, { scale: 0.97 }] : [{ translateY: 0 }, { scale: 1 }],
                        transitionProperty: 'box-shadow, transform',
                        transitionDuration: '120ms',
                    } as unknown as object)
                    : {
                        shadowColor: tint,
                        shadowOffset: { width: 0, height: pressed ? 1 : 5 },
                        shadowOpacity: pressed ? 0.18 : (isDark ? 0.5 : 0.3),
                        shadowRadius: pressed ? 2 : 9,
                        elevation: pressed ? 1 : 5,
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                    },
                style,
            ]}
        >
            {children}
        </Pressable>
    );
}
