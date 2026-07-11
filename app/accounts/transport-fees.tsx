import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import { styles as ds } from '@/src/theme/styles';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AdminHeader from '../../src/components/AdminHeader';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import { useTheme } from '../../src/hooks/useTheme';
import LogoLoader from '../../src/components/LogoLoader';
import {
  TransportFeeService,
  TransportRouteWithFees,
  TransportStopFee,
  TransportStudentFee,
  TransportBillingCycle,
} from '../../src/services/transportFeeService';
import { ClassService } from '../../src/services/classService';
import { AcademicYearService } from '../../src/services/academicYearService';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { APIError } from '../../src/services/apiClient';
import { generateUUID } from './fees/collect';

/* ------------------------------------------------------------------ *
 * Constants & palette (light theme only — never default to dark)
 * ------------------------------------------------------------------ */
const fmtINR = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const BILLING_CYCLES: TransportBillingCycle[] = ['term', 'monthly', 'quarterly', 'annual'];
const PAYMENT_MODES = [
  { id: 'cash' as const, label: 'Cash', icon: 'cash-outline' as const },
  { id: 'upi' as const, label: 'UPI', icon: 'phone-portrait-outline' as const },
  { id: 'cheque' as const, label: 'Cheque', icon: 'document-text-outline' as const },
];

const C = {
  accent: '#0891B2',
  accentDark: '#0E7490',
  accentSoft: '#ECFEFF',
  accentSoft2: '#E0F2FE',
  ink: '#0F172A',
  body: '#334155',
  sub: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  hairline: '#F1F5F9',
  surface: '#FFFFFF',
  canvas: '#FAFBFC',
  ok: '#059669',
  okSoft: '#ECFDF5',
  okSoft2: '#D1FAE5',
  warn: '#B45309',
  warnDeep: '#92400E',
  warnSoft: '#FFFBEB',
  warnSoft2: '#FEF3C7',
  warnLine: '#FDE68A',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  indigo: '#4F46E5',
  indigoDark: '#4338CA',
  indigoSoft: '#EEF2FF',
};

type Tab = 'routes' | 'students';

/* ------------------------------------------------------------------ *
 * Presentational pieces
 * ------------------------------------------------------------------ */
function StatCard({
  label,
  value,
  icon,
  color,
  bg,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
}) {
  return (
    <View style={[st.statCard, { backgroundColor: bg }]}>
      <View style={[st.statIconWrap, { backgroundColor: color + '1A' }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingLeft: 4 }}>
        <Text style={[st.statValue, { color }]} numberOfLines={1}>{value}</Text>
        <Text style={st.statLabel} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

/** Compact year pill — lives inside a horizontal ScrollView so it can never
 *  stretch vertically (the root cause of the giant boxes in the old build). */
function YearChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[st.yearChip, active && st.yearChipActive]} hitSlop={6}>
      <Text style={[st.yearChipText, active && st.yearChipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Segment({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        st.segBtn,
        active && st.segBtnActive,
        pressed && !active && st.segBtnPressed,
      ]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={15} color={active ? '#FFFFFF' : C.faint} />
      <Text style={[st.segText, active && st.segTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function StopRow({ stop, onEdit }: { stop: TransportStopFee; onEdit: () => void }) {
  return (
    <View style={st.stopRow}>
      <View style={st.stopOrderBadge}>
        <Text style={st.stopOrderText}>{stop.stop_order}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.stopName} numberOfLines={1}>
          {stop.stop_name}
        </Text>
        <View style={st.stopMetaRow}>
          <Ionicons name="people-outline" size={11} color={C.faint} />
          <Text style={st.stopMeta}>
            {stop.student_count} student{stop.student_count === 1 ? '' : 's'}
          </Text>
          {!stop.fee_not_set && stop.fee?.billing_cycle && (
            <>
              <Text style={st.stopMetaDot}>·</Text>
              <Text style={st.stopMeta}>{stop.fee.billing_cycle}</Text>
            </>
          )}
        </View>
      </View>
      <View style={st.stopRight}>
        {stop.fee_not_set ? (
          <View style={st.notSetBadge}>
            <Ionicons name="alert-circle" size={11} color={C.warn} />
            <Text style={st.notSetText}>Not set</Text>
          </View>
        ) : (
          <Text style={st.stopFee}>{fmtINR(stop.fee!.fee_amount)}</Text>
        )}
        <Pressable style={[st.editBtn, stop.fee_not_set && st.editBtnWarn]} onPress={onEdit}>
          <Ionicons
            name={stop.fee_not_set ? 'add-circle-outline' : 'create-outline'}
            size={14}
            color={stop.fee_not_set ? C.warn : C.indigoDark}
          />
          <Text style={[st.editBtnText, stop.fee_not_set && st.editBtnTextWarn]}>
            {stop.fee_not_set ? 'Set fee' : 'Edit'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Screen
 * ------------------------------------------------------------------ */
export default function TransportFeesScreen() {
  const { theme } = useTheme();
  const { shellActive } = useAccountsWebChrome();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const contentMaxW = isWide ? Math.min(1120, width - 64) : width;

  const [tab, setTab] = useState<Tab>('routes');
  const [loading, setLoading] = useState(true); // first paint / route loads
  const [refreshing, setRefreshing] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);

  const [academicYear, setAcademicYear] = useState('');
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [routes, setRoutes] = useState<TransportRouteWithFees[]>([]);
  const [students, setStudents] = useState<TransportStudentFee[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');

  const [feeModal, setFeeModal] = useState<{
    routeId: string;
    stop: TransportStopFee;
    existingFeeId?: string;
    amount: string;
    cycle: TransportBillingCycle;
  } | null>(null);
  const [collectModal, setCollectModal] = useState<TransportStudentFee | null>(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectMode, setCollectMode] = useState<'cash' | 'upi' | 'cheque'>('cash');
  const [submitting, setSubmitting] = useState(false);
  const lastExpandedYear = useRef('');

  /* ---- shared error handling ---- */
  const handleErr = (err: unknown, fallback: string) => {
    const msg =
      err instanceof APIError
        ? err.status === 404
          ? 'Transport fee API not found. Restart the backend (node server.js) and retry.'
          : err.message
        : fallback;
    alertCompat('Error', msg);
  };

  /* ---- 1) meta: years + classes, once on mount ---- */
  useEffect(() => {
    (async () => {
      try {
        const [allYears, classList] = await Promise.all([
          AcademicYearService.getAllYears(),
          ClassService.getClasses(),
        ]);
        const years = (allYears || []).map((y) => y.code).sort();
        setYearOptions(years);
        setClasses(classList || []);
        setAcademicYear((prev) => prev || years[years.length - 1] || '');
      } catch (err) {
        handleErr(err, 'Failed to load setup data');
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- 2) routes: only when the academic year changes ---- */
  const loadRoutes = useCallback(
    async (silent = false) => {
      if (!academicYear) return;
      if (!silent) setLoading(true);
      try {
        const res = await TransportFeeService.getRoutesWithFees(academicYear);
        const loaded = res.routes || [];
        setRoutes(loaded);
        if (lastExpandedYear.current !== academicYear && loaded.length > 0) {
          setExpandedRoutes(new Set(loaded.map((r) => r.id)));
          lastExpandedYear.current = academicYear;
        }
      } catch (err) {
        handleErr(err, 'Failed to load routes');
      } finally {
        setLoading(false);
      }
    },
    [academicYear],
  );

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  /* ---- 3) students: debounced search, independent of routes ---- */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadStudents = useCallback(async () => {
    if (!academicYear) return;
    setStudentsLoading(true);
    try {
      const res = await TransportFeeService.getStudentFees({
        academic_year: academicYear,
        search: debouncedSearch || undefined,
        class_filter: classFilter || undefined,
      });
      setStudents(res.students || []);
    } catch (err) {
      handleErr(err, 'Failed to load students');
    } finally {
      setStudentsLoading(false);
    }
  }, [academicYear, debouncedSearch, classFilter]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  /* ---- pull to refresh ---- */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadRoutes(true), loadStudents()]);
    setRefreshing(false);
  }, [loadRoutes, loadStudents]);

  /* ---- derived ---- */
  const stats = useMemo(() => {
    const totalStops = routes.reduce((n, r) => n + r.stops.length, 0);
    const unsetStops = routes.reduce((n, r) => n + r.stops.filter((s) => s.fee_not_set).length, 0);
    const configuredStops = totalStops - unsetStops;
    const totalDue = students.reduce(
      (n, s) => n + (s.fee_not_set ? 0 : Number(s.balance_due || 0)),
      0,
    );
    const collectable = students.filter((s) => s.can_collect).length;
    return {
      routes: routes.length,
      totalStops,
      configuredStops,
      unsetStops,
      students: students.length,
      totalDue,
      collectable,
    };
  }, [routes, students]);

  const allExpanded = routes.length > 0 && expandedRoutes.size >= routes.length;

  const toggleRoute = (id: string) =>
    setExpandedRoutes((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setExpandedRoutes(allExpanded ? new Set() : new Set(routes.map((r) => r.id)));

  /* ---- fee modal ---- */
  const openFeeModal = (routeId: string, stop: TransportStopFee) =>
    setFeeModal({
      routeId,
      stop,
      existingFeeId: stop.fee?.id,
      amount: stop.fee ? String(stop.fee.fee_amount) : '',
      cycle: stop.fee?.billing_cycle || 'term',
    });

  const saveFee = async () => {
    if (!feeModal || !academicYear) return;
    const amount = Number(feeModal.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      alertCompat('Invalid amount', 'Enter a valid fee amount.');
      return;
    }
    setSubmitting(true);
    try {
      if (feeModal.existingFeeId) {
        await TransportFeeService.updateFee(feeModal.existingFeeId, {
          fee_amount: amount,
          billing_cycle: feeModal.cycle,
        });
      } else {
        await TransportFeeService.setFee({
          route_id: feeModal.routeId,
          stop_id: feeModal.stop.stop_id,
          academic_year: academicYear,
          fee_amount: amount,
          billing_cycle: feeModal.cycle,
        });
      }
      setFeeModal(null);
      await Promise.all([loadRoutes(true), loadStudents()]);
      alertCompat('Saved', 'Stop fee updated.');
    } catch (err) {
      handleErr(err, 'Failed to save fee');
    } finally {
      setSubmitting(false);
    }
  };

  /* ---- collect modal ---- */
  const openCollect = (student: TransportStudentFee) => {
    setCollectModal(student);
    setCollectAmount(String(student.balance_due ?? ''));
    setCollectMode('cash');
  };

  const handleCollect = async () => {
    if (!collectModal) return;
    const amount = Number(collectAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alertCompat('Invalid amount', 'Enter a positive amount.');
      return;
    }
    const maxDue = Number(collectModal.balance_due || 0);
    if (amount > maxDue) {
      alertCompat('Amount too high', `Maximum collectable is ${fmtINR(maxDue)}.`);
      return;
    }
    setSubmitting(true);
    try {
      const result = await TransportFeeService.collect({
        student_id: collectModal.student_id,
        academic_year: academicYear,
        amount,
        payment_method: collectMode,
        transaction_ref: generateUUID(),
      });
      setCollectModal(null);
      await loadStudents();
      alertCompat('Payment recorded', `Receipt ${result.receipt.receipt_no} — ${fmtINR(amount)}`);
    } catch (err) {
      handleErr(err, 'Collection failed');
    } finally {
      setSubmitting(false);
    }
  };

  /* ---- toolbar (sticky part) ---- */
  const renderStickyHeader = () => (
    <View style={[st.toolbar, { maxWidth: contentMaxW }]}>
      <View style={st.toolbarHead}>
        <View style={st.titleBlock}>
          <Text style={st.pageTitle}>Transport Fees</Text>
          <Text style={st.pageSub}>Set stop-wise fees and collect payments</Text>
        </View>

        <View style={st.yearBar}>
          <Ionicons name="calendar-clear-outline" size={14} color={C.accent} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.yearScroll}>
            {yearOptions.map((y) => (
              <YearChip key={y} label={y} active={academicYear === y} onPress={() => setAcademicYear(y)} />
            ))}
          </ScrollView>
        </View>
      </View>

      <View style={st.segmented}>
        <Segment active={tab === 'routes'} icon="bus-outline" label="Routes & Stops" onPress={() => setTab('routes')} />
        <Segment
          active={tab === 'students'}
          icon="people-outline"
          label={`Students${stats.collectable > 0 ? ` (${stats.collectable})` : ''}`}
          onPress={() => setTab('students')}
        />
      </View>
    </View>
  );

  /* ---- stats & warnings (scrollable part) ---- */
  const renderScrollableStats = () => (
    <View style={st.scrollableStatsBox}>
      <View style={st.statsRow}>
        <StatCard label="Routes" value={stats.routes} icon="bus" color="#4F46E5" bg="#EEF2FF" />
        <StatCard
          label="Stops set"
          value={`${stats.configuredStops}/${stats.totalStops}`}
          icon="location"
          color="#10B981"
          bg="#ECFDF5"
        />
        <StatCard label="Students" value={stats.students} icon="people" color="#0EA5E9" bg="#F0F9FF" />
        <StatCard label="Due" value={fmtINR(stats.totalDue)} icon="wallet" color="#F43F5E" bg="#FFF1F2" />
      </View>

      {stats.unsetStops > 0 && tab === 'routes' && (
        <View style={st.warnBanner}>
          <Ionicons name="warning" size={18} color="#D97706" />
          <Text style={st.warnText}>
            <Text style={{ fontWeight: '700' }}>{stats.unsetStops} stop{stats.unsetStops === 1 ? '' : 's'} missing a fee</Text> for {academicYear} — students at those stops cannot be billed.
          </Text>
        </View>
      )}
    </View>
  );

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />
  );

  /* ------------------------------------------------------------------ */
  return (
    <View style={[st.root, { backgroundColor: theme.colors.background }]}>
      {!shellActive && <AdminHeader title="Transport Fees" showBackButton />}

      <View style={[st.contentWrap, isWide && st.contentWrapWide]}>
        <View style={{ width: '100%', maxWidth: contentMaxW, alignSelf: 'center' }}>{renderStickyHeader()}</View>

        {loading ? (
          <LogoLoader />
        ) : tab === 'routes' ? (
          routes.length === 0 ? (
            <View style={st.empty}>
              <LinearGradient colors={[C.accentSoft, '#F0FDFA']} style={st.emptyIconBg}>
                <Ionicons name="bus-outline" size={40} color={C.accent} />
              </LinearGradient>
              <Text style={st.emptyTitle}>No routes configured</Text>
              <Text style={st.emptyText}>
                Create bus routes and stops in Admin → Transport, then return here to set per-stop fees.
              </Text>
            </View>
          ) : (
            <FlatList
              style={[st.list, { maxWidth: contentMaxW }]}
              data={routes}
              keyExtractor={(r) => r.id}
              refreshControl={refreshControl}
              contentContainerStyle={st.listPad}
              ListHeaderComponent={
                <View>
                  {renderScrollableStats()}
                  <View style={st.listHeader}>
                    <View>
                      <Text style={st.listHeaderTitle}>Route fee setup</Text>
                      <Text style={st.listHeaderText}>
                        {routes.length} route{routes.length === 1 ? '' : 's'} · {stats.configuredStops}/{stats.totalStops} stops configured
                      </Text>
                    </View>
                    <Pressable style={st.expandAllBtn} onPress={toggleAll} hitSlop={6}>
                      <Ionicons
                        name={allExpanded ? 'contract-outline' : 'expand-outline'}
                        size={13}
                        color={C.accentDark}
                      />
                      <Text style={st.expandAllText}>{allExpanded ? 'Collapse all' : 'Expand all'}</Text>
                    </Pressable>
                  </View>
                </View>
              }
              renderItem={({ item, index }) => {
                const expanded = expandedRoutes.has(item.id);
                const unset = item.stops.filter((s) => s.fee_not_set).length;
                const configured = item.stops.length - unset;
                const coverage = item.stops.length ? Math.round((configured / item.stops.length) * 100) : 0;
                return (
                  <Animated.View style={st.listItem} entering={FadeInDown.delay(Math.min(index, 8) * 35).duration(320)}>
                    <View style={st.routeCard}>
                      <LinearGradient
                        colors={[C.accent, '#06B6D4']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={st.routeAccent}
                      />
                      <Pressable style={st.routeHeader} onPress={() => toggleRoute(item.id)}>
                        <View style={st.routeIconWrap}>
                          <Ionicons name="bus" size={18} color={C.accent} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={st.routeName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={st.routeMeta} numberOfLines={1}>
                            {item.bus_no ? `Bus ${item.bus_no}` : 'No bus assigned'}
                            {' · '}
                            {item.stops.length} stop{item.stops.length === 1 ? '' : 's'}
                          </Text>
                          <View style={st.routeProgressRow}>
                            <View style={st.routeProgressTrack}>
                              <View
                                style={[
                                  st.routeProgressFill,
                                  {
                                    width: `${coverage}%`,
                                    backgroundColor: unset > 0 ? C.warn : C.ok,
                                  },
                                ]}
                              />
                            </View>
                            <Text style={[st.routeCoverage, unset > 0 && st.routeCoverageWarn]}>
                              {coverage}% ready
                            </Text>
                          </View>
                        </View>
                        <View style={st.routeBadges}>
                          {configured > 0 && (
                            <View style={st.badgeOk}>
                              <Text style={st.badgeOkText}>{configured} set</Text>
                            </View>
                          )}
                          {unset > 0 && (
                            <View style={st.badgeWarn}>
                              <Text style={st.badgeWarnText}>{unset} unset</Text>
                            </View>
                          )}
                        </View>
                        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={C.faint} />
                      </Pressable>
                      {expanded && (
                        <View style={st.stopsBox}>
                          {item.stops.length === 0 ? (
                            <Text style={st.noStops}>No stops on this route yet.</Text>
                          ) : (
                            item.stops.map((stop) => (
                              <StopRow
                                key={stop.stop_id}
                                stop={stop}
                                onEdit={() => openFeeModal(item.id, stop)}
                              />
                            ))
                          )}
                        </View>
                      )}
                    </View>
                  </Animated.View>
                );
              }}
            />
          )
        ) : (
          <FlatList
              style={[st.list, { maxWidth: contentMaxW }]}
              data={students}
              keyExtractor={(s) => s.student_id}
              refreshControl={refreshControl}
              contentContainerStyle={st.listPad}
              ListHeaderComponent={
                <View>
                  {renderScrollableStats()}
                  <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                    <View style={[st.searchWrap, ds.searchBarWrapper]}>
                      <Ionicons name="search-outline" size={18} color={C.faint} />
                      <AppTextInput
                        style={[ds.inputInChrome, st.searchInput]}
                        placeholder="Search name or admission no…"
                        placeholderTextColor={C.faint}
                        value={search}
                        onChangeText={setSearch}
                      />
                      {studentsLoading ? (
                        <ActivityIndicator size="small" color={C.accent} />
                      ) : (
                        search.length > 0 && (
                          <Pressable onPress={() => setSearch('')} hitSlop={6}>
                            <Ionicons name="close-circle" size={18} color={C.faint} />
                          </Pressable>
                        )
                      )}
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
                      <Pressable
                        style={[st.filterChip, !classFilter && st.filterActive]}
                        onPress={() => setClassFilter('')}
                      >
                        <Text style={[st.filterText, !classFilter && st.filterTextActive]}>All classes</Text>
                      </Pressable>
                      {classes.map((c) => (
                        <Pressable
                          key={c.id}
                          style={[st.filterChip, classFilter === c.id && st.filterActive]}
                          onPress={() => setClassFilter(classFilter === c.id ? '' : c.id)}
                        >
                          <Text style={[st.filterText, classFilter === c.id && st.filterTextActive]}>{c.name}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              }
              ListEmptyComponent={
                <View style={st.empty}>
                  <LinearGradient colors={[C.indigoSoft, '#F5F3FF']} style={st.emptyIconBg}>
                    <Ionicons name="people-outline" size={40} color={C.indigo} />
                  </LinearGradient>
                  <Text style={st.emptyTitle}>
                    {debouncedSearch || classFilter ? 'No matching students' : 'No transport students'}
                  </Text>
                  <Text style={st.emptyText}>
                    {debouncedSearch || classFilter
                      ? 'Try clearing the search or class filter.'
                      : `Assign students to routes in Admin → Transport for ${academicYear}.`}
                  </Text>
                </View>
              }
              renderItem={({ item, index }) => (
                <Animated.View style={st.listItem} entering={FadeInDown.delay(Math.min(index, 8) * 35).duration(320)}>
                  <View style={st.studentCard}>
                    <View
                      style={[st.studentAccent, { backgroundColor: item.fee_not_set ? '#F59E0B' : C.ok }]}
                    />
                    <View style={st.studentBody}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={st.studentName} numberOfLines={1}>
                          {item.student_name}
                        </Text>
                        <Text style={st.studentMeta} numberOfLines={1}>
                          {item.admission_no}
                          {item.class_name ? ` · ${item.class_name}` : ''}
                          {item.section_name ? ` ${item.section_name}` : ''}
                        </Text>
                        <View style={st.routePill}>
                          <Ionicons name="bus-outline" size={11} color={C.accent} />
                          <Text style={st.routePillText} numberOfLines={1}>
                            {item.route_name} → {item.stop_name || 'No stop'}
                          </Text>
                        </View>
                      </View>
                      <View style={st.studentRight}>
                        {item.fee_not_set ? (
                          <View style={st.notSetBadge}>
                            <Text style={st.notSetText}>Fee not set</Text>
                          </View>
                        ) : (
                          <>
                            <Text style={st.studentDue}>{fmtINR(item.balance_due ?? 0)}</Text>
                            <Text style={st.studentDueLabel}>
                              {item.paid_amount > 0 ? `Paid ${fmtINR(item.paid_amount)}` : 'due'}
                            </Text>
                          </>
                        )}
                        {item.can_collect && (
                          <Pressable style={st.collectBtn} onPress={() => openCollect(item)}>
                            <Ionicons name="cash-outline" size={13} color="#fff" />
                            <Text style={st.collectBtnText}>Collect</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  </View>
                </Animated.View>
              )}
            />
        )}
      </View>

      {/* Fee modal */}
      <Modal visible={!!feeModal} transparent animationType="slide">
        <Pressable style={st.overlay} onPress={() => setFeeModal(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.sheetKv}>
            <Pressable style={st.sheet} onPress={() => {}}>
              <View style={st.sheetHandle} />
              <View style={st.sheetHeader}>
                <LinearGradient colors={[C.accent, '#06B6D4']} style={st.sheetIconBg}>
                  <Ionicons name="location" size={20} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.sheetTitle} numberOfLines={1}>
                    {feeModal?.existingFeeId ? 'Edit stop fee' : 'Set stop fee'}
                  </Text>
                  <Text style={st.sheetSub} numberOfLines={1}>
                    {feeModal?.stop.stop_name} · {academicYear}
                  </Text>
                </View>
              </View>
              <Text style={st.fieldLabel}>Fee amount (₹)</Text>
              <AppTextInput
                style={st.fieldInput}
                keyboardType="numeric"
                placeholder="e.g. 900"
                placeholderTextColor={C.faint}
                value={feeModal?.amount ?? ''}
                onChangeText={(v) => feeModal && setFeeModal({ ...feeModal, amount: v })}
              />
              <Text style={st.fieldLabel}>Billing cycle</Text>
              <View style={st.cycleRow}>
                {BILLING_CYCLES.map((c) => (
                  <Pressable
                    key={c}
                    style={[st.filterChip, feeModal?.cycle === c && st.filterActive]}
                    onPress={() => feeModal && setFeeModal({ ...feeModal, cycle: c })}
                  >
                    <Text style={[st.filterText, feeModal?.cycle === c && st.filterTextActive]}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={st.primaryBtn} onPress={saveFee} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryBtnText}>Save fee</Text>}
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Collect modal */}
      <Modal visible={!!collectModal} transparent animationType="slide">
        <Pressable style={st.overlay} onPress={() => setCollectModal(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.sheetKv}>
            <Pressable style={st.sheet} onPress={() => {}}>
              <View style={st.sheetHandle} />
              <View style={st.sheetHeader}>
                <LinearGradient colors={[C.ok, '#10B981']} style={st.sheetIconBg}>
                  <Ionicons name="cash" size={20} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.sheetTitle} numberOfLines={1}>
                    Collect transport fee
                  </Text>
                  <Text style={st.sheetSub} numberOfLines={1}>
                    {collectModal?.student_name} · {collectModal?.stop_name}
                  </Text>
                </View>
              </View>
              <Text style={st.fieldLabel}>
                Amount (max {fmtINR(Number(collectModal?.balance_due || 0))})
              </Text>
              <AppTextInput
                style={st.fieldInput}
                keyboardType="numeric"
                value={collectAmount}
                onChangeText={setCollectAmount}
              />
              <Text style={st.fieldLabel}>Payment mode</Text>
              <View style={st.cycleRow}>
                {PAYMENT_MODES.map((m) => (
                  <Pressable
                    key={m.id}
                    style={[st.payChip, collectMode === m.id && st.payChipActive]}
                    onPress={() => setCollectMode(m.id)}
                  >
                    <Ionicons name={m.icon} size={14} color={collectMode === m.id ? C.ok : C.sub} />
                    <Text style={[st.filterText, collectMode === m.id && st.payTextActive]}>{m.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                style={[st.primaryBtn, st.collectPrimary]}
                onPress={handleCollect}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={st.primaryBtnText}>Collect & generate receipt</Text>
                )}
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */
const st = StyleSheet.create({
  root: { flex: 1 },
  contentWrap: { flex: 1 },
  contentWrapWide: { alignItems: 'center' },

  toolbar: { width: '100%', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  toolbarHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  scrollableStatsBox: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  titleBlock: { flexShrink: 1, minWidth: 220 },
  pageTitle: { fontSize: 20, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  pageSub: { fontSize: 12, color: C.sub, marginTop: 2 },

  /* compact year selector */
  yearBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 34,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: '#F1F5F9', // softer gray for inset clay look
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.02)',
    borderLeftColor: 'rgba(0,0,0,0.02)',
    borderBottomColor: 'rgba(255,255,255,0.8)',
    borderRightColor: 'rgba(255,255,255,0.8)',
  },
  yearBarLabel: { fontSize: 11, fontWeight: '700', color: C.faint, letterSpacing: 0.2 },
  yearScroll: { gap: 6, alignItems: 'center', paddingRight: 8 },
  yearChip: {
    paddingHorizontal: 11,
    height: 26,
    minHeight: 26,
    maxHeight: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ boxSizing: 'border-box' } as object) : {}),
  },
  yearChipActive: { backgroundColor: C.accentSoft, borderColor: C.accent },
  yearChipText: { fontSize: 11.5, lineHeight: 14, fontWeight: '700', color: C.sub, includeFontPadding: false },
  yearChipTextActive: { color: C.accentDark, fontWeight: '800' },

  /* stats */
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  statCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.8)',
    borderLeftColor: 'rgba(255,255,255,0.8)',
    borderBottomColor: 'rgba(0,0,0,0.03)',
    borderRightColor: 'rgba(0,0,0,0.03)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 3,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: 16, fontWeight: '800', lineHeight: 20 },
  statLabel: { fontSize: 11, color: C.sub, fontWeight: '600', marginTop: 1 },

  /* segmented */
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    padding: 4,
    marginBottom: 8,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.03)',
    borderLeftColor: 'rgba(0,0,0,0.03)',
    borderBottomColor: 'rgba(255,255,255,0.8)',
    borderRightColor: 'rgba(255,255,255,0.8)',
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 34,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segBtnActive: {
    backgroundColor: C.accent,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.3)',
    borderLeftColor: 'rgba(255,255,255,0.3)',
    borderBottomColor: 'rgba(0,0,0,0.1)',
    borderRightColor: 'rgba(0,0,0,0.1)',
    shadowColor: C.accent,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  segBtnPressed: { backgroundColor: C.accentSoft, borderColor: 'transparent' },
  segText: { fontSize: 13, fontWeight: '700', color: C.faint },
  segTextActive: { color: '#FFFFFF', fontWeight: '800' },
  
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.6)',
    borderLeftColor: 'rgba(255,255,255,0.6)',
    borderBottomColor: 'rgba(0,0,0,0.02)',
    borderRightColor: 'rgba(0,0,0,0.02)',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    marginBottom: 8,
  },
  warnText: { flex: 1, fontSize: 12, color: C.warnDeep, lineHeight: 17 },

  /* list chrome */
  list: { width: '100%', flex: 1, alignSelf: 'center' },
  listPad: { width: '100%', paddingHorizontal: 16, paddingBottom: 32 },
  listItem: { width: '100%' },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    gap: 12,
  },
  listHeaderTitle: { fontSize: 14, fontWeight: '800', color: C.ink },
  listHeaderText: { fontSize: 12, fontWeight: '700', color: C.sub },
  expandAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: C.accentSoft,
  },
  expandAllText: { fontSize: 11, fontWeight: '800', color: C.accentDark },

  /* route card */
  routeCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  routeAccent: { height: 3 },
  routeHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  routeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeName: { fontSize: 16, fontWeight: '800', color: C.ink },
  routeMeta: { fontSize: 12, color: C.sub, marginTop: 2 },
  routeProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  routeProgressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: C.hairline,
    overflow: 'hidden',
  },
  routeProgressFill: { height: '100%', borderRadius: 999 },
  routeCoverage: { fontSize: 10, fontWeight: '800', color: C.ok },
  routeCoverageWarn: { color: C.warn },
  routeBadges: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  badgeOk: { backgroundColor: C.okSoft2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeOkText: { fontSize: 10, fontWeight: '800', color: C.ok },
  badgeWarn: { backgroundColor: C.warnSoft2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeWarnText: { fontSize: 10, fontWeight: '800', color: C.warn },
  stopsBox: { borderTopWidth: 1, borderTopColor: C.hairline, backgroundColor: C.canvas },
  noStops: { padding: 16, fontSize: 13, color: C.faint, fontStyle: 'italic' },

  /* stop row */
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
  },
  stopOrderBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.accentSoft2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopOrderText: { fontSize: 11, fontWeight: '800', color: C.accent },
  stopName: { fontSize: 14, fontWeight: '700', color: C.body },
  stopMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  stopMeta: { fontSize: 11, color: C.faint },
  stopMetaDot: { fontSize: 11, color: '#CBD5E1' },
  stopRight: { alignItems: 'flex-end', gap: 6 },
  stopFee: { fontSize: 15, fontWeight: '800', color: C.ok },
  notSetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.warnSoft2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  notSetText: { fontSize: 10, fontWeight: '800', color: C.warn },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.indigoSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editBtnWarn: { backgroundColor: C.warnSoft, borderWidth: 1, borderColor: C.warnLine },
  editBtnText: { fontSize: 11, fontWeight: '800', color: C.indigoDark },
  editBtnTextWarn: { color: C.warn },

  /* search + filters */
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 14,
    backgroundColor: C.surface,
  },
  searchInput: { flex: 1, fontSize: 15, color: C.ink },
  filterRow: { gap: 8, marginBottom: 12, paddingRight: 16 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    height: 36,
    justifyContent: 'center',
  },
  filterActive: { backgroundColor: C.accentSoft, borderColor: C.accent },
  filterText: { fontSize: 12, fontWeight: '600', color: C.sub },
  filterTextActive: { color: C.accentDark, fontWeight: '800' },

  /* student card */
  studentCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    overflow: 'hidden',
  },
  studentAccent: { height: 3 },
  studentBody: { flexDirection: 'row', padding: 14, gap: 12 },
  studentName: { fontSize: 15, fontWeight: '800', color: C.ink },
  studentMeta: { fontSize: 12, color: C.sub, marginTop: 2 },
  routePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    backgroundColor: C.accentSoft,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: '100%',
  },
  routePillText: { fontSize: 11, color: C.accentDark, fontWeight: '600', flexShrink: 1 },
  studentRight: { alignItems: 'flex-end', gap: 6 },
  studentDue: { fontSize: 17, fontWeight: '800', color: C.danger },
  studentDueLabel: { fontSize: 10, color: C.faint, fontWeight: '700' },
  collectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.ok,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  collectBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  /* empty */
  empty: { alignItems: 'center', padding: 48 },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.ink },
  emptyText: { fontSize: 14, color: C.sub, textAlign: 'center', marginTop: 6, maxWidth: 320, lineHeight: 20 },

  /* modal */
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheetKv: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  sheetIconBg: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: C.ink },
  sheetSub: { fontSize: 13, color: C.sub, marginTop: 2 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.sub, marginTop: 14, marginBottom: 6 },
  fieldInput: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    backgroundColor: '#F8FAFC',
    color: C.ink,
  },
  cycleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  payChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    height: 36,
  },
  payChipActive: { backgroundColor: C.okSoft, borderColor: C.ok },
  payTextActive: { color: C.ok, fontWeight: '800' },
  primaryBtn: { marginTop: 20, backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  collectPrimary: { backgroundColor: C.ok },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});