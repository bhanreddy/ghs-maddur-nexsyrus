import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import { styles as ds } from '@/src/theme/styles';

import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, Modal, Platform, ScrollView, Pressable, useWindowDimensions,
} from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import AdminHeader from '../../src/components/AdminHeader';
import Animated, {
  FadeInDown, FadeInUp, ZoomIn, FadeIn,
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useExpenses } from '../../src/hooks/useExpenses';
import { CreateExpenseRequest, Expense } from '../../src/types/expenses';
import { PolicyService } from '../../src/services/policyService';
import { AcademicYear, AcademicYearService } from '../../src/services/academicYearService';
import NetBalanceTab from '../../src/components/NetBalanceTab';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
import ExpenseDateFilterBar from '../../src/components/expenses/ExpenseDateFilterBar';
import BulkExpenseSheet from '../../src/components/expenses/BulkExpenseSheet';
import {
  EXPENSE_CATEGORIES,
  formatDateShort,
  monthStartInput,
  todayDateInput,
} from '../../src/components/expenses/expenseConstants';

const CATEGORIES = [...EXPENSE_CATEGORIES];

const CATEGORY_META: Record<string, { icon: string; color: string; bg: string; grad: [string, string] }> = {
  Stationery: { icon: 'pencil-alt', color: '#4F46E5', bg: '#EEF2FF', grad: ['#4338CA', '#6366F1'] },
  'Office Expenses': { icon: 'briefcase', color: '#0F766E', bg: '#CCFBF1', grad: ['#0F766E', '#14B8A6'] },
  Cameras: { icon: 'video', color: '#7C3AED', bg: '#F3E8FF', grad: ['#6D28D9', '#A855F7'] },
  Savings: { icon: 'piggy-bank', color: '#059669', bg: '#D1FAE5', grad: ['#047857', '#10B981'] },
  'Agent Commission': { icon: 'handshake', color: '#EA580C', bg: '#FFEDD5', grad: ['#C2410C', '#F97316'] },
  Donations: { icon: 'hand-holding-heart', color: '#DB2777', bg: '#FCE7F3', grad: ['#BE185D', '#EC4899'] },
  'Labour Charges': { icon: 'hard-hat', color: '#B45309', bg: '#FEF3C7', grad: ['#92400E', '#D97706'] },
  Construction: { icon: 'building', color: '#475569', bg: '#F1F5F9', grad: ['#334155', '#64748B'] },
  'Electricity Bill': { icon: 'bolt', color: '#CA8A04', bg: '#FEF9C3', grad: ['#A16207', '#EAB308'] },
  'Tea & Refreshments': { icon: 'coffee', color: '#A16207', bg: '#FEF3C7', grad: ['#854D0E', '#CA8A04'] },
  'Water Bill': { icon: 'tint', color: '#0284C7', bg: '#E0F2FE', grad: ['#0369A1', '#0EA5E9'] },
  'Transport & Fuel': { icon: 'bus', color: '#0891B2', bg: '#CFFAFE', grad: ['#0E7490', '#06B6D4'] },
  Education: { icon: 'graduation-cap', color: '#4F46E5', bg: '#EEF2FF', grad: ['#4338CA', '#6366F1'] },
  Maintenance: { icon: 'tools', color: '#D97706', bg: '#FEF3C7', grad: ['#B45309', '#F59E0B'] },
  'Internet & Phone': { icon: 'wifi', color: '#2563EB', bg: '#DBEAFE', grad: ['#1D4ED8', '#3B82F6'] },
  'Printing & Exams': { icon: 'print', color: '#9333EA', bg: '#F3E8FF', grad: ['#7E22CE', '#A855F7'] },
  Security: { icon: 'shield-alt', color: '#DC2626', bg: '#FEE2E2', grad: ['#B91C1C', '#EF4444'] },
  Sports: { icon: 'running', color: '#059669', bg: '#D1FAE5', grad: ['#047857', '#10B981'] },
  Utility: { icon: 'bolt', color: '#2563EB', bg: '#DBEAFE', grad: ['#1D4ED8', '#3B82F6'] },
  Events: { icon: 'calendar-alt', color: '#DB2777', bg: '#FCE7F3', grad: ['#BE185D', '#EC4899'] },
  Salary: { icon: 'wallet', color: '#7C3AED', bg: '#EDE9FE', grad: ['#6D28D9', '#8B5CF6'] },
  Other: { icon: 'ellipsis-h', color: '#64748B', bg: '#F1F5F9', grad: ['#475569', '#94A3B8'] },
};

const QUICK_EXPENSE_CATEGORIES = [
  { category: 'Stationery', label: 'Stationery', hint: 'Books, pens & supplies' },
  { category: 'Office Expenses', label: 'Office expenses', hint: 'Daily administration' },
  { category: 'Cameras', label: 'Cameras & CCTV', hint: 'Devices & installation' },
  { category: 'Savings', label: 'Savings', hint: 'Reserve allocations' },
  { category: 'Agent Commission', label: 'Agent commission', hint: 'Referral commissions' },
  { category: 'Donations', label: 'Donations', hint: 'Charitable support' },
  { category: 'Labour Charges', label: 'Labour charges', hint: 'Daily & contract labour' },
  { category: 'Construction', label: 'Construction', hint: 'Campus development' },
  { category: 'Electricity Bill', label: 'Electricity bill', hint: 'Power charges' },
  { category: 'Tea & Refreshments', label: 'Chai & refreshments', hint: 'Tea, snacks & pantry' },
  { category: 'Water Bill', label: 'Water bill', hint: 'Water charges' },
  { category: 'Transport & Fuel', label: 'Transport & fuel', hint: 'Vehicles and travel' },
  { category: 'Maintenance', label: 'Repairs & maintenance', hint: 'Upkeep and servicing' },
  { category: 'Internet & Phone', label: 'Internet & phone', hint: 'Connectivity bills' },
  { category: 'Printing & Exams', label: 'Printing & exams', hint: 'Paper and assessments' },
  { category: 'Security', label: 'Security', hint: 'Guards and safety' },
  { category: 'Salary', label: 'Salaries', hint: 'Staff payments' },
  { category: 'Other', label: 'Other expenses', hint: 'Any name not listed' },
] as const;

const STATUS_META = {
  approved: { bg: '#ECFDF5', text: '#065F46', dot: '#10B981', border: '#A7F3D0', label: 'Approved' },
  paid: { bg: '#EFF6FF', text: '#1E40AF', dot: '#3B82F6', border: '#BFDBFE', label: 'Paid' },
  pending: { bg: '#FFFBEB', text: '#92400E', dot: '#F59E0B', border: '#FDE68A', label: 'Pending' },
};

const fmtINR = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const defaultAcademicYearRange = () => {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    fromDate: `${startYear}-04-01`,
    toDate: `${startYear + 1}-03-31`,
  };
};

export default function AdminExpenses() {
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { expenses, loading, fetchExpenses, createExpense, createBulkExpenses, updateStatus } = useExpenses();
  const {
    expenses: academicYearExpenses,
    loading: academicSummaryLoading,
    fetchExpenses: fetchAcademicYearExpenses,
  } = useExpenses();
  const [academicYear, setAcademicYear] = useState<AcademicYear | null>(null);
  const [academicYearRange, setAcademicYearRange] = useState(defaultAcademicYearRange);
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState(monthStartInput);
  const [toDate, setToDate] = useState(todayDateInput);
  const [activeTab, setActiveTab] = useState<'list' | 'balance'>('list');

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isBulkModalVisible, setIsBulkModalVisible] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<string>(CATEGORIES[0]);
  const [newAmount, setNewAmount] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchFocused, setSearchFocused] = useState(false);

  const fabScale = useSharedValue(1);
  const fabStyle = useAnimatedStyle(() => ({ transform: [{ scale: fabScale.value }] }));

  const fetchOptions = useMemo(
    () => ({ fromDate, toDate }),
    [fromDate, toDate]
  );

  useEffect(() => {
    if (activeTab === 'list') fetchExpenses(searchQuery, fetchOptions);
  }, [searchQuery, activeTab, fetchOptions, fetchExpenses]);

  useEffect(() => {
    let active = true;
    const loadAcademicSummary = async () => {
      let range = defaultAcademicYearRange();
      try {
        const year = await AcademicYearService.getCurrentYear();
        if (!active) return;
        setAcademicYear(year);
        range = { fromDate: year.start_date, toDate: year.end_date };
        setAcademicYearRange(range);
      } catch {
        // The April–March fallback keeps the summary useful if no active year is configured.
      }
      if (active) await fetchAcademicYearExpenses('', range);
    };
    loadAcademicSummary();
    return () => { active = false; };
  }, [fetchAcademicYearExpenses]);

  const resetDateFilters = () => {
    setFromDate(monthStartInput());
    setToDate(todayDateInput());
  };

  const resetForm = () => {
    setNewTitle('');
    setNewCategory(CATEGORIES[0]);
    setNewAmount('');
    setNewDescription('');
  };

  const handleAddExpense = async () => {
    if (!newTitle.trim() || !newAmount.trim()) {
      alertCompat('Required', 'Title and amount are required.');
      return;
    }
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) {
      alertCompat('Invalid amount', 'Enter a valid positive number.');
      return;
    }

    setIsSubmitting(true);
    const success = await createExpense({
      title: newTitle.trim(),
      category: newCategory,
      amount,
      expense_date: todayDateInput(),
      description: newDescription.trim() || undefined,
      status: 'paid' as any,
    });
    setIsSubmitting(false);

    if (success) {
      setIsAddModalVisible(false);
      resetForm();
      fetchAcademicYearExpenses('', academicYearRange);
      alertCompat('Success', 'Expense logged successfully');
    }
  };

  const handleBulkExpenses = async (items: CreateExpenseRequest[]) => {
    const result = await createBulkExpenses(items);
    if (result.ok) fetchAcademicYearExpenses('', academicYearRange);
    return result;
  };

  const handleApprove = async (expense: Expense) => {
    alertCompat('Confirm Approve', 'Are you sure you want to approve this expense?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          const s = await updateStatus(expense.id, 'approved');
          if (s) setSelectedExpense(null);
        },
      },
    ]);
  };

  const handlePay = async (expense: Expense) => {
    alertCompat('Confirm Payment', 'Mark this expense as Paid?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Paid',
        onPress: async () => {
          const s = await updateStatus(expense.id, 'paid');
          if (s) setSelectedExpense(null);
        },
      },
    ]);
  };

  const handleDeletePress = () => setIsDeleteModalVisible(true);

  const confirmDelete = async () => {
    if (!selectedExpense) return;
    if (!deleteReason.trim()) {
      alertCompat('Required', 'Please provide a reason for deletion.');
      return;
    }
    setDeleting(true);
    try {
      await PolicyService.deleteWithReason('expenses', selectedExpense.id, deleteReason);
      setIsDeleteModalVisible(false);
      setSelectedExpense(null);
      setDeleteReason('');
      fetchExpenses(searchQuery, fetchOptions);
      fetchAcademicYearExpenses('', academicYearRange);
      alertCompat('Success', 'Expense deleted.');
    } catch {
      alertCompat('Error', 'Failed to delete expense.');
    } finally {
      setDeleting(false);
    }
  };

  const totalPending = expenses.filter((e) => e.status === 'pending').reduce((s, e) => s + e.amount, 0);
  const totalApproved = expenses.filter((e) => e.status === 'approved').reduce((s, e) => s + e.amount, 0);
  const totalPaid = expenses.filter((e) => e.status === 'paid').reduce((s, e) => s + e.amount, 0);
  const totalAll = totalPending + totalApproved + totalPaid;
  const academicYearTotal = academicYearExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const thisMonthStart = monthStartInput();
  const today = todayDateInput();
  const thisMonthExpenses = academicYearExpenses.filter(
    (expense) => expense.expense_date >= thisMonthStart && expense.expense_date <= today
  );
  const thisMonthTotal = thisMonthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const knownQuickCategories = useMemo(
    () => new Set(QUICK_EXPENSE_CATEGORIES.filter((item) => item.category !== 'Other').map((item) => item.category)),
    []
  );
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    academicYearExpenses.forEach((expense) => {
      const category = knownQuickCategories.has(expense.category as any) ? expense.category : 'Other';
      totals[category] = (totals[category] ?? 0) + expense.amount;
    });
    return totals;
  }, [academicYearExpenses, knownQuickCategories]);
  const quickCardWidth = width >= 1450
    ? '15.8%'
    : width >= 1050
      ? '23.8%'
      : width >= 720
        ? '31.5%'
        : '48.2%';

  const renderItem = useCallback(({ item, index }: { item: Expense; index: number }) => {
    const st = STATUS_META[item.status as keyof typeof STATUS_META] ?? STATUS_META.pending;
    const cat = CATEGORY_META[item.category] ?? CATEGORY_META.Other;

    return (
      <Animated.View entering={index < 10 ? FadeInDown.delay(index * 45).duration(320) : undefined}>
        <Pressable
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] }]}
          onPress={() => setSelectedExpense(item)}
        >
          <View style={[styles.cardAccent, { backgroundColor: cat.color }]} />
          <View style={styles.cardBody}>
            <View style={styles.headerRow}>
              <View style={[styles.iconBox, { backgroundColor: cat.bg }]}>
                <FontAwesome5 name={cat.icon as any} size={13} color={cat.color} />
              </View>
              <View style={styles.titleBox}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.date}>
                  {formatDateShort(item.expense_date)} · {item.category}
                </Text>
              </View>
              <Text style={styles.amount}>{fmtINR(item.amount)}</Text>
            </View>

            <View style={styles.cardFooter}>
              {item.description ? (
                <Text style={styles.descText} numberOfLines={1}>{item.description}</Text>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <View style={[styles.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
                <View style={[styles.statusDot, { backgroundColor: st.dot }]} />
                <Text style={[styles.statusText, { color: st.text }]}>{st.label}</Text>
              </View>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  }, [styles]);

  const openAdd = (category?: string, title?: string) => {
    resetForm();
    if (category) {
      setNewCategory(category);
      setNewTitle(category === 'Other' ? '' : (title ?? category));
    }
    setIsAddModalVisible(true);
  };

  return (
    <TourTarget id="screen.admin-expenses.workspace" native><View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
      <TourTarget id="screen.admin-expenses.overview"><AdminHeader title="Expense Tracker" showBackButton={true} /></TourTarget>

      {/* Segmented tabs */}
      <Animated.View entering={FadeInDown.duration(280)} style={styles.tabContainer}>
        {([
          { key: 'list' as const, label: 'Expenses', icon: 'receipt-outline' as const },
          { key: 'balance' as const, label: 'Net Balance', icon: 'stats-chart-outline' as const },
        ]).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.tabBtn, active && styles.activeTabBtn]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Ionicons
                name={tab.icon}
                size={15}
                color={active ? '#fff' : theme.colors.textSecondary}
              />
              <Text style={[styles.tabText, active && styles.activeTabText]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </Animated.View>

      {activeTab === 'list' ? (
        <>
          <FlatList
            data={expenses}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <>
                <Animated.View entering={FadeInDown.delay(40).duration(360)} style={styles.heroWrap}>
                  <LinearGradient
                    colors={isDark ? ['#312E81', '#4C1D95'] : ['#4338CA', '#6D28D9']}
                    style={styles.heroCard}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <View style={styles.heroOrbLarge} />
                    <View style={styles.heroOrbSmall} />
                    <View style={styles.heroTopRow}>
                      <View>
                        <Text style={styles.heroEyebrow}>TOTAL EXPENSES</Text>
                        <Text style={styles.heroTitle}>Academic year spending</Text>
                      </View>
                      <View style={styles.heroYearPill}>
                        <Ionicons name="calendar-outline" size={13} color="#E0E7FF" />
                        <Text style={styles.heroYearText}>{academicYear?.code ?? 'Current year'}</Text>
                      </View>
                    </View>
                    <View style={styles.heroMetrics}>
                      <View style={styles.heroMainMetric}>
                        <Text style={styles.heroAmount}>
                          {academicSummaryLoading && academicYearExpenses.length === 0 ? '₹—' : fmtINR(academicYearTotal)}
                        </Text>
                        <Text style={styles.heroMetricCaption}>
                          {academicYearExpenses.length} {academicYearExpenses.length === 1 ? 'entry' : 'entries'} this academic year
                        </Text>
                      </View>
                      <View style={styles.heroMonthCard}>
                        <View style={styles.heroMonthIcon}>
                          <Ionicons name="trending-up-outline" size={17} color="#fff" />
                        </View>
                        <View>
                          <Text style={styles.heroMonthLabel}>This month</Text>
                          <Text style={styles.heroMonthAmount}>
                            {academicSummaryLoading && academicYearExpenses.length === 0 ? '₹—' : fmtINR(thisMonthTotal)}
                          </Text>
                          <Text style={styles.heroMonthCount}>
                            {thisMonthExpenses.length} {thisMonthExpenses.length === 1 ? 'expense' : 'expenses'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.heroAddButton, pressed && { opacity: 0.88 }]}
                      onPress={() => openAdd()}
                    >
                      <Ionicons name="add-circle" size={19} color="#4338CA" />
                      <Text style={styles.heroAddButtonText}>Add new expense</Text>
                    </Pressable>
                  </LinearGradient>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(90).duration(360)} style={styles.quickSection}>
                  <View style={styles.sectionHeadingRow}>
                    <View>
                      <Text style={styles.sectionEyebrow}>QUICK ENTRY</Text>
                      <Text style={styles.sectionTitle}>Choose an expense type</Text>
                      <Text style={styles.sectionSubtitle}>Tap a card, enter the amount and save.</Text>
                    </View>
                    <Pressable
                      onPress={() => setIsBulkModalVisible(true)}
                      style={({ pressed }) => [styles.bulkEntryButton, pressed && { opacity: 0.8 }]}
                    >
                      <Ionicons name="grid-outline" size={16} color={theme.colors.primary} />
                      <Text style={styles.bulkEntryButtonText}>Bulk entry</Text>
                    </Pressable>
                  </View>

                  <View style={styles.quickGrid}>
                    {QUICK_EXPENSE_CATEGORIES.map((item, index) => {
                      const meta = CATEGORY_META[item.category] ?? CATEGORY_META.Other;
                      const spent = categoryTotals[item.category] ?? 0;
                      return (
                        <Animated.View
                          key={item.category}
                          entering={index < 12 ? FadeInDown.delay(110 + index * 22).duration(300) : undefined}
                          style={{ width: quickCardWidth as any }}
                        >
                          <Pressable
                            onPress={() => openAdd(item.category, item.label)}
                            accessibilityLabel={`Add ${item.label} expense`}
                            style={({ pressed }) => [
                              styles.quickCard,
                              pressed && { opacity: 0.9, transform: [{ translateY: 1 }] },
                            ]}
                          >
                            <View style={styles.quickCardTop}>
                              <View style={[styles.quickIconBox, { backgroundColor: meta.bg }]}>
                                <FontAwesome5 name={meta.icon as any} size={15} color={meta.color} />
                              </View>
                              <View style={[styles.quickAddIcon, { borderColor: `${meta.color}32` }]}>
                                <Ionicons name="add" size={14} color={meta.color} />
                              </View>
                            </View>
                            <Text style={styles.quickCardTitle} numberOfLines={1}>{item.label}</Text>
                            <Text style={styles.quickCardHint} numberOfLines={1}>{item.hint}</Text>
                            <View style={styles.quickCardFooter}>
                              <View>
                                <Text style={styles.quickSpentLabel}>YEAR SPEND</Text>
                                <Text style={[styles.quickSpentAmount, { color: meta.color }]}>{fmtINR(spent)}</Text>
                              </View>
                              <Text style={[styles.quickAddText, { color: meta.color }]}>Add money</Text>
                            </View>
                          </Pressable>
                        </Animated.View>
                      );
                    })}
                  </View>
                </Animated.View>

                <View style={styles.historySection}>
                  <View style={styles.historyHeadingRow}>
                    <View>
                      <Text style={styles.sectionEyebrow}>HISTORY</Text>
                      <Text style={styles.sectionTitle}>Expense transactions</Text>
                    </View>
                    <View style={styles.historyCountBadge}>
                      <Text style={styles.historyCountText}>{expenses.length} records</Text>
                    </View>
                  </View>

                  <View style={[styles.searchContainer, searchFocused && styles.searchContainerFocused]}>
                    <Ionicons
                      name="search-outline"
                      size={17}
                      color={searchFocused ? theme.colors.primary : theme.colors.textTertiary}
                      style={styles.searchIcon}
                    />
                    <AppTextInput
                      style={[ds.inputInChrome, styles.searchInput]}
                      placeholder="Search by title or category…"
                      placeholderTextColor={theme.colors.textTertiary}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => setSearchFocused(false)}
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn} hitSlop={8}>
                        <Ionicons name="close" size={12} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </View>

                  <ExpenseDateFilterBar
                    fromDate={fromDate}
                    toDate={toDate}
                    onFromDateChange={setFromDate}
                    onToDateChange={setToDate}
                    onClear={resetDateFilters}
                    isDark={isDark}
                  />

                  {expenses.length > 0 && (
                    <View style={styles.summaryStrip}>
                      <View style={styles.summaryHero}>
                        <Text style={styles.summaryHeroLabel}>Filtered total</Text>
                        <Text style={styles.summaryHeroAmount}>{fmtINR(totalAll)}</Text>
                      </View>
                      <View style={styles.summaryDivider} />
                      {[
                        { label: 'Pending', amount: totalPending, color: STATUS_META.pending.dot },
                        { label: 'Approved', amount: totalApproved, color: STATUS_META.approved.dot },
                        { label: 'Paid', amount: totalPaid, color: STATUS_META.paid.dot },
                      ].map((stat) => (
                        <View key={stat.label} style={styles.summaryChip}>
                          <View style={[styles.summaryDot, { backgroundColor: stat.color }]} />
                          <Text style={styles.summaryLabel}>{stat.label}</Text>
                          <Text style={styles.summaryAmount}>{fmtINR(stat.amount)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </>
            }
            ListEmptyComponent={
              loading ? (
                <View style={styles.inlineLoading}>
                  <LogoLoader size={44} color={theme.colors.primary} />
                  <Text style={styles.loadingText}>Loading expenses…</Text>
                </View>
              ) : (
                <Animated.View entering={FadeIn.duration(350)} style={styles.emptyContainer}>
                  <View style={styles.emptyIconWrap}>
                    <LinearGradient
                      colors={['#EEF2FF', '#E0E7FF']}
                      style={StyleSheet.absoluteFill}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    />
                    <FontAwesome5 name="receipt" size={24} color="#818CF8" />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {searchQuery ? 'No matching expenses' : 'No expenses in this period'}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {searchQuery
                      ? `Nothing matched “${searchQuery}”. Try another search or widen the date range.`
                      : 'Use any quick-entry card above to log spending.'}
                  </Text>
                </Animated.View>
              )
            }
            refreshing={loading}
            onRefresh={() => {
              fetchExpenses(searchQuery, fetchOptions);
              fetchAcademicYearExpenses('', academicYearRange);
            }}
          />

          {/* FABs */}
          <Pressable
            style={({ pressed }) => [styles.fabSecondaryWrap, pressed && { opacity: 0.88 }]}
            onPress={() => setIsBulkModalVisible(true)}
            accessibilityLabel="Bulk add expenses"
          >
            <View style={styles.fabSecondary}>
              <Ionicons name="grid-outline" size={20} color={theme.colors.primary} />
            </View>
          </Pressable>

          <Animated.View style={[styles.fabWrapper, fabStyle]}>
            <Pressable
              onPress={() => openAdd()}
              onPressIn={() => { fabScale.value = withSpring(0.94, { damping: 15, stiffness: 280 }); }}
              onPressOut={() => { fabScale.value = withSpring(1, { damping: 12, stiffness: 220 }); }}
              accessibilityLabel="Add expense"
            >
              <LinearGradient
                colors={['#4F46E5', '#6366F1']}
                style={styles.fab}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
                  style={styles.fabGloss}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                />
                <Ionicons name="add" size={22} color="#fff" />
                <Text style={styles.fabLabel}>Add Expense</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </>
      ) : (
        <NetBalanceTab />
      )}

      {/* ── ADD EXPENSE SHEET ── */}
      <Modal visible={isAddModalVisible} animationType="slide" transparent statusBarTranslucent>
        <View style={styles.sheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setIsAddModalVisible(false); resetForm(); }} />
          <Animated.View entering={FadeInUp.duration(300)} style={[styles.sheetContent, { maxHeight: '92%' as any }]}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleRow}>
                <View style={styles.sheetIconBadge}>
                  <Ionicons name="receipt-outline" size={16} color={theme.colors.primary} />
                </View>
                <View>
                  <Text style={styles.sheetTitle}>New Expense</Text>
                  <Text style={styles.sheetSubtitle}>Log a single school expenditure</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => { setIsAddModalVisible(false); resetForm(); }}
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {(() => {
              const formFields = (
                <>
                  <Text style={styles.fieldLabel}>Title <Text style={styles.req}>*</Text></Text>
                  <AppTextInput
                    style={styles.input}
                    placeholder="e.g. Lab equipment, bus repair"
                    placeholderTextColor={theme.colors.textTertiary}
                    value={newTitle}
                    onChangeText={setNewTitle}
                  />

                  <Text style={styles.fieldLabel}>Amount <Text style={styles.req}>*</Text></Text>
                  <View style={styles.amountRow}>
                    <View style={styles.currencyBox}>
                      <Text style={styles.currencyBoxText}>₹</Text>
                    </View>
                    <AppTextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      placeholder="0.00"
                      placeholderTextColor={theme.colors.textTertiary}
                      keyboardType="numeric"
                      value={newAmount}
                      onChangeText={setNewAmount}
                    />
                  </View>

                  <Text style={styles.fieldLabel}>Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                    {CATEGORIES.map((cat) => {
                      const meta = CATEGORY_META[cat];
                      const active = newCategory === cat;
                      return (
                        <Pressable
                          key={cat}
                          onPress={() => setNewCategory(cat)}
                          style={[
                            styles.catChip,
                            {
                              backgroundColor: active ? meta.bg : theme.colors.card,
                              borderColor: active ? meta.color : theme.colors.border,
                            },
                          ]}
                        >
                          <FontAwesome5 name={meta.icon as any} size={11} color={active ? meta.color : theme.colors.textTertiary} />
                          <Text style={[styles.catChipText, { color: active ? meta.color : theme.colors.textSecondary }]}>
                            {cat}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  <Text style={styles.fieldLabel}>
                    Notes <Text style={styles.fieldOpt}>(optional)</Text>
                  </Text>
                  <AppTextInput
                    style={[styles.input, { height: 88, textAlignVertical: 'top' }]}
                    placeholder="Any extra context…"
                    placeholderTextColor={theme.colors.textTertiary}
                    multiline
                    value={newDescription}
                    onChangeText={setNewDescription}
                  />

                  <Pressable
                    style={styles.bulkLink}
                    onPress={() => {
                      setIsAddModalVisible(false);
                      resetForm();
                      setIsBulkModalVisible(true);
                    }}
                  >
                    <Ionicons name="grid-outline" size={15} color={theme.colors.primary} />
                    <Text style={styles.bulkLinkText}>Need to add several? Use bulk entry</Text>
                  </Pressable>
                </>
              );

              const submitBtn = (
                <Pressable
                  style={({ pressed }) => [styles.submitWrap, pressed && { opacity: 0.9 }]}
                  onPress={handleAddExpense}
                  disabled={isSubmitting}
                >
                  <LinearGradient
                    colors={['#4F46E5', '#6366F1']}
                    style={styles.submitBtn}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {isSubmitting ? (
                      <LogoLoader color="#fff" size={22} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                        <Text style={styles.submitBtnText}>Save expense</Text>
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
              );

              if (Platform.OS === 'web') {
                return (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ paddingBottom: 12 + insets.bottom }}
                  >
                    {formFields}
                    {submitBtn}
                  </ScrollView>
                );
              }

              return (
                <View style={{ flexShrink: 1, minHeight: 0, maxHeight: 520 }}>
                  <KeyboardAwareScrollView
                    bottomOffset={100}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 16 }}
                  >
                    {formFields}
                  </KeyboardAwareScrollView>
                  <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
                    <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
                      {submitBtn}
                    </View>
                  </KeyboardStickyView>
                </View>
              );
            })()}
          </Animated.View>
        </View>
      </Modal>

      <BulkExpenseSheet
        visible={isBulkModalVisible}
        onClose={() => setIsBulkModalVisible(false)}
        onSubmit={handleBulkExpenses}
        isDark={isDark}
      />

      {/* ── DETAILS ── */}
      <Modal visible={!!selectedExpense} animationType="fade" transparent>
        <View style={styles.overlayBlur}>
          {selectedExpense && (() => {
            const st = STATUS_META[selectedExpense.status as keyof typeof STATUS_META] ?? STATUS_META.pending;
            const cat = CATEGORY_META[selectedExpense.category] ?? CATEGORY_META.Other;
            return (
              <Animated.View entering={ZoomIn.duration(260)} style={styles.detailsCard}>
                <LinearGradient colors={cat.grad} style={styles.detailBand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                  />
                  <View style={styles.detailBandIcon}>
                    <FontAwesome5 name={cat.icon as any} size={18} color="#fff" />
                  </View>
                  <TouchableOpacity style={styles.closeBtnLight} onPress={() => setSelectedExpense(null)}>
                    <Ionicons name="close" size={18} color="#fff" />
                  </TouchableOpacity>
                </LinearGradient>

                <View style={styles.detailAmountSection}>
                  <Text style={styles.detailAmountLabel}>Amount</Text>
                  <Text style={styles.detailAmountValue}>{fmtINR(selectedExpense.amount)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: st.bg, borderColor: st.border, alignSelf: 'center', marginTop: 10 }]}>
                    <View style={[styles.statusDot, { backgroundColor: st.dot }]} />
                    <Text style={[styles.statusText, { color: st.text }]}>{st.label}</Text>
                  </View>
                </View>

                <View style={styles.detailSep} />

                {[
                  { label: 'Title', value: selectedExpense.title },
                  { label: 'Date', value: formatDateShort(selectedExpense.expense_date) },
                ].map(({ label, value }) => (
                  <View key={label} style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{label}</Text>
                    <Text style={styles.detailValue}>{value}</Text>
                  </View>
                ))}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Category</Text>
                  <View style={[styles.detailCatPill, { backgroundColor: cat.bg }]}>
                    <FontAwesome5 name={cat.icon as any} size={10} color={cat.color} style={{ marginRight: 4 }} />
                    <Text style={[styles.detailCatText, { color: cat.color }]}>{selectedExpense.category}</Text>
                  </View>
                </View>

                {selectedExpense.description ? (
                  <View style={styles.detailDescBox}>
                    <Text style={styles.detailLabel}>Notes</Text>
                    <Text style={styles.detailLog}>{selectedExpense.description}</Text>
                  </View>
                ) : null}

                <View style={styles.actionRow}>
                  {selectedExpense.status === 'pending' && (
                    <>
                      <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => handleApprove(selectedExpense)}>
                        <MaterialIcons name="check" size={17} color="#fff" />
                        <Text style={styles.actionText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDeletePress}>
                        <MaterialIcons name="delete-outline" size={17} color="#fff" />
                        <Text style={styles.actionText}>Reject</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {selectedExpense.status === 'approved' && (
                    <TouchableOpacity style={[styles.actionBtn, styles.payBtn]} onPress={() => handlePay(selectedExpense)}>
                      <MaterialIcons name="attach-money" size={17} color="#fff" />
                      <Text style={styles.actionText}>Mark as Paid</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Animated.View>
            );
          })()}
        </View>
      </Modal>

      {/* ── DELETE ── */}
      <Modal visible={isDeleteModalVisible} transparent animationType="fade">
        <View style={styles.overlayBlur}>
          <Animated.View entering={ZoomIn.duration(260)} style={styles.deleteCard}>
            <View style={styles.deleteIconRing}>
              <MaterialIcons name="warning-amber" size={26} color="#EF4444" />
            </View>
            <Text style={styles.deleteTitle}>Reject & delete</Text>
            <Text style={styles.deleteSubtitle}>
              This is permanent and will be recorded in the audit log.
            </Text>
            <AppTextInput
              style={[styles.input, { height: 90, textAlignVertical: 'top', marginTop: 16, width: '100%' }]}
              placeholder="Reason (e.g. Unjustified, budget exceeded)"
              placeholderTextColor={theme.colors.textTertiary}
              multiline
              value={deleteReason}
              onChangeText={setDeleteReason}
            />
            <View style={styles.deleteActions}>
              <TouchableOpacity onPress={() => setIsDeleteModalVisible(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDelete} style={styles.confirmDeleteBtn} disabled={deleting}>
                {deleting
                  ? <LogoLoader color="#fff" size={28} />
                  : <Text style={styles.confirmDeleteText}>Confirm delete</Text>}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View></TourTarget>
  );
}

const getStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  loadingText: { marginTop: 14, fontSize: 13, color: theme.colors.textSecondary, letterSpacing: 0.2 },

  tabContainer: {
    flexDirection: 'row',
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 11,
  },
  activeTabBtn: {
    backgroundColor: theme.colors.primaryDark || '#4F46E5',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 8 }
      : { elevation: 3 }),
  },
  tabText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  activeTabText: { color: '#fff', fontWeight: '800' },

  heroWrap: { marginHorizontal: 20, marginTop: 14 },
  heroCard: {
    minHeight: 206,
    borderRadius: 24,
    padding: 22,
    overflow: 'hidden',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#4338CA', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.24, shadowRadius: 18 }
      : { elevation: 6 }),
  },
  heroOrbLarge: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.07)',
    right: -70,
    top: -110,
  },
  heroOrbSmall: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.06)',
    left: '42%',
    bottom: -70,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  heroEyebrow: { color: '#C7D2FE', fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  heroTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 4, letterSpacing: -0.25 },
  heroYearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 18,
  },
  heroYearText: { color: '#F5F3FF', fontSize: 11, fontWeight: '700' },
  heroMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 20,
  },
  heroMainMetric: { flex: 1, minWidth: 190 },
  heroAmount: { color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -1.2 },
  heroMetricCaption: { color: '#C7D2FE', fontSize: 11, fontWeight: '600', marginTop: 4 },
  heroMonthCard: {
    minWidth: 186,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  heroMonthIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroMonthLabel: { color: '#DDD6FE', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  heroMonthAmount: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 1 },
  heroMonthCount: { color: '#C7D2FE', fontSize: 10, fontWeight: '600', marginTop: 1 },
  heroAddButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 17,
  },
  heroAddButtonText: { color: '#4338CA', fontSize: 12, fontWeight: '800' },

  quickSection: { marginHorizontal: 20, marginTop: 24 },
  sectionHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
    marginBottom: 14,
  },
  sectionEyebrow: { color: theme.colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.25 },
  sectionTitle: { color: theme.colors.textStrong, fontSize: 18, fontWeight: '800', letterSpacing: -0.4, marginTop: 3 },
  sectionSubtitle: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '500', marginTop: 3 },
  bulkEntryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: isDark ? 'rgba(129,140,248,0.12)' : '#EEF2FF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(129,140,248,0.22)' : '#E0E7FF',
  },
  bulkEntryButtonText: { color: theme.colors.primary, fontSize: 11, fontWeight: '800' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: {
    minHeight: 144,
    backgroundColor: theme.colors.background,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 13,
    justifyContent: 'space-between',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10 }
      : { elevation: 2 }),
  },
  quickCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quickIconBox: { width: 36, height: 36, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  quickAddIcon: {
    width: 25,
    height: 25,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#fff',
  },
  quickCardTitle: { color: theme.colors.textStrong, fontSize: 13, fontWeight: '800', letterSpacing: -0.15, marginTop: 11 },
  quickCardHint: { color: theme.colors.textTertiary, fontSize: 10, fontWeight: '500', marginTop: 2 },
  quickCardFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 9,
    marginTop: 10,
  },
  quickSpentLabel: { color: theme.colors.textTertiary, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  quickSpentAmount: { fontSize: 12, fontWeight: '900', marginTop: 1 },
  quickAddText: { fontSize: 9, fontWeight: '800' },

  historySection: {
    marginTop: 28,
    paddingTop: 22,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  historyHeadingRow: {
    marginHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  historyCountBadge: {
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  historyCountText: { color: theme.colors.textSecondary, fontSize: 10, fontWeight: '700' },
  inlineLoading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 34 },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    height: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchContainerFocused: {
    borderColor: theme.colors.primary,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.textStrong, fontWeight: '500' },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.textTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  summaryHero: { paddingRight: 4 },
  summaryHeroLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  summaryHeroAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.primary,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  summaryDivider: { width: 1, height: 36, backgroundColor: theme.colors.border, marginHorizontal: 4 },
  summaryChip: { flex: 1, gap: 2 },
  summaryDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 2 },
  summaryLabel: {
    fontSize: 10,
    color: theme.colors.textTertiary,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  summaryAmount: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textStrong,
    letterSpacing: -0.2,
  },

  listContent: { paddingTop: 0, paddingBottom: 120 },

  card: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderRadius: 18,
    marginHorizontal: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 }
      : { elevation: 2 }),
  },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, padding: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  titleBox: { flex: 1, marginRight: 8 },
  title: { fontSize: 15, fontWeight: '700', color: theme.colors.textStrong, letterSpacing: -0.2 },
  date: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2, fontWeight: '500' },
  amount: { fontSize: 16, fontWeight: '800', color: '#EF4444', letterSpacing: -0.4 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  descText: { flex: 1, fontSize: 12, color: theme.colors.textTertiary, fontWeight: '500' },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },

  fabWrapper: { position: 'absolute', bottom: 28, right: 18 },
  fabSecondaryWrap: { position: 'absolute', bottom: 32, right: 178 },
  fabSecondary: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.background,
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(129,140,248,0.35)' : '#C7D2FE',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10 }
      : { elevation: 4 }),
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    gap: 6,
    overflow: 'hidden',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 14 }
      : { elevation: 8 }),
  },
  fabGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 22 },
  fabLabel: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.1 },

  emptyContainer: { alignItems: 'center', paddingTop: 28, paddingHorizontal: 28, paddingBottom: 24 },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    overflow: 'hidden',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.textStrong,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 320,
  },
  emptyCta: {
    marginTop: 22,
    borderRadius: 14,
    overflow: 'hidden',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 12 }
      : { elevation: 6 }),
  },
  emptyCtaGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 22,
  },
  emptyCtaText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  overlayBlur: {
    flex: 1,
    backgroundColor: 'rgba(8,8,24,0.58)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8,8,24,0.5)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingBottom: Platform.OS === 'ios' ? 36 : 28,
    paddingTop: 12,
    maxWidth: Platform.OS === 'web' ? 520 : undefined,
    width: Platform.OS === 'web' ? '100%' as any : undefined,
    alignSelf: Platform.OS === 'web' ? 'center' : undefined,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: isDark ? 'rgba(129,140,248,0.15)' : '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.textStrong, letterSpacing: -0.3 },
  sheetSubtitle: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnLight: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginTop: 14,
    marginBottom: 8,
  },
  fieldOpt: { fontWeight: '500', color: theme.colors.textTertiary },
  req: { color: '#EF4444' },
  input: {
    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 13,
    padding: 14,
    fontSize: 15,
    color: theme.colors.textStrong,
    fontWeight: '500',
    marginBottom: 4,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  currencyBox: {
    width: 48,
    height: 50,
    borderRadius: 13,
    backgroundColor: isDark ? '#1E293B' : '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? theme.colors.border : '#C7D2FE',
  },
  currencyBoxText: { fontSize: 17, fontWeight: '800', color: theme.colors.primary },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 1.5,
  },
  catChipText: { fontSize: 12, fontWeight: '700' },

  submitWrap: {
    marginTop: 20,
    borderRadius: 16,
    overflow: 'hidden',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12 }
      : { elevation: 6 }),
  },
  submitBtn: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  bulkLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 8,
    paddingVertical: 10,
  },
  bulkLinkText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },

  detailsCard: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: theme.colors.background,
    borderRadius: 26,
    overflow: 'hidden',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 24 }
      : { elevation: 16 }),
  },
  detailBand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    overflow: 'hidden',
  },
  detailBandIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailAmountSection: { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 24 },
  detailAmountLabel: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  detailAmountValue: {
    fontSize: 32,
    fontWeight: '900',
    color: theme.colors.textStrong,
    letterSpacing: -1.2,
    marginTop: 4,
  },
  detailSep: { height: 1, backgroundColor: theme.colors.border, marginHorizontal: 20 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  detailLabel: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
  detailValue: { fontSize: 14, fontWeight: '700', color: theme.colors.textStrong, letterSpacing: -0.2, flexShrink: 1, textAlign: 'right', marginLeft: 16 },
  detailCatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  detailCatText: { fontSize: 12, fontWeight: '700' },
  detailDescBox: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 4 },
  detailLog: {
    backgroundColor: theme.colors.card,
    padding: 14,
    borderRadius: 12,
    marginTop: 6,
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 20,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  approveBtn: { backgroundColor: '#059669' },
  payBtn: { backgroundColor: '#2563EB' },
  deleteBtn: { backgroundColor: '#EF4444' },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  deleteCard: {
    width: '88%',
    maxWidth: 400,
    backgroundColor: theme.colors.background,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
  },
  deleteIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: '#FECACA',
  },
  deleteTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.textStrong, letterSpacing: -0.3 },
  deleteSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  deleteActions: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: theme.colors.card,
  },
  cancelBtnText: { color: theme.colors.textSecondary, fontWeight: '700', fontSize: 14 },
  confirmDeleteBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 12,
  },
  confirmDeleteText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
