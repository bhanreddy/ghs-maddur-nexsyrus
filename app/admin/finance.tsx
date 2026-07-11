import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, useWindowDimensions, Platform } from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import AdminHeader from '../../src/components/AdminHeader';
import Animated, { FadeInUp, useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FeeService } from '../../src/services/feeService';
import { useAuth } from '../../src/hooks/useAuth';
import LogoLoader from '../../src/components/LogoLoader';
import { printCollectionReport, exportCollectionCsv } from '../../src/utils/collectionReport';
import PremiumDatePickerModal from '../../src/components/PremiumDatePickerModal';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const AVATAR_COLORS = ['#7C3AED', '#2563EB', '#059669', '#DB2777', '#D97706', '#0891B2', '#DC2626', '#4F46E5'];
const initialsFor = (name: string) =>
  (name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const colorFor = (name: string) => {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

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
  const { authChecked } = useAuth();
  const { width } = useWindowDimensions();
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
        style={styles.fab}
        onPress={() => {
          if (!transactions || transactions.length === 0) {
            alertCompat('No Transactions', 'There are no transactions to export for this date.');
            return;
          }
          const meta = {
            schoolName: 'Samskruthe School',
            accountantName: 'Admin',
            dateLabel: selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            dateIso: selectedDate.getFullYear() + '-' + String(selectedDate.getMonth() + 1).padStart(2, '0') + '-' + String(selectedDate.getDate()).padStart(2, '0')
          };
          alertCompat('Export Collection', 'How would you like to export this collection?', [
            {
              text: 'Print PDF',
              onPress: async () => {
                try {
                  await printCollectionReport(transactions, meta);
                } catch (e) {
                  alertCompat('Error', 'Failed to generate PDF.');
                }
              }
            },
            {
              text: 'Export CSV',
              onPress: async () => {
                try {
                  await exportCollectionCsv(transactions, meta);
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
  }
});