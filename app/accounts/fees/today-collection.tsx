import { TourTarget } from '@/src/features/app-tour';
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  StatusBar,
  Platform,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AppTextInput from '@/src/components/AppTextInput';
import { clay, clayCard, clayInset } from '@/src/theme/clayStyles';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import AdminHeader from '../../../src/components/AdminHeader';
import LogoLoader from '../../../src/components/LogoLoader';
import PaymentDeletionActions from '../../../src/components/accounts/PaymentDeletionActions';
import CollectionReportColumnSelector from '../../../src/components/accounts/CollectionReportColumnSelector';
import CashDenominationCalculator from '../../../src/components/accounts/CashDenominationCalculator';
import { useAuth } from '../../../src/hooks/useAuth';
import {
  useCollectionReportColumns,
  useCollectionReportDenominations,
} from '../../../src/hooks/useCollectionReportColumns';
import { useTheme } from '../../../src/hooks/useTheme';
import { useAccountsWebChrome } from '../../../src/contexts/AccountsWebChromeContext';
import { FeeService } from '../../../src/services/feeService';
import { FeeTransaction } from '../../../src/types/models';
import { SCHOOL_NAME } from '../../../src/constants/school';
import { alertCompat } from '../../../src/utils/crossPlatformAlert';
import {
  PAYMENT_MODES,
  buildCashDenominationBreakdownFromPieces,
  calculateCashDenominations,
  computeCollectionTotals,
  exportCollectionCsv,
  formatAmount,
  formatClassSection,
  formatPaymentMethod,
  formatTime,
  piecesFromCashDenominationBreakdown,
  printCollectionReport,
  type CashDenominationPieces,
  type PaymentMode,
} from '../../../src/utils/collectionReport';

type PaymentFilter = 'all' | PaymentMode;

interface CollectionFilters {
  paymentMode: PaymentFilter;
  feeType: string;
  search: string;
}

const EMPTY_FILTERS: CollectionFilters = {
  paymentMode: 'all',
  feeType: 'all',
  search: '',
};

const ACCENT = '#0D9488';
const ACCENT_SOFT = '#CCFBF1';
const ACCENT_DEEP = '#0F766E';
const MONEY = '#059669';
const FONT = Platform.OS === 'ios' ? 'SF Pro Display' : 'System';

function applyCollectionFilters(rows: FeeTransaction[], filters: CollectionFilters): FeeTransaction[] {
  let list = rows;
  if (filters.paymentMode !== 'all') {
    list = list.filter((tx) => String(tx.payment_method ?? '').toLowerCase() === filters.paymentMode);
  }
  if (filters.feeType !== 'all') {
    list = list.filter((tx) => (tx.fee_type ?? '') === filters.feeType);
  }
  const q = filters.search.trim().toLowerCase();
  if (q) {
    list = list.filter((tx) => {
      const name = (tx.student_name ?? '').toLowerCase();
      const adm = (tx.admission_no ?? '').toLowerCase();
      const ref = (tx.transaction_ref ?? '').toLowerCase();
      const father = (tx.father_name ?? '').toLowerCase();
      const receipt = String(tx.receipt_no ?? '').toLowerCase();
      const feeType = (tx.fee_type ?? '').toLowerCase();
      return (
        name.includes(q) ||
        adm.includes(q) ||
        ref.includes(q) ||
        father.includes(q) ||
        receipt.includes(q) ||
        feeType.includes(q)
      );
    });
  }
  return list;
}

function buildFilterNote(filters: CollectionFilters): string | undefined {
  const parts: string[] = [];
  if (filters.paymentMode !== 'all') parts.push(`Payment: ${formatPaymentMethod(filters.paymentMode)}`);
  if (filters.feeType !== 'all') parts.push(`Fee: ${filters.feeType}`);
  if (filters.search.trim()) parts.push(`Search: ${filters.search.trim()}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function hasActiveCollectionFilters(filters: CollectionFilters): boolean {
  return filters.paymentMode !== 'all' || filters.feeType !== 'all' || filters.search.trim().length > 0;
}

const toDateInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

function todayRange() {
  const today = toDateInput(new Date());
  return { today, fromDate: today, toDate: `${today}T23:59:59` };
}

function formatTodayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatShortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

const PressableScale = ({
  children,
  onPress,
  disabled,
  style,
  containerStyle,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: any;
  containerStyle?: any;
  accessibilityLabel?: string;
}) => {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      focusable
      style={[
        containerStyle,
        Platform.OS === 'web' && {
          cursor: disabled ? 'not-allowed' : 'pointer',
        },
      ]}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 16, stiffness: 280 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 16, stiffness: 280 });
      }}
    >
      <Animated.View style={[style, animStyle, disabled && { opacity: 0.55 }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

const TransactionCard = React.memo(function TransactionCard({
  item,
  index,
  isDark,
  onChanged,
}: {
  item: FeeTransaction;
  index: number;
  isDark: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const textPri = isDark ? '#F1F5F9' : '#0F172A';
  const textSec = isDark ? 'rgba(255,255,255,0.45)' : '#64748B';
  const enterDelay = Math.min(index, 8) * 45;

  return (
    <Animated.View entering={FadeInDown.delay(enterDelay).duration(320)}>
      <View
        style={[
          cardStyles.card,
          clayCard(isDark, 'sm'),
          { backgroundColor: isDark ? '#1A2332' : '#F8FAFC', borderWidth: 0 },
        ]}
      >
        <View style={[cardStyles.accent, { backgroundColor: MONEY }]} />
        <View style={cardStyles.inner}>
          <View style={cardStyles.topRow}>
            <View style={[cardStyles.avatar, { backgroundColor: isDark ? 'rgba(13,148,136,0.18)' : ACCENT_SOFT }]}>
              <Text style={[cardStyles.avatarText, { color: ACCENT_DEEP }]}>
                {(item.student_name ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={cardStyles.titleBlock}>
              <Text style={[cardStyles.student, { color: textPri, fontFamily: FONT }]} numberOfLines={1}>
                {item.student_name ?? '—'}
              </Text>
              {item.father_name ? (
                <Text style={[cardStyles.father, { color: textSec, fontFamily: FONT }]} numberOfLines={1}>
                  {item.father_name}
                </Text>
              ) : null}
            </View>
            <View style={cardStyles.amountBlock}>
              <Text style={[cardStyles.amount, { color: MONEY, fontFamily: FONT }]}>
                {formatAmount(Number(item.amount || 0))}
              </Text>
              <Text style={[cardStyles.timeHint, { color: textSec, fontFamily: FONT }]}>
                {formatTime(item.paid_at)}
              </Text>
            </View>
          </View>

          <View style={cardStyles.metaRow}>
            <MetaChip label={item.fee_type ?? 'Fee'} isDark={isDark} />
            <MetaChip label={formatPaymentMethod(item.payment_method)} isDark={isDark} accent={ACCENT} />
            <MetaChip
              label={formatClassSection(item.class_name, item.section_name)}
              isDark={isDark}
            />
          </View>

          <View style={[cardStyles.detailRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }]}>
            <DetailCell label="Adm no" value={item.admission_no ?? '—'} color={textSec} />
            <DetailCell label="Ref" value={item.transaction_ref ?? '—'} color={textSec} flex />
          </View>
          <PaymentDeletionActions transaction={item} isDark={isDark} onChanged={onChanged} />
        </View>
      </View>
    </Animated.View>
  );
});

function MetaChip({ label, isDark, accent }: { label: string; isDark: boolean; accent?: string }) {
  return (
    <View
      style={[
        cardStyles.chip,
        {
          backgroundColor: accent
            ? `${accent}14`
            : isDark
              ? 'rgba(255,255,255,0.06)'
              : '#EEF2F7',
        },
      ]}
    >
      <Text
        style={[
          cardStyles.chipText,
          { color: accent ?? (isDark ? 'rgba(255,255,255,0.65)' : '#475569'), fontFamily: FONT },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function DetailCell({
  label,
  value,
  color,
  flex,
}: {
  label: string;
  value: string;
  color: string;
  flex?: boolean;
}) {
  return (
    <View style={[cardStyles.detailCell, flex ? { flex: 1 } : undefined]}>
      <Text style={[cardStyles.detailLabel, { color, fontFamily: FONT }]}>{label}</Text>
      <Text style={[cardStyles.detailValue, { color, fontFamily: FONT }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function SummaryStrip({
  totals,
  isDark,
}: {
  totals: ReturnType<typeof computeCollectionTotals>;
  isDark: boolean;
}) {
  const modeChips = PAYMENT_MODES.map((mode) => {
    const bucket = totals.byMode[mode];
    if (!bucket || bucket.count === 0) return null;
    return (
      <View
        key={mode}
        style={[
          sumStyles.modeChip,
          {
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)',
          },
        ]}
      >
        <Text style={[sumStyles.modeLabel, { color: isDark ? 'rgba(255,255,255,0.45)' : '#64748B', fontFamily: FONT }]}>
          {formatPaymentMethod(mode)}
        </Text>
        <Text style={[sumStyles.modeValue, { color: isDark ? '#F8FAFC' : '#0F172A', fontFamily: FONT }]}>
          {formatAmount(bucket.total)}
        </Text>
        <Text style={[sumStyles.modeCount, { color: isDark ? 'rgba(255,255,255,0.35)' : '#94A3B8', fontFamily: FONT }]}>
          {bucket.count} txn
        </Text>
      </View>
    );
  }).filter(Boolean);

  return (
    <Animated.View entering={FadeInDown.delay(60).duration(360)} style={sumStyles.wrap}>
      <View style={sumStyles.statRow}>
        <View
          style={[
            sumStyles.statCard,
            clayCard(isDark, 'md'),
            { backgroundColor: isDark ? '#1A2332' : '#F4F7FB', borderWidth: 0 },
          ]}
        >
          <View style={[sumStyles.statIcon, { backgroundColor: isDark ? 'rgba(13,148,136,0.2)' : ACCENT_SOFT }]}>
            <Ionicons name="receipt-outline" size={18} color={ACCENT} />
          </View>
          <Text style={[sumStyles.statLabel, { color: isDark ? 'rgba(255,255,255,0.45)' : '#64748B', fontFamily: FONT }]}>
            Transactions
          </Text>
          <Text style={[sumStyles.statValue, { color: isDark ? '#F8FAFC' : '#0F172A', fontFamily: FONT }]}>
            {totals.count}
          </Text>
        </View>

        <View
          style={[
            sumStyles.statCard,
            clayCard(isDark, 'md'),
            { backgroundColor: isDark ? '#1A2332' : '#F4F7FB', borderWidth: 0, overflow: 'hidden' },
          ]}
        >
          <LinearGradient
            colors={isDark ? ['rgba(16,185,129,0.18)', 'rgba(16,185,129,0)'] : ['rgba(204,251,241,0.9)', 'rgba(244,247,251,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={[sumStyles.statIcon, { backgroundColor: isDark ? 'rgba(16,185,129,0.2)' : '#D1FAE5' }]}>
            <Ionicons name="wallet-outline" size={18} color={MONEY} />
          </View>
          <Text style={[sumStyles.statLabel, { color: isDark ? 'rgba(255,255,255,0.45)' : '#64748B', fontFamily: FONT }]}>
            Grand total
          </Text>
          <Text style={[sumStyles.statValueMoney, { color: MONEY, fontFamily: FONT }]} numberOfLines={1}>
            {formatAmount(totals.grandTotal)}
          </Text>
        </View>
      </View>

      {modeChips.length > 0 ? (
        <View style={sumStyles.modeRow}>{modeChips}</View>
      ) : null}
    </Animated.View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  isDark,
  count,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  isDark: boolean;
  count?: number;
}) {
  const idleText = isDark ? 'rgba(255,255,255,0.5)' : '#64748B';

  return (
    <PressableScale onPress={onPress}>
      <View
        style={[
          filterStyles.chip,
          active
            ? {
                backgroundColor: ACCENT,
                ...clay(isDark, 'sm'),
                borderWidth: 0,
              }
            : {
                backgroundColor: isDark ? '#151C28' : '#EEF2F7',
                ...(clayInset(isDark) as any),
                borderWidth: 0,
              },
        ]}
      >
        <Text style={[filterStyles.chipText, { color: active ? '#fff' : idleText, fontFamily: FONT }]}>
          {label}
        </Text>
        {count !== undefined && count > 0 ? (
          <View
            style={[
              filterStyles.chipBadge,
              {
                backgroundColor: active
                  ? 'rgba(255,255,255,0.22)'
                  : isDark
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(15,23,42,0.08)',
              },
            ]}
          >
            <Text style={[filterStyles.chipBadgeText, { color: active ? '#fff' : idleText, fontFamily: FONT }]}>
              {count}
            </Text>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

function CollectionFiltersPanel({
  expanded,
  onToggle,
  isDark,
  filters,
  onChange,
  onClear,
  feeTypes,
  allRows,
}: {
  expanded: boolean;
  onToggle: () => void;
  isDark: boolean;
  filters: CollectionFilters;
  onChange: (patch: Partial<CollectionFilters>) => void;
  onClear: () => void;
  feeTypes: string[];
  allRows: FeeTransaction[];
}) {
  const chipText = isDark ? 'rgba(255,255,255,0.55)' : '#64748B';
  const active = hasActiveCollectionFilters(filters);
  const [searchFocused, setSearchFocused] = useState(false);

  const modeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allRows.length };
    for (const mode of PAYMENT_MODES) {
      counts[mode] = allRows.filter((tx) => String(tx.payment_method ?? '').toLowerCase() === mode).length;
    }
    return counts;
  }, [allRows]);

  const feeTypeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allRows.length };
    for (const ft of feeTypes) {
      counts[ft] = allRows.filter((tx) => tx.fee_type === ft).length;
    }
    return counts;
  }, [allRows, feeTypes]);

  return (
    <Animated.View entering={FadeInDown.delay(100).duration(360)} style={filterStyles.wrap}>
      {/* Always-visible search */}
      <View style={[filterStyles.searchOuter, clayCard(isDark, 'sm'), { backgroundColor: isDark ? '#1A2332' : '#F4F7FB', borderWidth: 0 }]}>
        <View style={[filterStyles.searchInner, clayInset(isDark, searchFocused) as any]}>
          <Ionicons
            name="search"
            size={16}
            color={searchFocused ? ACCENT : isDark ? '#64748B' : '#94A3B8'}
          />
          <AppTextInput
            style={[
              filterStyles.searchInput,
              {
                color: isDark ? '#F8FAFC' : '#0F172A',
                fontFamily: FONT,
                backgroundColor: 'transparent',
                borderWidth: 0,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
              } as any,
            ]}
            placeholder="Search name, admission no, ref…"
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.28)' : '#94A3B8'}
            accessibilityLabel="Search collection transactions"
            value={filters.search}
            onChangeText={(search) => onChange({ search })}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {filters.search.trim().length > 0 ? (
            <Pressable
              onPress={() => onChange({ search: '' })}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}
            >
              <Ionicons name="close-circle" size={18} color={isDark ? '#64748B' : '#94A3B8'} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <PressableScale onPress={onToggle}>
        <View
          style={[
            filterStyles.toggleRow,
            clayCard(isDark, 'sm'),
            {
              backgroundColor: isDark ? '#1A2332' : '#F4F7FB',
              borderWidth: 0,
            },
          ]}
        >
          <View style={filterStyles.toggleLeft}>
            <View
              style={[
                filterStyles.filterIconWrap,
                { backgroundColor: active ? (isDark ? 'rgba(13,148,136,0.2)' : ACCENT_SOFT) : isDark ? 'rgba(255,255,255,0.06)' : '#E8EEF6' },
              ]}
            >
              <Ionicons name="options-outline" size={15} color={active ? ACCENT : chipText} />
            </View>
            <Text style={[filterStyles.toggleText, { color: active ? ACCENT : chipText, fontFamily: FONT }]}>
              {active ? 'Filters active' : 'More filters'}
            </Text>
            {active ? (
              <View style={[filterStyles.activeDot, { backgroundColor: ACCENT }]} />
            ) : null}
          </View>
          <View style={filterStyles.toggleRight}>
            {active ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  onClear();
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear all filters"
                style={[
                  filterStyles.clearButton,
                  {
                    backgroundColor: isDark ? 'rgba(13,148,136,0.18)' : ACCENT_SOFT,
                  },
                  Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                ]}
              >
                <Ionicons name="close" size={13} color={isDark ? '#5EEAD4' : ACCENT_DEEP} />
                <Text
                  style={[
                    filterStyles.clearText,
                    { color: isDark ? '#5EEAD4' : ACCENT_DEEP, fontFamily: FONT },
                  ]}
                >
                  Clear
                </Text>
              </Pressable>
            ) : null}
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={chipText} />
          </View>
        </View>
      </PressableScale>

      {expanded ? (
        <Animated.View
          entering={FadeIn.duration(220)}
          style={[
            filterStyles.panel,
            clayCard(isDark, 'sm'),
            { backgroundColor: isDark ? '#1A2332' : '#F8FAFC', borderWidth: 0 },
          ]}
        >
          <Text style={[filterStyles.label, { color: chipText, fontFamily: FONT }]}>Payment mode</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={filterStyles.chipRow}>
            <FilterChip
              label="All modes"
              active={filters.paymentMode === 'all'}
              onPress={() => onChange({ paymentMode: 'all' })}
              isDark={isDark}
              count={modeCounts.all}
            />
            {PAYMENT_MODES.map((mode) => {
              const count = modeCounts[mode] ?? 0;
              if (count === 0 && filters.paymentMode !== mode) return null;
              return (
                <FilterChip
                  key={mode}
                  label={formatPaymentMethod(mode)}
                  active={filters.paymentMode === mode}
                  onPress={() => onChange({ paymentMode: mode })}
                  isDark={isDark}
                  count={count}
                />
              );
            })}
          </ScrollView>

          <Text style={[filterStyles.label, { color: chipText, fontFamily: FONT, marginTop: 4 }]}>Fee type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={filterStyles.chipRow}>
            <FilterChip
              label="All fees"
              active={filters.feeType === 'all'}
              onPress={() => onChange({ feeType: 'all' })}
              isDark={isDark}
              count={feeTypeCounts.all}
            />
            {feeTypes.map((ft) => (
              <FilterChip
                key={ft}
                label={ft}
                active={filters.feeType === ft}
                onPress={() => onChange({ feeType: ft })}
                isDark={isDark}
                count={feeTypeCounts[ft] ?? 0}
              />
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export default function TodayCollectionScreen() {
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const { shellActive } = useAccountsWebChrome();
  const { width: viewportWidth } = useWindowDimensions();
  const isCompact = viewportWidth < 720;
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);

  const [allRows, setAllRows] = useState<FeeTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filters, setFilters] = useState<CollectionFilters>(EMPTY_FILTERS);
  const [schoolFeeTypes, setSchoolFeeTypes] = useState<string[]>([]);

  const { today } = useMemo(() => todayRange(), []);
  const [reportDate, setReportDate] = useState(today);
  const accountantId = user?.userId || user?.id || null;
  const accountantName =
    user?.displayName || user?.display_name || user?.name || 'Accountant';
  const {
    columns: reportColumns,
    hydrated: reportColumnsHydrated,
    saveError: reportColumnsSaveError,
    toggleColumn: toggleReportColumn,
  } = useCollectionReportColumns(String(accountantId || 'accounts'));
  const {
    includeDenominations,
    hydrated: denominationsHydrated,
    saveError: denominationsSaveError,
    toggleDenominations,
  } = useCollectionReportDenominations(String(accountantId || 'accounts'));
  const [denominationPieces, setDenominationPieces] = useState<CashDenominationPieces>(() =>
    piecesFromCashDenominationBreakdown(calculateCashDenominations(0)),
  );
  const [denominationSeedKey, setDenominationSeedKey] = useState<string | null>(null);

  const reportMeta = useMemo(
    () => ({
      schoolName: SCHOOL_NAME,
      accountantName,
      dateLabel: formatTodayLabel(reportDate),
      dateIso: reportDate,
      filterNote: buildFilterNote(filters),
    }),
    [accountantName, reportDate, filters],
  );

  const feeTypes = useMemo(() => {
    const set = new Set<string>(schoolFeeTypes);
    for (const row of allRows) {
      if (row.fee_type) set.add(row.fee_type);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allRows, schoolFeeTypes]);

  React.useEffect(() => {
    FeeService.getFeeTypes()
      .then((types) => {
        const names = types
          .map((t) => t.name?.trim())
          .filter((name): name is string => Boolean(name));
        setSchoolFeeTypes(Array.from(new Set(names)));
      })
      .catch(() => setSchoolFeeTypes([]));
  }, []);

  const filteredRows = useMemo(
    () => applyCollectionFilters(allRows, filters),
    [allRows, filters],
  );

  const totals = useMemo(() => computeCollectionTotals(filteredRows), [filteredRows]);
  const cashTotal = totals.byMode.cash?.total || 0;
  const filtersActive = hasActiveCollectionFilters(filters);

  // Re-seed the calculator when the cash total changes so print always starts from a sensible suggestion.
  React.useEffect(() => {
    const seedKey = `${reportDate}:${cashTotal}`;
    if (denominationSeedKey === seedKey) return;
    setDenominationPieces(piecesFromCashDenominationBreakdown(calculateCashDenominations(cashTotal)));
    setDenominationSeedKey(seedKey);
  }, [cashTotal, denominationSeedKey, reportDate]);

  const loadData = useCallback(async (): Promise<FeeTransaction[]> => {
    if (!accountantId) {
      setAllRows([]);
      return [];
    }
    const result = await FeeService.getTodayCollection();
    if (result.date) {
      setReportDate(result.date);
    }
    const collectorKey = String(accountantId ?? '');
    const resultCollectorKey = String(result.collector_id ?? '');
    const scoped = result.transactions.filter((tx) => {
      if (tx.deletion_status === 'DELETED') return false;
      const receivedBy = String(tx.received_by_id ?? '');
      return (
        !collectorKey ||
        receivedBy === collectorKey ||
        (resultCollectorKey && receivedBy === resultCollectorKey)
      );
    });
    setAllRows(scoped);
    return scoped;
  }, [accountantId]);

  React.useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        await loadData();
      } catch {
        if (active) setAllRows([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData();
    } catch {
      alertCompat('Error', 'Could not refresh today\'s collection.');
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const fresh = await loadData();
      const exportRows = applyCollectionFilters(fresh, filters);
      await exportCollectionCsv(exportRows, reportMeta, reportColumns);
    } catch {
      alertCompat('Error', 'Failed to export collection report.');
    } finally {
      setExporting(false);
    }
  }, [filters, loadData, reportColumns, reportMeta]);

  const handlePrint = useCallback(async () => {
    const runPrint = async () => {
      setPrinting(true);
      try {
        const fresh = await loadData();
        const exportRows = applyCollectionFilters(fresh, filters);
        await printCollectionReport(exportRows, reportMeta, reportColumns, {
          includeDenominations,
          denominationPieces: includeDenominations ? denominationPieces : undefined,
        });
      } catch {
        alertCompat('Error', 'Failed to print collection report.');
      } finally {
        setPrinting(false);
      }
    };

    if (includeDenominations) {
      const counted = buildCashDenominationBreakdownFromPieces(denominationPieces).allocatedTotal;
      const difference = Number((counted - cashTotal).toFixed(2));
      if (difference !== 0) {
        alertCompat(
          'Cash count does not match',
          `Counted denominations are ${formatAmount(counted)} but cash collections are ${formatAmount(cashTotal)} (${difference > 0 ? 'excess' : 'short'} ${formatAmount(Math.abs(difference))}). Print anyway?`,
          [
            { text: 'Edit counts', style: 'cancel' },
            { text: 'Print anyway', onPress: () => { void runPrint(); } },
          ],
        );
        return;
      }
    }

    await runPrint();
  }, [
    cashTotal,
    denominationPieces,
    filters,
    includeDenominations,
    loadData,
    reportColumns,
    reportMeta,
  ]);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: FeeTransaction; index: number }) => (
      <TransactionCard item={item} index={index} isDark={isDark} onChanged={handleRefresh} />
    ),
    [handleRefresh, isDark],
  );

  const ListHeader = (
    <View>
      <Animated.View entering={FadeInDown.duration(360)} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroCopy}>
            <Text style={[styles.heroEyebrow, { color: isDark ? 'rgba(255,255,255,0.4)' : '#94A3B8', fontFamily: FONT }]}>
              Daily audit · yours only
            </Text>
            <Text style={[styles.heroTitle, { color: isDark ? '#F8FAFC' : '#0F172A', fontFamily: FONT }]}>
              Today&apos;s Collection
            </Text>
          </View>
          <View
            style={[
              styles.datePill,
              clayCard(isDark, 'sm'),
              { backgroundColor: isDark ? '#1A2332' : '#F4F7FB', borderWidth: 0 },
            ]}
          >
            <View style={[styles.liveDot, { backgroundColor: MONEY }]} />
            <Text style={[styles.datePillText, { color: isDark ? '#CBD5E1' : '#475569', fontFamily: FONT }]}>
              {formatShortDate(reportDate)}
            </Text>
          </View>
        </View>

        <View style={styles.heroMetaRow}>
          <View style={[styles.collectorChip, { backgroundColor: isDark ? 'rgba(13,148,136,0.15)' : ACCENT_SOFT }]}>
            <Ionicons name="person" size={12} color={ACCENT_DEEP} />
            <Text style={[styles.collectorText, { color: ACCENT_DEEP, fontFamily: FONT }]} numberOfLines={1}>
              {accountantName}
            </Text>
          </View>
          <Text style={[styles.scopeNote, { color: isDark ? 'rgba(255,255,255,0.35)' : '#94A3B8', fontFamily: FONT }]}>
            Fees you collected today
          </Text>
        </View>
      </Animated.View>

      <SummaryStrip totals={totals} isDark={isDark} />

      <CollectionFiltersPanel
        expanded={filtersExpanded}
        onToggle={() => setFiltersExpanded((prev) => !prev)}
        isDark={isDark}
        filters={filters}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        onClear={clearFilters}
        feeTypes={feeTypes}
        allRows={allRows}
      />

      <CollectionReportColumnSelector
        columns={reportColumns}
        hydrated={reportColumnsHydrated}
        isDark={isDark}
        onToggle={toggleReportColumn}
        saveError={reportColumnsSaveError || denominationsSaveError}
        accentColor={ACCENT}
        includeDenominations={includeDenominations}
        denominationsHydrated={denominationsHydrated}
        onToggleDenominations={toggleDenominations}
      />

      {includeDenominations ? (
        <CashDenominationCalculator
          cashTotal={cashTotal}
          pieces={denominationPieces}
          onChange={setDenominationPieces}
          isDark={isDark}
          accentColor={ACCENT}
        />
      ) : null}

      <Animated.View
        entering={FadeInDown.delay(140).duration(360)}
        style={[
          styles.reportToolbar,
          isCompact && styles.reportToolbarCompact,
          {
            backgroundColor: isDark ? '#18212F' : '#FFFFFF',
            borderColor: isDark ? 'rgba(255,255,255,0.09)' : '#D9E2EC',
          },
        ]}
      >
        <View style={styles.reportToolbarCopy}>
          <Text style={[styles.reportToolbarTitle, { color: isDark ? '#F8FAFC' : '#0F172A', fontFamily: FONT }]}>
            Report actions
          </Text>
          <Text style={[styles.reportToolbarHint, { color: isDark ? '#94A3B8' : '#64748B', fontFamily: FONT }]}>
            {filtersActive ? `Uses ${totals.count} filtered transaction${totals.count === 1 ? '' : 's'}` : 'Uses all transactions shown above'}
          </Text>
        </View>

        <View style={[styles.actionRow, isCompact && styles.actionRowCompact]}>
          <PressableScale
            onPress={handleRefresh}
            disabled={refreshing || loading}
            accessibilityLabel="Refresh today's collection"
            containerStyle={[styles.actionBtnSlot, isCompact && styles.actionBtnSlotCompact]}
            style={[
              styles.actionBtn,
              styles.refreshBtn,
              {
                backgroundColor: isDark ? '#111827' : '#F8FAFC',
                borderColor: isDark ? '#334155' : '#CBD5E1',
              },
            ]}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={isDark ? '#CBD5E1' : '#475569'} />
            ) : (
              <Ionicons name="refresh" size={18} color={isDark ? '#CBD5E1' : '#475569'} />
            )}
            <Text style={[styles.refreshBtnText, { color: isDark ? '#E2E8F0' : '#334155', fontFamily: FONT }]}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Text>
          </PressableScale>

          <PressableScale
            onPress={handleExport}
            disabled={exporting || loading || !reportColumnsHydrated}
            accessibilityLabel="Export current collection as CSV"
            containerStyle={[styles.actionBtnSlot, isCompact && styles.actionBtnSlotCompact]}
            style={[
              styles.actionBtn,
              styles.exportBtn,
              {
                backgroundColor: isDark ? 'rgba(13,148,136,0.12)' : '#F0FDFA',
                borderColor: isDark ? '#2DD4BF' : ACCENT_DEEP,
              },
            ]}
          >
            {exporting ? (
              <ActivityIndicator size="small" color={isDark ? '#5EEAD4' : ACCENT_DEEP} />
            ) : (
              <Ionicons name="download-outline" size={18} color={isDark ? '#5EEAD4' : ACCENT_DEEP} />
            )}
            <Text style={[styles.actionBtnTextSecondary, { color: isDark ? '#5EEAD4' : ACCENT_DEEP, fontFamily: FONT }]}>
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Text>
          </PressableScale>

          <PressableScale
            onPress={handlePrint}
            disabled={printing || loading || !reportColumnsHydrated || !denominationsHydrated}
            accessibilityLabel="Print current collection report"
            containerStyle={[styles.actionBtnSlot, styles.primaryActionSlot, isCompact && styles.actionBtnSlotCompact]}
            style={[
              styles.actionBtn,
              styles.printBtn,
              {
                backgroundColor: ACCENT_DEEP,
                borderColor: isDark ? '#5EEAD4' : ACCENT_DEEP,
                ...clay(isDark, 'sm'),
                overflow: 'hidden',
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.7, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {printing ? (
              <ActivityIndicator size="small" color="#fff" style={{ zIndex: 2 }} />
            ) : (
              <Ionicons name="print-outline" size={18} color="#fff" style={{ zIndex: 2 }} />
            )}
            <Text style={[styles.actionBtnText, { fontFamily: FONT, zIndex: 2 }]}>
              {printing ? 'Preparing…' : 'Print report'}
            </Text>
          </PressableScale>
        </View>
      </Animated.View>

      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: isDark ? '#F8FAFC' : '#0F172A', fontFamily: FONT }]}>
          Transactions
        </Text>
        <View style={[styles.countPill, { backgroundColor: isDark ? 'rgba(13,148,136,0.18)' : ACCENT_SOFT }]}>
          <Text style={[styles.countPillText, { color: ACCENT_DEEP, fontFamily: FONT }]}>
            {totals.count}
            {allRows.length !== totals.count ? ` / ${allRows.length}` : ''}
          </Text>
        </View>
      </View>
    </View>
  );

  const EmptyState = (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyWrap}>
      <View
        style={[
          styles.emptyGlow,
          clayCard(isDark, 'lg'),
          { backgroundColor: isDark ? '#1A2332' : '#F4F7FB', borderWidth: 0 },
        ]}
      >
        <View style={[styles.emptyIconRing, { backgroundColor: isDark ? 'rgba(13,148,136,0.15)' : ACCENT_SOFT }]}>
          <MaterialCommunityIcons
            name={filtersActive ? 'filter-off-outline' : 'wallet-outline'}
            size={32}
            color={ACCENT}
          />
        </View>
        <Text style={[styles.emptyTitle, { color: isDark ? '#F8FAFC' : '#0F172A', fontFamily: FONT }]}>
          {filtersActive ? 'Nothing matches' : 'Quiet day so far'}
        </Text>
        <Text style={[styles.emptySub, { color: isDark ? 'rgba(255,255,255,0.45)' : '#64748B', fontFamily: FONT }]}>
          {filtersActive
            ? 'Try clearing filters or pick a different payment mode / fee type.'
            : 'Payments you collect today will land here for a clean end-of-day audit.'}
        </Text>
        {filtersActive ? (
          <PressableScale onPress={clearFilters} style={[styles.emptyCta, { backgroundColor: ACCENT }]}>
            <Text style={[styles.emptyCtaText, { fontFamily: FONT }]}>Clear filters</Text>
          </PressableScale>
        ) : null}
      </View>
    </Animated.View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {!shellActive && (
          <AdminHeader title="Today's Collection" showBackButton />
        )}
        <LogoLoader />
      </View>
    );
  }

  return (
    <TourTarget id="screen.accounts-fees-today-collection.overview" native><View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      {!shellActive && <AdminHeader title="Today's Collection" showBackButton />}

      <TourTarget id="screen.accounts-fees-today-collection.workspace" native><FlatList
        data={filteredRows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={EmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={ACCENT}
            colors={[ACCENT]}
          />
        }
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
      /></TourTarget>
    </View></TourTarget>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 22,
    marginBottom: 12,
    overflow: 'hidden',
  },
  accent: { width: 4, alignSelf: 'stretch', borderRadius: 4, marginVertical: 14, marginLeft: 10 },
  inner: { flex: 1, padding: 14, paddingLeft: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '800' },
  titleBlock: { flex: 1, minWidth: 0 },
  student: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  father: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  amountBlock: { alignItems: 'flex-end' },
  amount: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  timeHint: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, maxWidth: '100%' },
  chipText: { fontSize: 11, fontWeight: '700' },
  detailRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailCell: { minWidth: 72 },
  detailLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  detailValue: { fontSize: 12, fontWeight: '600' },
});

const sumStyles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 22,
    padding: 16,
    minHeight: 118,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  statValueMoney: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  modeChip: {
    minWidth: '30%',
    flexGrow: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  modeLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  modeValue: { fontSize: 14, fontWeight: '800', marginTop: 3, letterSpacing: -0.2 },
  modeCount: { fontSize: 10, fontWeight: '600', marginTop: 2 },
});

const filterStyles = StyleSheet.create({
  wrap: { marginBottom: 14, gap: 10 },
  searchOuter: {
    borderRadius: 18,
    padding: 5,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    height: 44,
    paddingVertical: 0,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 48,
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filterIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: { fontSize: 13, fontWeight: '700' },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  toggleRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  clearText: { fontSize: 11, fontWeight: '800', color: ACCENT_DEEP },
  panel: {
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2, textTransform: 'uppercase' },
  chipRow: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 14,
    minHeight: 36,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  chipBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  chipBadgeText: { fontSize: 10, fontWeight: '800' },
});

const getStyles = (theme: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 48,
      paddingTop: 14,
      width: '100%',
      maxWidth: 1280,
      alignSelf: 'center',
    },
    hero: {
      marginBottom: 16,
      paddingTop: 2,
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    heroCopy: { flex: 1, minWidth: 0 },
    heroEyebrow: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    heroTitle: {
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: -0.7,
    },
    datePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 14,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    datePillText: {
      fontSize: 12,
      fontWeight: '700',
    },
    heroMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 12,
    },
    collectorChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      maxWidth: '70%',
    },
    collectorText: {
      fontSize: 12,
      fontWeight: '700',
    },
    scopeNote: {
      fontSize: 12,
      fontWeight: '500',
    },
    reportToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 20,
      borderWidth: 1,
      borderRadius: 20,
      padding: 14,
      marginBottom: 18,
      ...Platform.select({
        web: {
          boxShadow: isDark
            ? '0 12px 28px -20px rgba(0,0,0,0.75)'
            : '0 12px 28px -20px rgba(15,23,42,0.32)',
        },
        default: {
          elevation: 2,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: isDark ? 0.28 : 0.1,
          shadowRadius: 12,
        },
      }),
    },
    reportToolbarCompact: {
      alignItems: 'stretch',
      flexDirection: 'column',
      gap: 12,
    },
    reportToolbarCopy: {
      flexShrink: 1,
      minWidth: 150,
    },
    reportToolbarTitle: {
      fontSize: 14,
      fontWeight: '800',
      marginBottom: 3,
    },
    reportToolbarHint: {
      fontSize: 11,
      fontWeight: '500',
    },
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
    },
    actionRowCompact: {
      flexDirection: 'column',
      width: '100%',
    },
    actionBtnSlot: {
      width: 144,
    },
    primaryActionSlot: {
      width: 164,
    },
    actionBtnSlotCompact: {
      width: '100%',
    },
    actionBtn: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 48,
      paddingHorizontal: 16,
      borderRadius: 14,
      borderWidth: 1.5,
    },
    refreshBtn: {},
    exportBtn: {},
    printBtn: { minWidth: 164 },
    actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    actionBtnTextSecondary: { fontSize: 14, fontWeight: '800' },
    refreshBtnText: { fontSize: 13, fontWeight: '800' },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    countPill: {
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 999,
    },
    countPillText: {
      fontSize: 12,
      fontWeight: '800',
    },
    emptyWrap: {
      alignItems: 'center',
      paddingVertical: 28,
      paddingHorizontal: 8,
    },
    emptyGlow: {
      width: '100%',
      alignItems: 'center',
      paddingVertical: 36,
      paddingHorizontal: 28,
      borderRadius: 28,
    },
    emptyIconRing: {
      width: 72,
      height: 72,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8, letterSpacing: -0.3 },
    emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 21, maxWidth: 300 },
    emptyCta: {
      marginTop: 18,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 14,
      minHeight: 44,
      justifyContent: 'center',
    },
    emptyCtaText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  });
