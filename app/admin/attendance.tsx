import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Modal,
  Pressable,
  Platform,
  Image,
} from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/hooks/useTheme';
import AdminHeader from '../../src/components/AdminHeader';
import LogoLoader from '../../src/components/LogoLoader';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { api } from '../../src/services/apiClient';
import AppDatePicker, { toYMD } from '../../src/components/AppDatePicker';

const { width: SW } = Dimensions.get('window');

// ─── Claymorphism shadow helpers ──────────────────────────────────────────────
// Soft, puffy "clay" depth: a diffuse drop shadow paired with a light top-left
// highlight. Web gets true layered box-shadows (incl. inner highlight); native
// falls back to a single soft elevation shadow.
function clay(isDark: boolean, raised: 'sm' | 'md' | 'lg' = 'md') {
  const spread = raised === 'lg' ? 22 : raised === 'sm' ? 10 : 16;
  const dy = raised === 'lg' ? 12 : raised === 'sm' ? 5 : 8;
  if (Platform.OS === 'web') {
    const drop = isDark ? 'rgba(0,0,0,0.50)' : 'rgba(148,163,184,0.40)';
    const light = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.95)';
    const innerHi = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.70)';
    const innerLo = isDark ? 'rgba(0,0,0,0.30)' : 'rgba(148,163,184,0.20)';
    return {
      boxShadow:
        `${dy}px ${dy}px ${spread}px ${drop}, ` +
        `-${dy}px -${dy}px ${spread}px ${light}, ` +
        `inset 1.5px 1.5px 2px ${innerHi}, ` +
        `inset -1.5px -1.5px 2px ${innerLo}`,
    } as any;
  }
  return {
    shadowColor: isDark ? '#000000' : '#94A3B8',
    shadowOffset: { width: 0, height: dy },
    shadowOpacity: isDark ? 0.45 : 0.28,
    shadowRadius: spread,
    elevation: raised === 'lg' ? 10 : raised === 'sm' ? 4 : 7,
  } as any;
}

// Colored clay glow for tinted elements (avatars, CTA, stat icons).
function clayGlow(color: string, raised: 'sm' | 'md' = 'md') {
  const dy = raised === 'sm' ? 4 : 7;
  const spread = raised === 'sm' ? 10 : 16;
  if (Platform.OS === 'web') {
    return {
      boxShadow:
        `${dy}px ${dy}px ${spread}px ${color}55, ` +
        `inset 1.5px 1.5px 2px rgba(255,255,255,0.35), ` +
        `inset -1.5px -1.5px 2px rgba(0,0,0,0.15)`,
    } as any;
  }
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: dy },
    shadowOpacity: 0.4,
    shadowRadius: spread,
    elevation: raised === 'sm' ? 5 : 8,
  } as any;
}

// ─── Status cycling order & config ───────────────────────────────────────────
const STATUS_CYCLE: Record<string, string> = {
  absent: 'present',
  present: 'half_day',
  half_day: 'absent',
};

const STATUS_META: Record<string, {
  label: string;
  darkColors: [string, string];
  lightColors: [string, string];
  dot: string;
  darkText: string;
  lightText: string;
  darkBg: string;
  lightBg: string;
  icon: string;
}> = {
  present: {
    label: 'Present',
    darkColors: ['#00C48C', '#009E72'],
    lightColors: ['#00C48C', '#009E72'],
    dot: '#00C48C',
    darkText: '#00C48C',
    lightText: '#007A58',
    darkBg: 'rgba(0,196,140,0.15)',
    lightBg: 'rgba(0,122,88,0.10)',
    icon: 'checkmark-circle',
  },
  absent: {
    label: 'Absent',
    darkColors: ['#FF4D6A', '#C0203B'],
    lightColors: ['#FF4D6A', '#C0203B'],
    dot: '#FF4D6A',
    darkText: '#FF4D6A',
    lightText: '#B0102E',
    darkBg: 'rgba(255,77,106,0.15)',
    lightBg: 'rgba(176,16,46,0.10)',
    icon: 'close-circle',
  },
  half_day: {
    label: 'Half-Day',
    darkColors: ['#FFB800', '#E67E00'],
    lightColors: ['#FFB800', '#E67E00'],
    dot: '#FFB800',
    darkText: '#FFB800',
    lightText: '#A05500',
    darkBg: 'rgba(255,184,0,0.15)',
    lightBg: 'rgba(160,85,0,0.10)',
    icon: 'time',
  },
};

// ─── Status Badge (display-only — the whole card is the tap target) ─────────────
function StatusBadge({ status, isDark }: { status: string; isDark: boolean }) {
  const meta = STATUS_META[status] ?? STATUS_META.absent;
  const pillBg = isDark ? meta.darkBg : meta.lightBg;
  const textClr = isDark ? meta.darkText : meta.lightText;

  // The pill has a translucent tinted background; pairing that with the
  // clayGlow elevation makes Android draw a boxy shadow artifact behind the
  // capsule. The badge doesn't need a drop shadow, so skip the glow on Android.
  const glow = Platform.OS === 'android' ? null : clayGlow(meta.dot, 'sm');

  return (
    <View style={[styles.statusBadge, { backgroundColor: pillBg }, glow]}>
      <Ionicons name={meta.icon as any} size={13} color={textClr} style={{ marginRight: 5 }} />
      <Text style={[styles.statusBadgeText, { color: textClr }]}>{meta.label}</Text>
    </View>
  );
}

// ─── Circular progress donut ──────────────────────────────────────────────────
function DonutRing({
  present, absent, half, total, isDark,
}: { present: number; absent: number; half: number; total: number; isDark: boolean }) {
  const R = 38;
  const CIRC = 2 * Math.PI * R;
  const pct = total > 0 ? present / total : 0;

  const ringBg = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

  return (
    <View style={styles.donutWrapper}>
      {/* Background ring */}
      <View style={[styles.donutOuter, { borderColor: ringBg }]} />
      {/* Filled arc using a gradient overlay clipped to a wedge — approximated with a
          coloured ring + opacity since RN SVG isn't guaranteed.
          We use a gradient LinearGradient rotated behind a masked view. */}
      <LinearGradient
        colors={['#00C48C', '#7C6FFF']}
        style={[styles.donutFill, { opacity: total > 0 ? 1 : 0.2 }]}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
      />
      {/* White/dark mask to create donut hole */}
      <View style={[styles.donutHole, { backgroundColor: isDark ? '#0E0F1A' : '#FFFFFF' }]} />
      {/* Centre text */}
      <View style={styles.donutCenter}>
        <Text style={[styles.donutPct, { color: isDark ? '#FFFFFF' : '#111827' }]}>
          {total > 0 ? Math.round(pct * 100) : 0}
          <Text style={{ fontSize: 12 }}>%</Text>
        </Text>
        <Text style={[styles.donutLabel, { color: isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.38)' }]}>
          present
        </Text>
      </View>
    </View>
  );
}

// ─── Stat Chip ────────────────────────────────────────────────────────────────
function StatChip({
  value, label, color, icon, isDark,
}: { value: number; label: string; color: string; icon: string; isDark: boolean }) {
  const isAndroid = Platform.OS === 'android';
  // Android elevation shadows only render as a clean rounded card when the
  // background is opaque. With a translucent bg the platform draws the shadow
  // as a hard grey frame around a see-through centre (the broken "white box"
  // look), so use solid equivalents of the translucent tints on Android.
  const chipBg = isAndroid
    ? (isDark ? '#22242E' : '#F4F5F8')
    : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)');
  const chipBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const labelColor = isDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.42)';

  return (
    <View style={[styles.statChip, { backgroundColor: chipBg, borderColor: chipBorder }, clay(isDark, 'sm')]}>
      {/* The icon disc keeps its colour tint but drops the elevation glow on
          Android — a tiny translucent view + elevation casts a boxy artifact. */}
      <View style={[styles.statIcon, { backgroundColor: `${color}22` }, isAndroid ? null : clayGlow(color, 'sm')]}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: labelColor }]}>{label}</Text>
    </View>
  );
}

// ─── Staff Card — entire card is the tap target ───────────────────────────────
function StaffCard({
  staff, index, isDark, cardBg, cardBorder, onToggle,
}: {
  staff: any; index: number; isDark: boolean;
  cardBg: string; cardBorder: string; onToggle: () => void;
}) {
  const status = staff.status || 'absent';
  const meta = STATUS_META[status] ?? STATUS_META.absent;
  const pressScale = useSharedValue(1);

  const cardAnim = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  // Subtle press feedback only — no bounce/overshoot.
  const handlePressIn = () => { pressScale.value = withSpring(0.985, { damping: 20, stiffness: 260 }); };
  const handlePressOut = () => { pressScale.value = withSpring(1, { damping: 20, stiffness: 260 }); };

  const handlePress = () => { onToggle(); };

  const initials = (staff.staff_name || '?')
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Animated.View
      entering={FadeIn.delay(Math.min(index, 8) * 28).duration(220)}
      style={cardAnim}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }, clay(isDark, 'sm')]}
      >
        <View style={styles.cardRow}>
          {/* Avatar — colour reflects current status */}
          <LinearGradient
            colors={isDark ? meta.darkColors : meta.lightColors}
            style={[styles.avatar, clayGlow(meta.dot, 'sm')]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {staff.photo_url ? (
              <Image source={{ uri: staff.photo_url }} style={styles.avatarImg} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
          </LinearGradient>

          {/* Info */}
          <View style={styles.cardInfo}>
            <Text
              style={[styles.staffName, { color: isDark ? '#FFFFFF' : '#111827' }]}
              numberOfLines={1}
            >
              {staff.staff_name || 'Unknown'}
            </Text>
            <Text
              style={[styles.staffRole, { color: isDark ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.44)' }]}
              numberOfLines={1}
            >
              {staff.designation || 'Staff'}
            </Text>
          </View>

          {/* Status badge — visual indicator only */}
          <StatusBadge status={status} isDark={isDark} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Filter dropdown chip ─────────────────────────────────────────────────────
function FilterChip({
  label, active, isDark, filterBg, filterBorder, filterText, onPress,
}: {
  label: string; active: boolean; isDark: boolean;
  filterBg: string; filterBorder: string; filterText: string; onPress: () => void;
}) {
  const activeText = '#7C6FFF';
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          backgroundColor: active ? (isDark ? 'rgba(124,111,255,0.18)' : 'rgba(124,111,255,0.10)') : filterBg,
          borderColor: active ? 'rgba(124,111,255,0.55)' : filterBorder,
        },
        active ? clayGlow('#7C6FFF', 'sm') : clay(isDark, 'sm'),
      ]}
    >
      <Text style={[styles.filterChipText, { color: active ? activeText : filterText }]} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={13} color={active ? activeText : filterText} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

// ─── Filter option menu (cross-platform dropdown) ─────────────────────────────
function FilterMenu({
  visible, title, options, selected, isDark, onSelect, onClose,
}: {
  visible: boolean; title: string;
  options: { label: string; value: string | null }[];
  selected: string | null; isDark: boolean;
  onSelect: (v: string | null) => void; onClose: () => void;
}) {
  const menuBg = isDark ? '#1A1B2A' : '#FFFFFF';
  const menuBorder = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';
  const titleColor = isDark ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.42)';
  const rowText = isDark ? '#FFFFFF' : '#111827';

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <Pressable style={[styles.menuCard, { backgroundColor: menuBg, borderColor: menuBorder }, clay(isDark, 'lg')]}>
          <Text style={[styles.menuTitle, { color: titleColor }]}>{title}</Text>
          {options.map((opt) => {
            const isSel = selected === opt.value;
            return (
              <TouchableOpacity
                key={opt.label}
                activeOpacity={0.7}
                style={[
                  styles.menuRow,
                  isSel && { backgroundColor: isDark ? 'rgba(124,111,255,0.16)' : 'rgba(124,111,255,0.09)' },
                ]}
                onPress={() => { onSelect(opt.value); onClose(); }}
              >
                <Text style={[styles.menuRowText, { color: isSel ? '#7C6FFF' : rowText }]}>{opt.label}</Text>
                {isSel && <Ionicons name="checkmark" size={17} color="#7C6FFF" />}
              </TouchableOpacity>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AdminAttendanceScreen() {
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 60; // Approximate header height including spacing
  
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const todayYMD = toYMD(new Date());
  const [selectedDate, setSelectedDate] = useState(todayYMD);
  const [deptFilter, setDeptFilter] = useState<string | null>(null);      // null → all designations
  const [statusFilter, setStatusFilter] = useState<string | null>(null);  // null → all statuses
  const [openMenu, setOpenMenu] = useState<'dept' | 'status' | null>(null);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
  });

  // ── Theme tokens ────────────────────────────────────────────────────────────
  const pageBg = isDark ? '#0E0F1A' : '#F2F3F8';
  const cardBg = isDark ? 'rgba(255,255,255,0.048)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const summaryBg = isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
  const summaryBorder = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const titleColor = isDark ? '#FFFFFF' : '#111827';
  const subColor = isDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.42)';
  const sectionColor = isDark ? 'rgba(255,255,255,0.36)' : 'rgba(0,0,0,0.36)';
  const filterBg = isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const filterBorder = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
  const filterText = isDark ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.65)';
  const footerBg = isDark ? 'rgba(14,15,26,0.97)' : 'rgba(242,243,248,0.97)';
  const footerBorder = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
  const orb1Color = isDark ? 'rgba(124,111,255,0.08)' : 'rgba(124,111,255,0.05)';
  const orb2Color = isDark ? 'rgba(0,196,140,0.06)' : 'rgba(0,196,140,0.05)';

  // ── Data ────────────────────────────────────────────────────────────────────
  const fetchAttendance = async () => {
    try {
      setLoading(true);
      const data = await api.get<any[]>('/attendance/staff', { date: selectedDate });
      setStaffList(data || []);
    } catch { }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Refetch whenever the viewed day changes (also covers initial mount).
  useEffect(() => { fetchAttendance(); }, [selectedDate]);

  const onRefresh = () => { setRefreshing(true); fetchAttendance(); };

  const toggleStatus = (staffId: string) => {
    setStaffList((prev) =>
      prev.map((s) =>
        s.staff_id === staffId
          ? { ...s, status: STATUS_CYCLE[s.status || 'absent'] }
          : s
      )
    );
  };

  const handleMarkAll = (status: string) => {
    alertCompat(
      'Confirm Bulk Update',
      `Are you sure you want to mark all staff as ${STATUS_META[status]?.label}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: () => {
            setIsBulkUpdating(true);
            setTimeout(() => {
              setStaffList((prev) =>
                prev.map((s) => ({ ...s, status }))
              );
              setIsBulkUpdating(false);
            }, 50);
          },
        },
      ]
    );
  };

  const submitAttendance = async () => {
    try {
      const records = staffList.map((s) => ({ staff_id: s.staff_id, status: s.status || 'absent' }));
      await api.post('/attendance/staff', { date: selectedDate, attendance: records });
      alertCompat('✓ Saved', 'Attendance marked successfully.');
    } catch {
      alertCompat('Error', 'Failed to save attendance.');
    }
  };

  const stats = useMemo(() => {
    let present = 0, absent = 0, half = 0;
    staffList.forEach((s) => {
      if (s.status === 'present') present++;
      else if (s.status === 'absent') absent++;
      else if (s.status === 'half_day') half++;
      else absent++;               // default unset → absent
    });
    return { present, absent, half, total: staffList.length };
  }, [staffList]);

  // ── Distinct designations for the department filter ───────────────────────────
  const deptOptions = useMemo(() => {
    const set = new Set<string>();
    staffList.forEach((s) => { if (s.designation) set.add(s.designation); });
    return [
      { label: 'All Departments', value: null as string | null },
      ...Array.from(set).sort().map((d) => ({ label: d, value: d })),
    ];
  }, [staffList]);

  const statusOptions: { label: string; value: string | null }[] = [
    { label: 'All Statuses', value: null },
    { label: 'Present', value: 'present' },
    { label: 'Absent', value: 'absent' },
    { label: 'Half-Day', value: 'half_day' },
  ];

  // ── Apply department + status filters to the visible list ─────────────────────
  const filteredStaff = useMemo(() => {
    return staffList.filter((s) => {
      const st = s.status || 'absent';
      if (deptFilter && s.designation !== deptFilter) return false;
      if (statusFilter && st !== statusFilter) return false;
      return true;
    });
  }, [staffList, deptFilter, statusFilter]);

  // ── Date label ────────────────────────────────────────────────────────────────
  const isToday = selectedDate === todayYMD;
  const selectedDateObj = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }, [selectedDate]);
  const todayStr = selectedDateObj.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      {/* Ambient orbs */}
      <View style={[styles.orb1, { backgroundColor: orb1Color }]} />
      <View style={[styles.orb2, { backgroundColor: orb2Color }]} />

      <AdminHeader title="Staff Attendance" showNotification scrollY={scrollY} />

      {loading && !refreshing ? (
        <View style={styles.loaderContainer}>
          <LogoLoader size={56} color="#7C6FFF" />
          <Text style={[styles.loaderText, { color: subColor }]}>Loading attendance…</Text>
        </View>
      ) : (
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight + 16 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="transparent"
              colors={['transparent']}
              progressBackgroundColor="transparent"
            />
          }
        >
          {/* Pull-to-refresh logo */}
          {refreshing && (
            <View style={{ alignItems: 'center', paddingBottom: 16 }}>
              <LogoLoader size={30} color="#7C6FFF" />
            </View>
          )}

          {/* ── Overview card ─────────────────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.duration(280)}
            style={[styles.summaryCard, { backgroundColor: summaryBg, borderColor: summaryBorder }, clay(isDark, 'lg')]}
          >
            <View style={styles.summaryTop}>
              {/* Left: title + date */}
              <View style={{ flex: 1 }}>
                <View style={styles.sectionAccentRow}>
                  <LinearGradient
                    colors={['#7C6FFF', '#5A4FE0']}
                    style={styles.sectionAccent}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  />
                  <Text style={[styles.overviewLabel, { color: sectionColor }]}>{isToday ? "TODAY'S OVERVIEW" : 'DAY OVERVIEW'}</Text>
                </View>
                <Text style={[styles.dateTitle, { color: titleColor }]}>Attendance</Text>
                <Text style={[styles.dateSub, { color: subColor }]}>{todayStr}</Text>
              </View>

              {/* Right: donut */}
              <DonutRing {...stats} isDark={isDark} />
            </View>

            {/* Stat chips */}
            <View style={styles.statChipsRow}>
              <StatChip value={stats.present} label="Present" color="#00C48C" icon="checkmark-circle" isDark={isDark} />
              <StatChip value={stats.absent} label="Absent" color="#FF4D6A" icon="close-circle" isDark={isDark} />
              <StatChip value={stats.half} label="Half-Day" color="#FFB800" icon="time" isDark={isDark} />
            </View>
          </Animated.View>

          {/* ── Filters: department · status · date ─────────────────────────── */}
          <Animated.View entering={FadeIn.duration(200)} style={styles.filterRow}>
            <FilterChip
              label={deptFilter ?? 'All Depts'}
              active={!!deptFilter}
              isDark={isDark}
              filterBg={filterBg}
              filterBorder={filterBorder}
              filterText={filterText}
              onPress={() => setOpenMenu('dept')}
            />
            <FilterChip
              label={statusFilter ? (STATUS_META[statusFilter]?.label ?? 'Status') : 'Status'}
              active={!!statusFilter}
              isDark={isDark}
              filterBg={filterBg}
              filterBorder={filterBorder}
              filterText={filterText}
              onPress={() => setOpenMenu('status')}
            />
            <AppDatePicker
              value={selectedDate}
              onChange={setSelectedDate}
              maximumDate={todayYMD}
              variant="compact"
              isDark={isDark}
              accentColor="#7C6FFF"
              containerStyle={styles.datePickerContainer}
            />
          </Animated.View>

          <FilterMenu
            visible={openMenu === 'dept'}
            title="Filter by department"
            options={deptOptions}
            selected={deptFilter}
            isDark={isDark}
            onSelect={setDeptFilter}
            onClose={() => setOpenMenu(null)}
          />
          <FilterMenu
            visible={openMenu === 'status'}
            title="Filter by status"
            options={statusOptions}
            selected={statusFilter}
            isDark={isDark}
            onSelect={setStatusFilter}
            onClose={() => setOpenMenu(null)}
          />

          {/* ── Section header ─────────────────────────────────────────────── */}
          <Animated.View
            entering={FadeIn.duration(200)}
            style={styles.listHeader}
          >
            <View style={styles.sectionAccentRow}>
              <LinearGradient
                colors={['#7C6FFF', '#5A4FE0']}
                style={styles.sectionAccent}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
              <Text style={[styles.sectionTitle, { color: sectionColor }]}>STAFF LIST</Text>
            </View>
            <View style={[styles.countBadge, { backgroundColor: isDark ? 'rgba(124,111,255,0.18)' : 'rgba(124,111,255,0.12)' }, clayGlow('#7C6FFF', 'sm')]}>
              <Text style={styles.countBadgeText}>{filteredStaff.length}</Text>
            </View>
          </Animated.View>

          {/* ── Staff cards ────────────────────────────────────────────────── */}
          {filteredStaff.length === 0 ? (
            <Animated.View entering={FadeIn.duration(240)} style={styles.emptyBox}>
              <LinearGradient
                colors={['rgba(124,111,255,0.15)', 'rgba(124,111,255,0.04)']}
                style={[styles.emptyIcon, clay(isDark, 'md')]}
              >
                <Ionicons name={staffList.length === 0 ? 'people-outline' : 'filter-outline'} size={36} color="rgba(124,111,255,0.6)" />
              </LinearGradient>
              <Text style={[styles.emptyTitle, { color: titleColor }]}>
                {staffList.length === 0 ? 'No Staff Found' : 'No Matches'}
              </Text>
              <Text style={[styles.emptySub, { color: subColor }]}>
                {staffList.length === 0
                  ? 'Pull down to refresh the list'
                  : 'No staff match the selected filters'}
              </Text>
            </Animated.View>
          ) : (
            filteredStaff.map((staff, index) => (
              <StaffCard
                key={staff.staff_id}
                staff={staff}
                index={index}
                isDark={isDark}
                cardBg={cardBg}
                cardBorder={cardBorder}
                onToggle={() => toggleStatus(staff.staff_id)}
              />
            ))
          )}
        </Animated.ScrollView>
      )}

      {/* ── Footer CTA ──────────────────────────────────────────────────────── */}
      <View style={[styles.footerContainer, { backgroundColor: footerBg, borderTopColor: footerBorder }, clay(isDark, 'lg')]}>
        <View style={styles.quickActions}>
          <TouchableOpacity onPress={() => handleMarkAll('present')} style={[styles.quickBtn, { backgroundColor: isDark ? STATUS_META.present.darkBg : STATUS_META.present.lightBg }]}>
            <Ionicons name="checkmark-circle" size={14} color={isDark ? STATUS_META.present.darkText : STATUS_META.present.lightText} />
            <Text style={[styles.quickBtnText, { color: isDark ? STATUS_META.present.darkText : STATUS_META.present.lightText }]}>All Present</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleMarkAll('absent')} style={[styles.quickBtn, { backgroundColor: isDark ? STATUS_META.absent.darkBg : STATUS_META.absent.lightBg }]}>
            <Ionicons name="close-circle" size={14} color={isDark ? STATUS_META.absent.darkText : STATUS_META.absent.lightText} />
            <Text style={[styles.quickBtnText, { color: isDark ? STATUS_META.absent.darkText : STATUS_META.absent.lightText }]}>All Absent</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleMarkAll('half_day')} style={[styles.quickBtn, { backgroundColor: isDark ? STATUS_META.half_day.darkBg : STATUS_META.half_day.lightBg }]}>
            <Ionicons name="time" size={14} color={isDark ? STATUS_META.half_day.darkText : STATUS_META.half_day.lightText} />
            <Text style={[styles.quickBtnText, { color: isDark ? STATUS_META.half_day.darkText : STATUS_META.half_day.lightText }]}>All Half</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footerRow}>
          <View style={styles.footerMeta}>
            <Text style={[styles.footerCount, { color: titleColor }]}>
              {stats.present}
              <Text style={[styles.footerTotal, { color: subColor }]}> / {stats.total} present</Text>
            </Text>
          </View>
          <TouchableOpacity onPress={submitAttendance} disabled={isBulkUpdating} activeOpacity={0.85} style={[styles.submitBtn, clayGlow('#7C6FFF', 'md')]}>
            <LinearGradient
              colors={['#7C6FFF', '#5A4FE0']}
              style={styles.submitGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {isBulkUpdating ? (
                <LogoLoader size={20} color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.submitText}>Mark Attendance</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Static styles (zero hardcoded colours — injected inline) ─────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Orbs
  orb1: { position: 'absolute', width: 300, height: 300, borderRadius: 150, top: -80, right: -100 },
  orb2: { position: 'absolute', width: 200, height: 200, borderRadius: 100, bottom: 140, left: -80 },

  // Scroll
  scrollContent: { paddingTop: 100, paddingHorizontal: 20, paddingBottom: 160 },

  // Loader
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
  loaderText: { fontSize: 14, fontWeight: '500', letterSpacing: 0.4 },

  // Summary card
  summaryCard: {
    borderRadius: 28, padding: 22, marginBottom: 22,
    borderWidth: 1,
  },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },

  // Section accent
  sectionAccentRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  sectionAccent: { width: 3, height: 12, borderRadius: 2, marginRight: 7 },
  overviewLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2.2 },

  dateTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginBottom: 3 },
  dateSub: { fontSize: 13, fontWeight: '500' },

  // Donut
  donutWrapper: {
    width: 90, height: 90,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 10,
  },
  donutOuter: {
    position: 'absolute', width: 82, height: 82, borderRadius: 41,
    borderWidth: 6,
  },
  donutFill: {
    position: 'absolute', width: 82, height: 82, borderRadius: 41,
  },
  donutHole: {
    position: 'absolute', width: 62, height: 62, borderRadius: 31,
  },
  donutCenter: { alignItems: 'center' },
  donutPct: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  donutLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5, marginTop: 1 },

  // Stat chips
  statChipsRow: { flexDirection: 'row', gap: 10 },
  statChip: {
    flex: 1, alignItems: 'center', padding: 14,
    borderRadius: 20, borderWidth: 1, gap: 5,
  },
  statIcon: {
    width: 30, height: 30, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },

  // Filters
  filterRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 15, paddingVertical: 11,
    borderRadius: 16, borderWidth: 1,
  },
  filterChipText: { fontSize: 12, fontWeight: '600', maxWidth: 120 },
  datePickerContainer: { flex: 1 },

  // Filter dropdown menu
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  menuCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  menuTitle: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8,
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 12, borderRadius: 11,
  },
  menuRowText: { fontSize: 15, fontWeight: '600' },

  // List header
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 2.2 },
  countBadge: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 13 },
  countBadgeText: { fontSize: 12, fontWeight: '700', color: '#7C6FFF' },

  // Staff card
  card: {
    borderRadius: 22, padding: 15, marginBottom: 13,
    borderWidth: 1,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center', marginRight: 13,
    overflow: 'hidden',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  avatarImg: { width: '100%', height: '100%', borderRadius: 23 },
  cardInfo: { flex: 1 },
  staffName: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, marginBottom: 3 },
  staffRole: { fontSize: 12, fontWeight: '500' },

  // Status badge
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },

  // Empty state
  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: {
    width: 76, height: 76, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4, borderWidth: 1, borderColor: 'rgba(124,111,255,0.2)',
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  emptySub: { fontSize: 13, fontWeight: '500', textAlign: 'center', paddingHorizontal: 40 },

  // Footer
  footerContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1,
    flexDirection: 'column',
    gap: 12,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  quickBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  footerMeta: { justifyContent: 'center' },
  footerCount: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  footerTotal: { fontSize: 14, fontWeight: '500' },
  submitBtn: { flex: 1, borderRadius: 18 },
  submitGrad: {
    flexDirection: 'row', height: 52,
    alignItems: 'center', justifyContent: 'center', borderRadius: 18,
  },
  submitText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 },
});