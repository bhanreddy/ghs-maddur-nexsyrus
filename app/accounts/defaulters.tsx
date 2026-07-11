import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import AdminHeader from '../../src/components/AdminHeader';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import { useTheme } from '../../src/hooks/useTheme';
import LogoLoader from '../../src/components/LogoLoader';
import { DefaulterService, DefaulterStudent, DefaulterYearBreakdown } from '../../src/services/defaulterService';
import { StudentService } from '../../src/services/studentService';
import { ClassService } from '../../src/services/classService';
import { AcademicYearService } from '../../src/services/academicYearService';
import type { Student } from '../../src/types/models';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { APIError } from '../../src/services/apiClient';
import { generateUUID } from './fees/collect';

const fmtINR = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const PAYMENT_MODES = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI' },
  { id: 'cheque', label: 'Cheque' },
] as const;

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const focused = useSharedValue(0);
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: focused.value === 1 ? '#6366F1' : 'rgba(0,0,0,0.08)',
    borderWidth: focused.value === 1 ? 1.5 : 1,
  }));

  return (
    <Animated.View style={[st.searchWrap, ds.searchBarWrapper, { backgroundColor: '#fff' }, borderStyle]}>
      <Ionicons name="search-outline" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
      <AppTextInput
        style={[ds.inputInChrome, st.searchInput, { color: '#0F172A' }]}
        placeholder="Search by name or admission no…"
        placeholderTextColor="#94A3B8"
        value={value}
        onChangeText={onChange}
        onFocus={() => { focused.value = withTiming(1, { duration: 160 }); }}
        onBlur={() => { focused.value = withTiming(0, { duration: 180 }); }}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChange('')}>
          <Ionicons name="close-circle" size={18} color="#94A3B8" />
        </Pressable>
      )}
    </Animated.View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[st.chip, active ? st.chipActive : st.chipIdle]}
    >
      <Text style={[st.chipText, active && st.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function YearBreakdownRow({
  item,
  onCollect,
}: {
  item: DefaulterYearBreakdown;
  onCollect: (due: DefaulterYearBreakdown) => void;
}) {
  return (
    <View style={st.breakdownRow}>
      <View style={{ flex: 1 }}>
        <Text style={st.breakdownYear}>{item.due_academic_year}</Text>
        <Text style={st.breakdownMeta}>
          Paid {fmtINR(item.paid_amount)} of {fmtINR(item.original_amount)}
          {item.source === 'manual_legacy' ? ' · Manual' : ' · Carried forward'}
        </Text>
      </View>
      <Text style={st.breakdownBalance}>{fmtINR(item.balance)}</Text>
      <Pressable style={st.collectBtn} onPress={() => onCollect(item)}>
        <Text style={st.collectBtnText}>Collect</Text>
      </Pressable>
    </View>
  );
}

function DefaulterCard({
  item,
  index,
  expanded,
  onToggle,
  onCollect,
  onRemind,
  reminding,
}: {
  item: DefaulterStudent;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onCollect: (due: DefaulterYearBreakdown) => void;
  onRemind: () => void;
  reminding: boolean;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 45).duration(400).springify()}>
      <Pressable style={st.card} onPress={onToggle}>
        <LinearGradient
            colors={['rgba(255,255,255,1)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 0.8 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
            pointerEvents="none"
        />
        <View style={st.cardAccent} />
        <View style={st.cardBody}>
          <View style={st.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={st.studentName}>{item.student_name}</Text>
              <Text style={st.studentMeta}>
                {item.admission_no}
                {item.class_name ? ` · ${item.class_name}` : ''}
                {item.section_name ? ` ${item.section_name}` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={st.totalBalance}>{fmtINR(Number(item.total_balance))}</Text>
              <Text style={st.totalLabel}>Previous-year due</Text>
              <Pressable
                style={[st.remindBtn, reminding && st.remindBtnDisabled]}
                onPress={(e) => { e.stopPropagation?.(); onRemind(); }}
                disabled={reminding}
              >
                {reminding ? (
                  <ActivityIndicator size="small" color="#4338CA" />
                ) : (
                  <>
                    <Ionicons name="notifications-outline" size={13} color="#4338CA" />
                    <Text style={st.remindBtnText}>Remind</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
          <View style={st.expandRow}>
            <Text style={st.expandHint}>
              {expanded ? 'Hide' : 'Show'} {item.year_breakdown?.length || 0} year breakdown
            </Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#64748B" />
          </View>
          {expanded && (
            <View style={st.breakdownBox}>
              {(item.year_breakdown || []).map((yr) => (
                <YearBreakdownRow key={yr.id} item={yr} onCollect={onCollect} />
              ))}
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <Pressable style={st.sheetOverlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.sheetKv}>
          <Pressable style={st.sheet} onPress={() => {}}>
            <View style={st.sheetHandle} />
            <Text style={st.sheetTitle}>{title}</Text>
            {subtitle ? <Text style={st.sheetSubtitle}>{subtitle}</Text> : null}
            {children}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

export default function DefaultersScreen() {
  const { theme } = useTheme();
  const { shellActive } = useAccountsWebChrome();
  const showHeader = !shellActive;

  const [loading, setLoading] = useState(true);
  const [defaulters, setDefaulters] = useState<DefaulterStudent[]>([]);
  const [activeYear, setActiveYear] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [priorYears, setPriorYears] = useState<string[]>([]);

  const [addVisible, setAddVisible] = useState(false);
  const [collectVisible, setCollectVisible] = useState(false);
  const [selectedDue, setSelectedDue] = useState<DefaulterYearBreakdown | null>(null);
  const [selectedStudentName, setSelectedStudentName] = useState('');

  const [studentQuery, setStudentQuery] = useState('');
  const [studentResults, setStudentResults] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [addYear, setAddYear] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addRemarks, setAddRemarks] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [collectAmount, setCollectAmount] = useState('');
  const [collectMode, setCollectMode] = useState<'cash' | 'upi' | 'cheque'>('cash');
  const [collectRemarks, setCollectRemarks] = useState('');
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [bulkReminding, setBulkReminding] = useState(false);

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    defaulters.forEach((d) => d.year_breakdown?.forEach((y) => years.add(y.due_academic_year)));
    return Array.from(years).sort();
  }, [defaulters]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, classList, allYears] = await Promise.all([
        DefaulterService.list({
          search: search.trim() || undefined,
          class_filter: classFilter || undefined,
          year_filter: yearFilter || undefined,
        }),
        ClassService.getClasses(),
        AcademicYearService.getAllYears(),
      ]);

      const activeYearCode = listRes.active_academic_year
        || (await ClassService.getCurrentAcademicYear())?.code
        || '';

      setDefaulters(listRes.defaulters || []);
      setActiveYear(activeYearCode);
      setClasses(classList || []);

      const currentStart = parseInt(activeYearCode.split('-')[0], 10) || 9999;
      const prior = (allYears || [])
        .map((y) => y.code)
        .filter((code) => {
          const start = parseInt(code.split('-')[0], 10);
          return Number.isFinite(start) && start < currentStart;
        })
        .sort((a, b) => parseInt(a.split('-')[0], 10) - parseInt(b.split('-')[0], 10));
      setPriorYears(prior);
      if (!addYear && prior.length > 0) setAddYear(prior[prior.length - 1]);
    } catch (err) {
      const msg = err instanceof APIError ? err.message : 'Failed to load defaulters';
      alertCompat('Error', msg);
    } finally {
      setLoading(false);
    }
  }, [search, classFilter, yearFilter, addYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!studentQuery.trim()) {
      setStudentResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const results = await StudentService.search(studentQuery.trim());
        setStudentResults(results);
      } catch {
        setStudentResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [studentQuery]);

  const resetAddForm = () => {
    setStudentQuery('');
    setStudentResults([]);
    setSelectedStudent(null);
    setAddAmount('');
    setAddRemarks('');
    setAddError(null);
  };

  const handleAddDue = async () => {
    setAddError(null);
    if (!selectedStudent || !addYear || !addAmount) {
      setAddError('Select a student, academic year, and amount.');
      return;
    }
    const amount = Number(addAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setAddError('Enter a positive amount.');
      return;
    }

    setSubmitting(true);
    try {
      await DefaulterService.create({
        student_id: selectedStudent.id,
        due_academic_year: addYear,
        amount,
        remarks: addRemarks.trim() || undefined,
      });
      setAddVisible(false);
      resetAddForm();
      await loadData();
      alertCompat('Success', 'Previous year due added.');
    } catch (err) {
      // Inline, user-actionable messages for the two expected rejections.
      if (err instanceof APIError && err.status === 409) {
        setAddError('A due for this student and year already exists.');
      } else if (err instanceof APIError && err.status === 400) {
        setAddError('Only past academic years are allowed.');
      } else {
        setAddError(err instanceof APIError ? err.message : 'Failed to add due.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openCollect = (due: DefaulterYearBreakdown, studentName: string) => {
    setSelectedDue(due);
    setSelectedStudentName(studentName);
    setCollectAmount(String(due.balance));
    setCollectMode('cash');
    setCollectRemarks('');
    setCollectVisible(true);
  };

  const handleRemindStudent = async (studentId: string) => {
    setRemindingId(studentId);
    try {
      const result = await DefaulterService.remind({ student_id: studentId });
      alertCompat(
        'Reminder sent',
        result.notifications_sent > 0
          ? `Notification sent to student/parent (${result.notifications_sent} device${result.notifications_sent === 1 ? '' : 's'}).`
          : 'No active devices found for this student or their parents.'
      );
    } catch (err) {
      const msg = err instanceof APIError ? err.message : 'Failed to send reminder';
      alertCompat('Error', msg);
    } finally {
      setRemindingId(null);
    }
  };

  const handleRemindAll = async () => {
    if (defaulters.length === 0) return;
    setBulkReminding(true);
    try {
      const result = await DefaulterService.remind({
        search: search.trim() || undefined,
        class_filter: classFilter || undefined,
        year_filter: yearFilter || undefined,
      });
      alertCompat(
        'Reminders sent',
        `Queued reminders for ${result.student_count} student${result.student_count === 1 ? '' : 's'} (${result.notifications_sent} notification${result.notifications_sent === 1 ? '' : 's'}).`
      );
    } catch (err) {
      const msg = err instanceof APIError ? err.message : 'Failed to send reminders';
      alertCompat('Error', msg);
    } finally {
      setBulkReminding(false);
    }
  };

  const handleCollect = async () => {
    if (!selectedDue) return;
    const amount = Number(collectAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alertCompat('Invalid amount', 'Enter a positive amount.');
      return;
    }
    if (amount > Number(selectedDue.balance)) {
      alertCompat('Overpayment', `Amount cannot exceed balance of ${fmtINR(selectedDue.balance)}.`);
      return;
    }

    setSubmitting(true);
    try {
      const result = await DefaulterService.collect(selectedDue.id, {
        amount,
        payment_method: collectMode,
        transaction_ref: generateUUID(),
        remarks: collectRemarks.trim() || undefined,
      });
      setCollectVisible(false);
      setSelectedDue(null);
      await loadData();
      alertCompat(
        'Payment recorded',
        `Receipt ${result.receipt.receipt_no} created for ${fmtINR(amount)}.`
      );
    } catch (err) {
      const msg = err instanceof APIError ? err.message : 'Collection failed';
      alertCompat('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[st.root, { backgroundColor: theme.colors.background }]}>
      {showHeader && <AdminHeader title="Defaulters" showBackButton />}

      <SearchBar value={search} onChange={setSearch} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.filterScroll} contentContainerStyle={st.filterRow}>
        <FilterChip label="All classes" active={!classFilter} onPress={() => setClassFilter('')} />
        {classes.map((c) => (
          <FilterChip
            key={c.id}
            label={c.name}
            active={classFilter === c.id}
            onPress={() => setClassFilter(classFilter === c.id ? '' : c.id)}
          />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.filterScroll} contentContainerStyle={st.filterRow}>
        <FilterChip label="All years" active={!yearFilter} onPress={() => setYearFilter('')} />
        {yearOptions.map((y) => (
          <FilterChip
            key={y}
            label={y}
            active={yearFilter === y}
            onPress={() => setYearFilter(yearFilter === y ? '' : y)}
          />
        ))}
      </ScrollView>

      <View style={st.banner}>
        <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
        <Text style={st.bannerText}>
          Showing unpaid balances from years before {activeYear || 'the active year'}. Current-year dues are not listed here.
        </Text>
      </View>

      <View style={st.actionRow}>
        <Pressable
          style={[st.remindAllBtn, bulkReminding && st.remindBtnDisabled]}
          onPress={handleRemindAll}
          disabled={bulkReminding || defaulters.length === 0}
        >
          {bulkReminding ? (
            <ActivityIndicator size="small" color="#4338CA" />
          ) : (
            <>
              <Ionicons name="notifications" size={18} color="#4338CA" />
              <Text style={st.remindAllText}>Send Reminders</Text>
            </>
          )}
        </Pressable>
        <Pressable style={st.addFab} onPress={() => { resetAddForm(); setAddVisible(true); }}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={st.addFabText}>Add Previous-Year Due</Text>
        </Pressable>
      </View>

      {loading ? (
        <LogoLoader />
      ) : defaulters.length === 0 ? (
        <View style={st.empty}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
          <Text style={st.emptyTitle}>No defaulters</Text>
          <Text style={st.emptyText}>
            No students have unpaid balances from previous academic years.
          </Text>
        </View>
      ) : (
        <FlatList
          data={defaulters}
          keyExtractor={(item) => item.student_id}
          contentContainerStyle={st.listContent}
          renderItem={({ item, index }) => (
            <DefaulterCard
              item={item}
              index={index}
              expanded={expandedId === item.student_id}
              onToggle={() => setExpandedId(expandedId === item.student_id ? null : item.student_id)}
              onCollect={(due) => openCollect(due, item.student_name)}
              onRemind={() => handleRemindStudent(item.student_id)}
              reminding={remindingId === item.student_id}
            />
          )}
        />
      )}

      <BottomSheet
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        title="Add Previous-Year Due"
        subtitle="Seed legacy arrears for first-year onboarding"
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={st.fieldLabel}>Student</Text>
          <AppTextInput
            style={st.fieldInput}
            placeholder="Search name or admission no"
            value={studentQuery}
            onChangeText={(v) => { setStudentQuery(v); setSelectedStudent(null); }}
          />
          {studentResults.length > 0 && !selectedStudent && (
            <View style={st.suggestBox}>
              {studentResults.map((s) => (
                <Pressable
                  key={s.id}
                  style={st.suggestItem}
                  onPress={() => {
                    setSelectedStudent(s);
                    setStudentQuery(s.display_name || `${s.first_name} ${s.last_name}`);
                    setStudentResults([]);
                  }}
                >
                  <Text style={st.suggestName}>{s.display_name || `${s.first_name} ${s.last_name}`}</Text>
                  <Text style={st.suggestMeta}>{s.admission_no}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={st.fieldLabel}>Academic year (before {activeYear})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
            {priorYears.map((y) => (
              <FilterChip
                key={y}
                label={y}
                active={addYear === y}
                onPress={() => setAddYear(y)}
              />
            ))}
          </ScrollView>

          <Text style={st.fieldLabel}>Amount (₹)</Text>
          <AppTextInput
            style={st.fieldInput}
            keyboardType="numeric"
            value={addAmount}
            onChangeText={setAddAmount}
            placeholder="e.g. 4000"
          />

          <Text style={st.fieldLabel}>Remark (optional)</Text>
          <AppTextInput
            style={st.fieldInput}
            value={addRemarks}
            onChangeText={setAddRemarks}
            placeholder="Legacy arrears note"
          />

          {addError ? (
            <View style={st.inlineError}>
              <Text style={st.inlineErrorText}>{addError}</Text>
            </View>
          ) : null}

          <Pressable style={st.primaryBtn} onPress={handleAddDue} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryBtnText}>Save due</Text>}
          </Pressable>
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={collectVisible}
        onClose={() => setCollectVisible(false)}
        title="Collect arrears"
        subtitle={selectedDue ? `${selectedStudentName} · ${selectedDue.due_academic_year}` : undefined}
      >
        <Text style={st.fieldLabel}>Amount (max {fmtINR(Number(selectedDue?.balance || 0))})</Text>
        <AppTextInput
          style={st.fieldInput}
          keyboardType="numeric"
          value={collectAmount}
          onChangeText={setCollectAmount}
        />

        <Text style={st.fieldLabel}>Payment mode</Text>
        <View style={st.modeRow}>
          {PAYMENT_MODES.map((m) => (
            <FilterChip
              key={m.id}
              label={m.label}
              active={collectMode === m.id}
              onPress={() => setCollectMode(m.id)}
            />
          ))}
        </View>

        <Text style={st.fieldLabel}>Remark (optional)</Text>
        <AppTextInput
          style={st.fieldInput}
          value={collectRemarks}
          onChangeText={setCollectRemarks}
        />

        <Pressable style={st.primaryBtn} onPress={handleCollect} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryBtnText}>Collect & generate receipt</Text>}
        </Pressable>
      </BottomSheet>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500' },
  filterScroll: { maxHeight: 44, marginBottom: 4 },
  filterRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipIdle: { backgroundColor: '#fff', borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: '#4338CA' },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 20,
    marginVertical: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  bannerText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  remindAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  remindAllText: { color: '#4338CA', fontWeight: '700', fontSize: 13 },
  remindBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  remindBtnDisabled: { opacity: 0.6 },
  remindBtnText: { color: '#4338CA', fontSize: 11, fontWeight: '800' },
  addFab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addFabText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  listContent: { paddingHorizontal: 20, paddingBottom: 32 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    borderBottomWidth: 4,
    borderBottomColor: '#FECACA',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  cardAccent: { height: 6, backgroundColor: '#EF4444', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  cardBody: { padding: 18 },
  cardTop: { flexDirection: 'row', gap: 12 },
  studentName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  studentMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  totalBalance: { fontSize: 18, fontWeight: '800', color: '#DC2626' },
  totalLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '700', letterSpacing: 0.5 },
  expandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  expandHint: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  breakdownBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 8, gap: 8 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownYear: { fontSize: 14, fontWeight: '700', color: '#334155' },
  breakdownMeta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  breakdownBalance: { fontSize: 14, fontWeight: '800', color: '#B91C1C' },
  collectBtn: { backgroundColor: '#059669', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  collectBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 12 },
  emptyText: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 6 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheetKv: { width: '100%' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  sheetSubtitle: { fontSize: 13, color: '#64748B', marginTop: 4, marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', marginTop: 12, marginBottom: 6 },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  suggestBox: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, marginTop: 4, overflow: 'hidden' },
  suggestItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  suggestName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  suggestMeta: { fontSize: 12, color: '#64748B' },
  modeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  primaryBtn: {
    marginTop: 20,
    marginBottom: 8,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  inlineError: {
    marginTop: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  inlineErrorText: { color: '#991B1B', fontSize: 13, fontWeight: '600' },
});
