import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Linking,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenLayout from '../../src/components/ScreenLayout';
import AdminHeader from '../../src/components/AdminHeader';
import LogoLoader from '../../src/components/LogoLoader';
import { useTheme } from '../../src/hooks/useTheme';
import { GlassSurfaces, PremiumGradients, Theme } from '../../src/theme/themes';
import {
  FeeRecoveryService,
  FeeDefaulterItem,
  FeeRecoveryOverview,
} from '../../src/services/feeRecoveryService';
import { ClassService, ClassInfo } from '../../src/services/classService';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const PAID_RANGE_PRESETS = [
  { label: 'All Dues', min: undefined, max: undefined },
  { label: 'Unpaid (0%)', min: 0, max: 0 },
  { label: 'Partial (<50%)', min: 0, max: 49.99 },
  { label: '50% – 99%', min: 50, max: 99.99 },
  { label: 'Custom', min: -1, max: -1 },
];

const AVATAR_COLORS = [
  '#7C3AED',
  '#2563EB',
  '#059669',
  '#DB2777',
  '#D97706',
  '#0891B2',
  '#DC2626',
  '#4F46E5',
];

function initialsFor(name: string): string {
  return (
    (name || '?')
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const PAGE_LIMIT = 20;

export default function FeeRemindersAdmin() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);

  // Filters State
  const currentMonthName = useMemo(
    () => new Date().toLocaleString('default', { month: 'long' }),
    []
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthName);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);
  const [customMinInput, setCustomMinInput] = useState<string>('0');
  const [customMaxInput, setCustomMaxInput] = useState<string>('100');
  const [activeRange, setActiveRange] = useState<{ min?: number; max?: number }>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedAgeing, setSelectedAgeing] = useState<string | null>(null);

  // Pagination & List State
  const [students, setStudents] = useState<FeeDefaulterItem[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Overview metrics state
  const [overview, setOverview] = useState<FeeRecoveryOverview | null>(null);

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal State for Dispatching
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [customMessage, setCustomMessage] = useState<string>('');
  const [targetStudentForModal, setTargetStudentForModal] = useState<FeeDefaulterItem | null>(null);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load initial classes & overview stats
  useEffect(() => {
    const initData = async () => {
      try {
        const [classList, overviewRes] = await Promise.all([
          ClassService.getClasses().catch(() => []),
          FeeRecoveryService.getOverview().catch(() => null),
        ]);
        setClasses(classList || []);
        if (overviewRes) setOverview(overviewRes);
      } catch {
        // Handled silently
      }
    };
    initData();
  }, []);

  // Fetch defaulters list
  const fetchDefaulters = useCallback(
    async (targetPage = 1, isRefresh = false) => {
      if (targetPage === 1) {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setInitialLoading(true);
        }
      } else {
        setLoadingMore(true);
      }

      try {
        const res = await FeeRecoveryService.getDefaulters({
          page: targetPage,
          limit: PAGE_LIMIT,
          class_id: selectedClass || undefined,
          search: debouncedSearch || undefined,
          min_paid_percent: activeRange.min,
          max_paid_percent: activeRange.max,
          ageing_stage: selectedAgeing || undefined,
        });

        if (targetPage === 1) {
          setStudents(res.data || []);
        } else {
          setStudents((prev) => [...prev, ...(res.data || [])]);
        }

        setPage(res.pagination.page);
        setTotalPages(res.pagination.total_pages);
        setTotalCount(res.pagination.total);
      } catch (err: any) {
        if (targetPage === 1) {
          setStudents([]);
        }
      } finally {
        setInitialLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [selectedClass, debouncedSearch, activeRange, selectedAgeing]
  );

  // Trigger fetch when any primary filter changes
  useEffect(() => {
    fetchDefaulters(1);
    setSelectedIds(new Set());
  }, [fetchDefaulters]);

  // Pull to refresh handler
  const handleRefresh = useCallback(() => {
    fetchDefaulters(1, true);
    FeeRecoveryService.getOverview()
      .then((res) => setOverview(res))
      .catch(() => {});
  }, [fetchDefaulters]);

  // Load more on scroll reached end
  const handleLoadMore = useCallback(() => {
    if (!loadingMore && !initialLoading && page < totalPages) {
      fetchDefaulters(page + 1);
    }
  }, [loadingMore, initialLoading, page, totalPages, fetchDefaulters]);

  // Preset Paid Filter selection
  const handleSelectPreset = (index: number) => {
    setSelectedPresetIndex(index);
    const preset = PAID_RANGE_PRESETS[index];
    if (preset.label === 'Custom') {
      // Don't apply until user hits apply
      return;
    }
    setActiveRange({ min: preset.min, max: preset.max });
  };

  const handleApplyCustomRange = () => {
    const min = Number(customMinInput);
    const max = Number(customMaxInput);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 100 || min > max) {
      alertCompat(
        'Invalid percentage',
        'Enter numbers between 0 and 100 where min does not exceed max.'
      );
      return;
    }
    setActiveRange({ min, max });
  };

  // Toggle selection for a single student
  const toggleSelectStudent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle select all visible
  const toggleSelectAll = () => {
    if (selectedIds.size === students.length && students.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(students.map((s) => s.student_id)));
    }
  };

  // Calculate selected total outstanding
  const selectedSummary = useMemo(() => {
    let totalAmt = 0;
    let count = 0;
    for (const s of students) {
      if (selectedIds.has(s.student_id)) {
        totalAmt += Number(s.total_outstanding || 0);
        count++;
      }
    }
    return { count, totalAmt };
  }, [students, selectedIds]);

  // Open confirmation modal for sending
  const handleOpenBulkSend = () => {
    if (selectedIds.size === 0) {
      alertCompat('Select Students', 'Please select at least one student to send a reminder.');
      return;
    }
    setTargetStudentForModal(null);
    setCustomMessage(
      `Fee Reminder: An outstanding balance is due for ${selectedMonth}. Kindly clear the pending fees promptly to ensure uninterrupted academic services. Thank you.`
    );
    setModalVisible(true);
  };

  const handleOpenSingleSend = (student: FeeDefaulterItem) => {
    setTargetStudentForModal(student);
    setCustomMessage(
      `Fee Reminder: ₹${Number(student.total_outstanding || 0).toLocaleString(
        'en-IN'
      )} is pending for ${student.student_name} for ${selectedMonth}. Kindly clear the dues at your earliest convenience.`
    );
    setModalVisible(true);
  };

  // Send reminders
  const handleConfirmSend = async () => {
    setIsSending(true);
    try {
      const idsToSend = targetStudentForModal
        ? [targetStudentForModal.student_id]
        : Array.from(selectedIds);

      const result = await FeeRecoveryService.sendReminders(idsToSend, customMessage);

      setModalVisible(false);

      const skippedList = result.skipped_details || [];
      const hasNoPush = skippedList.some((s) => s.reason === 'NO_PUSH_RECIPIENTS');
      const hasCooldown = skippedList.some((s) => s.reason === 'IDEMPOTENCY_OR_COOLDOWN');

      if (result.dispatched_count > 0 && result.skipped_count === 0) {
        alertCompat(
          'Reminders Sent',
          `Successfully dispatched fee push reminder to ${result.dispatched_count} student(s).`
        );
      } else if (result.dispatched_count > 0 && result.skipped_count > 0) {
        alertCompat(
          'Reminders Partially Sent',
          `Dispatched: ${result.dispatched_count}\nSkipped: ${result.skipped_count}\n\nNote: Skipped students do not have the mobile app installed / registered for push notifications, or were already reminded today.`
        );
      } else if (result.skipped_count > 0) {
        let explanation = 'Push reminder could not be delivered.';
        if (hasNoPush) {
          explanation = 'The reminder was saved to the student\'s in-app portal inbox, but cannot be sent as a lockscreen push notification because neither the student nor parent has logged into the mobile app yet (no push device registered).\n\nTip: You can use the "Call" button to contact the parent directly.';
        } else if (hasCooldown) {
          explanation = 'A fee reminder was already sent to this student today. Daily cooldown is active to avoid spamming parents. You can call the parent directly if urgent.';
        }
        alertCompat(
          'Push Notification Skipped',
          `Dispatched: 0\nEligible: ${result.eligible_count}\nSkipped: ${result.skipped_count}\n\n${explanation}`
        );
      } else if (result.error_count > 0) {
        alertCompat('Dispatch Failed', `Encountered errors sending to ${result.error_count} student(s). Please try again later.`);
      } else {
        alertCompat('Reminders', 'No eligible defaulters found to remind.');
      }
      // Clear selection and refresh list
      setSelectedIds(new Set());
      fetchDefaulters(1, true);
    } catch (err: any) {
      alertCompat('Dispatch Failed', err.message || 'Failed to send fee reminders.');
    } finally {
      setIsSending(false);
    }
  };

  // Call parent directly
  const handleCallParent = (phone?: string) => {
    if (!phone) {
      alertCompat('No Phone Number', 'No contact number available for this student.');
      return;
    }
    Linking.openURL(`tel:${encodeURIComponent(phone.trim())}`).catch(() => {
      alertCompat('Unable to Call', 'Could not launch phone dialer.');
    });
  };

  // Render individual student card
  const renderStudentItem = ({ item }: { item: FeeDefaulterItem }) => {
    const isSelected = selectedIds.has(item.student_id);
    const paidPct = Math.round(Number(item.paid_percentage ?? 0));
    const outstanding = Number(item.total_outstanding || 0);
    const totalDue = Number(item.total_due || outstanding);
    const totalPaid = Number(item.total_paid || 0);
    const daysOverdue = Number(item.days_overdue || 0);
    const parentPhone = item.parent_contact?.phone;
    const parentName = item.parent_contact?.parent_name;

    const urgencyColor =
      daysOverdue >= 60 ? '#EF4444' : daysOverdue >= 30 ? '#F59E0B' : '#3B82F6';

    return (
      <View
        style={[
          styles.studentCard,
          isSelected && styles.studentCardSelected,
          { backgroundColor: isDark ? 'rgba(30,41,59,0.72)' : '#FFFFFF' },
        ]}
      >
        {/* Top Row: Checkbox, Avatar, Name, Class & Amount */}
        <View style={styles.cardHeaderRow}>
          <TouchableOpacity
            style={styles.checkboxTouchable}
            onPress={() => toggleSelectStudent(item.student_id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isSelected ? 'checkbox' : 'square-outline'}
              size={24}
              color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
            />
          </TouchableOpacity>

          <View style={[styles.avatarCircle, { backgroundColor: colorFor(item.student_name) }]}>
            <Text style={styles.avatarText}>{initialsFor(item.student_name)}</Text>
          </View>

          <View style={styles.studentInfoCol}>
            <Text style={[styles.studentName, { color: theme.colors.text }]} numberOfLines={1}>
              {item.student_name}
            </Text>
            <View style={styles.subMetaRow}>
              <Text style={styles.admissionText}>Adm: {item.admission_no || 'N/A'}</Text>
              <View style={styles.classBadge}>
                <Text style={styles.classBadgeText}>
                  {item.class_name || 'Class'}
                  {item.section_name ? ` • ${item.section_name}` : ''}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.outstandingCol}>
            <Text style={styles.outstandingLabel}>DUE</Text>
            <Text style={styles.outstandingValue}>₹{outstanding.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        {/* Progress bar of Paid percentage */}
        <View style={styles.progressContainer}>
          <View style={styles.progressLabelRow}>
            <Text style={[styles.progressDetailText, { color: theme.colors.textSecondary }]}>
              Paid: ₹{totalPaid.toLocaleString('en-IN')} / ₹{totalDue.toLocaleString('en-IN')}
            </Text>
            <Text style={[styles.progressPercentText, { color: theme.colors.primary }]}>
              {paidPct}% Paid
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(Math.max(paidPct, 0), 100)}%`,
                  backgroundColor:
                    paidPct >= 75 ? '#10B981' : paidPct >= 40 ? '#3B82F6' : '#F59E0B',
                },
              ]}
            />
          </View>
        </View>

        {/* Footer: Overdue badge, Parent name & Actions */}
        <View style={styles.cardFooterRow}>
          <View style={styles.footerLeft}>
            {daysOverdue > 0 ? (
              <View style={[styles.overdueBadge, { backgroundColor: `${urgencyColor}18` }]}>
                <Ionicons name="time-outline" size={13} color={urgencyColor} />
                <Text style={[styles.overdueText, { color: urgencyColor }]}>
                  {daysOverdue}d Overdue
                </Text>
              </View>
            ) : (
              <View style={[styles.overdueBadge, { backgroundColor: 'rgba(16,185,129,0.14)' }]}>
                <Ionicons name="checkmark-circle-outline" size={13} color="#10B981" />
                <Text style={[styles.overdueText, { color: '#10B981' }]}>Current Dues</Text>
              </View>
            )}

            {parentName ? (
              <Text
                style={[styles.parentNameText, { color: theme.colors.textSecondary }]}
                numberOfLines={1}
              >
                {parentName}
              </Text>
            ) : null}
          </View>

          <View style={styles.actionsRow}>
            {parentPhone ? (
              <TouchableOpacity
                style={styles.callIconButton}
                onPress={() => handleCallParent(parentPhone)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="call" size={15} color="#10B981" />
                <Text style={styles.callButtonText}>Call</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.singleRemindButton}
              onPress={() => handleOpenSingleSend(item)}
            >
              <Feather name="bell" size={13} color="#FFFFFF" />
              <Text style={styles.singleRemindText}>Remind</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // Header component for FlatList (Stats + All Filter Controls)
  const renderListHeader = () => {
    const isAllSelected = selectedIds.size > 0 && selectedIds.size === students.length;
    const isCustomActive = selectedPresetIndex === 4;

    return (
      <View style={styles.listHeaderContainer}>
        {/* ── Executive Overview Mini-Cards ── */}
        <View style={styles.statsGrid}>
          {/* Card 1: Outstanding Balance */}
          <LinearGradient
            colors={isDark ? ['#1E1B4B', '#0F172A'] : ['#FEF2F2', '#FFF1F2']}
            style={styles.statCard}
          >
            <View style={styles.statIconWrap}>
              <MaterialCommunityIcons name="currency-inr" size={20} color="#EF4444" />
            </View>
            <Text style={[styles.statValue, { color: '#EF4444' }]}>
              ₹
              {Number(overview?.summary?.total_outstanding || 0).toLocaleString('en-IN', {
                maximumFractionDigits: 0,
              })}
            </Text>
            <Text style={[styles.statTitle, { color: theme.colors.textSecondary }]}>
              Total Outstanding
            </Text>
          </LinearGradient>

          {/* Card 2: Defaulter Students */}
          <LinearGradient
            colors={isDark ? ['#1E293B', '#0F172A'] : ['#EFF6FF', '#F0F9FF']}
            style={styles.statCard}
          >
            <View style={styles.statIconWrap}>
              <Feather name="users" size={18} color="#3B82F6" />
            </View>
            <Text style={[styles.statValue, { color: '#3B82F6' }]}>
              {overview?.summary?.outstanding_students_count || totalCount || 0}
            </Text>
            <Text style={[styles.statTitle, { color: theme.colors.textSecondary }]}>
              Total Defaulters
            </Text>
          </LinearGradient>

          {/* Card 3: Collection Efficiency */}
          <LinearGradient
            colors={isDark ? ['#064E3B', '#0F172A'] : ['#ECFDF5', '#F0FDF4']}
            style={styles.statCard}
          >
            <View style={styles.statIconWrap}>
              <Feather name="pie-chart" size={18} color="#10B981" />
            </View>
            <Text style={[styles.statValue, { color: '#10B981' }]}>
              {overview?.summary?.collection_efficiency ?? 0}%
            </Text>
            <Text style={[styles.statTitle, { color: theme.colors.textSecondary }]}>
              Collection Efficiency
            </Text>
          </LinearGradient>

          {/* Card 4: Selected Defaulters */}
          <LinearGradient
            colors={isDark ? ['#2E1065', '#0F172A'] : ['#F5F3FF', '#EDE9FE']}
            style={styles.statCard}
          >
            <View style={styles.statIconWrap}>
              <Ionicons name="checkbox-outline" size={19} color="#8B5CF6" />
            </View>
            <Text style={[styles.statValue, { color: '#8B5CF6' }]}>
              {selectedSummary.count}
            </Text>
            <Text style={[styles.statTitle, { color: theme.colors.textSecondary }]}>
              Selected for Reminder
            </Text>
          </LinearGradient>
        </View>

        {/* ── Search Bar ── */}
        <View style={styles.searchContainer}>
          <Ionicons
            name="search"
            size={18}
            color={theme.colors.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by student name or admission no..."
            placeholderTextColor={theme.colors.textTertiary}
            style={[styles.searchInput, { color: theme.colors.text }]}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Filter 1: Month Chips ── */}
        <View style={styles.filterSection}>
          <View style={styles.filterTitleRow}>
            <Text style={[styles.filterTitle, { color: theme.colors.text }]}>Reminder Month</Text>
            <Text style={[styles.filterSub, { color: theme.colors.textSecondary }]}>
              Active: {selectedMonth}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalChipsList}
          >
            {MONTHS.map((month) => {
              const isSelected = selectedMonth === month;
              return (
                <TouchableOpacity
                  key={month}
                  style={[
                    styles.chipPill,
                    isSelected && styles.chipPillActive,
                    {
                      backgroundColor: isSelected
                        ? theme.colors.primary
                        : isDark
                        ? 'rgba(255,255,255,0.06)'
                        : '#FFFFFF',
                    },
                  ]}
                  onPress={() => setSelectedMonth(month)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      isSelected && styles.chipTextActive,
                      { color: isSelected ? '#FFFFFF' : theme.colors.text },
                    ]}
                  >
                    {month}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Filter 2: Class Chips ── */}
        <View style={styles.filterSection}>
          <View style={styles.filterTitleRow}>
            <Text style={[styles.filterTitle, { color: theme.colors.text }]}>Class Filter</Text>
            {selectedClass && (
              <TouchableOpacity onPress={() => setSelectedClass(null)}>
                <Text style={styles.resetFilterText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalChipsList}
          >
            <TouchableOpacity
              style={[
                styles.chipPill,
                !selectedClass && styles.chipPillActive,
                {
                  backgroundColor: !selectedClass
                    ? theme.colors.primary
                    : isDark
                    ? 'rgba(255,255,255,0.06)'
                    : '#FFFFFF',
                },
              ]}
              onPress={() => setSelectedClass(null)}
            >
              <Text
                style={[
                  styles.chipText,
                  !selectedClass && styles.chipTextActive,
                  { color: !selectedClass ? '#FFFFFF' : theme.colors.text },
                ]}
              >
                All Classes
              </Text>
            </TouchableOpacity>

            {classes.map((cls) => {
              const isSelected = selectedClass === cls.id;
              return (
                <TouchableOpacity
                  key={cls.id}
                  style={[
                    styles.chipPill,
                    isSelected && styles.chipPillActive,
                    {
                      backgroundColor: isSelected
                        ? theme.colors.primary
                        : isDark
                        ? 'rgba(255,255,255,0.06)'
                        : '#FFFFFF',
                    },
                  ]}
                  onPress={() => setSelectedClass(cls.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      isSelected && styles.chipTextActive,
                      { color: isSelected ? '#FFFFFF' : theme.colors.text },
                    ]}
                  >
                    {cls.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Filter 3: Paid Percentage Range Chips ── */}
        <View style={styles.filterSection}>
          <View style={styles.filterTitleRow}>
            <Text style={[styles.filterTitle, { color: theme.colors.text }]}>
              Percentage Paid Range
            </Text>
            <Text style={[styles.filterSub, { color: theme.colors.textSecondary }]}>
              Target unpaid dues
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalChipsList}
          >
            {PAID_RANGE_PRESETS.map((preset, idx) => {
              const isSelected = selectedPresetIndex === idx;
              return (
                <TouchableOpacity
                  key={preset.label}
                  style={[
                    styles.chipPill,
                    isSelected && styles.chipPillActive,
                    {
                      backgroundColor: isSelected
                        ? theme.colors.primary
                        : isDark
                        ? 'rgba(255,255,255,0.06)'
                        : '#FFFFFF',
                    },
                  ]}
                  onPress={() => handleSelectPreset(idx)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      isSelected && styles.chipTextActive,
                      { color: isSelected ? '#FFFFFF' : theme.colors.text },
                    ]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Custom Range Inputs (if "Custom" preset active) */}
          {isCustomActive && (
            <View style={styles.customRangeRow}>
              <View style={styles.customInputWrap}>
                <TextInput
                  value={customMinInput}
                  onChangeText={setCustomMinInput}
                  keyboardType="decimal-pad"
                  style={[styles.customInput, { color: theme.colors.text }]}
                  placeholder="0"
                  placeholderTextColor={theme.colors.textTertiary}
                />
                <Text style={styles.customInputSuffix}>%</Text>
              </View>

              <Text style={[styles.customRangeTo, { color: theme.colors.textSecondary }]}>to</Text>

              <View style={styles.customInputWrap}>
                <TextInput
                  value={customMaxInput}
                  onChangeText={setCustomMaxInput}
                  keyboardType="decimal-pad"
                  style={[styles.customInput, { color: theme.colors.text }]}
                  placeholder="100"
                  placeholderTextColor={theme.colors.textTertiary}
                />
                <Text style={styles.customInputSuffix}>%</Text>
              </View>

              <TouchableOpacity style={styles.applyCustomBtn} onPress={handleApplyCustomRange}>
                <Text style={styles.applyCustomBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Student List Bar: Count & Select All ── */}
        <View style={styles.listSubHeaderRow}>
          <View>
            <Text style={[styles.listResultsCount, { color: theme.colors.text }]}>
              {totalCount} {totalCount === 1 ? 'Student' : 'Students'} with Dues
            </Text>
            <Text style={[styles.listResultsHelper, { color: theme.colors.textSecondary }]}>
              Scroll to load more • {students.length} loaded
            </Text>
          </View>

          {students.length > 0 && (
            <TouchableOpacity style={styles.selectAllBtn} onPress={toggleSelectAll}>
              <Ionicons
                name={isAllSelected ? 'checkbox' : 'square-outline'}
                size={18}
                color={theme.colors.primary}
              />
              <Text style={[styles.selectAllText, { color: theme.colors.primary }]}>
                {isAllSelected ? 'Deselect All' : `Select All (${students.length})`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // Footer for pagination loading indicator
  const renderListFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.paginationLoaderWrap}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={[styles.paginationLoaderText, { color: theme.colors.textSecondary }]}>
            Loading more defaulters...
          </Text>
        </View>
      );
    }
    if (students.length > 0 && page >= totalPages) {
      return (
        <View style={styles.paginationEndWrap}>
          <View style={styles.endDot} />
          <Text style={[styles.paginationEndText, { color: theme.colors.textTertiary }]}>
            All {totalCount} students loaded
          </Text>
          <View style={styles.endDot} />
        </View>
      );
    }
    return <View style={{ height: 100 }} />;
  };

  // Empty state when no records found
  const renderEmptyState = () => {
    if (initialLoading) {
      return (
        <View style={styles.emptyContainer}>
          <LogoLoader size={54} color={theme.colors.primary} />
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
            Loading defaulters...
          </Text>
          <Text style={[styles.emptySub, { color: theme.colors.textSecondary }]}>
            Fetching fee recovery records and analytics
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <Ionicons name="checkmark-done" size={38} color="#10B981" />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>No Defaulters Found</Text>
        <Text style={[styles.emptySub, { color: theme.colors.textSecondary }]}>
          No students with pending dues match your active filters and percentage criteria.
        </Text>
        <TouchableOpacity
          style={styles.emptyResetBtn}
          onPress={() => {
            setSelectedClass(null);
            setSelectedPresetIndex(0);
            setActiveRange({});
            setSearchQuery('');
            setSelectedAgeing(null);
          }}
        >
          <Text style={styles.emptyResetBtnText}>Reset All Filters</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScreenLayout>
      <TourTarget id="screen.admin-fee-reminders.overview"><AdminHeader title="Fee Reminders" showBackButton={true} hideAppSearch={true} /></TourTarget>

      {/* Main FlatList with true infinite scroll (fetch while scroll) */}
      <TourTarget id="screen.admin-fee-reminders.workspace" native><FlatList
        data={students}
        keyExtractor={(item) => item.student_id}
        renderItem={renderStudentItem}
        ListHeaderComponent={renderListHeader}
        ListFooterComponent={renderListFooter}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={[styles.listContent, { paddingBottom: 110 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      /></TourTarget>

      {/* ── Sticky Bottom Dispatch Bar ── */}
      {students.length > 0 && (
        <View
          style={[
            styles.bottomStickyBar,
            {
              backgroundColor: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.94)',
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={styles.bottomBarInfo}>
            <Text style={[styles.bottomBarCount, { color: theme.colors.text }]}>
              {selectedSummary.count > 0
                ? `${selectedSummary.count} Selected`
                : 'No students selected'}
            </Text>
            <Text style={styles.bottomBarAmount}>
              {selectedSummary.count > 0
                ? `Total Dues: ₹${selectedSummary.totalAmt.toLocaleString('en-IN')}`
                : 'Select students to send reminders'}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.sendBulkBtn,
              selectedSummary.count === 0 && styles.sendBulkBtnDisabled,
            ]}
            disabled={selectedSummary.count === 0}
            onPress={handleOpenBulkSend}
          >
            <LinearGradient
              colors={
                selectedSummary.count > 0
                  ? ['#4F46E5', '#6366F1']
                  : ['#94A3B8', '#94A3B8']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sendBulkGradient}
            >
              <Feather name="send" size={16} color="#FFFFFF" />
              <Text style={styles.sendBulkBtnText}>
                {selectedSummary.count > 0
                  ? `Send (${selectedSummary.count})`
                  : 'Send Reminders'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Confirmation & Custom Message Modal ── */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' },
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="notifications" size={24} color="#4F46E5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                  {targetStudentForModal ? 'Send Individual Reminder' : 'Confirm Bulk Reminders'}
                </Text>
                <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>
                  {targetStudentForModal
                    ? `To ${targetStudentForModal.student_name} (${targetStudentForModal.class_name || 'Class'})`
                    : `Sending to ${selectedSummary.count} selected students for ${selectedMonth}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalOverviewBox}>
              <View style={styles.modalStatItem}>
                <Text style={styles.modalStatLabel}>Recipients</Text>
                <Text style={[styles.modalStatValue, { color: theme.colors.text }]}>
                  {targetStudentForModal ? 1 : selectedSummary.count}
                </Text>
              </View>
              <View style={styles.modalStatDivider} />
              <View style={styles.modalStatItem}>
                <Text style={styles.modalStatLabel}>Outstanding Dues</Text>
                <Text style={[styles.modalStatValue, { color: '#EF4444' }]}>
                  ₹
                  {(targetStudentForModal
                    ? Number(targetStudentForModal.total_outstanding || 0)
                    : selectedSummary.totalAmt
                  ).toLocaleString('en-IN')}
                </Text>
              </View>
            </View>

            <Text style={[styles.modalFieldLabel, { color: theme.colors.text }]}>
              Customize Message:
            </Text>
            <TextInput
              value={customMessage}
              onChangeText={setCustomMessage}
              multiline
              numberOfLines={4}
              style={[
                styles.modalTextInput,
                {
                  color: theme.colors.text,
                  backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : '#F8FAFC',
                  borderColor: theme.colors.border,
                },
              ]}
              placeholder="Type custom reminder message..."
              placeholderTextColor={theme.colors.textTertiary}
            />

            <Text style={[styles.modalNotice, { color: theme.colors.textTertiary }]}>
              * Reminders are dispatched directly to the registered parent contacts via in-app &
              SMS notifications.
            </Text>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: theme.colors.border }]}
                onPress={() => setModalVisible(false)}
                disabled={isSending}
              >
                <Text style={[styles.modalCancelText, { color: theme.colors.textSecondary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleConfirmSend}
                disabled={isSending}
              >
                <LinearGradient
                  colors={['#4F46E5', '#6366F1']}
                  style={styles.modalConfirmGradient}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Feather name="send" size={16} color="#FFFFFF" />
                      <Text style={styles.modalConfirmText}>Dispatch Reminders</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenLayout>
  );
}

const getStyles = (theme: Theme, isDark: boolean) =>
  StyleSheet.create({
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    listHeaderContainer: {
      marginBottom: 12,
    },

    // ── Stats Grid ──
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 16,
    },
    statCard: {
      flex: 1,
      minWidth: '47%',
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      ...Platform.select({
        web: {
          boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
        },
        default: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
        },
      }),
    },
    statIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    statValue: {
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.3,
      marginBottom: 2,
    },
    statTitle: {
      fontSize: 12,
      fontWeight: '600',
    },

    // ── Search Input ──
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 46,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
      paddingHorizontal: 14,
      marginBottom: 16,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
    },
    clearSearchBtn: {
      padding: 4,
    },

    // ── Filters Section ──
    filterSection: {
      marginBottom: 14,
    },
    filterTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      paddingHorizontal: 2,
    },
    filterTitle: {
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    filterSub: {
      fontSize: 12,
      fontWeight: '500',
    },
    resetFilterText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    horizontalChipsList: {
      gap: 8,
      paddingVertical: 2,
    },
    chipPill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipPillActive: {
      borderColor: 'transparent',
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
    },
    chipTextActive: {
      fontWeight: '700',
    },

    // Custom Percentage Range
    customRangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 10,
      paddingHorizontal: 4,
    },
    customInputWrap: {
      flex: 1,
      height: 42,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#CBD5E1',
      backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : '#FFFFFF',
      paddingHorizontal: 10,
    },
    customInput: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
    },
    customInputSuffix: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    customRangeTo: {
      fontSize: 13,
      fontWeight: '600',
    },
    applyCustomBtn: {
      height: 42,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    applyCustomBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },

    // ── List Sub Header Row ──
    listSubHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      marginBottom: 10,
      paddingHorizontal: 2,
    },
    listResultsCount: {
      fontSize: 15,
      fontWeight: '800',
    },
    listResultsHelper: {
      fontSize: 12,
      fontWeight: '500',
      marginTop: 2,
    },
    selectAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(79,70,229,0.08)',
    },
    selectAllText: {
      fontSize: 13,
      fontWeight: '700',
    },

    // ── Student Card ──
    studentCard: {
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
      ...Platform.select({
        web: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        },
        default: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
          elevation: 2,
        },
      }),
    },
    studentCardSelected: {
      borderColor: theme.colors.primary,
      borderWidth: 1.5,
      backgroundColor: isDark ? 'rgba(79,70,229,0.15)' : 'rgba(79,70,229,0.04)',
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    checkboxTouchable: {
      marginRight: 10,
    },
    avatarCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    avatarText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
    },
    studentInfoCol: {
      flex: 1,
    },
    studentName: {
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: -0.2,
      marginBottom: 2,
    },
    subMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    admissionText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      fontWeight: '500',
    },
    classBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(255,255,255,0.09)' : '#F1F5F9',
    },
    classBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    outstandingCol: {
      alignItems: 'flex-end',
      marginLeft: 8,
    },
    outstandingLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: '#EF4444',
      letterSpacing: 0.5,
    },
    outstandingValue: {
      fontSize: 16,
      fontWeight: '800',
      color: '#EF4444',
      marginTop: 1,
    },

    // Progress Bar
    progressContainer: {
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
    },
    progressLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    progressDetailText: {
      fontSize: 12,
      fontWeight: '500',
    },
    progressPercentText: {
      fontSize: 12,
      fontWeight: '800',
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 3,
    },

    // Card Footer
    cardFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
    },
    footerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 8,
      marginRight: 8,
    },
    overdueBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
    },
    overdueText: {
      fontSize: 11,
      fontWeight: '700',
    },
    parentNameText: {
      fontSize: 12,
      fontWeight: '500',
      flex: 1,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    callIconButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: 'rgba(16,185,129,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(16,185,129,0.25)',
    },
    callButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#10B981',
    },
    singleRemindButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: theme.colors.primary,
    },
    singleRemindText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // ── Pagination Loader & End ──
    paginationLoaderWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 18,
    },
    paginationLoaderText: {
      fontSize: 13,
      fontWeight: '600',
    },
    paginationEndWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 20,
    },
    endDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.textTertiary,
    },
    paginationEndText: {
      fontSize: 12,
      fontWeight: '600',
    },

    // ── Empty State ──
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
    },
    emptyIconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: 'rgba(16,185,129,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '800',
      marginBottom: 6,
      textAlign: 'center',
    },
    emptySub: {
      fontSize: 14,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 20,
    },
    emptyResetBtn: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: theme.colors.primary,
    },
    emptyResetBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },

    // ── Bottom Sticky Bar ──
    bottomStickyBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
      ...Platform.select({
        web: {
          boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
        },
        default: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 10,
        },
      }),
    },
    bottomBarInfo: {
      flex: 1,
      marginRight: 12,
    },
    bottomBarCount: {
      fontSize: 15,
      fontWeight: '800',
    },
    bottomBarAmount: {
      fontSize: 12,
      fontWeight: '600',
      color: '#EF4444',
      marginTop: 2,
    },
    sendBulkBtn: {
      borderRadius: 12,
      overflow: 'hidden',
    },
    sendBulkBtnDisabled: {
      opacity: 0.6,
    },
    sendBulkGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    sendBulkBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
    },

    // ── Modal Styles ──
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      width: '100%',
      maxWidth: 480,
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
    },
    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 16,
    },
    modalIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: 'rgba(79,70,229,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '800',
      marginBottom: 2,
    },
    modalSubtitle: {
      fontSize: 13,
      fontWeight: '500',
    },
    modalOverviewBox: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : '#F8FAFC',
      padding: 12,
      marginBottom: 16,
    },
    modalStatItem: {
      flex: 1,
      alignItems: 'center',
    },
    modalStatLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    modalStatValue: {
      fontSize: 16,
      fontWeight: '800',
    },
    modalStatDivider: {
      width: 1,
      height: 28,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
    },
    modalFieldLabel: {
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 8,
    },
    modalTextInput: {
      borderRadius: 12,
      borderWidth: 1,
      padding: 12,
      fontSize: 14,
      lineHeight: 20,
      textAlignVertical: 'top',
      minHeight: 90,
      marginBottom: 8,
    },
    modalNotice: {
      fontSize: 11,
      lineHeight: 16,
      marginBottom: 18,
    },
    modalActionsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    modalCancelBtn: {
      flex: 1,
      height: 46,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCancelText: {
      fontSize: 14,
      fontWeight: '700',
    },
    modalConfirmBtn: {
      flex: 2,
      borderRadius: 12,
      overflow: 'hidden',
    },
    modalConfirmGradient: {
      height: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    modalConfirmText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
    },
  });
