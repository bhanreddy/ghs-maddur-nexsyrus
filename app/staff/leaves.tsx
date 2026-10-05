import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import ClayInput from '@/src/components/ClayInput';
import { clayCard, clayInset } from '@/src/theme/clayStyles';
import AppDatePicker from '@/src/components/AppDatePicker';

import { alertCompat } from '../../src/utils/crossPlatformAlert';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import KeyboardAwareScreen from '@/components/keyboard/KeyboardAwareScreen';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  FadeIn,
  FadeInUp,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import StaffHeader from '../../src/components/StaffHeader';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { useAuth } from '../../src/hooks/useAuth';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import { LeaveService, LeaveApplication } from '../../src/services/commonServices';
import { useTheme } from '../../src/hooks/useTheme';

const FONT = Platform.OS === 'ios' ? 'SF Pro Display' : 'sans-serif';
const ACCENT = '#4F46E5';
const ACCENT_SOFT = '#6366F1';
const REASON_MAX = 280;

// ─── Leave Type Config ─────────────────────────────────────────────
const LEAVE_TYPES = [
  {
    label: 'Sick Leave',
    icon: 'local-hospital' as const,
    color: '#E11D48',
    soft: '#FFE4E8',
    softDark: 'rgba(225,29,72,0.16)',
    key: 'sick',
    hint: 'Feeling unwell',
  },
  {
    label: 'Casual Leave',
    icon: 'beach-access' as const,
    color: '#EA580C',
    soft: '#FFEDD5',
    softDark: 'rgba(234,88,12,0.16)',
    key: 'casual',
    hint: 'Personal time',
  },
  {
    label: 'Emergency',
    icon: 'flash-on' as const,
    color: '#7C3AED',
    soft: '#EDE9FE',
    softDark: 'rgba(124,58,237,0.18)',
    key: 'other',
    hint: 'Urgent need',
  },
] as const;

const STATUS_CFG: Record<string, { color: string; bg: string; soft: string; icon: string; label: string }> = {
  approved: { color: '#059669', bg: 'rgba(5,150,105,0.12)', soft: '#D1FAE5', icon: 'check-circle', label: 'Approved' },
  rejected: { color: '#DC2626', bg: 'rgba(220,38,38,0.12)', soft: '#FEE2E2', icon: 'cancel', label: 'Rejected' },
  pending: { color: '#D97706', bg: 'rgba(217,119,6,0.12)', soft: '#FEF3C7', icon: 'hourglass-empty', label: 'Pending' },
};

type StaffLeaveRow = {
  id: string;
  type: string;
  range: string;
  days: string;
  dayCount: number;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  appliedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewRemarks?: string | null;
};

type HistoryFilter = 'all' | 'pending' | 'approved' | 'rejected';

function formatStaffDateTime(iso?: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function calcDayCount(start: string, end: string) {
  if (!start || !end) return 0;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.max(1, Math.ceil((b - a) / 86400000) + 1);
}

function formatDaysLabel(n: number) {
  if (n <= 0) return '';
  if (n === 0.5) return 'Half day';
  return `${n} Day${n !== 1 ? 's' : ''}`;
}

function PressScale({
  children,
  onPress,
  disabled,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: any;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => {
        s.value = withTiming(0.97, { duration: 90 });
      }}
      onPressOut={() => {
        s.value = withTiming(1, { duration: 120 });
      }}
      onPress={onPress}
      hitSlop={8}
      style={style}
    >
      <Animated.View style={a}>{children}</Animated.View>
    </Pressable>
  );
}

// ─── Leave Type Card ───────────────────────────────────────────────
const LeaveTypeCard = memo(function LeaveTypeCard({
  type,
  isActive,
  onPress,
  isDark,
}: {
  type: (typeof LEAVE_TYPES)[number];
  isActive: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <PressScale onPress={onPress} style={{ flex: 1 }}>
      <View
        style={[
          chipStyles.card,
          {
            backgroundColor: isActive
              ? isDark
                ? type.softDark
                : type.soft
              : isDark
                ? 'rgba(255,255,255,0.04)'
                : '#F8FAFC',
            borderColor: isActive
              ? type.color + (isDark ? '66' : '40')
              : isDark
                ? 'rgba(255,255,255,0.06)'
                : 'rgba(148,163,184,0.22)',
            borderBottomWidth: isActive ? 2 : 1,
            borderBottomColor: isActive
              ? type.color + '55'
              : isDark
                ? 'rgba(255,255,255,0.06)'
                : 'rgba(148,163,184,0.18)',
          },
          isActive && Platform.OS === 'ios'
            ? {
                shadowColor: type.color,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.18,
                shadowRadius: 10,
              }
            : null,
          isActive && Platform.OS === 'android' ? { elevation: 3 } : null,
        ]}
      >
        {isActive && (
          <LinearGradient
            colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.7, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}
        <View
          style={[
            chipStyles.iconWrap,
            {
              backgroundColor: isActive
                ? type.color + (isDark ? '30' : '18')
                : isDark
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(15,23,42,0.05)',
            },
          ]}
        >
          <MaterialIcons
            name={type.icon}
            size={20}
            color={isActive ? type.color : isDark ? '#64748B' : '#94A3B8'}
          />
        </View>
        <Text
          style={[
            chipStyles.label,
            {
              color: isActive ? type.color : isDark ? '#94A3B8' : '#475569',
              fontFamily: FONT,
              fontWeight: isActive ? '800' : '600',
            },
          ]}
          numberOfLines={1}
        >
          {type.label.replace(' Leave', '')}
        </Text>
        <Text
          style={[
            chipStyles.hint,
            { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT },
          ]}
          numberOfLines={1}
        >
          {type.hint}
        </Text>
        {isActive && (
          <View style={[chipStyles.check, { backgroundColor: type.color }]}>
            <Ionicons name="checkmark" size={10} color="#fff" />
          </View>
        )}
      </View>
    </PressScale>
  );
});

const chipStyles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 6,
    minHeight: 108,
    overflow: 'hidden',
    position: 'relative',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  label: { fontSize: 13, letterSpacing: -0.2, textAlign: 'center' },
  hint: { fontSize: 10, fontWeight: '500', textAlign: 'center', letterSpacing: -0.1 },
  check: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── History Card ──────────────────────────────────────────────────
const HistoryCard = memo(function HistoryCard({
  item,
  index,
  isDark,
  expanded,
  onToggle,
}: {
  item: StaffLeaveRow;
  index: number;
  isDark: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cfg = STATUS_CFG[item.status] || STATUS_CFG.pending;
  const leaveTypeCfg = LEAVE_TYPES.find((t) => t.label === item.type) || LEAVE_TYPES[0];
  const showReview =
    (item.status === 'approved' || item.status === 'rejected') &&
    (item.reviewedBy || item.reviewedAt || item.reviewRemarks);

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 6) * 60).duration(280).easing(Easing.out(Easing.cubic))}
      layout={Layout.springify().damping(18).stiffness(180)}
    >
      <PressScale onPress={onToggle}>
        <View
          style={[
            hcStyles.wrap,
            clayCard(isDark, 'sm'),
            { backgroundColor: isDark ? '#1A2332' : '#F7F9FC', padding: 0 },
          ]}
        >
          <View style={[hcStyles.accentBar, { backgroundColor: leaveTypeCfg.color }]} />

          <View style={hcStyles.row}>
            <View
              style={[
                hcStyles.iconBox,
                { backgroundColor: isDark ? leaveTypeCfg.softDark : leaveTypeCfg.soft },
              ]}
            >
              <MaterialIcons name={leaveTypeCfg.icon} size={20} color={leaveTypeCfg.color} />
            </View>

            <View style={hcStyles.textBlock}>
              <Text style={[hcStyles.type, { color: isDark ? '#EEF2FF' : '#0F172A', fontFamily: FONT }]}>
                {item.type}
              </Text>
              <View style={hcStyles.metaRow}>
                <Ionicons name="calendar-outline" size={12} color={isDark ? '#64748B' : '#64748B'} />
                <Text style={[hcStyles.date, { color: isDark ? '#94A3B8' : '#64748B', fontFamily: FONT }]}>
                  {item.range}
                </Text>
              </View>
            </View>

            <View style={hcStyles.rightCol}>
              <View style={[hcStyles.statusBadge, { backgroundColor: isDark ? cfg.bg : cfg.soft }]}>
                <MaterialIcons name={cfg.icon as any} size={12} color={cfg.color} />
                <Text style={[hcStyles.statusText, { color: cfg.color, fontFamily: FONT }]}>
                  {cfg.label}
                </Text>
              </View>
              <View style={hcStyles.expandHint}>
                <Text style={[hcStyles.daysText, { color: isDark ? '#94A3B8' : '#64748B', fontFamily: FONT }]}>
                  {item.days}
                </Text>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={isDark ? '#64748B' : '#94A3B8'}
                />
              </View>
            </View>
          </View>

          {expanded && (
            <Animated.View
              entering={FadeIn.duration(200)}
              style={[
                hcStyles.detailBlock,
                { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' },
              ]}
            >
              <View style={hcStyles.detailRow}>
                <Ionicons name="time-outline" size={14} color={isDark ? '#64748B' : '#64748B'} />
                <Text style={[hcStyles.detailLabel, { color: isDark ? '#94A3B8' : '#64748B', fontFamily: FONT }]}>
                  Applied
                </Text>
                <Text
                  style={[hcStyles.detailValue, { color: isDark ? '#CBD5E1' : '#334155', fontFamily: FONT }]}
                  numberOfLines={2}
                >
                  {item.appliedAt || '—'}
                </Text>
              </View>

              <View style={hcStyles.reasonBlock}>
                <Text style={[hcStyles.reasonLabel, { color: isDark ? '#94A3B8' : '#64748B', fontFamily: FONT }]}>
                  Reason
                </Text>
                <Text style={[hcStyles.reasonBody, { color: isDark ? '#E2E8F0' : '#334155', fontFamily: FONT }]}>
                  {item.reason || 'No reason provided'}
                </Text>
              </View>

              {showReview && (
                <View
                  style={[
                    hcStyles.reviewBlock,
                    {
                      backgroundColor: isDark ? 'rgba(99,102,241,0.10)' : 'rgba(79,70,229,0.06)',
                    },
                  ]}
                >
                  <View style={hcStyles.reviewHead}>
                    <Ionicons name="shield-checkmark-outline" size={14} color={isDark ? '#A5B4FC' : ACCENT} />
                    <Text style={[hcStyles.reviewTitle, { color: isDark ? '#A5B4FC' : ACCENT, fontFamily: FONT }]}>
                      Review
                    </Text>
                  </View>
                  {item.reviewedAt && (
                    <Text style={[hcStyles.reviewLine, { color: isDark ? '#94A3B8' : '#64748B', fontFamily: FONT }]}>
                      {formatStaffDateTime(item.reviewedAt)}
                      {item.reviewedBy ? ` · ${item.reviewedBy}` : ''}
                    </Text>
                  )}
                  {item.reviewRemarks ? (
                    <Text style={[hcStyles.reviewRemarks, { color: isDark ? '#CBD5E1' : '#475569', fontFamily: FONT }]}>
                      {item.reviewRemarks}
                    </Text>
                  ) : null}
                </View>
              )}
            </Animated.View>
          )}
        </View>
      </PressScale>
    </Animated.View>
  );
});

const hcStyles = StyleSheet.create({
  wrap: { borderRadius: 24, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  accentBar: { position: 'absolute', left: 0, top: 14, bottom: 14, width: 4, borderRadius: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingLeft: 18,
    paddingRight: 14,
  },
  iconBox: { width: 44, height: 44, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  textBlock: { flex: 1, gap: 4 },
  type: { fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  date: { fontSize: 12, fontWeight: '500' },
  rightCol: { alignItems: 'flex-end', gap: 8 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.1 },
  expandHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  daysText: { fontSize: 11, fontWeight: '600' },
  detailBlock: {
    marginLeft: 18,
    marginRight: 14,
    marginBottom: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  detailLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  detailValue: { flex: 1, fontSize: 13, fontWeight: '600', minWidth: 120 },
  reasonBlock: { gap: 6 },
  reasonLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  reasonBody: { fontSize: 14, fontWeight: '500', lineHeight: 21 },
  reviewBlock: { borderRadius: 16, padding: 14, gap: 6 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reviewTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  reviewLine: { fontSize: 12, fontWeight: '500' },
  reviewRemarks: { fontSize: 14, fontWeight: '500', lineHeight: 21 },
});

// ─── Submit Button ─────────────────────────────────────────────────
const SubmitButton = ({
  onPress,
  loading,
  disabled,
}: {
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
}) => {
  const blocked = loading || disabled;
  return (
    <PressScale onPress={onPress} disabled={blocked}>
      <View style={[sbStyles.shadow, blocked && { opacity: 0.55 }]}>
        <LinearGradient
          colors={blocked ? ['#94A3B8', '#64748B'] : [ACCENT_SOFT, ACCENT, '#3730A3']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={sbStyles.btn}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="paper-plane" size={17} color="#fff" />
          )}
          <Text style={[sbStyles.text, { fontFamily: FONT }]}>
            {loading ? 'Sending…' : 'Submit Application'}
          </Text>
        </LinearGradient>
      </View>
    </PressScale>
  );
};

const sbStyles = StyleSheet.create({
  shadow: {
    marginTop: 8,
    borderRadius: 18,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.32,
        shadowRadius: 16,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 17,
    borderRadius: 18,
    overflow: 'hidden',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(0,0,0,0.14)',
  },
  text: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
});

// ─── Main Screen ───────────────────────────────────────────────────
export default function ApplyLeave() {
  const { isDark } = useTheme();
  const { shellActive } = useAccountsWebChrome();
  const { user } = useAuth();
  const { isViewingAsAdmin, viewAsName } = useEffectiveStaffId();

  const [leaveType, setLeaveType] = useState('Sick Leave');
  const [reason, setReason] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [halfDay, setHalfDay] = useState(false);
  const [leaves, setLeaves] = useState<StaffLeaveRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ from?: string; to?: string; reason?: string }>({});

  const loadLeaves = useCallback(async () => {
    try {
      if (!user) return;
      setFetching(true);
      const data = await LeaveService.getAll({ limit: 100 });
      const typeLabel = (code: string) =>
        code === 'sick'
          ? 'Sick Leave'
          : code === 'casual'
            ? 'Casual Leave'
            : code === 'other'
              ? 'Emergency'
              : code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const formatted: StaffLeaveRow[] = data.map((l: LeaveApplication) => {
        const dayCount = l.half_day ? 0.5 : calcDayCount(l.start_date, l.end_date);
        return {
          id: l.id,
          type: typeLabel(l.leave_type),
          range: `${new Date(l.start_date).toLocaleDateString()} – ${new Date(l.end_date).toLocaleDateString()}`,
          days: formatDaysLabel(dayCount),
          dayCount,
          status: l.status,
          reason: l.reason || '',
          appliedAt: formatStaffDateTime(l.created_at),
          reviewedAt: l.reviewed_at,
          reviewedBy: l.reviewed_by_name ?? null,
          reviewRemarks: l.review_remarks ?? null,
        };
      });
      setLeaves(formatted);
    } catch {
      // keep previous
    } finally {
      setFetching(false);
    }
  }, [user]);

  useEffect(() => {
    loadLeaves();
  }, [loadLeaves]);

  const sameDay = !!(fromDate && toDate && fromDate === toDate);
  const durationDays = useMemo(() => {
    const days = calcDayCount(fromDate, toDate);
    return halfDay && sameDay ? 0.5 : days;
  }, [fromDate, toDate, halfDay, sameDay]);
  const dateInvalid = !!(fromDate && toDate && new Date(toDate) < new Date(fromDate));

  const counts = useMemo(() => {
    const pending = leaves.filter((l) => l.status === 'pending').length;
    const approved = leaves.filter((l) => l.status === 'approved').length;
    const rejected = leaves.filter((l) => l.status === 'rejected').length;
    return { pending, approved, rejected, all: leaves.length };
  }, [leaves]);

  const filteredLeaves = useMemo(() => {
    if (historyFilter === 'all') return leaves;
    return leaves.filter((l) => l.status === historyFilter);
  }, [leaves, historyFilter]);

  const canSubmit =
    !!fromDate && !!toDate && reason.trim().length >= 3 && !dateInvalid && !loading;

  const activeLeaveCfg = LEAVE_TYPES.find((t) => t.label === leaveType)!;

  const onFromChange = (v: string) => {
    setFromDate(v);
    setFieldErrors((e) => ({ ...e, from: undefined }));
    if (toDate && v && new Date(toDate) < new Date(v)) {
      setToDate(v);
    }
    if (halfDay && toDate && v !== toDate) setHalfDay(false);
  };

  const onToChange = (v: string) => {
    setToDate(v);
    setFieldErrors((e) => ({ ...e, to: undefined }));
    if (halfDay && fromDate && v !== fromDate) setHalfDay(false);
  };

  const handleApply = async () => {
    const nextErrors: typeof fieldErrors = {};
    if (!fromDate) nextErrors.from = 'Pick a start date';
    if (!toDate) nextErrors.to = 'Pick an end date';
    if (dateInvalid) nextErrors.to = 'End date can’t be before start';
    if (!reason.trim()) nextErrors.reason = 'Tell us a short reason';
    else if (reason.trim().length < 3) nextErrors.reason = 'Add a bit more detail (3+ characters)';

    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return;
    }

    try {
      setLoading(true);
      if (user) {
        const typeMap: Record<string, string> = {
          'Sick Leave': 'sick',
          'Casual Leave': 'casual',
          Emergency: 'other',
        };
        await LeaveService.create({
          leave_type: typeMap[leaveType] || 'other',
          start_date: fromDate,
          end_date: toDate,
          half_day: halfDay && fromDate === toDate,
          reason: reason.trim(),
        });
        alertCompat('Submitted', 'Your leave request is in — we’ll notify you when it’s reviewed.');
        setReason('');
        setFromDate('');
        setToDate('');
        setHalfDay(false);
        setFieldErrors({});
        setHistoryFilter('pending');
        await loadLeaves();
      }
    } catch {
      alertCompat('Couldn’t submit', 'Something went wrong. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  const labelColor = isDark ? '#94A3B8' : '#64748B';
  const mutedColor = isDark ? '#64748B' : '#94A3B8';
  const titleColor = isDark ? '#EEF2FF' : '#0F172A';

  return (
    <TourTarget id="screen.staff-leaves.overview" native><View style={{ flex: 1, backgroundColor: isDark ? '#121824' : '#E9EDF6' }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      {shellActive ? null : <StaffHeader title="Apply Leave" showBackButton={true} />}
      {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}

      <TourTarget id="screen.staff-leaves.workspace" style={{ flex: 1 }}><KeyboardAwareScreen
        variant="scroll"
        contentContainerStyle={mainStyles.scroll}
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
      >
        {/* Soft intro */}
        <Animated.View entering={FadeInDown.delay(40).duration(320).easing(Easing.out(Easing.cubic))}>
          <View
            style={[
              mainStyles.intro,
              {
                backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : '#EEF2FF',
                borderColor: isDark ? 'rgba(129,140,248,0.20)' : 'rgba(79,70,229,0.12)',
              },
            ]}
          >
            <View style={[mainStyles.introIcon, { backgroundColor: isDark ? 'rgba(99,102,241,0.25)' : '#E0E7FF' }]}>
              <Ionicons name="leaf-outline" size={20} color={isDark ? '#A5B4FC' : ACCENT} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[mainStyles.introTitle, { color: titleColor, fontFamily: FONT }]}>
                Request time off
              </Text>
              <Text style={[mainStyles.introSub, { color: labelColor, fontFamily: FONT }]}>
                {counts.pending > 0
                  ? `You have ${counts.pending} pending review${counts.pending === 1 ? '' : 's'}`
                  : 'Pick dates, share a short reason, and you’re done'}
              </Text>
            </View>
            {counts.pending > 0 && (
              <View style={[mainStyles.introBadge, { backgroundColor: isDark ? 'rgba(217,119,6,0.2)' : '#FEF3C7' }]}>
                <Text style={[mainStyles.introBadgeText, { color: '#D97706', fontFamily: FONT }]}>
                  {counts.pending}
                </Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Form card */}
        <Animated.View entering={FadeInDown.delay(90).duration(340).easing(Easing.out(Easing.cubic))}>
          <View
            style={[
              mainStyles.card,
              clayCard(isDark, 'lg'),
              { backgroundColor: isDark ? '#1A2332' : '#F4F7FD', padding: 22 },
            ]}
          >
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']
                  : ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 0.6, y: 0.9 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 32 }]}
              pointerEvents="none"
            />

            <View style={mainStyles.cardTitleRow}>
              <View
                style={[
                  mainStyles.titleIcon,
                  { backgroundColor: isDark ? activeLeaveCfg.softDark : activeLeaveCfg.soft },
                ]}
              >
                <MaterialIcons name={activeLeaveCfg.icon} size={22} color={activeLeaveCfg.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[mainStyles.cardTitle, { color: titleColor, fontFamily: FONT }]}>
                  New application
                </Text>
                <Text style={[mainStyles.cardSubtitle, { color: labelColor, fontFamily: FONT }]}>
                  Takes about a minute
                </Text>
              </View>
            </View>

            {/* Leave type */}
            <View style={mainStyles.fieldGroup}>
              <Text style={[mainStyles.fieldLabel, { color: labelColor, fontFamily: FONT }]}>
                Leave type
              </Text>
              <View style={mainStyles.chipsRow}>
                {LEAVE_TYPES.map((t) => (
                  <LeaveTypeCard
                    key={t.key}
                    type={t}
                    isActive={leaveType === t.label}
                    onPress={() => setLeaveType(t.label)}
                    isDark={isDark}
                  />
                ))}
              </View>
            </View>

            {/* Dates */}
            <View style={mainStyles.fieldGroup}>
              <View style={mainStyles.dateHeader}>
                <Text style={[mainStyles.fieldLabel, { color: labelColor, fontFamily: FONT, marginBottom: 0 }]}>
                  Dates
                </Text>
                {durationDays > 0 && !dateInvalid && (
                  <Animated.View entering={FadeInUp.duration(220)} style={mainStyles.durationPill}>
                    <LinearGradient
                      colors={isDark ? ['rgba(99,102,241,0.28)', 'rgba(79,70,229,0.18)'] : ['#E0E7FF', '#EEF2FF']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={mainStyles.durationInner}
                    >
                      <Ionicons name="sparkles" size={12} color={isDark ? '#A5B4FC' : ACCENT} />
                      <Text style={[mainStyles.durationText, { color: isDark ? '#C7D2FE' : ACCENT, fontFamily: FONT }]}>
                        {formatDaysLabel(durationDays)}
                      </Text>
                    </LinearGradient>
                  </Animated.View>
                )}
              </View>

              <View style={mainStyles.dateRow}>
                <AppDatePicker
                  label="From"
                  value={fromDate}
                  onChange={onFromChange}
                  isDark={isDark}
                  placeholder="Start date"
                  variant="compact"
                  accentColor={ACCENT}
                  labelStyle={{ color: mutedColor, fontSize: 12, fontWeight: '700', letterSpacing: 0.2, textTransform: 'none' }}
                  wrapperStyle={{
                    ...(clayInset(isDark) as any),
                    borderRadius: 16,
                    minHeight: 48,
                    borderColor: fieldErrors.from
                      ? '#DC2626'
                      : isDark
                        ? 'rgba(255,255,255,0.06)'
                        : 'transparent',
                  }}
                />
                <View style={mainStyles.dateArrow}>
                  <Ionicons name="arrow-forward" size={16} color={mutedColor} />
                </View>
                <AppDatePicker
                  label="To"
                  value={toDate}
                  onChange={onToChange}
                  isDark={isDark}
                  placeholder="End date"
                  variant="compact"
                  accentColor={ACCENT}
                  minimumDate={fromDate || undefined}
                  labelStyle={{ color: mutedColor, fontSize: 12, fontWeight: '700', letterSpacing: 0.2, textTransform: 'none' }}
                  wrapperStyle={{
                    ...(clayInset(isDark) as any),
                    borderRadius: 16,
                    minHeight: 48,
                    borderColor: fieldErrors.to || dateInvalid
                      ? '#DC2626'
                      : isDark
                        ? 'rgba(255,255,255,0.06)'
                        : 'transparent',
                  }}
                />
              </View>
              {(fieldErrors.from || fieldErrors.to || dateInvalid) && (
                <Text style={[mainStyles.errorText, { fontFamily: FONT }]}>
                  {fieldErrors.from || fieldErrors.to || 'End date can’t be before start'}
                </Text>
              )}

              <Text style={[mainStyles.fieldLabel, { color: labelColor, fontFamily: FONT, marginTop: 14 }]}>
                Duration
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {([
                  { key: false, label: 'Full day' },
                  { key: true, label: 'Half day' },
                ] as const).map((option) => {
                  const active = halfDay === option.key;
                  const disabled = option.key && !sameDay;
                  return (
                    <Pressable
                      key={option.label}
                      disabled={disabled}
                      onPress={() => setHalfDay(option.key)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 14,
                        alignItems: 'center',
                        opacity: disabled ? 0.45 : 1,
                        backgroundColor: active
                          ? isDark ? 'rgba(99,102,241,0.28)' : '#E0E7FF'
                          : isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
                        borderWidth: 1,
                        borderColor: active ? ACCENT : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.22)',
                      }}
                    >
                      <Text style={{ color: active ? ACCENT : titleColor, fontWeight: '700', fontFamily: FONT }}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {!sameDay && (
                <Text style={{ color: mutedColor, fontSize: 12, marginTop: 6, fontFamily: FONT }}>
                  Half day is available when the start and end dates are the same.
                </Text>
              )}
            </View>

            {/* Reason */}
            <View style={mainStyles.fieldGroup}>
              <ClayInput
                label="Reason"
                value={reason}
                onChangeText={(t) => {
                  if (t.length <= REASON_MAX) {
                    setReason(t);
                    if (fieldErrors.reason) setFieldErrors((e) => ({ ...e, reason: undefined }));
                  }
                }}
                isDark={isDark}
                placeholder="A short note for your approver…"
                multiline
                icon="edit"
                containerStyle={{ marginBottom: 0 }}
              />
              <View style={mainStyles.reasonMeta}>
                {fieldErrors.reason ? (
                  <Text style={[mainStyles.errorText, { fontFamily: FONT, marginTop: 0 }]}>
                    {fieldErrors.reason}
                  </Text>
                ) : (
                  <Text style={[mainStyles.hintText, { color: mutedColor, fontFamily: FONT }]}>
                    Be clear — helps faster approval
                  </Text>
                )}
                <Text
                  style={[
                    mainStyles.charCount,
                    {
                      color: reason.length > REASON_MAX - 40 ? '#D97706' : mutedColor,
                      fontFamily: FONT,
                    },
                  ]}
                >
                  {reason.length}/{REASON_MAX}
                </Text>
              </View>
            </View>

            <SubmitButton onPress={handleApply} loading={loading} disabled={!canSubmit} />
          </View>
        </Animated.View>

        {/* History */}
        <Animated.View entering={FadeInDown.delay(150).duration(300)} style={mainStyles.historyHeader}>
          <View style={mainStyles.historyTitleRow}>
            <Text style={[mainStyles.historyTitle, { color: titleColor, fontFamily: FONT }]}>
              Your history
            </Text>
            <View
              style={[
                mainStyles.historyCount,
                { backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(79,70,229,0.10)' },
              ]}
            >
              <Text style={[mainStyles.historyCountText, { color: isDark ? '#A5B4FC' : ACCENT, fontFamily: FONT }]}>
                {leaves.length}
              </Text>
            </View>
          </View>

          {leaves.length > 0 && (
            <View style={mainStyles.filterRow}>
              {(
                [
                  { key: 'all', label: 'All', count: counts.all },
                  { key: 'pending', label: 'Pending', count: counts.pending },
                  { key: 'approved', label: 'Approved', count: counts.approved },
                  { key: 'rejected', label: 'Rejected', count: counts.rejected },
                ] as const
              ).map((f) => {
                const active = historyFilter === f.key;
                return (
                  <PressScale key={f.key} onPress={() => setHistoryFilter(f.key)}>
                    <View
                      style={[
                        mainStyles.filterChip,
                        {
                          backgroundColor: active
                            ? isDark
                              ? 'rgba(99,102,241,0.22)'
                              : '#EEF2FF'
                            : isDark
                              ? 'rgba(255,255,255,0.04)'
                              : 'rgba(255,255,255,0.7)',
                          borderColor: active
                            ? isDark
                              ? 'rgba(129,140,248,0.45)'
                              : 'rgba(79,70,229,0.28)'
                            : isDark
                              ? 'rgba(255,255,255,0.06)'
                              : 'rgba(148,163,184,0.25)',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          mainStyles.filterText,
                          {
                            color: active ? (isDark ? '#C7D2FE' : ACCENT) : labelColor,
                            fontFamily: FONT,
                            fontWeight: active ? '700' : '600',
                          },
                        ]}
                      >
                        {f.label}
                        {f.count > 0 ? ` ${f.count}` : ''}
                      </Text>
                    </View>
                  </PressScale>
                );
              })}
            </View>
          )}
        </Animated.View>

        {fetching && leaves.length === 0 ? (
          <View style={mainStyles.loadingBox}>
            <ActivityIndicator color={ACCENT} />
            <Text style={[mainStyles.loadingText, { color: mutedColor, fontFamily: FONT }]}>
              Loading your leaves…
            </Text>
          </View>
        ) : filteredLeaves.length === 0 ? (
          <Animated.View entering={FadeIn.delay(120).duration(280)} style={mainStyles.emptyState}>
            <View
              style={[
                mainStyles.emptyIcon,
                {
                  backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : '#EEF2FF',
                },
              ]}
            >
              <Ionicons
                name={leaves.length === 0 ? 'calendar-outline' : 'funnel-outline'}
                size={32}
                color={isDark ? '#818CF8' : ACCENT}
              />
            </View>
            <Text style={[mainStyles.emptyTitle, { color: titleColor, fontFamily: FONT }]}>
              {leaves.length === 0 ? 'No leaves yet' : 'Nothing in this filter'}
            </Text>
            <Text style={[mainStyles.emptyText, { color: labelColor, fontFamily: FONT }]}>
              {leaves.length === 0
                ? 'Your first request will show up here once you submit it.'
                : 'Try another status, or clear the filter to see everything.'}
            </Text>
            {leaves.length > 0 && historyFilter !== 'all' && (
              <PressScale onPress={() => setHistoryFilter('all')}>
                <View style={[mainStyles.emptyCta, { backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : '#EEF2FF' }]}>
                  <Text style={[mainStyles.emptyCtaText, { color: isDark ? '#C7D2FE' : ACCENT, fontFamily: FONT }]}>
                    Show all
                  </Text>
                </View>
              </PressScale>
            )}
          </Animated.View>
        ) : (
          <View style={mainStyles.historyList}>
            {filteredLeaves.map((item, i) => (
              <HistoryCard
                key={item.id}
                item={item}
                index={i}
                isDark={isDark}
                expanded={expandedId === item.id}
                onToggle={() => setExpandedId((id) => (id === item.id ? null : item.id))}
              />
            ))}
          </View>
        )}
      </KeyboardAwareScreen></TourTarget>
    </View></TourTarget>
  );
}

const mainStyles = StyleSheet.create({
  scroll: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 120 },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 16,
  },
  introIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  introSub: { fontSize: 13, fontWeight: '500', marginTop: 3, lineHeight: 18 },
  introBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  introBadgeText: { fontSize: 13, fontWeight: '800' },
  card: {
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 28,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 },
  titleIcon: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.45 },
  cardSubtitle: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  fieldGroup: { marginBottom: 20 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
    marginBottom: 12,
    textTransform: 'none',
  },
  chipsRow: { flexDirection: 'row', gap: 10 },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  durationPill: { borderRadius: 999, overflow: 'hidden' },
  durationInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  durationText: { fontSize: 12, fontWeight: '800', letterSpacing: -0.1 },
  dateRow: { flexDirection: 'row', alignItems: 'flex-end' },
  dateArrow: { width: 28, alignItems: 'center', justifyContent: 'center', paddingBottom: 14 },
  reasonMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  hintText: { fontSize: 12, fontWeight: '500', flex: 1 },
  charCount: { fontSize: 11, fontWeight: '700' },
  errorText: { fontSize: 12, fontWeight: '600', color: '#DC2626', marginTop: 8 },
  historyHeader: { marginBottom: 14, gap: 12 },
  historyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  historyCount: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  historyCountText: { fontSize: 13, fontWeight: '800' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterText: { fontSize: 12, letterSpacing: -0.1 },
  historyList: { gap: 12 },
  loadingBox: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  loadingText: { fontSize: 13, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 10 },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  emptyText: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  emptyCta: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 },
  emptyCtaText: { fontSize: 13, fontWeight: '700' },
});
