import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/services/apiClient';
import ResponsiveCard from '../../src/components/ResponsiveCard';
import LogoLoader from '../../src/components/LogoLoader';

// Aesthetic Theme Configuration dynamically built via useTheme

type TriggerType =
  | 'FEE_REMINDER'
  | 'DIARY_UPDATED'
  | 'RESULT_RELEASED'
  | 'NOTICE_ADMIN_STUDENT'
  | 'ATTENDANCE_ABSENT'
  | 'ATTENDANCE_PRESENT'
  | 'TIMETABLE_UPDATED'
  | 'COMPLAINT_CREATED'
  | 'EXPENSE_CREATED';

interface TriggerCard {
  id: TriggerType;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: [string, string];
  glow: string;
}

const TRIGGERS: TriggerCard[] = [
  { id: 'FEE_REMINDER', title: 'Fee Reminders', description: 'Dispatch gentle payment reminders to parents with pending dues.', icon: 'wallet-outline', colors: ['#F59E0B', '#B45309'], glow: 'rgba(245, 158, 11, 0.4)' },
  { id: 'DIARY_UPDATED', title: 'Diary Updates', description: 'Remind parents to check recent diary entries for homework and notes.', icon: 'book-outline', colors: ['#3B82F6', '#1D4ED8'], glow: 'rgba(59, 130, 246, 0.4)' },
  { id: 'RESULT_RELEASED', title: 'Result Declarations', description: 'Notify parents that new exam results are published in the portal.', icon: 'podium-outline', colors: ['#10B981', '#047857'], glow: 'rgba(16, 185, 129, 0.4)' },
  { id: 'NOTICE_ADMIN_STUDENT', title: 'Admin Notices', description: 'Send a high-priority push alert for the latest administration notice.', icon: 'megaphone-outline', colors: ['#8B5CF6', '#5B21B6'], glow: 'rgba(139, 92, 246, 0.4)' },
  { id: 'ATTENDANCE_ABSENT', title: 'Absence Alerts', description: 'Instantly notify parents whose children are marked absent today.', icon: 'timer-outline', colors: ['#EF4444', '#B91C1C'], glow: 'rgba(239, 68, 68, 0.4)' },
  { id: 'ATTENDANCE_PRESENT', title: 'Arrival Confirmations', description: 'Confirm safe arrival at school to parents of present students today.', icon: 'checkmark-circle-outline', colors: ['#22C55E', '#15803D'], glow: 'rgba(34, 197, 94, 0.4)' },
  { id: 'TIMETABLE_UPDATED', title: 'Timetable Updates', description: 'Notify all students and parents to check the newly updated timetable.', icon: 'calendar-outline', colors: ['#EC4899', '#BE185D'], glow: 'rgba(236, 72, 153, 0.4)' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Animated Card — each card owns its own animated values
// ─────────────────────────────────────────────────────────────────────────────
function AnimatedTriggerCard({
  item,
  index,
  isLoading,
  loadingType,
  onPress,
  styles,
  THEME_COLORS,
}: {
  item: TriggerCard;
  index: number;
  isLoading: boolean;
  loadingType: TriggerType | null;
  onPress: (item: TriggerCard) => void;
  styles: ReturnType<typeof getStyles>;
  THEME_COLORS: any;
}) {
  // ── Press spring ──
  const pressScale = useSharedValue(1);

  // ── Icon bounce on mount ──
  const iconScale = useSharedValue(0);
  useEffect(() => {
    iconScale.value = withDelay(
      320 + index * 60,
      withSpring(1, { damping: 9, stiffness: 200 })
    );
  }, []);

  // ── Pulsing live-dot (scale + opacity) ──
  const dotScale = useSharedValue(1);
  const dotOpacity = useSharedValue(1);
  useEffect(() => {
    const delay = 600 + index * 90;
    dotScale.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1.7, { duration: 750 }), withTiming(1, { duration: 750 })),
        -1,
        true
      )
    );
    dotOpacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(0.25, { duration: 750 }), withTiming(1, { duration: 750 })),
        -1,
        true
      )
    );
  }, []);

  // ── Glow orb breathe ──
  const orbScale = useSharedValue(1);
  useEffect(() => {
    orbScale.value = withDelay(
      index * 120,
      withRepeat(
        withSequence(withTiming(1.18, { duration: 3000 }), withTiming(1, { duration: 3000 })),
        -1,
        true
      )
    );
  }, []);

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const dotAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
    opacity: dotOpacity.value,
  }));

  const orbAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbScale.value }],
  }));

  const handlePressIn = () => {
    pressScale.value = withSpring(0.962, { damping: 15, stiffness: 320 });
  };

  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 12, stiffness: 260 });
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(200 + index * 65).springify().mass(0.75).damping(14)}
    >
      <ResponsiveCard maxWidth={700}>
        <Animated.View style={cardAnimStyle}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => onPress(item)}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={loadingType !== null}
            style={{ width: '100%' }}
          >
            <View style={styles.card}>

              {/* ── Breathing Glow Orb ── */}
              <Animated.View
                style={[styles.glowOrb, { backgroundColor: item.glow }, orbAnimStyle]}
              />

              {/* ── Top-right shimmer accent ── */}
              <LinearGradient
                colors={[item.glow, 'transparent']}
                start={{ x: 1, y: 0 }}
                end={{ x: 0.4, y: 0.6 }}
                style={styles.shimmerAccent}
                pointerEvents="none"
              />

              {/* ── Card Header ── */}
              <View style={styles.cardHeader}>

                {/* Bouncing Icon on mount */}
                <Animated.View style={[styles.iconShell, iconAnimStyle]}>
                  <LinearGradient
                    colors={item.colors}
                    style={styles.iconBox}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons name={item.icon} size={26} color="#FFF" />
                  </LinearGradient>
                </Animated.View>

                {/* Action Button */}
                <TouchableOpacity
                  style={[styles.actionBtn, isLoading && styles.actionBtnLoading]}
                  onPress={() => onPress(item)}
                  disabled={loadingType !== null}
                >
                  {isLoading ? (
                    <LogoLoader color={item.colors[0]} size={26} />
                  ) : (
                    <View style={styles.actionBtnInner}>
                      <Ionicons
                        name="paper-plane-outline"
                        size={13}
                        color={item.colors[0]}
                        style={{ marginRight: 5 }}
                      />
                      <Text style={[styles.actionBtnText, { color: item.colors[0] }]}>
                        SEND ALL
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* ── Card Body ── */}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardDesc}>{item.description}</Text>
              </View>

              {/* ── Footer with pulsing live-dot ── */}
              <View style={styles.cardFooter}>
                <View style={styles.dotWrapper}>
                  <View style={[styles.statusDotCore, { backgroundColor: item.colors[0] }]} />
                  <Animated.View
                    style={[
                      styles.statusDotRing,
                      { borderColor: item.colors[0] },
                      dotAnimStyle,
                    ]}
                  />
                </View>
                <Text style={[styles.statusText, { color: item.colors[0] }]}>
                  Ready to broadcast
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={THEME_COLORS.textMuted}
                  style={styles.chevron}
                />
              </View>

              {/* ── Inset Border ── */}
              <View style={styles.cardBorder} />
            </View>
          </TouchableOpacity>
        </Animated.View>
      </ResponsiveCard>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function NotificationsTriggerPage() {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const scrollY = useSharedValue(0);

  const THEME_COLORS = useMemo(() => ({
    background: theme.colors.background,
    surface: theme.colors.card,
    surfaceHighlight: isDark ? '#1A1D28' : '#F3F4F6',
    text: theme.colors.text,
    textMuted: theme.colors.textSecondary,
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    orbOpacity: isDark ? 0.3 : 0.08,
    gradientEnd: isDark ? '#050508' : theme.colors.background,
  }), [theme, isDark]);

  const styles = useMemo(() => getStyles(THEME_COLORS), [theme]);

  const [loadingType, setLoadingType] = useState<TriggerType | null>(null);

  // Scroll handler — drives scrollY for AdminHeader + hero parallax
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  // Hero: fade + translate up as user scrolls
  const heroAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 100], [1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, 100],
          [0, -20],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const handleFireTrigger = useCallback((item: TriggerCard) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Confirm Live Broadcast",
      `Are you sure you want to dispatch ${item.title} to all applicable students and parents? This will immediately send a push notification to their devices.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send All",
          style: "destructive",
          onPress: () => submitTrigger(item.id),
        },
      ]
    );
  }, []);

  const submitTrigger = async (type: TriggerType) => {
    Haptics.selectionAsync();
    setLoadingType(type);
    try {
      const res = await api.post<any>('/admin/notifications/test-trigger', { type });
      Alert.alert("Broadcast Status", res.data?.message || `Trigger successful for ${type}.`);
    } catch (error: any) {
      Alert.alert("Failed", error.message || error.response?.data?.error || "Failed to trigger notifications");
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <View style={styles.container}>
      <AdminHeader title="System Notifications" showBackButton scrollY={scrollY} />

      {/* Pure Ambient Background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={[THEME_COLORS.background, THEME_COLORS.gradientEnd]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <Animated.ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* ── Hero Header with parallax fade-out ──────────────────── */}
        <Animated.View style={heroAnimStyle}>
          <Animated.View
            entering={FadeIn.delay(100).duration(450)}
            style={styles.heroBadge}
          >
            <Ionicons name="radio-outline" size={12} color={THEME_COLORS.textMuted} />
            <Text style={styles.heroBadgeText}>BROADCAST CENTER</Text>
          </Animated.View>

          <Animated.Text
            entering={FadeInDown.delay(150).springify().damping(14)}
            style={styles.headerTitle}
          >
            Global{'\n'}Broadcasts
          </Animated.Text>

          <Animated.Text
            entering={FadeInDown.delay(210).springify().damping(14)}
            style={styles.headerSubtitle}
          >
            One-click communication tools to dispatch targeted system notifications and reminders to parent and student cohorts.
          </Animated.Text>

          {/* Divider with count */}
          <Animated.View
            entering={FadeIn.delay(290).duration(380)}
            style={styles.dividerRow}
          >
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>{TRIGGERS.length} CHANNELS</Text>
            <View style={styles.dividerLine} />
          </Animated.View>
        </Animated.View>

        {/* ── Cards Grid ──────────────────────────────────────────── */}
        <View style={styles.grid}>
          {TRIGGERS.map((item, index) => (
            <AnimatedTriggerCard
              key={item.id}
              item={item}
              index={index}
              isLoading={loadingType === item.id}
              loadingType={loadingType}
              onPress={handleFireTrigger}
              styles={styles}
              THEME_COLORS={THEME_COLORS}
            />
          ))}
        </View>

        <View style={{ height: 100 }} />
      </Animated.ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const getStyles = (THEME_COLORS: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: THEME_COLORS.background,
    },
    scrollContent: {
      padding: 24,
      paddingTop: 120,
    },

    // ── Hero ──────────────────────────────────────────────────────
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 14,
    },
    heroBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 2.5,
      color: THEME_COLORS.textMuted,
    },
    headerTitle: {
      fontSize: 46,
      fontWeight: '900',
      color: THEME_COLORS.text,
      letterSpacing: -1.5,
      lineHeight: 50,
      marginBottom: 14,
    },
    headerSubtitle: {
      fontSize: 15,
      color: THEME_COLORS.textMuted,
      lineHeight: 23,
      fontWeight: '400',
      marginBottom: 32,
      maxWidth: '88%',
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 32,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: THEME_COLORS.border,
    },
    dividerLabel: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 2,
      color: THEME_COLORS.textMuted,
    },

    // ── Grid ──────────────────────────────────────────────────────
    grid: {
      gap: 16,
    },

    // ── Card ──────────────────────────────────────────────────────
    card: {
      backgroundColor: THEME_COLORS.surface,
      borderRadius: 28,
      padding: 22,
      paddingBottom: 18,
      position: 'relative',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.07,
      shadowRadius: 24,
      elevation: 6,
    },
    cardBorder: {
      ...StyleSheet.absoluteFillObject,
      borderWidth: 1,
      borderColor: THEME_COLORS.border,
      borderRadius: 28,
      pointerEvents: 'none',
    },
    glowOrb: {
      position: 'absolute',
      width: 200,
      height: 200,
      top: -70,
      left: -60,
      borderRadius: 100,
      opacity: THEME_COLORS.orbOpacity,
    },
    shimmerAccent: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 130,
      height: 130,
      borderTopRightRadius: 28,
      opacity: 0.18,
    },

    // ── Card Header ───────────────────────────────────────────────
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
      zIndex: 2,
    },
    iconShell: {
      borderRadius: 22,
      padding: 3,
      backgroundColor: 'transparent',
    },
    iconBox: {
      width: 60,
      height: 60,
      borderRadius: 19,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 8,
    },
    actionBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: THEME_COLORS.surfaceHighlight,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: THEME_COLORS.border,
      minWidth: 108,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionBtnLoading: {
      opacity: 0.7,
    },
    actionBtnInner: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    actionBtnText: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1,
    },

    // ── Card Body ─────────────────────────────────────────────────
    cardBody: {
      zIndex: 2,
      marginBottom: 18,
    },
    cardTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: THEME_COLORS.text,
      letterSpacing: -0.4,
      marginBottom: 7,
    },
    cardDesc: {
      fontSize: 14,
      color: THEME_COLORS.textMuted,
      lineHeight: 21,
      fontWeight: '400',
    },

    // ── Card Footer ───────────────────────────────────────────────
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 2,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: THEME_COLORS.border,
    },
    dotWrapper: {
      width: 16,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    statusDotCore: {
      position: 'absolute',
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    statusDotRing: {
      position: 'absolute',
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 1.5,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.2,
      flex: 1,
    },
    chevron: {
      opacity: 0.4,
    },
  });