import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useMemo } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import { styles as ds } from '@/src/theme/styles';

import {
  View, Text, StyleSheet, FlatList, StatusBar, Modal,
  Platform, ScrollView, Pressable
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import AdminHeader from '../../src/components/AdminHeader';
import { Redirect } from 'expo-router';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import { usePermissions } from '../../src/hooks/usePermissions';
import Animated, {
  FadeInDown, FadeIn,
  useAnimatedStyle, useSharedValue,
  withTiming, withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useExpenses } from '../../src/hooks/useExpenses';
import { Expense } from '../../src/types/expenses';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
import ExpenseDateFilterBar from '../../src/components/expenses/ExpenseDateFilterBar';
import BulkExpenseSheet from '../../src/components/expenses/BulkExpenseSheet';
import { formatDateShort, monthStartInput, todayDateInput } from '../../src/components/expenses/expenseConstants';

// ─── Category config ──────────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<string, { icon: string; color: string; grad: [string, string] }> = {
  Stationery: { icon: 'pencil-outline', color: '#4F46E5', grad: ['#4338CA', '#6366F1'] },
  'Office Expenses': { icon: 'briefcase-outline', color: '#0F766E', grad: ['#0F766E', '#14B8A6'] },
  Cameras: { icon: 'videocam-outline', color: '#7C3AED', grad: ['#6D28D9', '#A855F7'] },
  Savings: { icon: 'wallet-outline', color: '#059669', grad: ['#047857', '#10B981'] },
  'Agent Commission': { icon: 'people-outline', color: '#EA580C', grad: ['#C2410C', '#F97316'] },
  Donations: { icon: 'heart-outline', color: '#DB2777', grad: ['#BE185D', '#EC4899'] },
  'Labour Charges': { icon: 'hammer-outline', color: '#B45309', grad: ['#92400E', '#D97706'] },
  Construction: { icon: 'business-outline', color: '#475569', grad: ['#334155', '#64748B'] },
  'Electricity Bill': { icon: 'flash-outline', color: '#CA8A04', grad: ['#A16207', '#EAB308'] },
  'Tea & Refreshments': { icon: 'cafe-outline', color: '#A16207', grad: ['#854D0E', '#CA8A04'] },
  'Water Bill': { icon: 'water-outline', color: '#0284C7', grad: ['#0369A1', '#0EA5E9'] },
  'Transport & Fuel': { icon: 'bus-outline', color: '#0891B2', grad: ['#0E7490', '#06B6D4'] },
  Education: { icon: 'book-outline', color: '#3B82F6', grad: ['#1D4ED8', '#3B82F6'] },
  Maintenance: { icon: 'construct-outline', color: '#F59E0B', grad: ['#B45309', '#F59E0B'] },
  'Internet & Phone': { icon: 'wifi-outline', color: '#2563EB', grad: ['#1D4ED8', '#3B82F6'] },
  'Printing & Exams': { icon: 'print-outline', color: '#9333EA', grad: ['#7E22CE', '#A855F7'] },
  Security: { icon: 'shield-checkmark-outline', color: '#DC2626', grad: ['#B91C1C', '#EF4444'] },
  Sports: { icon: 'football-outline', color: '#10B981', grad: ['#065F46', '#10B981'] },
  Utility: { icon: 'flash-outline', color: '#8B5CF6', grad: ['#5B21B6', '#8B5CF6'] },
  Events: { icon: 'calendar-outline', color: '#EC4899', grad: ['#9D174D', '#EC4899'] },
  Salary: { icon: 'cash-outline', color: '#14B8A6', grad: ['#0F766E', '#14B8A6'] },
  Other: { icon: 'ellipsis-horizontal-outline', color: '#6B7280', grad: ['#374151', '#6B7280'] },
};
const CATEGORIES = Object.keys(CATEGORY_CONFIG);

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending: { color: '#F59E0B', bg_light: '#FEF3C7', bg_dark: '#451A03', label: 'PENDING', icon: 'time-outline' },
  approved: { color: '#10B981', bg_light: '#D1FAE5', bg_dark: '#052E16', label: 'APPROVED', icon: 'checkmark-circle-outline' },
  paid: { color: '#3B82F6', bg_light: '#DBEAFE', bg_dark: '#172554', label: 'PAID', icon: 'card-outline' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtINR = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const fmtDate = (d: string) => formatDateShort(d);

// ─── Search Bar ───────────────────────────────────────────────────────────────
const SearchBar = ({ value, onChange, isDark }: any) => {
  const focused = useSharedValue(0);
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: focused.value === 1 ? '#6366F1' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
    borderWidth: focused.value === 1 ? 1.5 : 1,
  }));
  return (
    <Animated.View style={[srchSt.wrap, ds.searchBarWrapper, { backgroundColor: isDark ? '#111827' : '#fff' }, borderStyle]}>
      <Ionicons name="search-outline" size={18} color={isDark ? '#475569' : '#94A3B8'} style={{ marginRight: 10 }} />
      <AppTextInput
        style={[ds.inputInChrome, srchSt.input, { color: isDark ? '#E2E8F0' : '#0F172A' }]}
        placeholder="Search expenses…"
        placeholderTextColor={isDark ? '#374151' : '#94A3B8'}
        value={value}
        onChangeText={onChange}
        onFocus={() => { focused.value = withTiming(1, { duration: 160 }); }}
        onBlur={() => { focused.value = withTiming(0, { duration: 180 }); }}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChange('')}>
          <Ionicons name="close-circle" size={18} color={isDark ? '#475569' : '#94A3B8'} />
        </Pressable>
      )}
    </Animated.View>
  );
};
const srchSt = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginVertical: 14, borderRadius: 14, paddingHorizontal: 14, height: 46 },
  input: { flex: 1, fontSize: 15, fontWeight: '500' },
});

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status, isDark }: { status: string; isDark: boolean }) => {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
  return (
    <View style={[badgeSt.wrap, { backgroundColor: isDark ? cfg.bg_dark : cfg.bg_light }]}>
      <Ionicons name={cfg.icon as any} size={10} color={cfg.color} />
      <Text style={[badgeSt.text, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
};
const badgeSt = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  text: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
});

// ─── Expense Card ─────────────────────────────────────────────────────────────
const ExpenseCard = ({ item, index, onPress, isDark }: { item: Expense; index: number; onPress: () => void; isDark: boolean }) => {
  const cat = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.Other;
  const scale = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 55).duration(430).springify()}
      style={cardStyle}
    >
      <Pressable
        style={({ pressed }) => [
          cardSt.card,
          { backgroundColor: isDark ? '#111827' : '#fff', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' },
          pressed && { opacity: 0.92 },
        ]}
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 14, stiffness: 300 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 200 }); }}
        onPress={onPress}
      >
        {/* Category accent bar */}
        <View style={[cardSt.accentBar, { backgroundColor: cat.color }]} />

        <View style={cardSt.inner}>
          {/* Top row */}
          <View style={cardSt.topRow}>
            <LinearGradient colors={cat.grad} style={cardSt.iconWrap} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name={cat.icon as any} size={16} color="#fff" />
            </LinearGradient>

            <View style={cardSt.titleArea}>
              <Text style={[cardSt.title, { color: isDark ? '#E2E8F0' : '#0F172A' }]} numberOfLines={1}>{item.title}</Text>
              <Text style={[cardSt.meta, { color: isDark ? '#475569' : '#94A3B8' }]}>
                {fmtDate(item.expense_date)} · {item.category}
              </Text>
            </View>

            <Text style={[cardSt.amount, { color: '#EF4444' }]}>{fmtINR(item.amount)}</Text>
          </View>

          {/* Bottom row */}
          <View style={cardSt.bottomRow}>
            {item.description
              ? <Text style={[cardSt.desc, { color: isDark ? '#374151' : '#CBD5E1' }]} numberOfLines={1}>{item.description}</Text>
              : <View style={{ flex: 1 }} />
            }
            <StatusBadge status={item.status} isDark={isDark} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
};
const cardSt = StyleSheet.create({
  card: {
    flexDirection: 'row', borderRadius: 20, marginBottom: 12, overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 4,
  },
  accentBar: { width: 4 },
  inner: { flex: 1, padding: 15 },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  titleArea: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, marginBottom: 2 },
  meta: { fontSize: 12, fontWeight: '500' },
  amount: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3, flexShrink: 0 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  desc: { fontSize: 12, fontWeight: '500', flex: 1, marginRight: 8 },
});

// ─── Summary Strip ────────────────────────────────────────────────────────────
const SummaryStrip = ({ expenses, isDark }: { expenses: Expense[]; isDark: boolean }) => {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const pending = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount, 0);
  const paid = expenses.filter(e => e.status === 'paid').reduce((s, e) => s + e.amount, 0);
  const items = [
    { label: 'Total', value: fmtINR(total), color: '#6366F1' },
    { label: 'Pending', value: fmtINR(pending), color: '#F59E0B' },
    { label: 'Paid', value: fmtINR(paid), color: '#10B981' },
  ];
  return (
    <View style={[stripSt.wrap, { backgroundColor: isDark ? '#111827' : '#fff', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
      {items.map((item, i) => (
        <React.Fragment key={item.label}>
          <View style={stripSt.item}>
            <Text style={[stripSt.val, { color: item.color }]}>{item.value}</Text>
            <Text style={[stripSt.lbl, { color: isDark ? '#475569' : '#94A3B8' }]}>{item.label}</Text>
          </View>
          {i < items.length - 1 && <View style={[stripSt.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]} />}
        </React.Fragment>
      ))}
    </View>
  );
};
const stripSt = StyleSheet.create({
  wrap: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 14, borderRadius: 18, padding: 16, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  val: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  lbl: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  divider: { width: 1, marginVertical: 4 },
});

// ─── Bottom-Sheet Modal wrapper ───────────────────────────────────────────────
const BottomSheet = ({ visible, onClose, children, isDark, title, subtitle }: any) => (
  <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
    <Pressable style={sheetSt.overlay} onPress={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sheetSt.kvWrap}>
        <Pressable style={[sheetSt.sheet, { backgroundColor: isDark ? '#111827' : '#fff' }]} onPress={() => { }}>
          <View style={sheetSt.handle} />
          <View style={sheetSt.headerRow}>
            <View>
              <Text style={[sheetSt.title, { color: isDark ? '#E2E8F0' : '#0F172A' }]}>{title}</Text>
              {subtitle && <Text style={[sheetSt.subtitle, { color: isDark ? '#475569' : '#94A3B8' }]}>{subtitle}</Text>}
            </View>
            <Pressable style={[sheetSt.closeBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]} onPress={onClose}>
              <Ionicons name="close" size={18} color={isDark ? '#94A3B8' : '#64748B'} />
            </Pressable>
          </View>
          {children}
        </Pressable>
      </KeyboardAvoidingView>
    </Pressable>
  </Modal>
);
const sheetSt = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  kvWrap: { justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, paddingHorizontal: 22, paddingBottom: 36 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 3, fontWeight: '500' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
});

// ─── Form Input ───────────────────────────────────────────────────────────────
const FormInput = ({ label, value, onChange, placeholder, multiline = false, keyboardType = 'default', isDark, required = false }: any) => {
  const focused = useSharedValue(0);
  const bStyle = useAnimatedStyle(() => ({
    borderColor: focused.value === 1 ? '#6366F1' : (isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)'),
    borderWidth: focused.value === 1 ? 1.5 : 1,
  }));
  return (
    <View style={formSt.group}>
      <Text style={[formSt.label, { color: isDark ? '#64748B' : '#64748B' }]}>
        {label}{required && <Text style={{ color: '#EF4444' }}> *</Text>}
      </Text>
      <Animated.View style={[formSt.wrap, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }, multiline && { height: 90, alignItems: 'flex-start', paddingVertical: 12 }, bStyle]}>
        <AppTextInput
          style={[ds.inputInChrome, formSt.input, { color: isDark ? '#E2E8F0' : '#0F172A' }, multiline && { textAlignVertical: 'top', height: 66 }]}
          placeholder={placeholder}
          placeholderTextColor={isDark ? '#374151' : '#94A3B8'}
          value={value}
          onChangeText={onChange}
          multiline={multiline}
          keyboardType={keyboardType}
          onFocus={() => { focused.value = withTiming(1, { duration: 160 }); }}
          onBlur={() => { focused.value = withTiming(0, { duration: 180 }); }}
        />
      </Animated.View>
    </View>
  );
};
const formSt = StyleSheet.create({
  group: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 7, letterSpacing: 0.1 },
  wrap: { borderRadius: 13, paddingHorizontal: 14, height: 48, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, fontSize: 15, fontWeight: '500' },
});

// ─── Category Chip Row ────────────────────────────────────────────────────────
const CategoryChips = ({ value, onChange, isDark }: any) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={[formSt.label, { color: isDark ? '#64748B' : '#64748B' }]}>Category</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: -2 }}>
      {CATEGORIES.map(cat => {
        const cfg = CATEGORY_CONFIG[cat];
        const active = value === cat;
        return (
          <Pressable
            key={cat}
            style={({ pressed }) => [
              chipSt.chip,
              { backgroundColor: active ? cfg.color + '18' : (isDark ? '#1E293B' : '#F8FAFC') },
              { borderColor: active ? cfg.color : (isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)') },
              { borderWidth: active ? 1.5 : 1 },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => onChange(cat)}
          >
            <View style={[chipSt.iconWrap, { backgroundColor: active ? cfg.color : (isDark ? '#0F172A' : '#E2E8F0') }]}>
              <Ionicons name={cfg.icon as any} size={12} color={active ? '#fff' : (isDark ? '#475569' : '#94A3B8')} />
            </View>
            <Text style={[chipSt.text, { color: active ? cfg.color : (isDark ? '#475569' : '#94A3B8'), fontWeight: active ? '800' : '600' }]}>{cat}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  </View>
);
const chipSt = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, marginRight: 8 },
  iconWrap: { width: 22, height: 22, borderRadius: 7, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 12, letterSpacing: 0.1 },
});

// ─── Detail Row ───────────────────────────────────────────────────────────────
const DetailRow = ({ label, children, isDark }: any) => (
  <View style={[dtSt.row, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
    <Text style={[dtSt.label, { color: isDark ? '#475569' : '#94A3B8' }]}>{label}</Text>
    <View style={dtSt.valWrap}>{children}</View>
  </View>
);
const dtSt = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1 },
  label: { fontSize: 13, fontWeight: '600' },
  valWrap: { alignItems: 'flex-end', flex: 1, marginLeft: 20 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AccountsExpenses() {
  const { theme, isDark } = useTheme();
  const { shellActive } = useAccountsWebChrome();
  const { hasPermission } = usePermissions();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { expenses, loading, fetchExpenses, createExpense, createBulkExpenses } = useExpenses();

  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState(monthStartInput);
  const [toDate, setToDate] = useState(todayDateInput);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isBulkModalVisible, setIsBulkModalVisible] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
  const [newAmount, setNewAmount] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchOptions = useMemo(
    () => ({ accountsScope: true as const, fromDate, toDate }),
    [fromDate, toDate]
  );

  useEffect(() => {
    fetchExpenses(searchQuery, fetchOptions);
  }, [searchQuery, fetchOptions, fetchExpenses]);

  const resetDateFilters = () => {
    setFromDate(monthStartInput());
    setToDate(todayDateInput());
  };

  const handleAddExpense = async () => {
    if (!newTitle || !newAmount) { alertCompat('Required', 'Title and Amount are required.'); return; }
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) { alertCompat('Invalid Amount', 'Enter a valid positive number.'); return; }
    setIsSubmitting(true);
    const success = await createExpense({
      title: newTitle, category: newCategory, amount,
      expense_date: new Date().toISOString().split('T')[0], description: newDescription,
    });
    setIsSubmitting(false);
    if (success) { setIsAddModalVisible(false); resetForm(); }
  };

  const resetForm = () => { setNewTitle(''); setNewCategory(CATEGORIES[0]); setNewAmount(''); setNewDescription(''); };

  const renderItem = ({ item, index }: { item: Expense; index: number }) => (
    <ExpenseCard item={item} index={index} onPress={() => setSelectedExpense(item)} isDark={isDark} />
  );

  const selectedCat = selectedExpense ? CATEGORY_CONFIG[selectedExpense.category] || CATEGORY_CONFIG.Other : null;

  // Expenses are hidden from accounts (RBAC epic #2). Cosmetic guard against
  // direct navigation — the server already 403s these routes for accounts.
  if (!hasPermission('expenses.view')) {
    return <Redirect href="/accounts/dashboard" />;
  }

  return (
    <TourTarget id="screen.accounts-expenses.overview" native><View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#0A0F1E' : '#F1F5F9'} />
      {!shellActive && <AdminHeader title="Expense Tracker" showBackButton />}

      <SearchBar value={searchQuery} onChange={setSearchQuery} isDark={isDark} />

      <ExpenseDateFilterBar
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onClear={resetDateFilters}
        isDark={isDark}
      />

          {/* Summary strip */}
          {!loading && expenses.length > 0 && (
            <Animated.View entering={FadeInDown.duration(400)}>
              <SummaryStrip expenses={expenses} isDark={isDark} />
            </Animated.View>
          )}

          {loading && expenses.length === 0 ? (
            <View style={styles.centered}><LogoLoader size={60} color="#6366F1" /></View>
          ) : (
            <FlatList
              data={expenses}
              keyExtractor={item => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshing={loading}
              onRefresh={() => fetchExpenses(searchQuery, fetchOptions)}
              ListEmptyComponent={
                <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
                  <View style={[styles.emptyIconWrap, { backgroundColor: isDark ? '#1E293B' : '#EEF2FF' }]}>
                    <FontAwesome5 name="receipt" size={28} color={isDark ? '#374151' : '#A5B4FC'} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: isDark ? '#E2E8F0' : '#0F172A' }]}>
                    {searchQuery ? 'No matching expenses' : 'No expenses yet'}
                  </Text>
                  <Text style={[styles.emptySub, { color: isDark ? '#64748B' : '#64748B', textAlign: 'center', paddingHorizontal: 24 }]}>
                    {searchQuery
                      ? `Nothing matched “${searchQuery}”. Try another search or widen the date range.`
                      : 'Log school spending so balances stay accurate.'}
                  </Text>
                  {!searchQuery && (
                    <Pressable
                      style={({ pressed }) => [{ marginTop: 16, borderRadius: 14, overflow: 'hidden', opacity: pressed ? 0.9 : 1 }]}
                      onPress={() => setIsAddModalVisible(true)}
                    >
                      <LinearGradient colors={['#4F46E5', '#6366F1']} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 20 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                        <Ionicons name="add" size={18} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Add first expense</Text>
                      </LinearGradient>
                    </Pressable>
                  )}
                </Animated.View>
              }
            />
          )}

          {/* FABs */}
          <Pressable
            style={({ pressed }) => [styles.fabWrapSecondary, pressed && { opacity: 0.88 }]}
            onPress={() => setIsBulkModalVisible(true)}
          >
            <View style={[styles.fabSecondary, { backgroundColor: isDark ? '#1E293B' : '#fff', borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(99,102,241,0.25)' }]}>
              <Ionicons name="grid-outline" size={22} color="#6366F1" />
            </View>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.fabWrap, pressed && { opacity: 0.88 }]}
            onPress={() => setIsAddModalVisible(true)}
          >
            <LinearGradient colors={['#4F46E5', '#6366F1']} style={styles.fab} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <LinearGradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} style={styles.fabGloss} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
              <Ionicons name="add" size={28} color="#fff" />
            </LinearGradient>
          </Pressable>

      {/* ── ADD EXPENSE SHEET ── */}
      <BottomSheet
        visible={isAddModalVisible}
        onClose={() => { setIsAddModalVisible(false); resetForm(); }}
        isDark={isDark}
        title="New Expense"
        subtitle="Record a school expenditure"
      >
        <TourTarget id="screen.accounts-expenses.workspace" native><TourScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <FormInput label="Title" value={newTitle} onChange={setNewTitle} placeholder="e.g. Lab Equipment" isDark={isDark} required />

          {/* Amount with ₹ prefix */}
          <View style={formSt.group}>
            <Text style={[formSt.label, { color: isDark ? '#64748B' : '#64748B' }]}>Amount <Text style={{ color: '#EF4444' }}>*</Text></Text>
            <View style={[formSt.wrap, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)' }]}>
              <View style={[{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: isDark ? '#0F172A' : '#E2E8F0', marginRight: 8 }]}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: isDark ? '#64748B' : '#475569' }}>₹</Text>
              </View>
              <AppTextInput
                style={[ds.inputInChrome, formSt.input, { color: isDark ? '#E2E8F0' : '#0F172A' }]}
                placeholder="0.00" placeholderTextColor={isDark ? '#374151' : '#94A3B8'}
                keyboardType="numeric" value={newAmount} onChangeText={setNewAmount}
              />
            </View>
          </View>

          <CategoryChips value={newCategory} onChange={setNewCategory} isDark={isDark} />
          <FormInput label="Description" value={newDescription} onChange={setNewDescription}
            placeholder="Optional notes…" multiline isDark={isDark} />

          {/* Submit */}
          <Pressable
            style={({ pressed }) => [styles.submitWrap, pressed && { opacity: 0.88 }]}
            onPress={handleAddExpense} disabled={isSubmitting}
          >
            <LinearGradient colors={['#4F46E5', '#6366F1']} style={styles.submitBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <LinearGradient colors={['rgba(255,255,255,0.20)', 'rgba(255,255,255,0)']} style={styles.submitGloss} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
              {isSubmitting
                ? <LogoLoader color="#fff" size={22} />
                : <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={styles.submitTxt}>Submit Expense</Text>
                </>
              }
            </LinearGradient>
          </Pressable>
        </TourScrollView></TourTarget>
      </BottomSheet>

      <BulkExpenseSheet
        visible={isBulkModalVisible}
        onClose={() => setIsBulkModalVisible(false)}
        onSubmit={createBulkExpenses}
        isDark={isDark}
      />

      {/* ── EXPENSE DETAILS SHEET ── */}
      <BottomSheet
        visible={!!selectedExpense}
        onClose={() => setSelectedExpense(null)}
        isDark={isDark}
        title="Expense Details"
        subtitle={selectedExpense ? `${selectedExpense.category} · ${fmtDate(selectedExpense.expense_date)}` : ''}
      >
        {selectedExpense && selectedCat && (
          <>
            {/* Amount hero */}
            <LinearGradient colors={selectedCat.grad} style={styles.amountHero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <LinearGradient colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
              <View style={[styles.amountHeroIcon, { backgroundColor: 'rgba(255,255,255,0.20)' }]}>
                <Ionicons name={selectedCat.icon as any} size={22} color="#fff" />
              </View>
              <Text style={styles.amountHeroVal}>{fmtINR(selectedExpense.amount)}</Text>
              <Text style={styles.amountHeroTitle} numberOfLines={1}>{selectedExpense.title}</Text>
            </LinearGradient>

            {/* Detail rows */}
            <DetailRow label="Category" isDark={isDark}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: selectedCat.color }]} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? '#E2E8F0' : '#0F172A' }}>{selectedExpense.category}</Text>
              </View>
            </DetailRow>
            <DetailRow label="Date" isDark={isDark}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? '#E2E8F0' : '#0F172A' }}>{fmtDate(selectedExpense.expense_date)}</Text>
            </DetailRow>
            <DetailRow label="Status" isDark={isDark}>
              <StatusBadge status={selectedExpense.status} isDark={isDark} />
            </DetailRow>
            {selectedExpense.description && (
              <View style={[styles.descBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }]}>
                <Text style={[styles.descBoxText, { color: isDark ? '#94A3B8' : '#475569' }]}>{selectedExpense.description}</Text>
              </View>
            )}
          </>
        )}
      </BottomSheet>

    </View></TourTarget>
  );
}

// ─── Root Styles ──────────────────────────────────────────────────────────────
const getStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 20, paddingBottom: 110 },

  // Empty state
  emptyWrap: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyIconWrap: { width: 70, height: 70, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  emptySub: { fontSize: 13, fontWeight: '500' },

  // FAB
  fabWrap: {
    position: 'absolute', bottom: 32, right: 24,
    borderRadius: 28,
    shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45, shadowRadius: 20, elevation: 16,
  },
  fabWrapSecondary: {
    position: 'absolute', bottom: 32, right: 96,
    borderRadius: 24,
    shadowColor: '#6366F1', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
  },
  fabSecondary: {
    width: 52,
    height: 52,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  fab: { width: 60, height: 60, borderRadius: 28, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  fabGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 30, borderRadius: 28 },

  // Submit
  submitWrap: {
    borderRadius: 16, marginTop: 6, marginBottom: 8,
    shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.30, shadowRadius: 16, elevation: 10,
  },
  submitBtn: { height: 54, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, overflow: 'hidden' },
  submitGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 28, borderRadius: 16 },
  submitTxt: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },

  // Amount hero in details
  amountHero: {
    borderRadius: 20, padding: 22, flexDirection: 'row', alignItems: 'center',
    gap: 14, marginBottom: 6, overflow: 'hidden',
  },
  amountHeroIcon: { width: 48, height: 48, borderRadius: 15, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  amountHeroVal: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.8, flex: 1 },
  amountHeroTitle: { fontSize: 13, color: 'rgba(255,255,255,0.72)', fontWeight: '600', position: 'absolute', bottom: 14, left: 84, right: 20 },

  // Description box
  descBox: { borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 1, marginBottom: 4 },
  descBoxText: { fontSize: 14, fontWeight: '500', lineHeight: 21 },

  // Action row
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  actionBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  actionGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14 },
  actionTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // Warning banner
  warnBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1 },
  warnText: { fontSize: 13, fontWeight: '700' },

  // Delete actions
  deleteActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  cancelTxt: { fontSize: 15, fontWeight: '700' },
  deleteBtn: { flex: 2, borderRadius: 14, overflow: 'hidden', shadowColor: '#EF4444', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  deleteBtnGrad: { height: 50, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderRadius: 14 },
  deleteTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
