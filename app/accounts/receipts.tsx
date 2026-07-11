
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import { styles as ds } from '@/src/theme/styles';

import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ScrollView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../src/components/AdminHeader';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { FeeCollector, FeeService } from '../../src/services/feeService';
import { generateReceiptPDF } from '../../src/utils/pdfGenerator';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuth } from '../../src/hooks/useAuth';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);

const monthStart = () => {
  const now = new Date();
  return toDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
};

const todayInput = () => toDateInput(new Date());

const isAdminRole = (role?: string | null) => role === 'admin' || role === 'principal';

/** Map API fee_type label to Receipts filter chip (fee_types are school-defined names). */
function feeTypeToFilterCategory(feeType: string | undefined): 'Fees' | 'Uniform' | 'Transport' | 'Other' {
  const n = (feeType || '').toLowerCase().trim();
  if (!n) return 'Other';
  if (/\buniform\b|dress|apparel/.test(n)) return 'Uniform';
  if (/transport|conveyance|\bbus\b|\bvan\b/.test(n)) return 'Transport';
  if (
    /tuition|academic|examination|exam\b|admission|lab fee|library|development|activity|hostel|sports|magazine|stationery|calendar|computer|smart/.test(
      n
    )
  )
    return 'Fees';
  if (/\bfee\b/.test(n)) return 'Fees';
  return 'Other';
}

export default function ReceiptsScreen() {
  const { theme, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { shellActive } = useAccountsWebChrome();
  const { user, role } = useAuth();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectors, setCollectors] = useState<FeeCollector[]>([]);
  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate, setToDate] = useState(todayInput());
  const [selectedCollectorId, setSelectedCollectorId] = useState<string | null>(null);
  const [collectionTotal, setCollectionTotal] = useState<number | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const filters = ['All', 'Fees', 'Uniform', 'Transport', 'Other'];
  const canPickCollector = isAdminRole(role);
  const currentUserId = user?.userId || user?.id || null;

  useEffect(() => {
    FeeService.getCollectors()
      .then(setCollectors)
      .catch(() => setCollectors([]));
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    if (!canPickCollector) {
      setSelectedCollectorId(currentUserId);
    }
  }, [canPickCollector, currentUserId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const receivedBy = selectedCollectorId || (canPickCollector ? undefined : currentUserId || undefined);
      const [txData, summaryData] = await Promise.all([
        FeeService.getTransactions({
          from_date: fromDate,
          to_date: `${toDate}T23:59:59`,
          received_by: receivedBy,
          limit: 200,
        }),
        FeeService.getCollectionSummary({
          from_date: fromDate,
          to_date: `${toDate}T23:59:59`,
          received_by: receivedBy,
        }),
      ]);

      const rows = Array.isArray(txData) ? txData : (txData as any)?.data ?? [];
      const formatted = rows.map((tx: any) => ({
        id: tx.id,
        student: tx.student_name,
        admission_no: tx.admission_no,
        amount: `₹${Number(tx.amount || 0).toLocaleString('en-IN')}`,
        date: new Date(tx.paid_at).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short'
        }),
        type: tx.payment_method,
        classLabel: [tx.class_name, tx.section_name].filter(Boolean).join(' — ') || '—',
        feeType: tx.fee_type,
        collector: tx.received_by || '—',
        raw: tx
      }));
      setReceipts(formatted);
      setCollectionTotal(Number(summaryData?.total_collected ?? 0));
    } catch (error) {

    } finally {
      setLoading(false);
    }
  }, [canPickCollector, currentUserId, fromDate, selectedCollectorId, toDate]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadData();
  }, [loadData, user]);

  const filteredReceipts = useMemo(() => {
    let list = receipts;
    if (selectedFilter !== 'All') {
      list = list.filter((r) => feeTypeToFilterCategory(r.raw?.fee_type) === selectedFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const name = (r.student || '').toLowerCase();
        const adm = String(r.admission_no ?? '').toLowerCase();
        const ref = String(r.raw?.transaction_ref ?? '').toLowerCase();
        const id = String(r.id ?? '').toLowerCase();
        return name.includes(q) || adm.includes(q) || ref.includes(q) || id.includes(q);
      });
    }
    return list;
  }, [receipts, selectedFilter, searchQuery]);

  const handlePrint = async (transaction: any) => {
    try {
      // Ensure academic_year is passed even if nested or named slightly differently
      const receiptData = {
        ...transaction,
        academic_year: transaction.academic_year || (transaction as any).academicYear
      };
      await generateReceiptPDF(receiptData);
    } catch (error) {
      alertCompat('Error', 'Failed to generate receipt PDF');
    }
  };

  const renderReceiptItem = ({
    item,
    index
  }: { item: any; index: number; }) => {
    return <Animated.View entering={FadeInDown.delay(index * 60).duration(450)} style={styles.receiptCard}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: 20, overflow: 'hidden' }]}>
        <LinearGradient
          colors={isDark ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      <View style={[styles.receiptLeft, {
        flex: 1,
        zIndex: 2
      }]}>
        <View style={[styles.iconBox, {
          backgroundColor: isDark ? '#0A0B12' : '#E2E8F0'
        }]}>
          <Ionicons name="receipt" size={20} color={isDark ? 'rgba(255,255,255,0.6)' : '#4B5563'} />
        </View>
        <View style={{
          flex: 1
        }}>
          <Text style={styles.studentName} numberOfLines={1}>{item.student}</Text>
          <Text style={styles.receiptDetails}>{item.admission_no} • {item.classLabel}</Text>
          <Text style={styles.collectorText}>Collected by {item.collector}</Text>
        </View>
      </View>
      <View style={[styles.receiptRight, {
        flexShrink: 0,
        marginLeft: 10,
        zIndex: 2
      }]}>
        <Text style={styles.amount}>{item.amount}</Text>
        <Text style={styles.date}>{item.date}</Text>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 12,
          marginTop: 6
        }}>
          <View style={[
            styles.typeBadge,
            {
              backgroundColor: isDark ? '#0A0B12' : '#E2E8F0',
              borderWidth: 0,
              borderTopWidth: 1.2,
              borderTopColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.08)',
              borderBottomWidth: 1,
              borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
            }
          ]}>
            <Text style={{
              fontSize: 9,
              fontWeight: '800',
              color: isDark ? 'rgba(255,255,255,0.65)' : '#4B5563',
              textTransform: 'uppercase',
            }}>{item.type}</Text>
          </View>
          <TouchableOpacity onPress={() => handlePrint(item.raw)} hitSlop={6}>
            <Ionicons name="print-outline" size={18} color={isDark ? 'rgba(255,255,255,0.6)' : '#4B5563'} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>;
  };

  return <View style={styles.container}>
    <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#0F1117' : '#FFFFFF'} />
    {!shellActive && <AdminHeader title="Receipts" showBackButton={true} />}
    <View style={styles.content}>
      <Pressable
        style={[
          styles.filterToggle,
          {
            backgroundColor: isDark ? '#1F2433' : '#EEF1F8',
            borderWidth: 0,
            borderTopWidth: 1.5,
            borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.85)',
            borderBottomWidth: 3,
            borderBottomColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(76,90,120,0.12)',
            shadowColor: isDark ? '#000' : '#6B7A99',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.2 : 0.06,
            shadowRadius: 8,
            elevation: 2,
            position: 'relative',
          }
        ]}
        onPress={() => setFiltersExpanded((prev) => !prev)}
      >
        <View style={[StyleSheet.absoluteFill, { borderRadius: 12, overflow: 'hidden' }]}>
          <LinearGradient
            colors={isDark ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>
        <View style={[styles.filterToggleLeft, { zIndex: 2 }]}>
          <Ionicons name="calendar-outline" size={16} color={isDark ? 'rgba(255,255,255,0.6)' : '#4B5563'} />
          <Text style={[styles.filterToggleText, { color: isDark ? '#F9FAFB' : '#374151' }]}>
            {fromDate} → {toDate}
            {selectedCollectorId
              ? ` · ${collectors.find((c) => c.id === selectedCollectorId)?.name || 'Accountant'}`
              : canPickCollector ? ' · All accountants' : ''}
          </Text>
        </View>
        <Ionicons name={filtersExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={isDark ? 'rgba(255,255,255,0.4)' : '#6B7280'} style={{ zIndex: 2 }} />
      </Pressable>

      {filtersExpanded ? (
        <Animated.View
          entering={FadeIn.duration(250)}
          style={[
            styles.filterPanel,
            {
              backgroundColor: isDark ? '#1C2030' : '#FFFFFF',
              borderWidth: 0,
              borderTopWidth: 1.5,
              borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.85)',
              borderBottomWidth: 3.5,
              borderBottomColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(76,90,120,0.06)',
              shadowColor: isDark ? '#000' : '#6B7A99',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: isDark ? 0.22 : 0.08,
              shadowRadius: 10,
              elevation: 3,
              position: 'relative',
            }
          ]}
        >
          <View style={[StyleSheet.absoluteFill, { borderRadius: 14, overflow: 'hidden' }]}>
            <LinearGradient
              colors={isDark ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </View>

          <View style={[styles.dateRow, { zIndex: 2 }]}>
            <View style={styles.dateCell}>
              <Text style={[styles.filterLabel, { color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }]}>FROM</Text>
              <View style={styles.inputFrame}>
                <View style={[StyleSheet.absoluteFill, { borderRadius: 14, overflow: 'hidden' }]}>
                  <LinearGradient
                    colors={isDark ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                </View>
                <AppTextInput
                  style={[
                    ds.inputInChrome, 
                    styles.dateInput, 
                    { 
                      backgroundColor: isDark ? '#0A0B12' : '#D5E0ED', 
                      color: isDark ? '#F9FAFB' : '#111827', 
                      borderWidth: 0,
                      borderTopWidth: 1.5,
                      borderTopColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)',
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
                      borderRadius: 10,
                      height: 38,
                      zIndex: 2,
                    }
                  ]}
                  value={fromDate}
                  onChangeText={setFromDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.25)' : '#9CA3AF'}
                />
              </View>
            </View>
            <View style={styles.dateCell}>
              <Text style={[styles.filterLabel, { color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }]}>TO</Text>
              <View style={styles.inputFrame}>
                <View style={[StyleSheet.absoluteFill, { borderRadius: 14, overflow: 'hidden' }]}>
                  <LinearGradient
                    colors={isDark ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                </View>
                <AppTextInput
                  style={[
                    ds.inputInChrome, 
                    styles.dateInput, 
                    { 
                      backgroundColor: isDark ? '#0A0B12' : '#D5E0ED', 
                      color: isDark ? '#F9FAFB' : '#111827', 
                      borderWidth: 0,
                      borderTopWidth: 1.5,
                      borderTopColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)',
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
                      borderRadius: 10,
                      height: 38,
                      zIndex: 2,
                    }
                  ]}
                  value={toDate}
                  onChangeText={setToDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.25)' : '#9CA3AF'}
                />
              </View>
            </View>
          </View>

          {canPickCollector ? (
            <View style={{ zIndex: 2 }}>
              <Text style={[styles.filterLabel, { color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }]}>ACCOUNTANT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <TouchableOpacity
                  style={[
                    styles.collectorChip,
                    !selectedCollectorId ? {
                      backgroundColor: '#3B82F6',
                      borderWidth: 0,
                      borderTopWidth: 1.5,
                      borderTopColor: 'rgba(255,255,255,0.45)',
                      borderBottomWidth: 3,
                      borderBottomColor: 'rgba(29,78,216,0.3)',
                      shadowColor: '#3B82F6',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.22,
                      shadowRadius: 6,
                      elevation: 2,
                    } : {
                      backgroundColor: isDark ? '#0A0B12' : '#E2E8F0',
                      borderWidth: 0,
                      borderTopWidth: 1.2,
                      borderTopColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.08)',
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
                    }
                  ]}
                  onPress={() => setSelectedCollectorId(null)}
                >
                  {!selectedCollectorId && (
                    <View style={[StyleSheet.absoluteFill, { borderRadius: 18, overflow: 'hidden' }]}>
                      <LinearGradient
                        colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
                        start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                      />
                    </View>
                  )}
                  <Text style={[
                    styles.collectorChipText,
                    !selectedCollectorId ? { color: '#FFFFFF', zIndex: 2 } : { color: isDark ? 'rgba(255,255,255,0.6)' : '#4B5563' }
                  ]}>All</Text>
                </TouchableOpacity>
                {collectors.map((collector) => {
                  const active = selectedCollectorId === collector.id;
                  return (
                    <TouchableOpacity
                      key={collector.id}
                      style={[
                        styles.collectorChip,
                        active ? {
                          backgroundColor: '#3B82F6',
                          borderWidth: 0,
                          borderTopWidth: 1.5,
                          borderTopColor: 'rgba(255,255,255,0.45)',
                          borderBottomWidth: 3,
                          borderBottomColor: 'rgba(29,78,216,0.3)',
                          shadowColor: '#3B82F6',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.22,
                          shadowRadius: 6,
                          elevation: 2,
                        } : {
                          backgroundColor: isDark ? '#0A0B12' : '#E2E8F0',
                          borderWidth: 0,
                          borderTopWidth: 1.2,
                          borderTopColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.08)',
                          borderBottomWidth: 1,
                          borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
                        }
                      ]}
                      onPress={() => setSelectedCollectorId(active ? null : collector.id)}
                    >
                      {active && (
                        <View style={[StyleSheet.absoluteFill, { borderRadius: 18, overflow: 'hidden' }]}>
                          <LinearGradient
                            colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
                            start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
                            style={StyleSheet.absoluteFill}
                            pointerEvents="none"
                          />
                        </View>
                      )}
                      <Text style={[
                        styles.collectorChipText,
                        active ? { color: '#FFFFFF', zIndex: 2 } : { color: isDark ? 'rgba(255,255,255,0.6)' : '#4B5563' }
                      ]}>{collector.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : (
            <Text style={[styles.selfCollectorNote, { zIndex: 2, color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }]}>
              Showing collections recorded by you
            </Text>
          )}
        </Animated.View>
      ) : null}

      {collectionTotal !== null ? (
        <View
          style={[
            styles.totalBanner,
            {
              backgroundColor: isDark ? '#1D2433' : '#10B981',
              borderWidth: 0,
              borderTopWidth: 1.5,
              borderTopColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.45)',
              borderBottomWidth: 3.5,
              borderBottomColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(4,120,87,0.3)',
              shadowColor: isDark ? '#000' : '#10B981',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: isDark ? 0.35 : 0.25,
              shadowRadius: 16,
              elevation: 4,
              position: 'relative',
              overflow: 'visible',
            }
          ]}
        >
          <View style={[StyleSheet.absoluteFill, { borderRadius: 14, overflow: 'hidden' }]}>
            <LinearGradient
              colors={isDark ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.4)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </View>
          <Text style={[styles.totalLabel, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.85)', zIndex: 2 }]}>Collected in range</Text>
          <Text style={[styles.totalValue, { color: '#FFFFFF', zIndex: 2 }]}>₹{collectionTotal.toLocaleString('en-IN')}</Text>
        </View>
      ) : null}

      {/* Search Bar */}
      <View
        style={[
          styles.searchContainerFrame,
          searchFocused && styles.searchContainerFrameFocused
        ]}
      >
        <View style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}>
          <LinearGradient
            colors={isDark ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        <View style={[styles.searchRecessedWell, searchFocused && styles.searchRecessedWellFocused]}>
          <Ionicons
            name="search"
            size={20}
            color={searchFocused ? '#3B82F6' : (isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF')}
            style={styles.searchIcon}
          />
          <AppTextInput
            style={[ds.inputInChrome, styles.searchInput, { zIndex: 2 }]}
            placeholder="Search by transaction ID or Name"
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.25)' : '#9CA3AF'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
          {filters.map((filter, index) => {
            const active = selectedFilter === filter;
            return (
              <TouchableOpacity
                key={index}
                onPress={() => setSelectedFilter(filter)}
                style={[
                  styles.filterChip,
                  active ? {
                    backgroundColor: '#3B82F6',
                    borderWidth: 0,
                    borderTopWidth: 1.5,
                    borderTopColor: 'rgba(255,255,255,0.45)',
                    borderBottomWidth: 3,
                    borderBottomColor: 'rgba(29,78,216,0.3)',
                    shadowColor: '#3B82F6',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.22,
                    shadowRadius: 6,
                    elevation: 2,
                    position: 'relative',
                    overflow: 'hidden',
                  } : {
                    backgroundColor: isDark ? '#0A0B12' : '#E2E8F0',
                    borderWidth: 0,
                    borderTopWidth: 1.2,
                    borderTopColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.08)',
                    borderBottomWidth: 1,
                    borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
                  }
                ]}
              >
                {active && (
                  <View style={[StyleSheet.absoluteFill, { borderRadius: 20, overflow: 'hidden' }]}>
                    <LinearGradient
                      colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
                      start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                  </View>
                )}
                <Text
                  style={[
                    styles.filterText,
                    active ? { color: '#FFFFFF', zIndex: 2 } : { color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }
                  ]}
                >
                  {filter}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <LogoLoader size={60} color="#6B7280" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={filteredReceipts}
          renderItem={renderReceiptItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: isDark ? 'rgba(255,255,255,0.4)' : '#6B7280' }]}>
              {receipts.length === 0 ? 'No receipts found' : 'No receipts match your filters'}
            </Text>
          }
        />
      )}
    </View>
  </View>;
}
const getStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? '#0F1117' : '#F8FAFC'
  },
  content: {
    flex: 1,
    paddingHorizontal: 20
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  filterToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 8 },
  filterToggleText: { fontSize: 13, fontWeight: '700' },
  filterPanel: {
    marginTop: 8,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateCell: { flex: 1 },
  inputFrame: {
    borderRadius: 14,
    padding: 4,
    position: 'relative',
  },
  dateInput: {
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  chipRow: { gap: 8, paddingVertical: 4 },
  collectorChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  collectorChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  selfCollectorNote: {
    fontSize: 12,
    fontWeight: '600',
  },
  totalBanner: {
    marginTop: 14,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  searchContainerFrame: {
    backgroundColor: isDark ? '#2A3142' : '#EEF1F8',
    borderRadius: 24,
    marginTop: 20,
    borderTopWidth: 1.5,
    borderTopColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.9)',
    borderBottomWidth: 3,
    borderBottomColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(76,90,120,0.18)',
    shadowColor: isDark ? '#000' : '#6B7A99',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.25 : 0.15,
    shadowRadius: 12,
    elevation: 3,
    padding: 4,
    position: 'relative',
  },
  searchContainerFrameFocused: {
    backgroundColor: isDark ? '#2D3547' : '#EAF2FF',
  },
  searchRecessedWell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#0A0B12' : '#D5E0ED',
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 20,
    borderWidth: 0,
    borderTopWidth: 1.5,
    borderTopColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
    zIndex: 2,
  },
  searchRecessedWellFocused: {
    backgroundColor: isDark ? '#08090E' : '#FFFFFF',
  },
  searchIcon: {
    marginRight: 10
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: isDark ? '#F9FAFB' : '#111827',
  },
  filterContainer: {
    marginTop: 15,
    marginBottom: 10
  },
  filterChip: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '700'
  },
  receiptCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: isDark ? '#1C1F2A' : '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginTop: 14,
    borderWidth: 0,
    borderTopWidth: 1.5,
    borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)',
    borderBottomWidth: 3.5,
    borderBottomColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(76,90,120,0.06)',
    shadowColor: isDark ? '#000' : '#6B7A99',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.22 : 0.08,
    shadowRadius: 10,
    elevation: 3,
    position: 'relative',
  },
  receiptLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  studentName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: isDark ? '#F9FAFB' : '#111827'
  },
  receiptDetails: {
    fontSize: 12,
    color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280',
    marginTop: 2
  },
  collectorText: {
    fontSize: 11,
    color: isDark ? 'rgba(255,255,255,0.4)' : '#8B94A0',
    marginTop: 2,
    fontWeight: '600',
  },
  receiptRight: {
    alignItems: 'flex-end'
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: isDark ? '#F9FAFB' : '#111827'
  },
  date: {
    fontSize: 11,
    color: isDark ? 'rgba(255,255,255,0.4)' : '#8B94A0',
    marginTop: 2
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
    fontWeight: '600',
  },
});