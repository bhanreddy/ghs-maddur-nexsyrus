import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Pressable,
  Platform,
  Image,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/hooks/useTheme';
import AdminHeader from '../../src/components/AdminHeader';
import LogoLoader from '../../src/components/LogoLoader';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { api } from '../../src/services/apiClient';
import AppDatePicker, { toYMD } from '../../src/components/AppDatePicker';

// ─── Claymorphism shadow helpers ──────────────────────────────────────────────
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

const STATUS_META: Record<string, {
  label: string;
  short: string;
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
    short: 'P',
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
    short: 'A',
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
    short: 'H',
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

const STATUS_KEYS = ['present', 'absent', 'half_day'] as const;

const STATUS_CYCLE: Record<string, string> = {
  absent: 'present',
  present: 'half_day',
  half_day: 'absent',
};

// ─── Compact status segment (explicit tap targets) ────────────────────────────
function StatusSegment({
  status, isDark, onSelect, stretch,
}: {
  status: string; isDark: boolean; onSelect: (s: string) => void; stretch?: boolean;
}) {
  const trackBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const trackBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  return (
    <View style={[
      styles.segmentTrack,
      { backgroundColor: trackBg, borderColor: trackBorder },
      stretch && styles.segmentTrackStretch,
    ]}>
      {STATUS_KEYS.map((key) => {
        const meta = STATUS_META[key];
        const active = status === key;
        const textClr = isDark ? meta.darkText : meta.lightText;
        return (
          <TouchableOpacity
            key={key}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${meta.label}`}
            accessibilityState={{ selected: active }}
            activeOpacity={0.75}
            onPress={(e) => {
              // Keep segment taps from also cycling the whole card (esp. on web).
              e?.stopPropagation?.();
              onSelect(key);
            }}
            hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
            style={[
              styles.segmentBtn,
              stretch && styles.segmentBtnStretch,
              active && {
                backgroundColor: isDark ? meta.darkBg : meta.lightBg,
                borderColor: `${meta.dot}55`,
              },
            ]}
          >
            <Ionicons
              name={meta.icon as any}
              size={13}
              color={active ? textClr : (isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.32)')}
            />
            <Text
              style={[
                styles.segmentLabel,
                { color: active ? textClr : (isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.38)') },
              ]}
            >
              {stretch ? meta.label : meta.short}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Mini stat pill (tappable filter) ─────────────────────────────────────────
function MiniStat({
  value, label, color, icon, isDark, active, onPress,
}: {
  value: number; label: string; color: string; icon: string;
  isDark: boolean; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Filter ${label}`}
      accessibilityState={{ selected: active }}
      style={[
        styles.miniStat,
        {
          backgroundColor: active ? `${color}20` : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
          borderColor: active ? `${color}66` : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
        },
      ]}
    >
      <Ionicons name={icon as any} size={12} color={color} />
      <Text style={[styles.miniStatValue, { color }]}>{value}</Text>
      <Text style={[styles.miniStatLabel, { color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Staff Card ───────────────────────────────────────────────────────────────
function StaffCard({
  staff, index, isDark, cardBg, cardBorder, onSelectStatus, compact,
}: {
  staff: any; index: number; isDark: boolean;
  cardBg: string; cardBorder: string; onSelectStatus: (status: string) => void;
  compact: boolean;
}) {
  const status = staff.status || 'absent';
  const meta = STATUS_META[status] ?? STATUS_META.absent;
  const nextStatus = STATUS_CYCLE[status] ?? 'present';
  const nextLabel = STATUS_META[nextStatus]?.label ?? 'Present';

  const initials = (staff.staff_name || '?')
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const cycleStatus = () => {
    onSelectStatus(STATUS_CYCLE[status] ?? 'present');
  };

  return (
    <Animated.View
      entering={FadeIn.delay(Math.min(index, 8) * 28).duration(220)}
    >
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={cycleStatus}
        accessibilityRole="button"
        accessibilityLabel={`${staff.staff_name || 'Staff'}, ${meta.label}. Tap to mark ${nextLabel}`}
        style={[
          styles.card,
          {
            backgroundColor: cardBg,
            borderColor: cardBorder,
            borderLeftWidth: 3,
            borderLeftColor: meta.dot,
          },
          clay(isDark, 'sm'),
        ]}
      >
        <View style={[styles.cardRow, compact && styles.cardRowStacked]}>
          <View style={styles.cardIdentity}>
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
          </View>

          <StatusSegment
            status={status}
            isDark={isDark}
            onSelect={onSelectStatus}
            stretch={compact}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Filter dropdown chip ─────────────────────────────────────────────────────
function FilterChip({
  label, active, isDark, filterBg, filterBorder, filterText, onPress, icon,
}: {
  label: string; active: boolean; isDark: boolean;
  filterBg: string; filterBorder: string; filterText: string;
  onPress: () => void; icon?: string;
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
      {icon ? (
        <Ionicons name={icon as any} size={13} color={active ? activeText : filterText} style={{ marginRight: 5 }} />
      ) : null}
      <Text style={[styles.filterChipText, { color: active ? activeText : filterText }]} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={13} color={active ? activeText : filterText} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

// ─── Filter option menu ───────────────────────────────────────────────────────
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
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const headerHeight = insets.top + 60;
  const isCompact = windowWidth < 420;

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<any[]>([]);
  const originalStaffRef = React.useRef<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const todayYMD = toYMD(new Date());
  const [selectedDate, setSelectedDate] = useState(todayYMD);
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<'dept' | 'status' | null>(null);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
  });

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
  const searchBg = isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const orb1Color = isDark ? 'rgba(124,111,255,0.08)' : 'rgba(124,111,255,0.05)';
  const orb2Color = isDark ? 'rgba(0,196,140,0.06)' : 'rgba(0,196,140,0.05)';

  const fetchAttendance = React.useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<any[]>('/attendance/staff', { date: selectedDate });
      const list = data || [];
      setStaffList(list);
      originalStaffRef.current = list.map((s) => ({ ...s }));
    } catch { }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => { void fetchAttendance(); }, [fetchAttendance]);

  const onRefresh = () => { setRefreshing(true); fetchAttendance(); };

  const setStaffStatus = (staffId: string, status: string) => {
    setStaffList((prev) =>
      prev.map((s) => (s.staff_id === staffId ? { ...s, status } : s))
    );
  };

  const handleMarkAll = () => {
    const ids = new Set(filteredStaff.map((s) => s.staff_id));
    if (ids.size === 0) return;
    setStaffList((prev) =>
      prev.map((s) => (ids.has(s.staff_id) ? { ...s, status: 'present' } : s))
    );
  };

  const handleReset = () => {
    setStaffList(originalStaffRef.current.map((s) => ({ ...s })));
  };

  const submitAttendance = async () => {
    try {
      setIsSaving(true);
      const records = staffList.map((s) => ({ staff_id: s.staff_id, status: s.status || 'absent' }));
      await api.post('/attendance/staff', { date: selectedDate, attendance: records });
      originalStaffRef.current = staffList.map((s) => ({ ...s }));
      alertCompat('✓ Saved', 'Attendance marked successfully.');
    } catch {
      alertCompat('Error', 'Failed to save attendance.');
    } finally {
      setIsSaving(false);
    }
  };

  const stats = useMemo(() => {
    let present = 0, absent = 0, half = 0;
    staffList.forEach((s) => {
      if (s.status === 'present') present++;
      else if (s.status === 'absent') absent++;
      else if (s.status === 'half_day') half++;
      else absent++;
    });
    return { present, absent, half, total: staffList.length };
  }, [staffList]);

  const presentPct = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;

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

  const filteredStaff = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return staffList.filter((s) => {
      const st = s.status || 'absent';
      if (deptFilter && s.designation !== deptFilter) return false;
      if (statusFilter && st !== statusFilter) return false;
      if (q) {
        const name = (s.staff_name || '').toLowerCase();
        const role = (s.designation || '').toLowerCase();
        if (!name.includes(q) && !role.includes(q)) return false;
      }
      return true;
    });
  }, [staffList, deptFilter, statusFilter, searchQuery]);

  const hasActiveFilters = !!(deptFilter || statusFilter || searchQuery.trim());

  const clearFilters = () => {
    setDeptFilter(null);
    setStatusFilter(null);
    setSearchQuery('');
  };

  const toggleStatusFilter = (key: string) => {
    setStatusFilter((prev) => (prev === key ? null : key));
  };

  const isToday = selectedDate === todayYMD;
  const selectedDateObj = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }, [selectedDate]);
  const todayStr = selectedDateObj.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <View style={[styles.orb1, { backgroundColor: orb1Color }]} />
      <View style={[styles.orb2, { backgroundColor: orb2Color }]} />

      <AdminHeader title="Staff Attendance" showNotification scrollY={scrollY} />

      {loading && !refreshing ? (
        <View style={styles.loaderContainer}>
          <LogoLoader size={56} color="#7C6FFF" />
          <Text style={[styles.loaderText, { color: subColor }]}>Loading attendance…</Text>
        </View>
      ) : (
        <View style={[styles.body, { paddingTop: headerHeight + 10 }]}>
          {/* ── Slim overview strip (stays pinned) ────────────────────────── */}
          <View style={[
            styles.summaryStrip,
            { backgroundColor: summaryBg, borderColor: summaryBorder },
            isCompact && styles.summaryStripStacked,
            clay(isDark, 'sm'),
          ]}>
            <View style={styles.summaryStripLeft}>
              <Text style={[styles.dateTitle, { color: titleColor }]} numberOfLines={1}>
                {isToday ? 'Today' : todayStr}
              </Text>
              <View style={styles.pctRow}>
                <Text style={[styles.pctText, { color: '#00C48C' }]}>{presentPct}%</Text>
                <Text style={[styles.pctSub, { color: subColor }]}>
                  {stats.present}/{stats.total} present
                </Text>
                {!isToday && (
                  <TouchableOpacity
                    onPress={() => setSelectedDate(todayYMD)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.todayChipText}>Today</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={[styles.miniStatRow, isCompact && styles.miniStatRowFull]}>
              <MiniStat
                value={stats.present}
                label="P"
                color="#00C48C"
                icon="checkmark-circle"
                isDark={isDark}
                active={statusFilter === 'present'}
                onPress={() => toggleStatusFilter('present')}
              />
              <MiniStat
                value={stats.absent}
                label="A"
                color="#FF4D6A"
                icon="close-circle"
                isDark={isDark}
                active={statusFilter === 'absent'}
                onPress={() => toggleStatusFilter('absent')}
              />
              <MiniStat
                value={stats.half}
                label="H"
                color="#FFB800"
                icon="time"
                isDark={isDark}
                active={statusFilter === 'half_day'}
                onPress={() => toggleStatusFilter('half_day')}
              />
            </View>
          </View>

          {/* ── Scrollable: search, filters, staff, actions ──────────────── */}
          <Animated.FlatList
            data={filteredStaff}
            keyExtractor={(item) => String(item.staff_id)}
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={16}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="transparent"
                colors={['transparent']}
                progressBackgroundColor="transparent"
              />
            }
            ListHeaderComponent={
              <View>
                {refreshing ? (
                  <View style={{ alignItems: 'center', paddingBottom: 12 }}>
                    <LogoLoader size={28} color="#7C6FFF" />
                  </View>
                ) : null}

                <View style={[styles.searchWrap, { backgroundColor: searchBg, borderColor: filterBorder }, clay(isDark, 'sm')]}>
                  <Ionicons name="search" size={16} color={filterText} style={{ marginRight: 8 }} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search staff…"
                    placeholderTextColor={isDark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.32)'}
                    style={[styles.searchInput, { color: titleColor }]}
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                  />
                  {searchQuery.length > 0 && Platform.OS !== 'ios' ? (
                    <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color={filterText} />
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.filterRow}>
                  <FilterChip
                    label={deptFilter ?? 'All Depts'}
                    active={!!deptFilter}
                    isDark={isDark}
                    filterBg={filterBg}
                    filterBorder={filterBorder}
                    filterText={filterText}
                    icon="business-outline"
                    onPress={() => setOpenMenu('dept')}
                  />
                  <FilterChip
                    label={statusFilter ? (STATUS_META[statusFilter]?.label ?? 'Status') : 'Status'}
                    active={!!statusFilter}
                    isDark={isDark}
                    filterBg={filterBg}
                    filterBorder={filterBorder}
                    filterText={filterText}
                    icon="funnel-outline"
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
                </View>

                {hasActiveFilters && (
                  <TouchableOpacity onPress={clearFilters} style={styles.clearFiltersRow} activeOpacity={0.7}>
                    <Ionicons name="close-circle-outline" size={14} color="#7C6FFF" />
                    <Text style={styles.clearFiltersText}>Clear filters</Text>
                  </TouchableOpacity>
                )}

                <View style={styles.listHeader}>
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
                    <Text style={styles.countBadgeText}>
                      {hasActiveFilters ? `${filteredStaff.length} of ${staffList.length}` : filteredStaff.length}
                    </Text>
                  </View>
                </View>
              </View>
            }
            ListEmptyComponent={
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
                    : 'Try a different search or clear filters'}
                </Text>
                {hasActiveFilters && staffList.length > 0 ? (
                  <TouchableOpacity onPress={clearFilters} style={styles.emptyClearBtn} activeOpacity={0.8}>
                    <Text style={styles.emptyClearText}>Clear filters</Text>
                  </TouchableOpacity>
                ) : null}
              </Animated.View>
            }
            renderItem={({ item, index }) => (
              <StaffCard
                staff={item}
                index={index}
                isDark={isDark}
                cardBg={cardBg}
                cardBorder={cardBorder}
                compact={isCompact}
                onSelectStatus={(status) => setStaffStatus(item.staff_id, status)}
              />
            )}
            ListFooterComponent={
              staffList.length === 0 ? null : (
                <View
                  style={[
                    styles.footerContainer,
                    {
                      backgroundColor: cardBg,
                      borderColor: cardBorder,
                    },
                    clay(isDark, 'lg'),
                  ]}
                >
                  <View style={styles.quickActions}>
                    <TouchableOpacity
                      onPress={handleMarkAll}
                      disabled={filteredStaff.length === 0}
                      accessibilityRole="button"
                      accessibilityLabel="Mark all visible staff present"
                      style={[
                        styles.quickBtn,
                        { backgroundColor: isDark ? STATUS_META.present.darkBg : STATUS_META.present.lightBg },
                        filteredStaff.length === 0 && { opacity: 0.45 },
                      ]}
                    >
                      <Ionicons name="checkmark-done" size={15} color={isDark ? STATUS_META.present.darkText : STATUS_META.present.lightText} />
                      <Text style={[styles.quickBtnText, { color: isDark ? STATUS_META.present.darkText : STATUS_META.present.lightText }]}>
                        Mark All
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleReset}
                      disabled={staffList.length === 0}
                      accessibilityRole="button"
                      accessibilityLabel="Reset attendance to last loaded values"
                      style={[
                        styles.quickBtn,
                        { backgroundColor: isDark ? 'rgba(124,111,255,0.16)' : 'rgba(124,111,255,0.10)' },
                        staffList.length === 0 && { opacity: 0.45 },
                      ]}
                    >
                      <Ionicons name="refresh" size={15} color={isDark ? '#C7D2FE' : '#5A4FE0'} />
                      <Text style={[styles.quickBtnText, { color: isDark ? '#C7D2FE' : '#5A4FE0' }]}>
                        Reset
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.footerRow}>
                    <View style={styles.footerMeta}>
                      <Text style={[styles.footerCount, { color: titleColor }]}>
                        {stats.present}
                        <Text style={[styles.footerTotal, { color: subColor }]}> / {stats.total}</Text>
                      </Text>
                      <Text style={[styles.footerPct, { color: subColor }]}>{presentPct}% present</Text>
                    </View>
                    <TouchableOpacity
                      onPress={submitAttendance}
                      disabled={isSaving || staffList.length === 0}
                      activeOpacity={0.85}
                      style={[
                        styles.submitBtn,
                        clayGlow('#7C6FFF', 'md'),
                        (isSaving || staffList.length === 0) && { opacity: 0.55 },
                      ]}
                    >
                      <LinearGradient
                        colors={['#7C6FFF', '#5A4FE0']}
                        style={styles.submitGrad}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        {isSaving ? (
                          <LogoLoader size={20} color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-done" size={18} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.submitText}>Save Attendance</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            }
          />
        </View>
      )}

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

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  orb1: { position: 'absolute', width: 300, height: 300, borderRadius: 150, top: -80, right: -100 },
  orb2: { position: 'absolute', width: 200, height: 200, borderRadius: 100, bottom: 140, left: -80 },

  body: {
    flex: 1,
    paddingHorizontal: 16,
  },

  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
  loaderText: { fontSize: 14, fontWeight: '500', letterSpacing: 0.4 },

  // Slim overview
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    gap: 10,
  },
  summaryStripStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  summaryStripLeft: { flexShrink: 1, minWidth: 0, marginRight: 4 },
  dateTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3, marginBottom: 2 },
  pctRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  pctText: { fontSize: 13, fontWeight: '800' },
  pctSub: { fontSize: 11, fontWeight: '500' },
  todayChipText: { fontSize: 11, fontWeight: '700', color: '#7C6FFF' },

  miniStatRow: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  miniStatRowFull: { width: '100%' },
  miniStat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    flexGrow: 1,
  },
  miniStatValue: { fontSize: 13, fontWeight: '800' },
  miniStatLabel: { fontSize: 10, fontWeight: '700' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 9 : 2,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1, fontSize: 14, fontWeight: '500',
    paddingVertical: Platform.OS === 'android' ? 7 : 0,
    outlineStyle: 'none' as any,
  },

  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 11, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1,
  },
  filterChipText: { fontSize: 12, fontWeight: '600', maxWidth: 110 },
  datePickerContainer: { flexGrow: 1, flexShrink: 1, minWidth: 120 },

  clearFiltersRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', marginBottom: 6, paddingVertical: 2,
  },
  clearFiltersText: { fontSize: 12, fontWeight: '700', color: '#7C6FFF' },

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

  listHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8, marginTop: 2,
  },
  sectionAccentRow: { flexDirection: 'row', alignItems: 'center' },
  sectionAccent: { width: 3, height: 12, borderRadius: 2, marginRight: 7 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 2.2 },
  countBadge: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 13 },
  countBadgeText: { fontSize: 12, fontWeight: '700', color: '#7C6FFF' },

  list: { flex: 1 },
  listContent: { flexGrow: 1 },

  card: {
    borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8,
    borderWidth: 1,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardRowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  cardIdentity: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
    overflow: 'hidden',
  },
  avatarText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  avatarImg: { width: '100%', height: '100%', borderRadius: 20 },
  cardInfo: { flex: 1, marginRight: 8, minWidth: 0 },
  staffName: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2, marginBottom: 2 },
  staffRole: { fontSize: 11, fontWeight: '500' },

  segmentTrack: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 2,
    gap: 2,
    alignSelf: 'flex-start',
  },
  segmentTrackStretch: {
    alignSelf: 'stretch',
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    minWidth: 36,
  },
  segmentBtnStretch: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 9,
  },
  segmentLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

  emptyBox: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4, borderWidth: 1, borderColor: 'rgba(124,111,255,0.2)',
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  emptySub: { fontSize: 13, fontWeight: '500', textAlign: 'center', paddingHorizontal: 40 },
  emptyClearBtn: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(124,111,255,0.12)',
  },
  emptyClearText: { fontSize: 13, fontWeight: '700', color: '#7C6FFF' },

  footerContainer: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'column',
    gap: 10,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  quickBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  footerMeta: { justifyContent: 'center', minWidth: 72 },
  footerCount: { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
  footerTotal: { fontSize: 13, fontWeight: '500' },
  footerPct: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  submitBtn: { flex: 1, borderRadius: 16 },
  submitGrad: {
    flexDirection: 'row', height: 50,
    alignItems: 'center', justifyContent: 'center', borderRadius: 16,
  },
  submitText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 },
});
