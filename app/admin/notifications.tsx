import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  FadeIn,
  SlideInUp,
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
import * as Haptics from '@/src/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../src/components/AdminHeader';
import AdminNotificationSwitcher, {
  type NotificationWorkspaceTab,
} from '../../src/components/AdminNotificationSwitcher';
import NotificationInboxList from '../../src/components/NotificationInboxList';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/services/apiClient';
import ResponsiveCard from '../../src/components/ResponsiveCard';
import LogoLoader from '../../src/components/LogoLoader';

type TriggerType =
  | 'FEE_REMINDER'
  | 'DIARY_UPDATED'
  | 'RESULT_RELEASED'
  | 'NOTICE_ADMIN_STUDENT'
  | 'ATTENDANCE_ABSENT'
  | 'ATTENDANCE_PRESENT'
  | 'TIMETABLE_UPDATED';

interface TriggerCard {
  id: TriggerType;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** [light, dark] stops used only for the icon tile */
  gradient: [string, string];
  /** primary accent: top hairline, send button, selected states, stats */
  accent: string;
  /** very light accent wash for selected chips + corner glow */
  tint: string;
}

interface ClassTarget {
  class_id: string;
  class_name: string;
  class_code?: string;
  recipient_count: number;
}

interface ClassTargetsResponse {
  classes: ClassTarget[];
  all_school_recipient_count: number;
  notification_enabled?: boolean;
}

interface NotificationSetting {
  id: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  enabled: boolean;
}

interface NotificationSettingsResponse {
  settings: NotificationSetting[];
}

interface FeePaidRange {
  min: number;
  max: number;
}

interface BroadcastResult {
  batch_id: string;
  status: 'processing' | 'completed' | 'failed';
  mode: 'sync' | 'async';
  total_targets: number;
  sent_count: number;
  failure_count: number;
  no_token_count: number;
  remaining_count?: number;
  tokens_targeted?: number;
  message?: string;
  parent_batch_id?: string;
}

interface BroadcastStatus extends BroadcastResult {
  channel_type?: string;
  target_class_ids?: string[] | null;
  failed_recipients?: Array<{
    user_id: string;
    fcm_token: string | null;
    error_code: string | null;
  }>;
}

/**
 * Refined, desaturated accent system.
 * Each card keeps a distinct identity (icon tile + accent + selected chips),
 * but the surface stays neutral so color reads rich instead of loud.
 */
const TRIGGERS: TriggerCard[] = [
  {
    id: 'FEE_REMINDER',
    title: 'Fee Reminders',
    description: 'Send a gentle payment reminder to parents who still have pending dues.',
    icon: 'wallet-outline',
    gradient: ['#FBBF24', '#F59E0B'],
    accent: '#D97706',
    tint: 'rgba(217,119,6,0.08)',
  },
  {
    id: 'DIARY_UPDATED',
    title: 'Diary Updates',
    description: 'Ask parents to check the latest diary entries for homework and notes.',
    icon: 'book-outline',
    gradient: ['#6366F1', '#4F46E5'],
    accent: '#4F46E5',
    tint: 'rgba(79,70,229,0.08)',
  },
  {
    id: 'RESULT_RELEASED',
    title: 'Results Published',
    description: 'Let parents know that new exam results are now available in the app.',
    icon: 'trophy-outline',
    gradient: ['#10B981', '#059669'],
    accent: '#059669',
    tint: 'rgba(5,150,105,0.08)',
  },
  {
    id: 'NOTICE_ADMIN_STUDENT',
    title: 'School Notice',
    description: 'Push the latest school notice to parents as a high-priority alert.',
    icon: 'megaphone-outline',
    gradient: ['#8B5CF6', '#7C3AED'],
    accent: '#7C3AED',
    tint: 'rgba(124,58,237,0.08)',
  },
  {
    id: 'ATTENDANCE_ABSENT',
    title: 'Absence Alert',
    description: "Notify parents whose children are marked absent today.",
    icon: 'alert-circle-outline',
    gradient: ['#F87171', '#EF4444'],
    accent: '#DC2626',
    tint: 'rgba(220,38,38,0.08)',
  },
  {
    id: 'ATTENDANCE_PRESENT',
    title: 'Arrival Confirmation',
    description: 'Confirm to parents that their children reached school safely today.',
    icon: 'checkmark-done-circle-outline',
    gradient: ['#22C55E', '#16A34A'],
    accent: '#16A34A',
    tint: 'rgba(22,163,74,0.08)',
  },
  {
    id: 'TIMETABLE_UPDATED',
    title: 'Timetable Update',
    description: 'Tell parents and students to check the newly updated timetable.',
    icon: 'calendar-outline',
    gradient: ['#EC4899', '#DB2777'],
    accent: '#DB2777',
    tint: 'rgba(219,39,76,0.08)',
  },
];

const TRIGGER_SETTING_CATEGORY: Record<TriggerType, string> = {
  FEE_REMINDER: 'fees',
  DIARY_UPDATED: 'diary',
  RESULT_RELEASED: 'results',
  NOTICE_ADMIN_STUDENT: 'notices',
  ATTENDANCE_ABSENT: 'attendance',
  ATTENDANCE_PRESENT: 'attendance',
  TIMETABLE_UPDATED: 'timetable',
};

const FEE_RANGE_PRESETS: { label: string; range: FeePaidRange }[] = [
  { label: 'Not paid', range: { min: 0, max: 0 } },
  { label: 'Up to 25%', range: { min: 0, max: 25 } },
  { label: '25–50%', range: { min: 25, max: 50 } },
  { label: '50–75%', range: { min: 50, max: 75 } },
  { label: '75–99%', range: { min: 75, max: 99.99 } },
  { label: 'Any unpaid', range: { min: 0, max: 100 } },
];

const POLL_INTERVAL_MS = 2500;
// A flaky network shouldn't tear down the live delivery view — keep polling
// through short blips and only surface a failure after this many in a row.
const POLL_MAX_CONSECUTIVE_ERRORS = 5;

/**
 * Per-send idempotency key. A double-tap, a React re-render, or the API client
 * transparently retrying a 502/503/429 all reuse this exact value, so the
 * backend collapses them into a single broadcast instead of sending twice.
 */
function makeIdempotencyKey(): string {
  const rand = Math.random().toString(36).slice(2);
  return `bc_${Date.now().toString(36)}_${rand}`;
}

const STATUS_COLORS = {
  sent: '#16A34A',
  failed: '#DC2626',
  noDevice: '#D97706',
};

function humanizeFcmError(code: string | null): string {
  if (!code) return 'Unknown reason';
  const map: Record<string, string> = {
    'messaging/invalid-registration-token': 'Outdated app — parent needs to reopen it',
    'messaging/registration-token-not-registered': 'App was uninstalled',
    'messaging/invalid-argument': 'Message could not be built',
    'messaging/quota-exceeded': 'Too many at once — try resending',
    'messaging/server-unavailable': 'Notification service was busy',
    'messaging/internal-error': 'Notification service error',
    'messaging/third-party-auth-error': 'Notification service auth error',
  };
  return map[code] || code;
}

function summarizeFailures(
  failed: BroadcastStatus['failed_recipients']
): Array<{ reason: string; count: number }> {
  if (!failed || failed.length === 0) return [];
  const map: Record<string, number> = {};
  failed.forEach((f) => {
    const reason = humanizeFcmError(f.error_code);
    map[reason] = (map[reason] || 0) + 1;
  });
  return Object.entries(map)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

function AnimatedTriggerCard({
  item,
  index,
  isLoading,
  loadingType,
  selectedClassIds,
  classTargets,
  targetsLoading,
  onToggleClass,
  onSelectAllClasses,
  onPress,
  styles,
  THEME_COLORS,
  allSchoolCount,
  cardWidth,
}: {
  item: TriggerCard;
  index: number;
  isLoading: boolean;
  loadingType: TriggerType | null;
  selectedClassIds: string[];
  classTargets: ClassTarget[];
  targetsLoading: boolean;
  onToggleClass: (channel: TriggerType, classId: string) => void;
  onSelectAllClasses: (channel: TriggerType) => void;
  onPress: (item: TriggerCard) => void;
  styles: ReturnType<typeof getStyles>;
  THEME_COLORS: any;
  allSchoolCount: number;
  cardWidth: number | `${number}%`;
}) {
  const pressScale = useSharedValue(1);
  const iconScale = useSharedValue(0);

  useEffect(() => {
    iconScale.value = withDelay(
      200 + index * 40,
      withSpring(1, { damping: 12, stiffness: 150 })
    );
  }, []);

  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);
  useEffect(() => {
    if (isLoading) {
      ringScale.value = withRepeat(
        withSequence(withTiming(2.0, { duration: 650 }), withTiming(1, { duration: 650 })),
        -1,
        true
      );
      ringOpacity.value = withRepeat(
        withSequence(withTiming(0.6, { duration: 650 }), withTiming(0, { duration: 650 })),
        -1,
        true
      );
    } else {
      ringScale.value = withTiming(1, { duration: 200 });
      ringOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isLoading]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
    opacity: iconScale.value,
  }));

  const ringAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const handlePressIn = () => {
    pressScale.value = withSpring(0.985, { damping: 20, stiffness: 350 });
  };

  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 15, stiffness: 250 });
  };

  const isAllSchool = selectedClassIds.length === 0;
  const selectedRecipientEstimate = isAllSchool
    ? allSchoolCount
    : classTargets
        .filter((c) => selectedClassIds.includes(c.class_id))
        .reduce((sum, c) => sum + c.recipient_count, 0);

  const accent = item.accent;

  return (
    <Animated.View
      entering={FadeInDown.delay(120 + index * 50).springify().mass(0.6).damping(14)}
      style={{ width: cardWidth }}
    >
      <Animated.View style={cardAnimStyle}>
        <View style={styles.card}>
            <View style={[styles.accentStrip, { backgroundColor: accent }]} />

            <LinearGradient
              colors={[item.tint, 'transparent']}
              start={{ x: 1, y: 0 }}
              end={{ x: 0.35, y: 0.7 }}
              style={styles.cornerTint}
              pointerEvents="none"
            />

            <View style={styles.cardHeader}>
              <Animated.View style={[styles.iconShell, iconAnimStyle]}>
                <LinearGradient
                  colors={item.gradient}
                  style={styles.iconBox}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name={item.icon} size={22} color="#FFF" />
                </LinearGradient>
              </Animated.View>

              <View style={styles.headerText}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <View style={styles.statusRow}>
                  <View style={styles.dotWrapper}>
                    <View style={[styles.statusDotCore, { backgroundColor: accent }]} />
                    <Animated.View
                      style={[styles.statusDotRing, { borderColor: accent }, ringAnimStyle]}
                    />
                  </View>
                  <Text style={[styles.statusText, { color: THEME_COLORS.textMuted }]}>
                    {isLoading
                      ? 'Sending…'
                      : isAllSchool
                      ? 'Whole school'
                      : `${selectedClassIds.length} class${selectedClassIds.length > 1 ? 'es' : ''} selected`}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.cardDesc}>{item.description}</Text>

            <View style={styles.classSection}>
              <View style={styles.classSectionHead}>
                <Text style={styles.classSectionLabel}>WHO RECEIVES THIS</Text>
                {!isAllSchool && (
                  <Pressable
                    onPress={() => onSelectAllClasses(item.id)}
                    hitSlop={12}
                    style={styles.clearBtn}
                  >
                    <Ionicons name="refresh-outline" size={14} color={accent} />
                    <Text style={[styles.clearBtnText, { color: accent }]}>Reset</Text>
                  </Pressable>
                )}
              </View>

              {targetsLoading ? (
                <View style={styles.targetsLoading}>
                  <LogoLoader color={accent} size={18} />
                </View>
              ) : (
                <View style={styles.classChipRow}>
                  <Pressable
                    style={[
                      styles.classChip,
                      isAllSchool && {
                        backgroundColor: item.tint,
                        borderColor: accent + '55',
                      },
                    ]}
                    onPress={() => onSelectAllClasses(item.id)}
                  >
                    <Text
                      style={[
                        styles.classChipText,
                        isAllSchool && { color: accent, fontWeight: '700' },
                      ]}
                    >
                      Whole school
                    </Text>
                  </Pressable>

                  {classTargets.map((cls) => {
                    const selected = selectedClassIds.includes(cls.class_id);
                    return (
                      <Pressable
                        key={cls.class_id}
                        style={[
                          styles.classChip,
                          selected && {
                            backgroundColor: item.tint,
                            borderColor: accent + '55',
                          },
                        ]}
                        onPress={() => onToggleClass(item.id, cls.class_id)}
                      >
                        <Text
                          style={[
                            styles.classChipText,
                            selected && { color: accent, fontWeight: '700' },
                          ]}
                        >
                          {cls.class_name}
                        </Text>
                        <View style={[styles.countBadge, selected && { backgroundColor: accent + '22' }]}>
                          <Text style={[styles.classChipCount, selected && { color: accent }]}>
                            {cls.recipient_count}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.cardFooter}>
              <View style={styles.recipientPill}>
                <Ionicons name="people-outline" size={15} color={THEME_COLORS.textMuted} />
                <Text style={styles.recipientPillText}>
                  Reaches{' '}
                  <Text style={styles.recipientPillNumber}>
                    {selectedRecipientEstimate.toLocaleString()}
                  </Text>{' '}
                  parent{selectedRecipientEstimate === 1 ? '' : 's'}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  {
                    backgroundColor: accent,
                    shadowColor: accent,
                  },
                  isLoading && styles.sendBtnLoading,
                ]}
                onPress={() => onPress(item)}
                disabled={loadingType !== null}
                activeOpacity={0.9}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
              >
                {isLoading ? (
                  <LogoLoader color="#FFF" size={16} />
                ) : (
                  <>
                    <Text style={styles.sendBtnText}>Send</Text>
                    <Ionicons name="arrow-forward" size={14} color="#FFF" style={{ marginLeft: 5 }} />
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.cardBorder} />
          </View>
        </Animated.View>
    </Animated.View>
  );
}

function ConfirmBroadcastSheet({
  visible,
  channel,
  isAllSchool,
  selectedClassNames,
  estimate,
  feePaidRange,
  onCancel,
  onConfirm,
  styles,
}: {
  visible: boolean;
  channel: TriggerCard | null;
  isAllSchool: boolean;
  selectedClassNames: string[];
  estimate: number;
  feePaidRange?: FeePaidRange;
  onCancel: () => void;
  onConfirm: () => void;
  styles: ReturnType<typeof getStyles>;
}) {
  if (!channel) return null;
  const accent = channel.accent;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.sheetOverlay} onPress={onCancel}>
        <Animated.View
          entering={SlideInUp.springify().damping(22).mass(0.9)}
          style={styles.sheetCard}
        >
          <Pressable onPress={() => {}}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <LinearGradient
                colors={channel.gradient}
                style={styles.sheetIcon}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name={channel.icon} size={22} color="#FFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Send this notification?</Text>
                <Text style={styles.sheetSub}>Parents get this on their phones right away.</Text>
              </View>
            </View>

            <View style={styles.sheetTargetBox}>
              <View style={styles.sheetTargetRow}>
                <Text style={styles.sheetTargetLabel}>Audience</Text>
                <Text style={styles.sheetTargetValue}>
                  {isAllSchool ? 'Whole school' : 'Selected classes'}
                </Text>
              </View>
              {!isAllSchool && (
                <View style={styles.sheetClassList}>
                  {selectedClassNames.map((name) => (
                    <View
                      key={name}
                      style={[styles.sheetClassPill, { backgroundColor: channel.tint, borderColor: accent + '33' }]}
                    >
                      <Text style={[styles.sheetClassPillText, { color: accent }]}>{name}</Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.sheetDivider} />
              {channel.id === 'FEE_REMINDER' && feePaidRange && (
                <>
                  <View style={styles.sheetTargetRow}>
                    <Text style={styles.sheetTargetLabel}>Already paid</Text>
                    <Text style={styles.sheetTargetValue}>
                      {feePaidRange.min}%–{feePaidRange.max}%
                    </Text>
                  </View>
                  <View style={styles.sheetDivider} />
                </>
              )}
              <View style={styles.sheetTargetRow}>
                <Text style={styles.sheetTargetLabel}>Estimated reach</Text>
                <Text style={[styles.sheetReach, { color: accent }]}>
                  {estimate.toLocaleString()} parent{estimate === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetCancelBtn} onPress={onCancel}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetConfirmBtn, { backgroundColor: accent, shadowColor: accent }]}
                onPress={onConfirm}
                activeOpacity={0.9}
              >
                <Text style={styles.sheetConfirmText}>Send now</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function DeliveryStatusModal({
  visible,
  onClose,
  onRetry,
  status,
  channel,
  retrying,
  pollingWarning,
  styles,
  THEME_COLORS,
}: {
  visible: boolean;
  onClose: () => void;
  onRetry: () => void;
  status: BroadcastStatus | null;
  channel: TriggerCard | null;
  retrying: boolean;
  pollingWarning: string | null;
  styles: ReturnType<typeof getStyles>;
  THEME_COLORS: any;
}) {
  if (!status || !channel) return null;

  const accent = channel.accent;
  const isProcessing = status.status === 'processing';
  const sent = status.sent_count ?? 0;
  const failed = status.failure_count ?? 0;
  const noDevice = status.no_token_count ?? 0;
  const total = status.total_targets ?? 0;
  const accounted = sent + failed + noDevice;
  const remaining = status.remaining_count ?? Math.max(total - accounted, 0);
  const progressRatio =
    total > 0 ? Math.min(accounted / total, 1) : isProcessing ? 0 : 1;
  const progressPercent = `${Math.round(progressRatio * 100)}%` as `${number}%`;
  const successRate = accounted > 0 ? Math.round((sent / accounted) * 100) : 0;
  // Recoverable = confirmed-failed plus anyone the server never got to (a crash
  // or redeploy mid-send leaves them un-attempted; the batch reaper flips such a
  // broadcast to 'failed'). Retry re-sends to everyone not confirmed delivered.
  const isTerminal = status.status === 'completed' || status.status === 'failed';
  const resendCount = failed + (status.status === 'failed' ? remaining : 0);
  const canRetry = isTerminal && resendCount > 0;
  const allClean = status.status === 'completed' && failed === 0 && noDevice === 0;
  const failureBreakdown = summarizeFailures(status.failed_recipients);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Animated.View
          entering={FadeInDown.springify().damping(20).mass(0.9)}
          style={styles.modalCard}
        >
          <View style={styles.modalHeader}>
            <LinearGradient
              colors={channel.gradient}
              style={styles.modalIcon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name={channel.icon} size={18} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{channel.title}</Text>
              <Text style={styles.modalSubtitle}>
                {isProcessing ? 'Sending…' : 'Delivery report'}
              </Text>
            </View>
          </View>

          {isProcessing ? (
            <View style={styles.modalLoadingRow}>
              <LogoLoader color={accent} size={32} />
              <View style={styles.liveCounterBox}>
                <Text style={[styles.liveCounterNumber, { color: accent }]}>
                  {remaining.toLocaleString()}
                </Text>
                <Text style={styles.liveCounterLabel}>
                  {remaining === 1 ? 'device needs' : 'devices need'} to reach
                </Text>
              </View>
              <View style={styles.liveProgressTrack}>
                <View
                  style={[
                    styles.liveProgressFill,
                    { width: progressPercent, backgroundColor: accent },
                  ]}
                />
              </View>
              <Text style={styles.modalProcessingText}>
                Reached {Math.min(accounted, total).toLocaleString()} of{' '}
                {total.toLocaleString()} target device{total === 1 ? '' : 's'}…
              </Text>
              <Text style={styles.modalProcessingHint}>
                {pollingWarning ||
                  'Backend progress updates after each broadcast chunk. Keep this open to watch it count down.'}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ maxHeight: 420 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.resultHero}>
                {allClean ? (
                  <View style={[styles.resultBadge, { backgroundColor: STATUS_COLORS.sent + '14', borderColor: STATUS_COLORS.sent + '33' }]}>
                    <Ionicons name="checkmark-circle" size={15} color={STATUS_COLORS.sent} />
                    <Text style={[styles.resultBadgeText, { color: STATUS_COLORS.sent }]}>
                      All delivered
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.resultBadge, { backgroundColor: THEME_COLORS.surfaceHighlight, borderColor: THEME_COLORS.border }]}>
                    <Text style={[styles.resultBadgeText, { color: THEME_COLORS.text }]}>
                      {successRate}% delivered
                    </Text>
                  </View>
                )}
                <View style={styles.resultNumbers}>
                  <Text style={styles.resultBig}>{sent.toLocaleString()}</Text>
                  <Text style={styles.resultBigLabel}>
                    of {total.toLocaleString()} sent
                  </Text>
                </View>
              </View>

              {status.status === 'failed' && (
                <View style={styles.interruptedNote}>
                  <Ionicons name="warning-outline" size={15} color={STATUS_COLORS.noDevice} />
                  <Text style={styles.interruptedNoteText}>
                    This send was interrupted before it finished. {resendCount} parent
                    {resendCount === 1 ? '' : 's'} still need it — tap Resend to deliver to
                    everyone who hasn’t received it yet.
                  </Text>
                </View>
              )}

              <View style={styles.deliveryBar}>
                {sent > 0 && <View style={{ flex: sent, backgroundColor: STATUS_COLORS.sent }} />}
                {failed > 0 && <View style={{ flex: failed, backgroundColor: STATUS_COLORS.failed }} />}
                {noDevice > 0 && <View style={{ flex: noDevice, backgroundColor: STATUS_COLORS.noDevice }} />}
                {accounted === 0 && <View style={{ flex: 1, backgroundColor: THEME_COLORS.border }} />}
              </View>

              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: STATUS_COLORS.sent }]} />
                  <Text style={styles.legendCount}>{sent}</Text>
                  <Text style={styles.legendLabel}>Delivered</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: STATUS_COLORS.failed }]} />
                  <Text style={styles.legendCount}>{failed}</Text>
                  <Text style={styles.legendLabel}>Failed</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: STATUS_COLORS.noDevice }]} />
                  <Text style={styles.legendCount}>{noDevice}</Text>
                  <Text style={styles.legendLabel}>No app yet</Text>
                </View>
              </View>

              {noDevice > 0 && (
                <Text style={styles.legendCaption}>
                  “No app yet” means these parents have accounts but haven’t installed or signed in to the app, so they can’t get push notifications.
                </Text>
              )}

              {failureBreakdown.length > 0 && (
                <View style={styles.failBox}>
                  <Text style={styles.failBoxTitle}>WHY SOME FAILED</Text>
                  {failureBreakdown.map((f) => (
                    <View key={f.reason} style={styles.failRow}>
                      <View style={styles.failReasonWrap}>
                        <View style={[styles.failDot, { backgroundColor: STATUS_COLORS.failed }]} />
                        <Text style={styles.failReason}>{f.reason}</Text>
                      </View>
                      <Text style={styles.failCount}>{f.count}</Text>
                    </View>
                  ))}
                </View>
              )}

              {status.message ? (
                <Text style={styles.modalMessage}>{status.message}</Text>
              ) : null}
            </ScrollView>
          )}

          <View style={styles.modalActions}>
            {canRetry && (
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalRetryBtn]}
                onPress={onRetry}
                disabled={retrying}
                activeOpacity={0.9}
              >
                {retrying ? (
                  <LogoLoader color="#FFF" size={16} />
                ) : (
                  <>
                    <Ionicons name="refresh" size={14} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.modalRetryText}>
                      {status.status === 'failed'
                        ? `Resend to ${resendCount}`
                        : `Resend failed (${resendCount})`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.modalBtn, styles.modalCloseBtn, !canRetry && { flex: 1 }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCloseText}>{allClean ? 'Done' : 'Close'}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default function NotificationsTriggerPage() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const scrollY = useSharedValue(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep portrait tablets and foldables in the safer phone flow. The split
  // composer starts only when both panels have enough room for 48dp targets.
  const isWideScreen = windowWidth >= 900;
  const horizontalPad = isWideScreen ? 32 : windowWidth >= 600 ? 24 : 16;
  const contentWidth = Math.max(windowWidth - horizontalPad * 2, 280);
  const scrollPaddingTop = insets.top + (isWideScreen ? 148 : 130);

  const THEME_COLORS = useMemo(() => ({
    background: isDark ? '#10131C' : '#EEF2F8',
    gradientEnd: isDark ? '#090B11' : '#F7F9FD',
    surface: isDark ? '#181C28' : '#F5F7FB',
    surfaceHighlight: isDark ? '#121620' : '#E9EDF5',
    text: isDark ? '#F1F5F9' : '#0B1220',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    textFaint: isDark ? '#64748B' : '#94A3B8',
    border: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.82)',
    borderStrong: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(107,122,153,0.18)',
  }), [isDark]);

  const styles = useMemo(
    () => getStyles(THEME_COLORS, isDark, isWideScreen, horizontalPad, scrollPaddingTop),
    [THEME_COLORS, isDark, isWideScreen, horizontalPad, scrollPaddingTop]
  );

  const [loadingType, setLoadingType] = useState<TriggerType | null>(null);
  const [selectedType, setSelectedType] = useState<TriggerType>('FEE_REMINDER');
  const [retrying, setRetrying] = useState(false);
  const [classTargetsByChannel, setClassTargetsByChannel] = useState<Record<string, ClassTarget[]>>({});
  const [allSchoolCountByChannel, setAllSchoolCountByChannel] = useState<Record<string, number>>({});
  const [targetsLoadingByChannel, setTargetsLoadingByChannel] = useState<Record<string, boolean>>({});
  const [selectedClassesByChannel, setSelectedClassesByChannel] = useState<Record<string, string[]>>({});
  const [notificationSettings, setNotificationSettings] = useState<NotificationSetting[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [updatingSettingId, setUpdatingSettingId] = useState<string | null>(null);
  const [feePaidRange, setFeePaidRange] = useState<FeePaidRange>({ min: 0, max: 100 });
  const [feeMinInput, setFeeMinInput] = useState('0');
  const [feeMaxInput, setFeeMaxInput] = useState('100');

  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [activeStatus, setActiveStatus] = useState<BroadcastStatus | null>(null);
  const [activeChannel, setActiveChannel] = useState<TriggerCard | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [pollingWarning, setPollingWarning] = useState<string | null>(null);

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmChannel, setConfirmChannel] = useState<TriggerCard | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<NotificationWorkspaceTab>('send');

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const heroAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 100], [1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(scrollY.value, [0, 100], [0, -12], Extrapolation.CLAMP) },
    ],
  }));

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPollTimer(), [clearPollTimer]);

  const fetchClassTargets = useCallback(async (
    channel: TriggerType,
    paidRange: FeePaidRange = { min: 0, max: 100 }
  ) => {
    setTargetsLoadingByChannel((prev) => ({ ...prev, [channel]: true }));
    try {
      const rangeQuery = channel === 'FEE_REMINDER'
        ? `&fee_paid_min_percent=${paidRange.min}&fee_paid_max_percent=${paidRange.max}`
        : '';
      const res = await api.get<ClassTargetsResponse>(
        `/admin/notifications/classes/targets?type=${encodeURIComponent(channel)}${rangeQuery}`
      );
      setClassTargetsByChannel((prev) => ({ ...prev, [channel]: res.classes || [] }));
      setAllSchoolCountByChannel((prev) => ({
        ...prev,
        [channel]: res.all_school_recipient_count ?? 0,
      }));
    } catch {
      setClassTargetsByChannel((prev) => ({ ...prev, [channel]: [] }));
      setAllSchoolCountByChannel((prev) => ({ ...prev, [channel]: 0 }));
    } finally {
      setTargetsLoadingByChannel((prev) => ({ ...prev, [channel]: false }));
    }
  }, []);

  useEffect(() => {
    if (
      selectedType !== 'FEE_REMINDER' &&
      !classTargetsByChannel[selectedType] &&
      !targetsLoadingByChannel[selectedType]
    ) {
      fetchClassTargets(selectedType, feePaidRange);
    }
  }, [selectedType, classTargetsByChannel, targetsLoadingByChannel, fetchClassTargets, feePaidRange]);

  useEffect(() => {
    if (selectedType === 'FEE_REMINDER') fetchClassTargets(selectedType, feePaidRange);
  }, [selectedType, feePaidRange, fetchClassTargets]);

  const fetchNotificationSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const response = await api.get<NotificationSettingsResponse>('/admin/notifications/settings');
      setNotificationSettings(response.settings || []);
    } catch (error: any) {
      alertCompat('Could not load controls', error.message || 'Notification controls are unavailable.');
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotificationSettings();
  }, [fetchNotificationSettings]);

  const handleToggleNotificationSetting = useCallback(async (
    setting: NotificationSetting,
    enabled: boolean
  ) => {
    if (updatingSettingId) return;
    setUpdatingSettingId(setting.id);
    setNotificationSettings((current) => current.map((item) => (
      item.id === setting.id ? { ...item, enabled } : item
    )));
    try {
      const response = await api.put<NotificationSettingsResponse>(
        `/admin/notifications/settings/${encodeURIComponent(setting.id)}`,
        { enabled }
      );
      setNotificationSettings(response.settings || []);
      const affectedTypes = TRIGGERS
        .filter((trigger) => TRIGGER_SETTING_CATEGORY[trigger.id] === setting.id)
        .map((trigger) => trigger.id);
      setClassTargetsByChannel((current) => {
        const next = { ...current };
        affectedTypes.forEach((type) => delete next[type]);
        return next;
      });
      if (selectedType === 'FEE_REMINDER' && affectedTypes.includes(selectedType)) {
        fetchClassTargets(selectedType, feePaidRange);
      }
    } catch (error: any) {
      setNotificationSettings((current) => current.map((item) => (
        item.id === setting.id ? { ...item, enabled: setting.enabled } : item
      )));
      alertCompat('Update failed', error.message || 'Could not update this notification control.');
    } finally {
      setUpdatingSettingId(null);
    }
  }, [updatingSettingId, selectedType, fetchClassTargets, feePaidRange]);

  const applyFeePaidRange = useCallback(() => {
    const min = Number(feeMinInput);
    const max = Number(feeMaxInput);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 100 || min > max) {
      alertCompat('Invalid range', 'Enter percentages from 0 to 100. Minimum cannot exceed maximum.');
      return;
    }
    setFeePaidRange({ min, max });
  }, [feeMinInput, feeMaxInput]);

  const selectFeeRangePreset = useCallback((range: FeePaidRange) => {
    setFeeMinInput(String(range.min));
    setFeeMaxInput(String(range.max));
    setFeePaidRange(range);
  }, []);

  const pollBroadcastStatus = useCallback(
    (batchId: string) => {
      clearPollTimer();
      let consecutiveErrors = 0;

      const poll = async () => {
        try {
          const status = await api.get<BroadcastStatus>(
            `/admin/notifications/broadcast/${batchId}`,
            undefined,
            { silent: true }
          );
          consecutiveErrors = 0;
          setPollingWarning(null);
          setActiveStatus(status);
          if (status.status !== 'processing') {
            clearPollTimer();
            setLoadingType(null);
            if (status.status === 'completed' && (status.failure_count ?? 0) === 0) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            return;
          }
        } catch {
          // Tolerate transient blips (auth refresh, brief 5xx, offline moment).
          // Only give up after several failures in a row — one bad poll must not
          // collapse an otherwise-healthy live view.
          consecutiveErrors += 1;
          if (consecutiveErrors >= POLL_MAX_CONSECUTIVE_ERRORS) {
            consecutiveErrors = POLL_MAX_CONSECUTIVE_ERRORS;
            setPollingWarning('Connection interrupted. Retrying automatically…');
          }
        }
      };

      poll();
      pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    },
    [clearPollTimer]
  );

  const openStatusModal = useCallback((channel: TriggerCard, result: BroadcastResult) => {
    setPollingWarning(null);
    setActiveChannel(channel);
    setActiveBatchId(result.batch_id);
    setActiveStatus({
      ...result,
      sent_count: result.sent_count ?? 0,
      failure_count: result.failure_count ?? 0,
      no_token_count: result.no_token_count ?? 0,
      remaining_count:
        result.remaining_count ??
        Math.max(
          (result.total_targets ?? 0) -
            (result.sent_count ?? 0) -
            (result.failure_count ?? 0) -
            (result.no_token_count ?? 0),
          0
        ),
    });
    setStatusModalVisible(true);
  }, []);

  const submitBroadcast = useCallback(
    async (type: TriggerType, classIds: string[]) => {
      Haptics.selectionAsync();
      setLoadingType(type);
      try {
        const payload: {
          type: TriggerType;
          class_ids?: string[];
          idempotency_key: string;
          fee_paid_min_percent?: number;
          fee_paid_max_percent?: number;
        } = {
          type,
          idempotency_key: makeIdempotencyKey(),
        };
        if (classIds.length > 0) payload.class_ids = classIds;
        if (type === 'FEE_REMINDER') {
          payload.fee_paid_min_percent = feePaidRange.min;
          payload.fee_paid_max_percent = feePaidRange.max;
        }

        const result = await api.post<BroadcastResult>('/admin/notifications/broadcast', payload);
        const channel = TRIGGERS.find((t) => t.id === type)!;
        openStatusModal(channel, result);

        if (result.mode === 'async' && result.status === 'processing') {
          pollBroadcastStatus(result.batch_id);
        } else {
          setLoadingType(null);
          if (result.status === 'completed' && (result.failure_count ?? 0) === 0) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }
      } catch (error: any) {
        setLoadingType(null);
        alertCompat(
          'Failed',
          error.message || error.response?.data?.error || 'Failed to send notification'
        );
      }
    },
    [openStatusModal, pollBroadcastStatus, feePaidRange]
  );

  const handleFireTrigger = useCallback(
    (item: TriggerCard) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setConfirmChannel(item);
      setConfirmVisible(true);
    },
    []
  );

  const handleConfirmSend = useCallback(() => {
    if (!confirmChannel) return;
    const selected = selectedClassesByChannel[confirmChannel.id] || [];
    setConfirmVisible(false);
    submitBroadcast(confirmChannel.id, selected);
  }, [confirmChannel, selectedClassesByChannel, submitBroadcast]);

  const handleToggleClass = useCallback((channel: TriggerType, classId: string) => {
    Haptics.selectionAsync();
    setSelectedClassesByChannel((prev) => {
      const current = prev[channel] || [];
      const next = current.includes(classId)
        ? current.filter((id) => id !== classId)
        : [...current, classId];
      return { ...prev, [channel]: next };
    });
  }, []);

  const handleSelectAllClasses = useCallback((channel: TriggerType) => {
    Haptics.selectionAsync();
    setSelectedClassesByChannel((prev) => ({ ...prev, [channel]: [] }));
  }, []);

  const handleRetry = useCallback(async () => {
    if (!activeBatchId || !activeChannel) return;
    setPollingWarning(null);
    setRetrying(true);
    try {
      const result = await api.post<BroadcastResult>(
        `/admin/notifications/broadcast/${activeBatchId}/retry`,
        {}
      );
      setActiveBatchId(result.batch_id);
      setActiveStatus({
        ...result,
        sent_count: result.sent_count ?? 0,
        failure_count: result.failure_count ?? 0,
        no_token_count: result.no_token_count ?? 0,
        remaining_count:
          result.remaining_count ??
          Math.max(
            (result.total_targets ?? 0) -
              (result.sent_count ?? 0) -
              (result.failure_count ?? 0) -
              (result.no_token_count ?? 0),
            0
          ),
      });
      // A large recovery run may come back still processing — keep the live
      // view counting down instead of freezing on a partial report.
      if (result.status === 'processing') {
        pollBroadcastStatus(result.batch_id);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error: any) {
      alertCompat('Retry failed', error.message || error.response?.data?.error || 'Could not retry');
    } finally {
      setRetrying(false);
    }
  }, [activeBatchId, activeChannel, pollBroadcastStatus]);

  const closeStatusModal = useCallback(() => {
    clearPollTimer();
    setStatusModalVisible(false);
    setLoadingType(null);
    setPollingWarning(null);
  }, [clearPollTimer]);

  const confirmSelected = confirmChannel ? selectedClassesByChannel[confirmChannel.id] || [] : [];
  const confirmIsAllSchool = confirmSelected.length === 0;
  const confirmClassNames = confirmChannel
    ? (classTargetsByChannel[confirmChannel.id] || [])
        .filter((c) => confirmSelected.includes(c.class_id))
        .map((c) => c.class_name)
    : [];
  const confirmEstimate = confirmChannel
    ? confirmIsAllSchool
      ? allSchoolCountByChannel[confirmChannel.id] ?? 0
      : (classTargetsByChannel[confirmChannel.id] || [])
          .filter((c) => confirmSelected.includes(c.class_id))
          .reduce((sum, c) => sum + c.recipient_count, 0)
    : 0;

  const selectedTrigger = TRIGGERS.find((trigger) => trigger.id === selectedType)!;
  const selectedNotificationEnabled = notificationSettings.find(
    (setting) => setting.id === TRIGGER_SETTING_CATEGORY[selectedType]
  )?.enabled !== false;
  const selectedClassIds = selectedClassesByChannel[selectedType] || [];
  const selectedTargets = classTargetsByChannel[selectedType] || [];
  const isWholeSchool = selectedClassIds.length === 0;
  const selectedEstimate = isWholeSchool
    ? allSchoolCountByChannel[selectedType] ?? 0
    : selectedTargets
        .filter((target) => selectedClassIds.includes(target.class_id))
        .reduce((sum, target) => sum + target.recipient_count, 0);

  return (
    <View style={styles.container}>
      <AdminHeader
        title="Notifications"
        showBackButton
        showNotification={false}
        scrollY={workspaceTab === 'send' ? scrollY : undefined}
      />

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={[THEME_COLORS.background, THEME_COLORS.gradientEnd]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {workspaceTab === 'inbox' && (
        <View style={[styles.inboxPane, { paddingHorizontal: horizontalPad }]}>
          <AdminNotificationSwitcher value={workspaceTab} onChange={setWorkspaceTab} />
          <Text style={styles.headerTitle}>Your inbox</Text>
          <Text style={styles.headerSubtitle}>
            Alerts for this admin account. Switch to Send when you want to notify parents.
          </Text>
          <NotificationInboxList onSendPress={() => setWorkspaceTab('send')} />
        </View>
      )}

      {workspaceTab === 'send' && (
        <Animated.ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        >
        <ResponsiveCard maxWidth={contentWidth} fullWidth>
          <Animated.View style={heroAnimStyle}>
            <Animated.View entering={FadeIn.delay(50)} style={styles.heroSwitcher}>
              <AdminNotificationSwitcher value={workspaceTab} onChange={setWorkspaceTab} />
            </Animated.View>

            <Animated.View entering={FadeIn.delay(70)} style={styles.heroBadge}>
              <View style={styles.livePulseDot} />
              <Text style={styles.heroBadgeText}>PARENT NOTIFICATIONS</Text>
            </Animated.View>

            <Animated.Text entering={FadeInDown.delay(100).springify()} style={styles.headerTitle}>
              Notify parents
            </Animated.Text>

            <Animated.Text entering={FadeInDown.delay(150).springify()} style={styles.headerSubtitle}>
              Choose a message and its audience. You’ll review the exact reach before anything is sent.
            </Animated.Text>

            <Animated.View entering={FadeIn.delay(200)} style={styles.stepsRow}>
              {['Choose message', 'Select audience', 'Review & send'].map((label, index) => (
                <View key={label} style={styles.stepItem}>
                  <View style={[styles.stepNumber, index === 0 && { backgroundColor: selectedTrigger.accent }]}>
                    <Text style={[styles.stepNumberText, index === 0 && { color: '#FFF' }]}>{index + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{label}</Text>
                  {index < 2 && <View style={styles.stepLine} />}
                </View>
              ))}
            </Animated.View>
          </Animated.View>

          <View style={[styles.composer, isWideScreen && styles.composerWide]}>
            <View style={[styles.typePanel, isWideScreen && styles.typePanelWide]}>
              <Text style={styles.panelEyebrow}>1 · MESSAGE</Text>
              <Text style={styles.panelTitle}>What do you want to send?</Text>
              <View style={styles.typeList}>
                {TRIGGERS.map((item) => {
                  const selected = item.id === selectedType;
                  const typeEnabled = notificationSettings.find(
                    (setting) => setting.id === TRIGGER_SETTING_CATEGORY[item.id]
                  )?.enabled !== false;
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${item.title}. ${item.description}`}
                      android_ripple={{ color: item.accent + '18', borderless: false }}
                      onPress={() => { Haptics.selectionAsync(); setSelectedType(item.id); }}
                      style={({ pressed }) => [
                        styles.typeOption,
                        selected && styles.claySelected,
                        selected && { borderColor: item.accent + '70', backgroundColor: item.tint },
                        pressed && styles.clayPressed,
                      ]}
                    >
                      <LinearGradient colors={item.gradient} style={styles.typeIcon}>
                        <Ionicons name={item.icon} size={19} color="#FFF" />
                      </LinearGradient>
                      <View style={styles.typeCopy}>
                        <View style={styles.typeTitleRow}>
                          <Text style={styles.typeTitle}>{item.title}</Text>
                          {!typeEnabled && <Text style={styles.offBadge}>OFF</Text>}
                        </View>
                        <Text numberOfLines={isWideScreen ? 1 : 2} style={styles.typeDescription}>{item.description}</Text>
                      </View>
                      <View style={[styles.radio, selected && { borderColor: item.accent }]}>
                        {selected && <View style={[styles.radioDot, { backgroundColor: item.accent }]} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[styles.audiencePanel, isWideScreen && styles.audiencePanelWide]}>
              <Text style={styles.panelEyebrow}>2 · AUDIENCE</Text>
              <View style={styles.audienceHeadingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.panelTitle}>Who should receive it?</Text>
                  <Text style={styles.panelHint}>Choose the whole school or one or more classes.</Text>
                </View>
                {!isWholeSchool && (
                  <Pressable onPress={() => handleSelectAllClasses(selectedType)} style={styles.resetAudience}>
                    <Text style={[styles.resetAudienceText, { color: selectedTrigger.accent }]}>Reset</Text>
                  </Pressable>
                )}
              </View>

              {selectedType === 'FEE_REMINDER' && (
                <View style={styles.feeRangeCard}>
                  <View style={styles.feeRangeHeading}>
                    <View style={[styles.reviewIcon, { backgroundColor: selectedTrigger.tint }]}>
                      <Ionicons name="options-outline" size={20} color={selectedTrigger.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.feeRangeTitle}>Filter by percentage already paid</Text>
                      <Text style={styles.panelHint}>Only students in this range who still have a balance will receive a reminder.</Text>
                    </View>
                  </View>
                  <View style={styles.feePresetRow}>
                    {FEE_RANGE_PRESETS.map((preset) => {
                      const active = preset.range.min === feePaidRange.min && preset.range.max === feePaidRange.max;
                      return (
                        <Pressable
                          key={preset.label}
                          onPress={() => selectFeeRangePreset(preset.range)}
                          style={[
                            styles.feePreset,
                            active && { borderColor: selectedTrigger.accent, backgroundColor: selectedTrigger.tint },
                          ]}
                        >
                          <Text style={[styles.feePresetText, active && { color: selectedTrigger.accent }]}>{preset.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.customRangeRow}>
                    <View style={styles.percentInputWrap}>
                      <TextInput
                        value={feeMinInput}
                        onChangeText={setFeeMinInput}
                        keyboardType="decimal-pad"
                        inputMode="decimal"
                        maxLength={6}
                        style={styles.percentInput}
                        accessibilityLabel="Minimum fee percentage already paid"
                      />
                      <Text style={styles.percentSuffix}>%</Text>
                    </View>
                    <Text style={styles.rangeDash}>to</Text>
                    <View style={styles.percentInputWrap}>
                      <TextInput
                        value={feeMaxInput}
                        onChangeText={setFeeMaxInput}
                        keyboardType="decimal-pad"
                        inputMode="decimal"
                        maxLength={6}
                        style={styles.percentInput}
                        accessibilityLabel="Maximum fee percentage already paid"
                      />
                      <Text style={styles.percentSuffix}>%</Text>
                    </View>
                    <TouchableOpacity style={[styles.applyRangeBtn, { backgroundColor: selectedTrigger.accent }]} onPress={applyFeePaidRange}>
                      <Text style={styles.applyRangeText}>Apply</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {targetsLoadingByChannel[selectedType] ? (
                <View style={styles.audienceLoading}><LogoLoader color={selectedTrigger.accent} size={26} /></View>
              ) : (
                <View style={styles.audienceGrid}>
                  <Pressable
                    onPress={() => handleSelectAllClasses(selectedType)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isWholeSchool }}
                    android_ripple={{ color: selectedTrigger.accent + '18' }}
                    style={({ pressed }) => [styles.audienceOption, isWholeSchool && styles.claySelected, isWholeSchool && { borderColor: selectedTrigger.accent, backgroundColor: selectedTrigger.tint }, pressed && styles.clayPressed]}
                  >
                    <Ionicons name="school-outline" size={18} color={isWholeSchool ? selectedTrigger.accent : THEME_COLORS.textMuted} />
                    <View style={{ flex: 1 }}><Text style={styles.audienceName}>Whole school</Text><Text style={styles.audienceCount}>{(allSchoolCountByChannel[selectedType] ?? 0).toLocaleString()} parents</Text></View>
                    {isWholeSchool && <Ionicons name="checkmark-circle" size={20} color={selectedTrigger.accent} />}
                  </Pressable>
                  {selectedTargets.map((target) => {
                    const selected = selectedClassIds.includes(target.class_id);
                    return (
                      <Pressable key={target.class_id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} android_ripple={{ color: selectedTrigger.accent + '18' }} onPress={() => handleToggleClass(selectedType, target.class_id)} style={({ pressed }) => [styles.audienceOption, selected && styles.claySelected, selected && { borderColor: selectedTrigger.accent, backgroundColor: selectedTrigger.tint }, pressed && styles.clayPressed]}>
                        <Ionicons name="people-outline" size={18} color={selected ? selectedTrigger.accent : THEME_COLORS.textMuted} />
                        <View style={{ flex: 1 }}><Text style={styles.audienceName}>{target.class_name}</Text><Text style={styles.audienceCount}>{target.recipient_count} parents</Text></View>
                        {selected && <Ionicons name="checkmark-circle" size={20} color={selectedTrigger.accent} />}
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={styles.reviewBar}>
                <View style={styles.reviewReach}>
                  <View style={[styles.reviewIcon, { backgroundColor: selectedTrigger.tint }]}><Ionicons name="notifications-outline" size={20} color={selectedTrigger.accent} /></View>
                  <View><Text style={styles.reviewLabel}>ESTIMATED REACH</Text><Text style={styles.reviewCount}>{selectedEstimate.toLocaleString()} parent{selectedEstimate === 1 ? '' : 's'}</Text></View>
                </View>
                <TouchableOpacity disabled={loadingType !== null || selectedEstimate === 0 || !selectedNotificationEnabled} onPress={() => handleFireTrigger(selectedTrigger)} style={[styles.primarySend, { backgroundColor: selectedTrigger.accent }, (loadingType !== null || selectedEstimate === 0 || !selectedNotificationEnabled) && styles.primarySendDisabled]}>
                  {loadingType === selectedType ? <LogoLoader color="#FFF" size={18} /> : <><Text style={styles.primarySendText}>Review & send</Text><Ionicons name="arrow-forward" size={17} color="#FFF" /></>}
                </TouchableOpacity>
              </View>
              {!selectedNotificationEnabled && (
                <Text style={styles.disabledNotice}>This notification is off. Enable it in Notification controls below before sending.</Text>
              )}
            </View>
          </View>
        </ResponsiveCard>

        <ResponsiveCard maxWidth={contentWidth} fullWidth>
          <View style={styles.controlsCard}>
            <View style={styles.controlsHeader}>
              <View style={styles.controlsHeaderIcon}>
                <Ionicons name="notifications-circle-outline" size={26} color="#4F46E5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.controlsTitle}>Notification controls</Text>
                <Text style={styles.controlsSubtitle}>Turn a category off to stop every automatic and manual notification of that type for this school.</Text>
              </View>
            </View>
            {settingsLoading ? (
              <View style={styles.settingsLoader}><LogoLoader color="#4F46E5" size={24} /></View>
            ) : (
              <View style={styles.settingsGrid}>
                {notificationSettings.map((setting) => (
                  <View key={setting.id} style={styles.settingRow}>
                    <View style={styles.settingIcon}>
                      <Ionicons name={setting.icon} size={19} color={setting.enabled ? '#4F46E5' : THEME_COLORS.textFaint} />
                    </View>
                    <View style={styles.settingCopy}>
                      <Text style={styles.settingTitle}>{setting.label}</Text>
                      <Text style={styles.settingDescription}>{setting.description}</Text>
                    </View>
                    <Switch
                      value={setting.enabled}
                      onValueChange={(enabled) => handleToggleNotificationSetting(setting, enabled)}
                      disabled={updatingSettingId !== null}
                      trackColor={{ false: THEME_COLORS.borderStrong, true: '#A5B4FC' }}
                      thumbColor={setting.enabled ? '#4F46E5' : '#94A3B8'}
                      accessibilityLabel={`${setting.label} notifications`}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        </ResponsiveCard>

          <View style={{ height: 120 }} />
        </Animated.ScrollView>
      )}

      <ConfirmBroadcastSheet
        visible={confirmVisible}
        channel={confirmChannel}
        isAllSchool={confirmIsAllSchool}
        selectedClassNames={confirmClassNames}
        estimate={confirmEstimate}
        feePaidRange={feePaidRange}
        onCancel={() => setConfirmVisible(false)}
        onConfirm={handleConfirmSend}
        styles={styles}
      />

      <DeliveryStatusModal
        visible={statusModalVisible}
        onClose={closeStatusModal}
        onRetry={handleRetry}
        status={activeStatus}
        channel={activeChannel}
        retrying={retrying}
        pollingWarning={pollingWarning}
        styles={styles}
        THEME_COLORS={THEME_COLORS}
      />
    </View>
  );
}

const getStyles = (
  THEME_COLORS: any,
  isDark: boolean,
  isWide = false,
  horizontalPad = 24,
  scrollPaddingTop = 130
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      width: '100%',
      backgroundColor: 'transparent',
    },
    inboxPane: {
      flex: 1,
      minHeight: 0,
      paddingTop: 16,
      zIndex: 1,
    },
    scrollContent: {
      paddingHorizontal: horizontalPad,
      paddingBottom: 24,
      paddingTop: scrollPaddingTop,
      width: '100%',
      alignSelf: 'stretch',
    },
    heroSwitcher: {
      marginBottom: 18,
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
    },
    livePulseDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#16A34A',
    },
    heroBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.6,
      color: THEME_COLORS.textMuted,
    },
    headerTitle: {
      fontSize: isWide ? 40 : 32,
      fontWeight: '900',
      color: THEME_COLORS.text,
      letterSpacing: -1,
      lineHeight: isWide ? 46 : 38,
      marginBottom: 10,
    },
    headerSubtitle: {
      fontSize: isWide ? 16 : 15,
      color: THEME_COLORS.textMuted,
      lineHeight: isWide ? 25 : 23,
      fontWeight: '400',
      marginBottom: isWide ? 30 : 24,
      maxWidth: isWide ? undefined : '96%',
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 24,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: THEME_COLORS.border,
    },
    dividerLabel: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.4,
      color: THEME_COLORS.textFaint,
    },
    stepsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 28,
      maxWidth: 700,
    },
    stepItem: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
    },
    stepNumber: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: THEME_COLORS.surfaceHighlight,
      borderWidth: 1,
      borderColor: THEME_COLORS.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    stepNumberText: { fontSize: 11, fontWeight: '800', color: THEME_COLORS.textMuted },
    stepText: { fontSize: isWide ? 12.5 : 10.5, fontWeight: '700', color: THEME_COLORS.textMuted, flexShrink: 1 },
    stepLine: { height: 1, backgroundColor: THEME_COLORS.borderStrong, flex: 1, marginHorizontal: isWide ? 14 : 7 },
    composer: {
      backgroundColor: THEME_COLORS.surface,
      borderRadius: isWide ? 30 : 26,
      borderWidth: isDark ? 1 : 2,
      borderColor: THEME_COLORS.border,
      overflow: 'hidden',
      shadowColor: isDark ? '#000' : '#74829E',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: isDark ? 0.4 : 0.2,
      shadowRadius: 28,
      elevation: Platform.OS === 'android' ? 10 : 0,
    },
    composerWide: { flexDirection: 'row', alignItems: 'stretch' },
    typePanel: { padding: isWide ? 28 : 18, backgroundColor: THEME_COLORS.surfaceHighlight },
    typePanelWide: { width: '42%', borderRightWidth: 1, borderRightColor: THEME_COLORS.border },
    audiencePanel: { padding: isWide ? 28 : 18, flex: 1, backgroundColor: THEME_COLORS.surface },
    audiencePanelWide: { minHeight: 610 },
    panelEyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.4, color: THEME_COLORS.textFaint, marginBottom: 8 },
    panelTitle: { fontSize: isWide ? 20 : 19, fontWeight: '900', color: THEME_COLORS.text, letterSpacing: -0.4 },
    panelHint: { fontSize: 13, lineHeight: 19, color: THEME_COLORS.textMuted, marginTop: 5 },
    typeList: { gap: 12, marginTop: 20 },
    typeOption: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1.5, borderColor: THEME_COLORS.border, backgroundColor: THEME_COLORS.surface, overflow: 'hidden', shadowColor: isDark ? '#000' : '#9AA7BF', shadowOffset: { width: 0, height: 5 }, shadowOpacity: isDark ? 0.25 : 0.16, shadowRadius: 10, elevation: Platform.OS === 'android' ? 3 : 0 },
    typeIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', elevation: Platform.OS === 'android' ? 4 : 0 },
    typeCopy: { flex: 1, minWidth: 0 },
    typeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    typeTitle: { fontSize: 14.5, fontWeight: '800', color: THEME_COLORS.text, marginBottom: 3 },
    offBadge: { fontSize: 9, fontWeight: '900', letterSpacing: 0.7, color: '#DC2626', backgroundColor: 'rgba(220,38,38,0.1)', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
    typeDescription: { fontSize: 11.5, lineHeight: 16.5, color: THEME_COLORS.textMuted },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: THEME_COLORS.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME_COLORS.surface },
    radioDot: { width: 10, height: 10, borderRadius: 5 },
    claySelected: { elevation: Platform.OS === 'android' ? 7 : 0, shadowOpacity: isDark ? 0.4 : 0.24, shadowRadius: 14, transform: [{ translateY: -1 }] },
    clayPressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
    audienceHeadingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    feeRangeCard: { marginTop: 18, borderRadius: 20, borderWidth: 1.5, borderColor: THEME_COLORS.border, backgroundColor: THEME_COLORS.surfaceHighlight, padding: 15 },
    feeRangeHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    feeRangeTitle: { fontSize: 14.5, fontWeight: '800', color: THEME_COLORS.text },
    feePresetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    feePreset: { borderRadius: 14, borderWidth: 1, borderColor: THEME_COLORS.borderStrong, backgroundColor: THEME_COLORS.surface, paddingHorizontal: 11, paddingVertical: 8 },
    feePresetText: { fontSize: 11.5, fontWeight: '700', color: THEME_COLORS.textMuted },
    customRangeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    percentInputWrap: { height: 44, minWidth: 86, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: THEME_COLORS.borderStrong, borderRadius: 14, backgroundColor: THEME_COLORS.surface, paddingHorizontal: 11 },
    percentInput: { minWidth: 44, flex: 1, color: THEME_COLORS.text, fontSize: 14, fontWeight: '700', paddingVertical: 0 },
    percentSuffix: { color: THEME_COLORS.textMuted, fontSize: 13, fontWeight: '700' },
    rangeDash: { color: THEME_COLORS.textMuted, fontSize: 12, fontWeight: '700' },
    applyRangeBtn: { height: 44, borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
    applyRangeText: { color: '#FFF', fontSize: 12.5, fontWeight: '800' },
    resetAudience: { paddingVertical: 6, paddingHorizontal: 8 },
    resetAudienceText: { fontSize: 12.5, fontWeight: '700' },
    audienceLoading: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
    audienceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 22, marginBottom: 24, alignContent: 'flex-start' },
    audienceOption: { width: isWide ? '48%' : '100%', minWidth: isWide ? 200 : undefined, flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15, minHeight: 68, borderRadius: 20, borderWidth: 1.5, borderColor: THEME_COLORS.border, backgroundColor: THEME_COLORS.surfaceHighlight, overflow: 'hidden', shadowColor: isDark ? '#000' : '#9AA7BF', shadowOffset: { width: 0, height: 5 }, shadowOpacity: isDark ? 0.25 : 0.15, shadowRadius: 10, elevation: Platform.OS === 'android' ? 3 : 0 },
    audienceName: { fontSize: 14, fontWeight: '800', color: THEME_COLORS.text },
    audienceCount: { fontSize: 11.5, color: THEME_COLORS.textMuted, marginTop: 2 },
    reviewBar: { marginTop: 'auto', padding: 16, borderRadius: 22, borderWidth: 1.5, borderColor: THEME_COLORS.border, backgroundColor: THEME_COLORS.surfaceHighlight, flexDirection: isWide ? 'row' : 'column', alignItems: isWide ? 'center' : 'stretch', justifyContent: 'space-between', gap: 16, shadowColor: isDark ? '#000' : '#A4B0C5', shadowOffset: { width: 0, height: 6 }, shadowOpacity: isDark ? 0.28 : 0.18, shadowRadius: 12, elevation: Platform.OS === 'android' ? 5 : 0 },
    reviewReach: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    reviewIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME_COLORS.surface, elevation: Platform.OS === 'android' ? 2 : 0 },
    reviewLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 1.1, color: THEME_COLORS.textFaint },
    reviewCount: { fontSize: 18, fontWeight: '800', color: THEME_COLORS.text, marginTop: 2, fontVariant: ['tabular-nums'] },
    primarySend: { minHeight: 54, minWidth: 180, borderRadius: 18, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.24, shadowRadius: 13, elevation: Platform.OS === 'android' ? 8 : 5 },
    primarySendDisabled: { opacity: 0.45 },
    primarySendText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
    disabledNotice: { color: '#DC2626', fontSize: 12, fontWeight: '700', marginTop: 10, lineHeight: 18 },
    controlsCard: { marginTop: 24, marginBottom: 4, padding: isWide ? 28 : 18, borderRadius: isWide ? 28 : 24, borderWidth: 1.5, borderColor: THEME_COLORS.border, backgroundColor: THEME_COLORS.surface, shadowColor: isDark ? '#000' : '#9AA7BF', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.3 : 0.14, shadowRadius: 18, elevation: Platform.OS === 'android' ? 5 : 0 },
    controlsHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, marginBottom: 20 },
    controlsHeaderIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(79,70,229,0.18)' : '#EEF2FF' },
    controlsTitle: { fontSize: 20, fontWeight: '900', color: THEME_COLORS.text, letterSpacing: -0.3 },
    controlsSubtitle: { fontSize: 12.5, lineHeight: 18.5, color: THEME_COLORS.textMuted, marginTop: 4, maxWidth: 720 },
    settingsLoader: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
    settingsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    settingRow: { width: isWide ? '48%' : '100%', flexGrow: 1, minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 18, borderWidth: 1, borderColor: THEME_COLORS.border, backgroundColor: THEME_COLORS.surfaceHighlight },
    settingIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: THEME_COLORS.surface, alignItems: 'center', justifyContent: 'center' },
    settingCopy: { flex: 1, minWidth: 0 },
    settingTitle: { fontSize: 13.5, fontWeight: '800', color: THEME_COLORS.text },
    settingDescription: { fontSize: 10.5, lineHeight: 15, color: THEME_COLORS.textMuted, marginTop: 2 },
    grid: {
      gap: isWide ? 24 : 20,
      width: '100%',
    },
    gridTwoCol: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    card: {
      backgroundColor: THEME_COLORS.surface,
      borderRadius: isWide ? 24 : 22,
      padding: isWide ? 28 : 24,
      width: '100%',
      position: 'relative',
      overflow: 'hidden',
      shadowColor: '#0B1220',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.4 : 0.06,
      shadowRadius: 28,
      elevation: 4,
    },
    cardBorder: {
      ...StyleSheet.absoluteFillObject,
      borderWidth: 1,
      borderColor: THEME_COLORS.border,
      borderRadius: isWide ? 24 : 22,
      pointerEvents: 'none',
    },
    accentStrip: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 3,
    },
    cornerTint: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: isWide ? 280 : 220,
      height: isWide ? 220 : 180,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginBottom: 14,
      zIndex: 2,
    },
    iconShell: {
      borderRadius: 14,
    },
    iconBox: {
      width: 48,
      height: 48,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerText: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: THEME_COLORS.text,
      letterSpacing: -0.3,
      marginBottom: 3,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    dotWrapper: {
      width: 12,
      height: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 6,
    },
    statusDotCore: {
      position: 'absolute',
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusDotRing: {
      position: 'absolute',
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 1,
    },
    statusText: {
      fontSize: 12.5,
      fontWeight: '500',
    },
    cardDesc: {
      fontSize: 14,
      color: THEME_COLORS.textMuted,
      lineHeight: 21,
      marginBottom: 20,
      zIndex: 2,
    },
    classSection: {
      zIndex: 2,
      marginBottom: 20,
    },
    classSectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    classSectionLabel: {
      fontSize: 10.5,
      fontWeight: '700',
      letterSpacing: 1,
      color: THEME_COLORS.textFaint,
    },
    clearBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    clearBtnText: {
      fontSize: 12.5,
      fontWeight: '600',
    },
    targetsLoading: {
      paddingVertical: 10,
    },
    classChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    classChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 14,
      paddingRight: 14,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: THEME_COLORS.border,
      backgroundColor: THEME_COLORS.surfaceHighlight,
    },
    classChipText: {
      fontSize: 12.5,
      fontWeight: '500',
      color: THEME_COLORS.text,
    },
    countBadge: {
      backgroundColor: THEME_COLORS.borderStrong,
      borderRadius: 7,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginLeft: 7,
    },
    classChipCount: {
      fontSize: 10.5,
      fontWeight: '700',
      color: THEME_COLORS.textMuted,
      fontVariant: ['tabular-nums'],
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
      zIndex: 2,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: THEME_COLORS.border,
    },
    recipientPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 1,
    },
    recipientPillText: {
      fontSize: 13,
      fontWeight: '500',
      color: THEME_COLORS.textMuted,
    },
    recipientPillNumber: {
      fontWeight: '700',
      color: THEME_COLORS.text,
      fontVariant: ['tabular-nums'],
    },
    sendBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      height: 40,
      borderRadius: 12,
      minWidth: 96,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.32,
      shadowRadius: 12,
      elevation: 5,
    },
    sendBtnLoading: {
      opacity: 0.7,
    },
    sendBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFF',
      letterSpacing: 0.2,
    },
    sheetOverlay: {
      flex: 1,
      backgroundColor: 'rgba(11,18,32,0.55)',
      justifyContent: isWide ? 'center' : 'flex-end',
      alignItems: isWide ? 'center' : 'stretch',
      padding: isWide ? 24 : 0,
    },
    sheetCard: {
      backgroundColor: THEME_COLORS.surface,
      borderTopLeftRadius: isWide ? 26 : 26,
      borderTopRightRadius: isWide ? 26 : 26,
      borderRadius: isWide ? 26 : 0,
      padding: 24,
      paddingBottom: isWide ? 24 : 40,
      borderWidth: 1,
      borderColor: THEME_COLORS.border,
      width: isWide ? '100%' : undefined,
      maxWidth: isWide ? 520 : undefined,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: THEME_COLORS.borderStrong,
      alignSelf: 'center',
      marginBottom: 24,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginBottom: 24,
    },
    sheetIcon: {
      width: 46,
      height: 46,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sheetTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: THEME_COLORS.text,
      letterSpacing: -0.4,
    },
    sheetSub: {
      fontSize: 13.5,
      color: THEME_COLORS.textMuted,
      marginTop: 3,
      lineHeight: 19,
    },
    sheetTargetBox: {
      backgroundColor: THEME_COLORS.surfaceHighlight,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: THEME_COLORS.border,
      marginBottom: 24,
    },
    sheetTargetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sheetTargetLabel: {
      fontSize: 13.5,
      fontWeight: '500',
      color: THEME_COLORS.textMuted,
    },
    sheetTargetValue: {
      fontSize: 13.5,
      fontWeight: '700',
      color: THEME_COLORS.text,
    },
    sheetClassList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 12,
    },
    sheetClassPill: {
      paddingHorizontal: 11,
      height: 28,
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 1,
    },
    sheetClassPillText: {
      fontSize: 11.5,
      fontWeight: '700',
    },
    sheetDivider: {
      height: 1,
      backgroundColor: THEME_COLORS.border,
      marginVertical: 14,
    },
    sheetReach: {
      fontSize: 15,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    sheetActions: {
      flexDirection: 'row',
      gap: 12,
    },
    sheetCancelBtn: {
      flex: 1,
      height: 50,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: THEME_COLORS.surfaceHighlight,
      borderWidth: 1,
      borderColor: THEME_COLORS.border,
    },
    sheetCancelText: {
      fontSize: 14.5,
      fontWeight: '700',
      color: THEME_COLORS.text,
    },
    sheetConfirmBtn: {
      flex: 1.6,
      height: 50,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.32,
      shadowRadius: 12,
      elevation: 5,
    },
    sheetConfirmText: {
      fontSize: 14.5,
      fontWeight: '700',
      color: '#FFF',
      letterSpacing: 0.2,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(11,18,32,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalCard: {
      width: '100%',
      maxWidth: 440,
      backgroundColor: THEME_COLORS.surface,
      borderRadius: 24,
      padding: 24,
      borderWidth: 1,
      borderColor: THEME_COLORS.border,
      shadowColor: '#0B1220',
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: isDark ? 0.5 : 0.12,
      shadowRadius: 40,
      elevation: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 24,
    },
    modalIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: THEME_COLORS.text,
      letterSpacing: -0.3,
    },
    modalSubtitle: {
      fontSize: 13,
      color: THEME_COLORS.textMuted,
      marginTop: 2,
    },
    modalLoadingRow: {
      alignItems: 'center',
      paddingVertical: 32,
      gap: 16,
    },
    liveCounterBox: {
      alignItems: 'center',
      gap: 2,
    },
    liveCounterNumber: {
      fontSize: 42,
      fontWeight: '900',
      lineHeight: 44,
      fontVariant: ['tabular-nums'],
      letterSpacing: -1,
    },
    liveCounterLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: THEME_COLORS.text,
    },
    liveProgressTrack: {
      width: '100%',
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: THEME_COLORS.surfaceHighlight,
      borderWidth: 1,
      borderColor: THEME_COLORS.border,
    },
    liveProgressFill: {
      height: '100%',
      borderRadius: 4,
    },
    modalProcessingText: {
      fontSize: 15,
      fontWeight: '600',
      color: THEME_COLORS.text,
    },
    modalProcessingHint: {
      fontSize: 12.5,
      color: THEME_COLORS.textMuted,
      textAlign: 'center',
      lineHeight: 18,
      paddingHorizontal: 16,
    },
    resultHero: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    resultBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
    },
    resultBadgeText: {
      fontSize: 12.5,
      fontWeight: '700',
    },
    resultNumbers: {
      alignItems: 'flex-end',
    },
    resultBig: {
      fontSize: 34,
      fontWeight: '800',
      color: THEME_COLORS.text,
      lineHeight: 36,
      fontVariant: ['tabular-nums'],
    },
    resultBigLabel: {
      fontSize: 12.5,
      fontWeight: '500',
      color: THEME_COLORS.textMuted,
      marginTop: 2,
    },
    deliveryBar: {
      flexDirection: 'row',
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: 20,
      backgroundColor: THEME_COLORS.surfaceHighlight,
    },
    legendRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    legendItem: {
      flex: 1,
      backgroundColor: THEME_COLORS.surfaceHighlight,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: THEME_COLORS.border,
    },
    legendDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginBottom: 8,
    },
    legendCount: {
      fontSize: 19,
      fontWeight: '700',
      color: THEME_COLORS.text,
      fontVariant: ['tabular-nums'],
    },
    legendLabel: {
      fontSize: 11,
      fontWeight: '500',
      color: THEME_COLORS.textMuted,
      marginTop: 2,
    },
    legendCaption: {
      fontSize: 12,
      color: THEME_COLORS.textMuted,
      lineHeight: 17,
      marginBottom: 16,
    },
    interruptedNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: isDark ? 'rgba(217,119,6,0.10)' : 'rgba(217,119,6,0.06)',
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: 'rgba(217,119,6,0.22)',
      marginBottom: 14,
    },
    interruptedNoteText: {
      flex: 1,
      fontSize: 12.5,
      lineHeight: 18,
      color: THEME_COLORS.textMuted,
    },
    failBox: {
      backgroundColor: isDark ? 'rgba(220,38,38,0.08)' : 'rgba(220,38,38,0.04)',
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: 'rgba(220,38,38,0.18)',
      marginBottom: 16,
    },
    failBoxTitle: {
      fontSize: 10.5,
      fontWeight: '700',
      color: THEME_COLORS.text,
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    failRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 5,
    },
    failReasonWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 1,
    },
    failDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    failReason: {
      fontSize: 12.5,
      fontWeight: '500',
      color: THEME_COLORS.text,
      flexShrink: 1,
    },
    failCount: {
      fontSize: 13,
      fontWeight: '700',
      color: STATUS_COLORS.failed,
      fontVariant: ['tabular-nums'],
      marginLeft: 10,
    },
    modalMessage: {
      fontSize: 12.5,
      color: THEME_COLORS.textMuted,
      lineHeight: 18,
    },
    modalActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 24,
    },
    modalBtn: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    modalRetryBtn: {
      backgroundColor: STATUS_COLORS.failed,
    },
    modalRetryText: {
      color: '#FFF',
      fontWeight: '700',
      fontSize: 13.5,
    },
    modalCloseBtn: {
      backgroundColor: THEME_COLORS.surfaceHighlight,
      borderWidth: 1,
      borderColor: THEME_COLORS.border,
    },
    modalCloseText: {
      color: THEME_COLORS.text,
      fontWeight: '700',
      fontSize: 13.5,
    },
  });
