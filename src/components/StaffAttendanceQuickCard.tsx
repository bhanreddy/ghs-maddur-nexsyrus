import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  AppState,
  AppStateStatus,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { staffAttendanceV2Client, TodayAttendanceStatus } from '../services/staffAttendanceV2Client';
import { useTheme } from '../hooks/useTheme';
import { clayInset } from '../theme/clayStyles';
import { clayTokens } from '../styles/clayTokens';
import * as Haptics from '../utils/haptics';

const BRAND = clayTokens.colors.brand;
const IS_WEB = Platform.OS === 'web';

interface Props {
  isDark: boolean;
}

export default function StaffAttendanceQuickCard({ isDark }: Props) {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 500 || fontScale > 1.3;
  const openAttendance = (autoAction?: 'check_in' | 'check_out') => {
    (navigation as any).navigate('attendance', { autoAction });
  };
  const [loading, setLoading] = useState<boolean>(true);
  const [status, setStatus] = useState<TodayAttendanceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const loadStatus = useCallback(async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      setError(null);
      const res = await staffAttendanceV2Client.getTodayStatus();
      setStatus(res);
    } catch (err: any) {
      console.warn('Failed to load today staff attendance status:', err);
      setError('Unable to fetch live status');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStatus(true);
    }, [loadStatus])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        loadStatus(true);
      }
    });
    return () => subscription.remove();
  }, [loadStatus]);

  const handlePressCard = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openAttendance();
  };

  const handleActionPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!status) {
      openAttendance();
      return;
    }
    if (status.device_registration_status !== 'approved') {
      openAttendance();
      return;
    }
    if (status.can_check_in) {
      openAttendance('check_in');
    } else if (status.can_check_out) {
      openAttendance('check_out');
    } else {
      openAttendance();
    }
  };

  const ink = theme.colors.textStrong;
  const muted = theme.colors.textSecondary;
  const iconWell = isDark ? 'rgba(108,99,255,0.20)' : BRAND.violetSoft;

  const formatTime = (ts?: string | null) => {
    if (!ts) return null;
    try {
      return new Date(ts).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return null;
    }
  };

  const checkInTimeStr = formatTime(status?.check_in_at);
  const checkOutTimeStr = formatTime(status?.check_out_at);
  const campusRaw =
    typeof status?.campus === 'object' && status?.campus?.name
      ? status.campus.name
      : typeof status?.campus === 'string'
        ? status.campus
        : '';
  const campusName = campusRaw
    ? (/campus/i.test(campusRaw) ? campusRaw : `${campusRaw} Campus`)
    : 'Your campus';

  const getStatusBadge = () => {
    if (status?.enforcement_mode === 'disabled') {
      return {
        label: 'Not set up yet',
        color: muted,
        bg: isDark ? 'rgba(148,163,184,0.14)' : '#EEF1F6',
        icon: 'moon-outline',
      };
    }
    if (status?.device_registration_status === 'none') {
      return {
        label: 'Phone needed',
        color: '#B45309',
        bg: isDark ? 'rgba(245,158,11,0.16)' : BRAND.amberSoft,
        icon: 'phone-portrait-outline',
      };
    }
    if (status?.device_registration_status === 'pending') {
      return {
        label: 'Awaiting approval',
        color: BRAND.blue,
        bg: isDark ? 'rgba(61,142,255,0.16)' : '#E8F1FF',
        icon: 'time-outline',
      };
    }
    if (['invalidated', 'rejected', 'revoked', 'replaced'].includes(status?.device_registration_status || '')) {
      return {
        label: 'Biometrics changed',
        color: BRAND.rose,
        bg: isDark ? 'rgba(255,77,106,0.16)' : BRAND.roseSoft,
        icon: 'finger-print-outline',
      };
    }
    if (status?.is_finalized) {
      return {
        label: `Final: ${status.daily_status?.toUpperCase() || 'MARKED'}`,
        color: '#0F766E',
        bg: isDark ? 'rgba(0,196,160,0.16)' : BRAND.emeraldSoft,
        icon: 'shield-checkmark-outline',
      };
    }
    if (status?.verification_source && status.verification_source !== 'mobile_v2' && status.daily_status !== 'not_marked') {
      return {
        label: `Office marked ${status.daily_status}`,
        color: '#0F766E',
        bg: isDark ? 'rgba(13,148,136,0.16)' : '#D1FAF4',
        icon: 'person-circle-outline',
      };
    }
    if (status?.check_out_at) {
      return {
        label: 'Day complete',
        color: '#0F766E',
        bg: isDark ? 'rgba(0,196,160,0.16)' : BRAND.emeraldSoft,
        icon: 'checkmark-done-circle-outline',
      };
    }
    if (status?.check_in_at) {
      return {
        label: 'You are in',
        color: BRAND.violet,
        bg: isDark ? 'rgba(108,99,255,0.18)' : BRAND.violetSoft,
        icon: 'radio-button-on-outline',
      };
    }
    return {
      label: 'Not checked in',
      color: muted,
      bg: isDark ? 'rgba(148,163,184,0.12)' : '#EEF1F6',
      icon: 'sunny-outline',
    };
  };

  const getCaption = () => {
    if (status?.enforcement_mode === 'disabled') return 'Check-in is paused. Register your phone to be ready.';
    if (status?.device_registration_status === 'none') return 'Register this phone, then check in with one tap.';
    if (status?.device_registration_status === 'pending') return 'Waiting on office approval to check in.';
    if (status?.check_out_at) return 'Day complete. See you tomorrow.';
    if (status?.check_in_at) return 'You’re in. Check out when class is done.';
    if (status?.can_check_in) return 'Check in to mark that you’re on campus.';
    return 'Secure campus check-in — fingerprint, then teach.';
  };

  const badge = getStatusBadge();
  const caption = getCaption();
  const ctaKind = status?.can_check_in
    ? 'in'
    : status?.can_check_out
      ? 'out'
      : 'secondary';
  const ctaColors: [string, string] =
    ctaKind === 'in'
      ? ['#2DD4BF', BRAND.emerald]
      : ctaKind === 'out'
        ? ['#FFC85A', BRAND.amber]
        : [BRAND.violetMid, BRAND.violet];
  const ctaLabel = status?.can_check_in
    ? 'Check in'
    : status?.can_check_out
      ? 'Check out'
      : status?.device_registration_status === 'none'
        ? 'Register'
        : status?.device_registration_status === 'pending'
          ? 'See status'
          : 'Open attendance';
  const ctaIcon = status?.can_check_in
    ? 'log-in'
    : status?.can_check_out
      ? 'log-out'
      : status?.device_registration_status !== 'approved'
        ? 'finger-print-outline'
        : 'calendar-outline';

  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      style={[animStyle, styles.wrap]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open My Attendance"
        onPress={handlePressCard}
        onPressIn={() => { scale.value = withTiming(0.97, { duration: 90 }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 120 }); }}
        style={[
          { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
          styles.cardShell,
          IS_WEB ? { cursor: 'pointer' as const } : null,
        ]}
      >
        <View style={styles.cardInner}>
        <LinearGradient
          colors={isDark ? ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={[styles.headerRow, { flexWrap: 'wrap' }]}>
          <View style={[styles.titleWithIcon, { minWidth: 160 }]}>
            <View style={[styles.iconPill, { backgroundColor: iconWell }]}>
              <MaterialCommunityIcons name="fingerprint" size={16} color={BRAND.violet} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: ink }]}>Your attendance</Text>
              <Text style={[styles.cardSubtitle, { color: muted }]} numberOfLines={1}>
                {campusName}
              </Text>
            </View>
          </View>

          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Ionicons name={badge.icon as any} size={12} color={badge.color} style={{ marginRight: 4 }} />
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        </View>

        {error && status && <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.alertText, fontSize: theme.typography.fontSizeSM, marginBottom: 8 }}>Live status could not refresh. Showing the last response; open My Attendance to check.</Text>}
        {loading && !status ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={BRAND.violet} />
            <Text style={[styles.loadingText, { color: muted }]}>Looking up today’s arrival…</Text>
          </View>
        ) : error && !status ? (
          <View style={styles.errorBox}>
            <Text style={[styles.errorText, { color: muted }]}>{error}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry My Attendance status" onPress={() => loadStatus()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.body}>
            <View style={[styles.metricsRow, { flexWrap: 'wrap' }]}>
              <View style={[styles.timeWell, clayInset(isDark)]}>
                <Text style={[styles.timeLabel, { color: muted }]}>In</Text>
                <Text style={[styles.timeValue, { color: checkInTimeStr ? ink : muted }]}>
                  {checkInTimeStr || '—'}
                </Text>
              </View>
              <View style={[styles.timeWell, clayInset(isDark)]}>
                <Text style={[styles.timeLabel, { color: muted }]}>Out</Text>
                <Text style={[styles.timeValue, { color: checkOutTimeStr ? ink : muted }]}>
                  {checkOutTimeStr || '—'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${ctaLabel} · My Attendance`}
                onPress={(e) => {
                  if (typeof (e as any)?.stopPropagation === 'function') {
                    (e as any).stopPropagation();
                  }
                  handleActionPress();
                }}
                hitSlop={8}
                style={({ pressed }) => [styles.actionWrap, compact && { flexBasis: '100%' }, pressed && { opacity: 0.92, transform: [{ scale: 0.97 }] }]}
              >
                <LinearGradient colors={ctaColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionBtn}>
                  <Ionicons name={ctaIcon as any} size={14} color={ctaKind === 'out' ? '#3F2A00' : '#FFFFFF'} />
                  <Text style={[styles.actionBtnText, ctaKind === 'out' && { color: '#3F2A00' }]}>{ctaLabel}</Text>
                </LinearGradient>
              </Pressable>
            </View>
            <Text style={[styles.caption, { color: muted }]} numberOfLines={1}>{caption}</Text>
          </View>
        )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
  },
  cardShell: {
    borderRadius: 20,
  },
  cardInner: {
    padding: 14,
    borderRadius: 20,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  iconPill: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  body: {
    gap: 8,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeWell: {
    flex: 1,
    minWidth: 100,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  timeLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  actionWrap: {
    flexShrink: 0,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    gap: 5,
    ...Platform.select({
      web: { boxShadow: '0 6px 14px rgba(108,99,255,0.24), inset 0 1px 0 rgba(255,255,255,0.28)' },
      default: {
        shadowColor: '#6C63FF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
        elevation: 3,
      },
    }),
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 12,
  },
  errorText: {
    fontSize: 12,
    flex: 1,
  },
  retryBtn: {
    paddingHorizontal: 12,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: BRAND.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
