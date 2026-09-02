import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ActivityIndicator, Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, useWindowDimensions, Platform, KeyboardAvoidingView } from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import AdminHeader from '../../src/components/AdminHeader';
import Animated, { FadeInUp, useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FeeService, PendingFeeFilterOptions } from '../../src/services/feeService';
import { useAuth } from '../../src/hooks/useAuth';
import LogoLoader from '../../src/components/LogoLoader';
import CollectionReportColumnSelector from '../../src/components/accounts/CollectionReportColumnSelector';
import CashDenominationCalculator from '../../src/components/accounts/CashDenominationCalculator';
import {
  CASH_DENOMINATIONS,
  buildCashDenominationBreakdownFromPieces,
  computeCollectionTotals,
  exportCollectionCsv,
  formatAmount,
  printCollectionReport,
  type CashDenominationPieces,
  type CollectionReportMeta,
} from '../../src/utils/collectionReport';
import {
  useCollectionReportColumns,
  useCollectionReportDenominations,
} from '../../src/hooks/useCollectionReportColumns';
import PremiumDatePickerModal from '../../src/components/PremiumDatePickerModal';
import AppDatePicker from '../../src/components/AppDatePicker';
import AppTextInput from '../../src/components/AppTextInput';
import { styles as ds } from '../../src/theme/styles';
import { clayCard, clayInset } from '../../src/theme/clayStyles';
import {
  daysAgoInput,
  formatDateShort,
  lastMonthRange,
  monthStartInput,
  todayDateInput,
} from '../../src/components/expenses/expenseConstants';
import { SCHOOL_NAME } from '../../src/constants/school';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const AVATAR_COLORS = ['#7C3AED', '#2563EB', '#059669', '#DB2777', '#D97706', '#0891B2', '#DC2626', '#4F46E5'];
const initialsFor = (name: string) =>
  (name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const colorFor = (name: string) => {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

const emptyDenominationPieces = (): CashDenominationPieces => {
  const pieces: CashDenominationPieces = {};
  for (const denomination of CASH_DENOMINATIONS) pieces[denomination] = 0;
  return pieces;
};

type PendingCollectionPrint = {
  rows: any[];
  meta: CollectionReportMeta;
};

type DueFilterItem = { id: string; name: string; label?: string };

type DueFilterPickerState = {
  title: string;
  items: DueFilterItem[];
  selectedId: string;
  onSelect: (id: string) => void;
};

const DUE_PICKER_ROW_H = 52;

type FinanceStats = {
  today_collection: number;
  monthly_collection: number;
  collected_total: number;
  pending_dues: number;
  defaulter_count: number;
  recent_transactions?: any[];
};

export default function AdminFinanceScreen() {
  const { theme, isDark } = useTheme();
  const { authChecked, user } = useAuth();
  const { width, height } = useWindowDimensions();
  const isWide = Platform.OS === 'web' && width >= 768;
  const styles = useMemo(() => getStyles(theme, isWide), [theme, isWide]);
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [stats, setStats] = useState<any>({
    expected_total: 0,
    collected_total: 0,
    pending_total: 0,
    today_collection: 0,
    defaulter_count: 0
  });

  const [transactions, setTransactions] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [modeFilter, setModeFilter] = useState<string>('All');
  const [dueListOptions, setDueListOptions] = useState<PendingFeeFilterOptions | null>(null);
  const [dueClassId, setDueClassId] = useState<string>('');
  const [dueSectionId, setDueSectionId] = useState<string>('');
  const [dueFeeTypeId, setDueFeeTypeId] = useState<string>('');
  const [dueVillageId, setDueVillageId] = useState<string>('');
  const [dueOverdueOnly, setDueOverdueOnly] = useState(false);
  const [dueExporting, setDueExporting] = useState(false);
  const [dueFilterPicker, setDueFilterPicker] = useState<DueFilterPickerState | null>(null);
  const [dueFilterQuery, setDueFilterQuery] = useState('');
  const [receiptFromDate, setReceiptFromDate] = useState(todayDateInput());
  const [receiptToDate, setReceiptToDate] = useState(todayDateInput());
  const [receiptExporting, setReceiptExporting] = useState(false);
  const [pendingCollectionPrint, setPendingCollectionPrint] = useState<PendingCollectionPrint | null>(null);
  const [denominationPieces, setDenominationPieces] = useState<CashDenominationPieces>(emptyDenominationPieces);
  const [denominationEdited, setDenominationEdited] = useState(false);
  const [printingCollection, setPrintingCollection] = useState(false);
  const {
    columns: reportColumns,
    hydrated: reportColumnsHydrated,
    saveError: reportColumnsSaveError,
    toggleColumn: toggleReportColumn,
  } = useCollectionReportColumns(String(user?.id || 'admin'));
  const {
    includeDenominations,
    hydrated: denominationsHydrated,
    saveError: denominationsSaveError,
    toggleDenominations,
  } = useCollectionReportDenominations(String(user?.id || 'admin'));

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    }
  });

  const applyFinanceData = (data: FinanceStats) => {
    setStats({
      today_collection: data.today_collection ?? 0,
      monthly_collection: data.monthly_collection ?? 0,
      collected_total: data.collected_total ?? 0,
      pending_dues: data.pending_dues ?? 0,
      defaulter_count: data.defaulter_count ?? 0,
    });
    setTransactions(Array.isArray(data.recent_transactions) ? data.recent_transactions : []);
  };

  const fetchData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const dateStr = selectedDate.getFullYear() + '-' + String(selectedDate.getMonth() + 1).padStart(2, '0') + '-' + String(selectedDate.getDate()).padStart(2, '0');
      const financeStats = await FeeService.getAdminFinanceStats({ date: dateStr });
      applyFinanceData(financeStats);
    } catch (primaryError: any) {
      console.warn('Primary finance-stats failed, trying fallback:', primaryError?.message);
      try {
        const [statsRes, txRes] = await Promise.allSettled([
          FeeService.getDashboardStats(),
          FeeService.getRecentTransactions(10),
        ]);
        if (statsRes.status === 'rejected' && txRes.status === 'rejected') {
          throw primaryError;
        }
        const raw = (statsRes.status === 'fulfilled' ? (statsRes.value?.stats ?? statsRes.value ?? {}) : {}) as Record<string, any>;
        const txList = txRes.status === 'fulfilled'
          ? (Array.isArray(txRes.value) ? txRes.value : (txRes.value as any)?.data ?? [])
          : [];
        applyFinanceData({
          today_collection: raw.todays_collection ?? 0,
          monthly_collection: raw.total_collection_month ?? 0,
          collected_total: raw.collected_total ?? 0,
          pending_dues: raw.pending_dues ?? 0,
          defaulter_count: raw.defaulter_count ?? 0,
          recent_transactions: txList,
        });
      } catch (fallbackError: any) {
        console.error('Failed to load admin finance data:', fallbackError);
        setLoadError(fallbackError?.message || 'Failed to load finance data');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!authChecked) return;
    fetchData();
  }, [authChecked, selectedDate]);

  useEffect(() => {
    if (!authChecked) return;
    FeeService.getPendingFeeFilterOptions()
      .then(setDueListOptions)
      .catch((error) => console.warn('Failed to load due-list filter options:', error?.message));
  }, [authChecked]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatCurrency = (amount: number) => {
    return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return 'Invalid Date';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const handleFilterStatus = () => {
    const options = ['All', 'Success', 'Pending'];
    alertCompat('Filter by Status', 'Select transaction status', [
      ...options.map((opt) => ({ text: opt, onPress: () => setStatusFilter(opt) })),
      { text: 'Cancel', style: 'cancel' }]
    );
  };

  const handleFilterMode = () => {
    const options = ['All', 'CASH', 'ONLINE', 'UPI', 'BANK_TRANSFER'];
    alertCompat('Filter by Mode', 'Select payment mode', [
      ...options.map((opt) => ({ text: opt, onPress: () => setModeFilter(opt) })),
      { text: 'Cancel', style: 'cancel' }]
    );
  };

  const selectDueFilter = (
    title: string,
    items: DueFilterItem[],
    selectedId: string,
    onSelect: (id: string) => void,
  ) => {
    setDueFilterQuery('');
    setDueFilterPicker({ title, items, selectedId, onSelect });
  };

  const closeDueFilterPicker = useCallback(() => {
    setDueFilterPicker(null);
    setDueFilterQuery('');
  }, []);

  const dueFilterVisibleItems = useMemo(() => {
    if (!dueFilterPicker) return [];
    const query = dueFilterQuery.trim().toLowerCase();
    const matched = query
      ? dueFilterPicker.items.filter((item) =>
          (item.label || item.name).toLowerCase().includes(query),
        )
      : dueFilterPicker.items;
    return [{ id: '', name: 'All', label: 'All' }, ...matched];
  }, [dueFilterPicker, dueFilterQuery]);

  const duePickerListHeight = Math.min(
    Math.max(dueFilterVisibleItems.length, 1) * DUE_PICKER_ROW_H,
    Math.round(Math.max(height, 480) * 0.48),
  );

  const selectedDueClass = dueListOptions?.classes.find((item) => item.id === dueClassId);
  const selectedDueSection = dueListOptions?.sections.find((item) => item.id === dueSectionId);
  const selectedDueFeeType = dueListOptions?.fee_types.find((item) => item.id === dueFeeTypeId);
  const selectedDueVillage = dueListOptions?.villages.find((item) => item.id === dueVillageId);

  const exportDueList = async () => {
    if (!dueListOptions || dueExporting) return;
    setDueExporting(true);
    try {
      await FeeService.exportPendingFeesDueList({
        academic_year_id: dueListOptions.academic_year.id,
        class_id: dueClassId || undefined,
        section_id: dueSectionId || undefined,
        fee_type_id: dueFeeTypeId || undefined,
        village_id: dueVillageId || undefined,
        overdue_only: dueOverdueOnly || undefined,
      });
    } catch (error: any) {
      alertCompat('Download failed', error?.message || 'Unable to download the pending-fees due list.');
    } finally {
      setDueExporting(false);
    }
  };

  const applyReceiptPreset = (preset: 'today' | 'last_7' | 'this_month' | 'last_month') => {
    if (preset === 'today') {
      const today = todayDateInput();
      setReceiptFromDate(today);
      setReceiptToDate(today);
      return;
    }
    if (preset === 'last_7') {
      setReceiptFromDate(daysAgoInput(6));
      setReceiptToDate(todayDateInput());
      return;
    }
    if (preset === 'this_month') {
      setReceiptFromDate(monthStartInput());
      setReceiptToDate(todayDateInput());
      return;
    }
    const range = lastMonthRange();
    setReceiptFromDate(range.from);
    setReceiptToDate(range.to);
  };

  const exportReceiptList = async () => {
    if (receiptExporting) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptFromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(receiptToDate)) {
      alertCompat('Invalid dates', 'Please select a valid from and to date.');
      return;
    }
    if (receiptFromDate > receiptToDate) {
      alertCompat('Invalid range', 'From date must be on or before the to date.');
      return;
    }
    setReceiptExporting(true);
    try {
      await FeeService.exportCollectionReceipts({
        from_date: receiptFromDate,
        to_date: receiptToDate,
        columns: reportColumns,
      });
    } catch (error: any) {
      alertCompat('Download failed', error?.message || 'Unable to download the fee collection receipts list.');
    } finally {
      setReceiptExporting(false);
    }
  };


  const filteredTransactions = transactions.filter((tx) => {
    const txMode = (tx.payment_method || 'CASH').toUpperCase();
    if (modeFilter !== 'All' && txMode !== modeFilter.toUpperCase()) return false;

    const txStatus = tx.status || 'Success'; // DB transactions are assumed success unless specified
    if (statusFilter !== 'All') {
      if (statusFilter === 'Success' && txStatus.toLowerCase() !== 'success' && txStatus.toLowerCase() !== 'completed') return false;
      if (statusFilter === 'Pending' && txStatus.toLowerCase() !== 'pending') return false;
    }
    return true;
  });

  const pendingCashTotal = useMemo(() => {
    if (!pendingCollectionPrint) return 0;
    return computeCollectionTotals(pendingCollectionPrint.rows).byMode.cash?.total || 0;
  }, [pendingCollectionPrint]);

  const printCollectionPdf = async (
    printJob: PendingCollectionPrint,
    pieces?: CashDenominationPieces,
  ) => {
    if (printingCollection) return;
    setPrintingCollection(true);
    try {
      await printCollectionReport(printJob.rows, printJob.meta, reportColumns, {
        includeDenominations: pieces !== undefined,
        denominationPieces: pieces,
      });
      setPendingCollectionPrint(null);
    } catch {
      alertCompat('Error', 'Failed to generate PDF.');
    } finally {
      setPrintingCollection(false);
    }
  };

  const requestCollectionPrint = (printJob: PendingCollectionPrint) => {
    if (!includeDenominations) {
      void printCollectionPdf(printJob);
      return;
    }
    // Never infer the physical cash drawer. Every admin print starts with a
    // blank count and requires an explicit manual denomination review.
    setDenominationPieces(emptyDenominationPieces());
    setDenominationEdited(false);
    setPendingCollectionPrint(printJob);
  };

  const confirmDenominationPrint = () => {
    if (!pendingCollectionPrint || printingCollection) return;
    const counted = buildCashDenominationBreakdownFromPieces(denominationPieces).allocatedTotal;
    const difference = Number((counted - pendingCashTotal).toFixed(2));
    const runPrint = () => {
      void printCollectionPdf(pendingCollectionPrint, denominationPieces);
    };

    if (difference !== 0) {
      alertCompat(
        'Cash count does not match',
        `Counted denominations are ${formatAmount(counted)} but cash collections are ${formatAmount(pendingCashTotal)} (${difference > 0 ? 'excess' : 'short'} ${formatAmount(Math.abs(difference))}). Print anyway?`,
        [
          { text: 'Edit counts', style: 'cancel' },
          { text: 'Print anyway', onPress: runPrint },
        ],
      );
      return;
    }

    runPrint();
  };

  const collectionRate = useMemo(() => {
    const collected = Number(stats.collected_total) || 0;
    const pending = Number(stats.pending_dues) || 0;
    const denom = collected + pending;
    return denom > 0 ? Math.round((collected / denom) * 100) : 0;
  }, [stats.collected_total, stats.pending_dues]);

  const statCards: { label: string; value: string; icon: IconName; color: string; onPress?: () => void }[] = [
    { label: "Today's Collection", value: formatCurrency(stats.today_collection || 0), icon: 'today-outline', color: '#7C3AED' },
    { label: 'Total Collected', value: formatCurrency(stats.collected_total || 0), icon: 'wallet-outline', color: '#2563EB' },
    { label: 'This Month', value: formatCurrency(stats.monthly_collection || 0), icon: 'trending-up-outline', color: '#10B981' },
    { label: 'Pending Dues', value: formatCurrency(stats.pending_dues || 0), icon: 'cash-outline', color: '#F59E0B' },
  ];

  return (
    <View style={styles.container}>
      <AdminHeader title="Finance & Collection" showNotification scrollY={scrollY} />
      {loading && !refreshing ?
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <LogoLoader size={60} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.textSecondary, marginTop: 10 }}>Loading finance data...</Text>
        </View> :

        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="transparent" colors={['transparent']} progressBackgroundColor="transparent" />}>

          <View style={styles.inner}>
          {refreshing &&
            <View style={{ width: '100%', alignItems: 'center', paddingVertical: 20 }}>
              <LogoLoader size={30} />
            </View>
          }
          {loadError && (
            <TouchableOpacity
              onPress={fetchData}
              style={[styles.errorBanner, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
              activeOpacity={0.8}
            >
              <Ionicons name="warning-outline" size={18} color="#DC2626" />
              <Text style={styles.errorBannerText}>{loadError}</Text>
              <Text style={styles.retryText}>Tap to retry</Text>
            </TouchableOpacity>
          )}

          {/* ── Hero: Today's Collection + Collection Rate ── */}
          <Animated.View entering={FadeInUp.delay(0).springify()} style={styles.heroWrap}>
            <LinearGradient
              colors={['#6D28D9', '#7C3AED', '#9333EA']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              {/* decorative orbs */}
              <View style={styles.heroOrbLg} />
              <View style={styles.heroOrbSm} />

              <View style={styles.heroInner}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingRight: isWide ? 40 : 10 }}>
                    <Text style={styles.heroTitle}>
                      {selectedDate.toDateString() === new Date().toDateString() ? "TODAY'S COLLECTION" : "COLLECTION ON"}
                    </Text>
                    <TouchableOpacity 
                      activeOpacity={0.8}
                      onPress={() => setShowDatePicker(true)}
                      style={styles.datePickerBtn}>
                      <Ionicons name="calendar-outline" size={14} color="#fff" />
                      <Text style={styles.datePickerBtnText}>
                        {selectedDate.toDateString() === new Date().toDateString() ? 'Today' : selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                      <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.heroAmount}>{formatCurrency(stats.today_collection)}</Text>
                  <View style={styles.heroBadgeRow}>
                    <View style={styles.trendBadge}>
                      <View style={styles.livePulse} />
                      <Text style={styles.trendText}>Active Flow</Text>
                    </View>
                    <View style={styles.heroInlineStat}>
                      <Ionicons name="stats-chart" size={13} color="rgba(255,255,255,0.9)" />
                      <Text style={styles.heroInlineText}>This month {formatCurrency(stats.monthly_collection || 0)}</Text>
                    </View>
                  </View>
                </View>

                {/* Collection rate meter */}
                <View style={styles.rateBox}>
                  <View style={styles.rateHeader}>
                    <Text style={styles.rateLabel}>COLLECTION RATE</Text>
                    <Text style={styles.ratePct}>{collectionRate}%</Text>
                  </View>
                  <View style={styles.rateTrack}>
                    <View style={[styles.rateFill, { width: `${Math.min(Math.max(collectionRate, 0), 100)}%` }]} />
                  </View>
                  <Text style={styles.rateSub}>
                    {formatCurrency(stats.collected_total || 0)} of {formatCurrency((Number(stats.collected_total) || 0) + (Number(stats.pending_dues) || 0))}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* ── Stat grid ── */}
          <View style={styles.statGrid}>
            {statCards.map((s, i) => {
              const Card = (
                <Animated.View entering={FadeInUp.delay(80 + i * 60).springify()} style={styles.statCard}>
                  <View style={[styles.statAccent, { backgroundColor: s.color }]} />
                  <View style={[styles.statIconCircle, { backgroundColor: s.color + '18' }]}>
                    <Ionicons name={s.icon} size={20} color={s.color} />
                  </View>
                  <Text style={styles.statLabel}>{s.label}</Text>
                  <Text style={[styles.statValue, { color: s.color }]} numberOfLines={1} adjustsFontSizeToFit>{s.value}</Text>
                </Animated.View>
              );
              return (
                <View key={s.label} style={styles.statCell}>
                  {s.onPress
                    ? <TouchableOpacity activeOpacity={0.85} onPress={s.onPress}>{Card}</TouchableOpacity>
                    : Card}
                </View>
              );
            })}
          </View>

          {/* ── Pending fees due-list export ── */}
          <View style={styles.dueListCard}>
            <View style={styles.dueListHeader}>
              <View style={[styles.dueListIcon, { backgroundColor: '#F59E0B18' }]}>
                <Ionicons name="document-text-outline" size={22} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dueListTitle}>Pending Fees Due List</Text>
                <Text style={styles.dueListSubtitle}>
                  {dueListOptions ? `${dueListOptions.academic_year.code} · One row per student` : 'Loading available filters…'}
                </Text>
              </View>
            </View>
            <Text style={styles.dueListDescription}>
              Download father’s name, any linked mobile number, school-fee totals and transport pending fee when configured. Students with transport-only dues or fee waivers are also included. Village is taken from the student’s active transport stop.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dueFilterChips}>
              <TouchableOpacity
                disabled={!dueListOptions}
                style={[styles.filterChip, dueClassId && styles.filterChipActive]}
                onPress={() => selectDueFilter('Filter by Class', dueListOptions?.classes || [], dueClassId, setDueClassId)}
              >
                <Ionicons name="school-outline" size={13} color={dueClassId ? theme.colors.primary : theme.colors.textSecondary} style={{ marginRight: 5 }} />
                <Text style={[styles.filterChipText, dueClassId && { color: theme.colors.primary }]}>Class: {selectedDueClass?.name || 'All'}</Text>
                <Ionicons name="chevron-down" size={13} color={theme.colors.textSecondary} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!dueListOptions}
                style={[styles.filterChip, dueSectionId && styles.filterChipActive]}
                onPress={() => selectDueFilter('Filter by Section', dueListOptions?.sections || [], dueSectionId, setDueSectionId)}
              >
                <Ionicons name="layers-outline" size={13} color={dueSectionId ? theme.colors.primary : theme.colors.textSecondary} style={{ marginRight: 5 }} />
                <Text style={[styles.filterChipText, dueSectionId && { color: theme.colors.primary }]}>Section: {selectedDueSection?.name || 'All'}</Text>
                <Ionicons name="chevron-down" size={13} color={theme.colors.textSecondary} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!dueListOptions}
                style={[styles.filterChip, dueFeeTypeId && styles.filterChipActive]}
                onPress={() => selectDueFilter('Filter by Fee Type', dueListOptions?.fee_types || [], dueFeeTypeId, setDueFeeTypeId)}
              >
                <Ionicons name="pricetag-outline" size={13} color={dueFeeTypeId ? theme.colors.primary : theme.colors.textSecondary} style={{ marginRight: 5 }} />
                <Text style={[styles.filterChipText, dueFeeTypeId && { color: theme.colors.primary }]}>Fee type: {selectedDueFeeType?.name || 'All'}</Text>
                <Ionicons name="chevron-down" size={13} color={theme.colors.textSecondary} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!dueListOptions}
                style={[styles.filterChip, dueVillageId && styles.filterChipActive]}
                onPress={() => selectDueFilter('Filter by Village', dueListOptions?.villages || [], dueVillageId, setDueVillageId)}
              >
                <Ionicons name="location-outline" size={13} color={dueVillageId ? theme.colors.primary : theme.colors.textSecondary} style={{ marginRight: 5 }} />
                <Text style={[styles.filterChipText, dueVillageId && { color: theme.colors.primary }]}>Village: {selectedDueVillage?.label || 'All'}</Text>
                <Ionicons name="chevron-down" size={13} color={theme.colors.textSecondary} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, dueOverdueOnly && styles.filterChipActive]}
                onPress={() => setDueOverdueOnly((value) => !value)}
              >
                <Ionicons name={dueOverdueOnly ? 'checkbox-outline' : 'square-outline'} size={14} color={dueOverdueOnly ? theme.colors.primary : theme.colors.textSecondary} style={{ marginRight: 5 }} />
                <Text style={[styles.filterChipText, dueOverdueOnly && { color: theme.colors.primary }]}>Overdue only</Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity
              disabled={!dueListOptions || dueExporting}
              style={[styles.dueDownloadButton, (!dueListOptions || dueExporting) && styles.dueDownloadButtonDisabled]}
              onPress={exportDueList}
              activeOpacity={0.85}
            >
              <Ionicons name={dueExporting ? 'hourglass-outline' : 'download-outline'} size={18} color="#fff" />
              <Text style={styles.dueDownloadButtonText}>{dueExporting ? 'Preparing Excel…' : 'Download Excel Due List'}</Text>
            </TouchableOpacity>
          </View>

          {/* ── Fee collection receipts export ── */}
          <View style={styles.dueListCard}>
            <View style={styles.dueListHeader}>
              <View style={[styles.dueListIcon, { backgroundColor: '#7C3AED18' }]}>
                <Ionicons name="receipt-outline" size={22} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dueListTitle}>Fee Collection Receipts</Text>
                <Text style={styles.dueListSubtitle}>
                  {formatDateShort(receiptFromDate)} → {formatDateShort(receiptToDate)}
                </Text>
              </View>
            </View>
            <Text style={styles.dueListDescription}>
              Select a date range and download the full fee collection receipts list, including school fees and transport payments.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dueFilterChips}>
              {([
                { id: 'today', label: 'Today' },
                { id: 'last_7', label: 'Last 7 days' },
                { id: 'this_month', label: 'This month' },
                { id: 'last_month', label: 'Last month' },
              ] as const).map((preset) => {
                const active =
                  (preset.id === 'today' && receiptFromDate === todayDateInput() && receiptToDate === todayDateInput()) ||
                  (preset.id === 'last_7' && receiptFromDate === daysAgoInput(6) && receiptToDate === todayDateInput()) ||
                  (preset.id === 'this_month' && receiptFromDate === monthStartInput() && receiptToDate === todayDateInput()) ||
                  (preset.id === 'last_month' && (() => {
                    const range = lastMonthRange();
                    return receiptFromDate === range.from && receiptToDate === range.to;
                  })());
                return (
                  <TouchableOpacity
                    key={preset.id}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => applyReceiptPreset(preset.id)}
                  >
                    <Text style={[styles.filterChipText, active && { color: theme.colors.primary }]}>{preset.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.receiptDateRow}>
              <AppDatePicker
                label="From date"
                value={receiptFromDate}
                onChange={setReceiptFromDate}
                maximumDate={receiptToDate}
                variant="compact"
                isDark={isDark}
                accentColor={theme.colors.primary}
                containerStyle={styles.receiptDateField}
              />
              <AppDatePicker
                label="To date"
                value={receiptToDate}
                onChange={setReceiptToDate}
                minimumDate={receiptFromDate}
                maximumDate={todayDateInput()}
                variant="compact"
                isDark={isDark}
                accentColor={theme.colors.primary}
                containerStyle={styles.receiptDateField}
              />
            </View>
            <CollectionReportColumnSelector
              columns={reportColumns}
              hydrated={reportColumnsHydrated}
              isDark={isDark}
              onToggle={toggleReportColumn}
              saveError={reportColumnsSaveError || denominationsSaveError}
              accentColor={theme.colors.primary}
              title="Receipt export columns"
              description="Columns follow selection order; turn one off/on to move it last. Applies to Excel and PDF/CSV; S.No. and Date stay in Excel."
              embedded
              includeDenominations={includeDenominations}
              denominationsHydrated={denominationsHydrated}
              onToggleDenominations={toggleDenominations}
            />
            <TouchableOpacity
              disabled={receiptExporting || !reportColumnsHydrated}
              style={[
                styles.dueDownloadButton,
                (receiptExporting || !reportColumnsHydrated) && styles.dueDownloadButtonDisabled,
              ]}
              onPress={exportReceiptList}
              activeOpacity={0.85}
            >
              <Ionicons name={receiptExporting ? 'hourglass-outline' : 'download-outline'} size={18} color="#fff" />
              <Text style={styles.dueDownloadButtonText}>
                {receiptExporting ? 'Preparing Excel…' : 'Download Receipts List'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Filters ── */}
          <View style={styles.filterRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <TouchableOpacity style={[styles.filterChip, statusFilter !== 'All' && styles.filterChipActive]} onPress={handleFilterStatus}>
                <Ionicons name="funnel-outline" size={13} color={statusFilter !== 'All' ? theme.colors.primary : theme.colors.textSecondary} style={{ marginRight: 5 }} />
                <Text style={[styles.filterChipText, statusFilter !== 'All' && { color: theme.colors.primary, fontWeight: '700' }]}>Status: {statusFilter}</Text>
                <Ionicons name="chevron-down" size={13} color={theme.colors.textSecondary} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.filterChip, modeFilter !== 'All' && styles.filterChipActive]} onPress={handleFilterMode}>
                <Ionicons name="card-outline" size={13} color={modeFilter !== 'All' ? theme.colors.primary : theme.colors.textSecondary} style={{ marginRight: 5 }} />
                <Text style={[styles.filterChipText, modeFilter !== 'All' && { color: theme.colors.primary, fontWeight: '700' }]}>Mode: {modeFilter}</Text>
                <Ionicons name="chevron-down" size={13} color={theme.colors.textSecondary} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* ── Recent Transactions ── */}
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.sectionTitle}>Recent Transactions</Text>
              {filteredTransactions.length > 0 && (
                <View style={styles.countPill}><Text style={styles.countPillText}>{filteredTransactions.length}</Text></View>
              )}
            </View>
            <TouchableOpacity onPress={() => alertCompat('Transactions', 'Navigating to full transaction history...')}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          {filteredTransactions.length === 0 ?
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={40} color={theme.colors.textSecondary} style={{ opacity: 0.5 }} />
              <Text style={styles.emptyText}>No recent transactions found.</Text>
            </View> :

            <View style={styles.txList}>
              {filteredTransactions.map((tx, index) => {
                const isSuccess = tx.status === 'completed' || tx.status === 'success' || !tx.status;
                const statusColor = isSuccess ? '#10B981' : '#F59E0B';
                const studentName = tx.student_name || tx.student?.person?.display_name || tx.student?.first_name || 'Unknown Student';
                const avatarColor = colorFor(studentName);
                const isLast = index === filteredTransactions.length - 1;

                return (
                  <Animated.View key={tx.id || index} entering={FadeInUp.delay((index % 10 + 4) * 45).springify().damping(12)} style={[styles.txCard, !isLast && styles.txCardBorder]}>
                    <View style={[styles.txAvatar, { backgroundColor: avatarColor }]}>
                      <Text style={styles.txAvatarText}>{initialsFor(studentName)}</Text>
                    </View>
                    <View style={styles.txInfo}>
                      <Text style={styles.txName} numberOfLines={1}>{studentName}</Text>
                      <View style={styles.txMetaRow}>
                        <Ionicons name="time-outline" size={11} color={theme.colors.textSecondary} />
                        <Text style={styles.txTime}>{formatTime(tx.paid_at || tx.payment_date || tx.created_at)}</Text>
                        <View style={styles.txModeChip}>
                          <Text style={styles.txModeChipText}>{tx.payment_method?.toUpperCase() || 'CASH'}</Text>
                        </View>
                        {tx.fee_type ? (
                          <View style={[styles.txModeChip, tx.fee_type === 'Transport Fee' && styles.txTransportChip]}>
                            <Text style={[styles.txModeChipText, tx.fee_type === 'Transport Fee' && styles.txTransportChipText]}>
                              {tx.fee_type}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.txAmountContainer}>
                      <Text style={styles.txAmount}>+{formatCurrency(tx.amount)}</Text>
                      <View style={[styles.txStatusPill, { backgroundColor: statusColor + '18' }]}>
                        <Text style={[styles.txStatus, { color: statusColor }]}>
                          {isSuccess ? 'Success' : (tx.status?.charAt(0).toUpperCase() + tx.status?.slice(1)) || 'Pending'}
                        </Text>
                      </View>
                    </View>
                  </Animated.View>);
              })}
            </View>
          }
          </View>
        </Animated.ScrollView>
      }
      {/* Floating Action Button */}
      <TouchableOpacity
        disabled={!reportColumnsHydrated || !denominationsHydrated || printingCollection}
        style={[
          styles.fab,
          (!reportColumnsHydrated || !denominationsHydrated || printingCollection) && { opacity: 0.55 },
        ]}
        onPress={() => {
          if (!filteredTransactions || filteredTransactions.length === 0) {
            alertCompat('No Transactions', 'There are no transactions to export for this date.');
            return;
          }
          const meta = {
            schoolName: SCHOOL_NAME,
            accountantName: 'Admin',
            dateLabel: selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            dateIso: selectedDate.getFullYear() + '-' + String(selectedDate.getMonth() + 1).padStart(2, '0') + '-' + String(selectedDate.getDate()).padStart(2, '0')
          };
          alertCompat('Export Collection', 'How would you like to export this collection?', [
            {
              text: 'Print PDF',
              onPress: () => {
                requestCollectionPrint({ rows: [...filteredTransactions], meta });
              }
            },
            {
              text: 'Export CSV',
              onPress: async () => {
                try {
                  await exportCollectionCsv(filteredTransactions, meta, reportColumns);
                } catch (e) {
                  alertCompat('Error', 'Failed to generate CSV.');
                }
              }
            },
            { text: 'Cancel', style: 'cancel' }
          ]);
        }}>
        <Ionicons name="download-outline" size={24} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={pendingCollectionPrint !== null && includeDenominations}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!printingCollection) setPendingCollectionPrint(null);
        }}
      >
        <View style={styles.denominationModalOverlay}>
          <View style={styles.denominationModalCard}>
            <View style={styles.denominationModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.denominationModalTitle}>Count cash before printing</Text>
                <Text style={styles.denominationModalSubtitle}>
                  Use − / + or type the physical number of each note or coin. Nothing is filled automatically.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPendingCollectionPrint(null)}
                disabled={printingCollection}
                style={styles.denominationModalClose}
                accessibilityLabel="Close denomination entry"
              >
                <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.denominationModalScroll}
              contentContainerStyle={styles.denominationModalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              <CashDenominationCalculator
                cashTotal={pendingCashTotal}
                pieces={denominationPieces}
                onChange={(pieces) => {
                  setDenominationPieces(pieces);
                  setDenominationEdited(true);
                }}
                isDark={isDark}
                accentColor={theme.colors.primary}
                showSuggestion={false}
              />
            </ScrollView>
            <View style={styles.denominationModalActions}>
              <TouchableOpacity
                onPress={() => setPendingCollectionPrint(null)}
                disabled={printingCollection}
                style={styles.denominationCancelButton}
              >
                <Text style={styles.denominationCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmDenominationPrint}
                disabled={printingCollection || (!denominationEdited && pendingCashTotal > 0)}
                style={[
                  styles.denominationPrintButton,
                  (printingCollection || (!denominationEdited && pendingCashTotal > 0)) && styles.dueDownloadButtonDisabled,
                ]}
              >
                {printingCollection ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="print-outline" size={18} color="#fff" />
                )}
                <Text style={styles.denominationPrintText}>
                  {printingCollection ? 'Preparing…' : denominationEdited || pendingCashTotal === 0 ? 'Print PDF' : 'Enter cash counts'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={dueFilterPicker !== null}
        transparent
        animationType="fade"
        onRequestClose={closeDueFilterPicker}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.duePickerOverlay}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeDueFilterPicker}
            accessibilityLabel="Dismiss filter"
          />
          <View style={[styles.duePickerCard, clayCard(isDark, 'md')]}>
            <LinearGradient
              colors={isDark ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.75, y: 0.55 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.duePickerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.duePickerTitle}>{dueFilterPicker?.title || 'Select'}</Text>
                <Text style={styles.duePickerSubtitle}>
                  {dueFilterVisibleItems.length > 1
                    ? `${dueFilterVisibleItems.length - 1} option${dueFilterVisibleItems.length - 1 === 1 ? '' : 's'}`
                    : 'No matches'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeDueFilterPicker}
                style={styles.duePickerClose}
                accessibilityLabel="Close filter"
              >
                <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={[styles.duePickerSearch, clayInset(isDark, false)]}>
              <Ionicons name="search" size={16} color={theme.colors.textSecondary} />
              <AppTextInput
                style={[ds.inputInChrome, styles.duePickerSearchInput]}
                placeholder="Search…"
                placeholderTextColor={theme.colors.textSecondary}
                value={dueFilterQuery}
                onChangeText={setDueFilterQuery}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {dueFilterQuery.length > 0 ? (
                <TouchableOpacity onPress={() => setDueFilterQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView
              style={[styles.duePickerList, { height: duePickerListHeight }]}
              contentContainerStyle={styles.duePickerListContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {dueFilterVisibleItems.map((item) => {
                const selected = (dueFilterPicker?.selectedId || '') === item.id;
                return (
                  <TouchableOpacity
                    key={item.id || 'all'}
                    style={[styles.duePickerRow, selected && styles.duePickerRowSelected]}
                    onPress={() => {
                      dueFilterPicker?.onSelect(item.id);
                      closeDueFilterPicker();
                    }}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[styles.duePickerRowText, selected && { color: theme.colors.primary, fontWeight: '800' }]}
                      numberOfLines={2}
                    >
                      {item.label || item.name}
                    </Text>
                    {selected ? <Ionicons name="checkmark" size={18} color={theme.colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <PremiumDatePickerModal 
        visible={showDatePicker} 
        date={selectedDate} 
        onClose={() => setShowDatePicker(false)} 
        onSelect={(date) => {
          setSelectedDate(date);
          setShowDatePicker(false);
        }} 
      />
    </View>);

}

const getStyles = (theme: Theme, isWide: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  content: {
    paddingHorizontal: isWide ? 24 : 16,
    paddingTop: 96,
    paddingBottom: 96,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: 1080,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#991B1B',
    lineHeight: 17,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7C3AED',
  },

  /* Hero */
  heroWrap: {
    borderRadius: 26,
    marginBottom: 18,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 10,
  },
  heroCard: {
    borderRadius: 26,
    padding: isWide ? 28 : 22,
    overflow: 'hidden',
  },
  heroOrbLg: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)', top: -70, right: -50,
  },
  heroOrbSm: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.06)', bottom: -40, right: 80,
  },
  heroInner: {
    flexDirection: isWide ? 'row' : 'column',
    alignItems: isWide ? 'center' : 'flex-start',
    justifyContent: 'space-between',
    gap: 20,
  },
  heroTitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  heroAmount: {
    color: '#fff',
    fontSize: isWide ? 44 : 38,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 14,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  datePickerBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  livePulse: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ADE80', marginRight: 6,
  },
  trendText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  heroInlineStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  heroInlineText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 12,
    fontWeight: '600',
  },
  rateBox: {
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    width: isWide ? 260 : '100%',
  },
  rateHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10,
  },
  rateLabel: {
    color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '800', letterSpacing: 1,
  },
  ratePct: {
    color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.5,
  },
  rateTrack: {
    height: 8, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden',
  },
  rateFill: {
    height: '100%', borderRadius: 99, backgroundColor: '#4ADE80',
  },
  rateSub: {
    color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600', marginTop: 8,
  },

  /* Stat grid */
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 22,
  },
  statCell: {
    flexGrow: 1,
    flexBasis: isWide ? 200 : '46%',
  },
  statCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    padding: 16,
    paddingTop: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  statAccent: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 4,
  },
  statIconCircle: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: theme.colors.text,
  },

  /* Pending fee due-list export */
  dueListCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: isWide ? 20 : 16,
    marginBottom: 22,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  dueListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dueListIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dueListTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  dueListSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  dueListDescription: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
  dueFilterChips: {
    gap: 8,
    paddingTop: 14,
    paddingBottom: 14,
  },
  dueDownloadButton: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dueDownloadButtonDisabled: {
    opacity: 0.55,
  },
  dueDownloadButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  receiptDateRow: {
    flexDirection: isWide ? 'row' : 'column',
    gap: 10,
    marginBottom: 14,
  },
  receiptDateField: {
    flex: 1,
    marginBottom: 0,
  },

  /* Filters */
  filterRow: {
    marginBottom: 22,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '12',
  },
  filterChipText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },

  /* Section */
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: theme.colors.text,
  },
  countPill: {
    marginLeft: 8,
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 7,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.primary + '18',
  },
  countPillText: {
    fontSize: 11, fontWeight: '800', color: theme.colors.primary,
  },
  seeAllText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '700',
  },

  /* Transactions */
  txList: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  txCardBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  txAvatar: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  txAvatarText: {
    color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.3,
  },
  txInfo: {
    flex: 1,
  },
  txName: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  txMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  txTime: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  txModeChip: {
    marginLeft: 4,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  txModeChipText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: theme.colors.textSecondary,
  },
  txTransportChip: {
    backgroundColor: '#ECFEFF',
    borderColor: '#A5F3FC',
  },
  txTransportChipText: {
    color: '#0E7490',
  },
  txAmountContainer: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#10B981',
    marginBottom: 4,
  },
  txStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  txStatus: {
    fontSize: 11,
    fontWeight: '700',
  },

  /* Empty */
  emptyBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6
  },
  denominationModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  denominationModalCard: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '92%',
    backgroundColor: theme.colors.background,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  denominationModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  denominationModalTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  denominationModalSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  denominationModalClose: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: theme.colors.card,
  },
  denominationModalScroll: {
    flexShrink: 1,
  },
  denominationModalScrollContent: {
    padding: 16,
    paddingBottom: 0,
  },
  denominationModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  denominationCancelButton: {
    minHeight: 46,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  denominationCancelText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  denominationPrintButton: {
    minHeight: 46,
    minWidth: 150,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  denominationPrintText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },

  duePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  duePickerCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '86%',
    borderRadius: 24,
    overflow: 'hidden',
    zIndex: 2,
    paddingBottom: 10,
  },
  duePickerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },
  duePickerTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  duePickerSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  duePickerClose: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: isWide ? theme.colors.card : theme.colors.background,
  },
  duePickerSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 14,
  },
  duePickerSearchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : null),
  },
  duePickerList: {
    flexGrow: 0,
    ...(Platform.OS === 'web' ? { overflowY: 'auto' } as any : null),
  },
  duePickerListContent: {
    paddingHorizontal: 10,
    paddingBottom: 12,
  },
  duePickerRow: {
    minHeight: DUE_PICKER_ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
  },
  duePickerRowSelected: {
    backgroundColor: theme.colors.primary + '14',
  },
  duePickerRowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
});
