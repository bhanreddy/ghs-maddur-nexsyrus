import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
  Platform,
} from 'react-native';
import KeyboardAwareScreen from '@/components/keyboard/KeyboardAwareScreen';
import AppTextInput from '@/src/components/AppTextInput';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import AppDatePicker, { parseYMD } from '@/src/components/AppDatePicker';
import { format, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import StaffHeader from '../../src/components/StaffHeader';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import { DiaryService, DiaryEntry, TeacherService, TeacherClassAssignment } from '../../src/services/commonServices';
import { useAuth } from '../../src/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { Radii, Spacing, Typography, Theme } from '../../src/theme/themes';
import { api } from '../../src/services/apiClient';
import LogoLoader from '../../src/components/LogoLoader';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import {
  DiaryHistoryTabSwitcher,
  DiaryHistoryDatePickerSheet,
  DiaryHistoryDateSelectorButton,
  priorHistoryYmds,
  toYmd,
  type DiaryHistoryTabId,
} from '../../src/components/diary/DiaryHistoryChrome';

// ─── Mode A clay (soft, rationed) ────────────────────────────────────────────

function clay(isDark: boolean, raised: 'sm' | 'md' | 'lg' = 'md'): any {
  const spread = raised === 'lg' ? 20 : raised === 'sm' ? 10 : 14;
  const dy = raised === 'lg' ? 8 : raised === 'sm' ? 4 : 6;
  if (Platform.OS === 'web') {
    const drop = isDark ? 'rgba(0,0,0,0.45)' : 'rgba(148,163,184,0.28)';
    const light = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.95)';
    return {
      boxShadow:
        `0 ${dy}px ${spread}px ${drop}, ` +
        `0 -1px 0 ${light}`,
    };
  }
  return {
    shadowColor: isDark ? '#000000' : '#94A3B8',
    shadowOffset: { width: 0, height: dy },
    shadowOpacity: isDark ? 0.35 : 0.16,
    shadowRadius: spread,
    elevation: raised === 'lg' ? 5 : raised === 'sm' ? 2 : 3,
  };
}

function clayInset(isDark: boolean): any {
  if (Platform.OS === 'web') {
    const innerLo = isDark ? 'rgba(0,0,0,0.28)' : 'rgba(148,163,184,0.22)';
    const innerHi = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.9)';
    return {
      boxShadow: `inset 2px 2px 5px ${innerLo}, inset -2px -2px 5px ${innerHi}`,
    };
  }
  return {
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.22)',
  };
}

function clayCard(isDark: boolean, raised: 'sm' | 'md' | 'lg' = 'md'): any {
  return {
    backgroundColor: isDark ? '#161E2E' : '#FFFFFF',
    borderRadius: raised === 'lg' ? 28 : raised === 'sm' ? 20 : 24,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)',
    ...clay(isDark, raised),
  };
}

// ─── Subject styling ─────────────────────────────────────────────────────────

type SubjectStyle = {
  color: string;
  soft: string;
  softDark: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  gradient: readonly [string, string];
};

function getSubjectStyle(subject: string = ''): SubjectStyle {
  const s = subject.toLowerCase();
  if (s.includes('math'))
    return { color: '#2563EB', soft: '#EFF6FF', softDark: 'rgba(37,99,235,0.16)', icon: 'calculate', gradient: ['#1D4ED8', '#3B82F6'] };
  if (s.includes('science') || s.includes('bio') || s.includes('phys') || s.includes('chem'))
    return { color: '#7C3AED', soft: '#F5F3FF', softDark: 'rgba(124,58,237,0.16)', icon: 'biotech', gradient: ['#6D28D9', '#8B5CF6'] };
  if (s.includes('english'))
    return { color: '#D97706', soft: '#FFFBEB', softDark: 'rgba(217,119,6,0.16)', icon: 'menu-book', gradient: ['#B45309', '#F59E0B'] };
  if (s.includes('telugu') || s.includes('hindi') || s.includes('sanskrit'))
    return { color: '#DC2626', soft: '#FEF2F2', softDark: 'rgba(220,38,38,0.16)', icon: 'translate', gradient: ['#B91C1C', '#F87171'] };
  if (s.includes('social') || s.includes('history') || s.includes('civics'))
    return { color: '#DB2777', soft: '#FDF2F8', softDark: 'rgba(219,39,119,0.16)', icon: 'public', gradient: ['#BE185D', '#F472B6'] };
  if (s.includes('art') || s.includes('draw') || s.includes('music'))
    return { color: '#059669', soft: '#ECFDF5', softDark: 'rgba(5,150,105,0.16)', icon: 'palette', gradient: ['#047857', '#34D399'] };
  return { color: '#4F46E5', soft: '#EEF2FF', softDark: 'rgba(79,70,229,0.16)', icon: 'description', gradient: ['#4338CA', '#6366F1'] };
}

function diaryDisplayTitle(entry: DiaryEntry): string {
  return entry.title_te?.trim() || entry.title || '';
}

function diaryDisplayContent(entry: DiaryEntry): string {
  return entry.content_te?.trim() || entry.content || '';
}

/**
 * The API returns entry_date as a full ISO timestamp (e.g. 2026-07-18T00:00:00.000Z)
 * because it's a DATE column serialized via JSON, but every list/tab filter here
 * compares it against a plain YYYY-MM-DD key. Without this, those === checks never
 * match and the Today/History lists render empty. (The parent app normalizes the
 * same way in src/database/sync.ts.)
 */
const toDateKey = (d?: string): string => (d ? String(d).slice(0, 10) : '');
function normalizeDiaryEntry(e: DiaryEntry): DiaryEntry {
  return { ...e, entry_date: toDateKey(e.entry_date) };
}

function assignmentKey(a: TeacherClassAssignment) {
  return `${a.class_section_id}::${a.subject_id}`;
}

function dedupeAssignments(list: TeacherClassAssignment[]) {
  const seen = new Set<string>();
  return list.filter((a) => {
    const key = assignmentKey(a);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── PressScale ──────────────────────────────────────────────────────────────

function PressScale({
  onPress,
  children,
  disabled,
  style,
}: {
  onPress?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  style?: any;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        if (!disabled) scale.value = withSpring(0.97, { damping: 18, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 220 });
      }}
    >
      <Animated.View style={[style, aStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function StaffDiary() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const TE = t('staffDiary', { returnObjects: true }) as any;
  const { theme, isDark } = useTheme();
  const { isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(new Date());
  const [assignments, setAssignments] = useState<TeacherClassAssignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<TeacherClassAssignment | null>(null);
  const [existingEntry, setExistingEntry] = useState<DiaryEntry | null>(null);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [descFocused, setDescFocused] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const scrollRef = React.useRef<ScrollView>(null);
  const composerTopRef = React.useRef(0);
  const fieldTopRef = React.useRef({ title: 0, description: 0 });
  const focusScrollTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * KeyboardAwareScrollView handles the normal case. This measured fallback is
   * needed on some Android keyboards where the first focus event arrives before
   * the final keyboard height, leaving the diary field behind the IME.
   */
  const revealComposerField = useCallback((field: 'title' | 'description') => {
    const scrollToField = () => {
      const fieldY = composerTopRef.current + fieldTopRef.current[field];
      const topClearance = Platform.OS === 'ios' ? 104 : 88;
      scrollRef.current?.scrollTo({
        y: Math.max(0, fieldY - topClearance),
        animated: true,
      });
    };

    // Start moving immediately, then correct once the keyboard has reached its
    // final height. This also covers switching fields while it is already open.
    requestAnimationFrame(scrollToField);
    if (focusScrollTimerRef.current) clearTimeout(focusScrollTimerRef.current);
    focusScrollTimerRef.current = setTimeout(scrollToField, 360);
  }, []);

  useEffect(() => {
    return () => {
      if (focusScrollTimerRef.current) clearTimeout(focusScrollTimerRef.current);
    };
  }, []);

  const todayAnchor = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => toYmd(todayAnchor), [todayAnchor]);
  const priorDates = useMemo(() => priorHistoryYmds(todayAnchor), [todayAnchor]);

  const [activeTab, setActiveTab] = useState<DiaryHistoryTabId>('today');
  const [historyDate, setHistoryDate] = useState(() => todayYmd);
  const [pickerVisible, setPickerVisible] = useState(false);

  const datesWithData = useMemo(
    () => [...new Set(diaryEntries.map((e) => e.entry_date))],
    [diaryEntries]
  );
  const calendarAvailableYmds = useMemo(
    () => [...new Set([...datesWithData, ...priorDates])],
    [datesWithData, priorDates]
  );

  const todayCount = useMemo(
    () => diaryEntries.filter((e) => e.entry_date === todayYmd).length,
    [diaryEntries, todayYmd]
  );
  const historyCount = useMemo(
    () => diaryEntries.filter((e) => e.entry_date === historyDate).length,
    [diaryEntries, historyDate]
  );

  const subjectStyle = useMemo(
    () => getSubjectStyle(selectedAssignment?.subject_name),
    [selectedAssignment?.subject_name]
  );

  const canPost = description.trim().length > 0 && !!selectedAssignment && !submitting;

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const data = await TeacherService.getMyClasses();
      const unique = dedupeAssignments(Array.isArray(data) ? data : []);
      setAssignments(unique);
      if (unique.length > 0) {
        setSelectedAssignment(unique[0]);
      }
    } catch (error: any) {
      try {
        await api.post('/log', {
          msg: 'StaffDiary: fetchAssignments Failed',
          error: error.message,
        }, { silent: true });
      } catch (e) {
        if (__DEV__) { }
      }
      alertCompat('Error', TE.errLoadClass);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiaryHistory();
  }, [user?.userId, todayYmd, priorDates]);

  useEffect(() => {
    if (selectedAssignment) {
      checkExistingHomework();
    }
  }, [selectedAssignment, assignments]);

  const fetchDiaryHistory = async () => {
    try {
      const oldestYmd = priorDates[priorDates.length - 1];
      const allEntries = await DiaryService.getAll({
        from_date: oldestYmd,
        to_date: todayYmd,
      });
      setDiaryEntries(Array.isArray(allEntries) ? allEntries.map(normalizeDiaryEntry) : []);
    } catch (error: any) {
      try {
        await api.post('/log', {
          msg: 'StaffDiary: fetchDiaryHistory Failed',
          error: error.message,
        }, { silent: true });
      } catch (e) {
        if (__DEV__) { }
      }
    }
  };

  const checkExistingHomework = async () => {
    if (!selectedAssignment) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await DiaryService.getAll({
        class_section_id: selectedAssignment.class_section_id,
        entry_date: today,
        subject_id: selectedAssignment.subject_id,
      });

      const match = data
        .map(normalizeDiaryEntry)
        .find((e) => e.subject_id === selectedAssignment.subject_id);
      if (match) {
        setExistingEntry(match);
        setTitle(diaryDisplayTitle(match));
        setDescription(diaryDisplayContent(match));
        if (match.homework_due_date) {
          try {
            setDueDate(parseISO(match.homework_due_date));
          } catch (e) {
            setDueDate(new Date());
          }
        }
      } else {
        setExistingEntry(null);
        setTitle('');
        setDescription('');
        setDueDate(new Date());
      }
    } catch (error) {
      // silent — form stays empty
    }
  };

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setExistingEntry(null);
    setTitle('');
    setDescription('');
    setDueDate(new Date());
    if (selectedAssignment) checkExistingHomework();
  }, [selectedAssignment]);

  const handleEdit = (entry: DiaryEntry) => {
    const matchingAssignment = assignments.find(
      (a) => a.class_section_id === entry.class_section_id && a.subject_id === entry.subject_id
    );
    if (matchingAssignment) {
      setSelectedAssignment(matchingAssignment);
      setIsEditing(true);
      setActiveTab('today');
      setExistingEntry(entry);
      setTitle(diaryDisplayTitle(entry));
      setDescription(diaryDisplayContent(entry));
      if (entry.homework_due_date) {
        try {
          setDueDate(parseISO(entry.homework_due_date));
        } catch (e) {
          setDueDate(new Date());
        }
      }
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      alertCompat('Notice', TE.noticeInactive);
    }
  };

  const handleDelete = (entry: DiaryEntry) => {
    alertCompat(TE.confirmDeleteTitle, TE.confirmDeleteMessage, [
      { text: TE.cancelEdit, style: 'cancel' },
      {
        text: TE.delete,
        style: 'destructive',
        onPress: async () => {
          try {
            await DiaryService.delete(entry.id);
            if (existingEntry?.id === entry.id) {
              setIsEditing(false);
              setExistingEntry(null);
              setTitle('');
              setDescription('');
              setDueDate(new Date());
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            alertCompat('Success', TE.successDelete);
            fetchDiaryHistory();
            if (selectedAssignment) checkExistingHomework();
          } catch (error: any) {
            alertCompat('Error', error.message || TE.errDelete);
          }
        },
      },
    ]);
  };

  const handlePost = async () => {
    try {
      await api.post('/log', {
        msg: 'StaffDiary: handlePost initiated',
        isEditing,
        hasExisting: !!existingEntry,
        classId: selectedAssignment?.class_section_id,
      }, { silent: true });
    } catch (e) {
      if (__DEV__) { }
    }
    if (!selectedAssignment) {
      alertCompat('Error', TE.errClass);
      return;
    }
    if (!description.trim()) {
      alertCompat('Error', TE.errDesc);
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const dueStr = format(dueDate, 'yyyy-MM-dd');

    const duplicateSameDay =
      !existingEntry &&
      diaryEntries.find(
        (e) =>
          e.class_section_id === selectedAssignment.class_section_id &&
          e.subject_id === selectedAssignment.subject_id &&
          e.entry_date === today
      );
    const entryToUpdate = existingEntry || duplicateSameDay || null;

    try {
      setSubmitting(true);
      const payload = {
        class_section_id: selectedAssignment.class_section_id,
        entry_date: entryToUpdate?.entry_date || today,
        subject_id: selectedAssignment.subject_id,
        title: title.trim() || `${selectedAssignment.subject_name} హోంవర్క్`,
        content: description.trim(),
        homework_due_date: dueStr,
        // 'auto' lets the backend detect whether the teacher typed English or
        // Telugu and translate to fill the other column. Hardcoding 'te' stored
        // English verbatim in the Telugu column, so parents saw it untranslated.
        input_language: 'auto' as const,
        created_by: user?.userId || '',
      };
      if (entryToUpdate) {
        await DiaryService.update(entryToUpdate.id, payload);
        alertCompat('Success', TE.successUpdate);
      } else {
        await DiaryService.create(payload);
        alertCompat('Success', TE.successPost);
      }
      setIsEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchDiaryHistory();
      if (!isEditing) checkExistingHomework();
    } catch (error: any) {
      try {
        await api.post('/log', {
          msg: 'StaffDiary: handlePost Failed',
          error: error.message,
          stack: error.stack,
        }, { silent: true });
      } catch (e) {
        if (__DEV__) { }
      }
      alertCompat('Error', TE.errSave);
    } finally {
      setSubmitting(false);
    }
  };

  const selectAssignment = (assign: TeacherClassAssignment) => {
    if (isEditing) return;
    setSelectedAssignment(assign);
    Haptics.selectionAsync();
  };

  if (loading && assignments.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <LogoLoader size={60} color={theme.colors.primary} />
      </View>
    );
  }

  const pageBg = isDark ? '#0B1020' : '#EEF1F8';

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={pageBg} />
      <StaffHeader title={TE.header} showBackButton={true} />
      {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}

      <KeyboardAwareScreen
        variant="scroll"
        scrollViewRef={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bottomOffset={Platform.OS === 'android' ? 104 : 80}
        extraScrollPadding={160}
      >
        <Animated.View entering={FadeInDown.delay(40).duration(320)} style={styles.tabWrap}>
          <DiaryHistoryTabSwitcher
            active={activeTab}
            onChange={(tab) => {
              setActiveTab(tab);
              Haptics.selectionAsync();
            }}
            todayLabel={TE.today}
            historyLabel={TE.history}
          />
        </Animated.View>

        {activeTab === 'today' ? (
          <>
            {/* Class & subject picker */}
            <Animated.View
              entering={FadeInDown.delay(80).duration(340)}
              style={[styles.selectionSection, isEditing && styles.selectionLocked]}
            >
              <View style={styles.sectionRow}>
                <View>
                  <Text style={[styles.sectionTitle, { color: theme.colors.textStrong }]}>
                    {TE.selectClass}
                  </Text>
                  <Text style={[styles.sectionHint, { color: theme.colors.textTertiary }]}>
                    {TE.selectClassHint}
                  </Text>
                </View>
                {isEditing ? (
                  <PressScale onPress={cancelEdit}>
                    <View style={styles.cancelChip}>
                      <Ionicons name="close" size={14} color={theme.colors.primary} />
                      <Text style={[styles.cancelChipText, { color: theme.colors.primary }]}>
                        {TE.cancelEdit}
                      </Text>
                    </View>
                  </PressScale>
                ) : null}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.assignmentsScroll}
                contentContainerStyle={styles.assignmentsContent}
                pointerEvents={isEditing ? 'none' : 'auto'}
              >
                {assignments.map((assign, index) => {
                  const isSelected = selectedAssignment?.assignment_id === assign.assignment_id;
                  const ss = getSubjectStyle(assign.subject_name);
                  return (
                    <Animated.View
                      key={assign.assignment_id}
                      entering={FadeInDown.delay(90 + Math.min(index, 6) * 40).duration(300)}
                    >
                      <PressScale
                        disabled={isEditing}
                        onPress={() => selectAssignment(assign)}
                        style={[
                          styles.assignmentChip,
                          {
                            backgroundColor: isSelected
                              ? isDark
                                ? ss.softDark
                                : ss.soft
                              : isDark
                                ? '#161E2E'
                                : '#FFFFFF',
                            borderColor: isSelected
                              ? ss.color
                              : isDark
                                ? 'rgba(255,255,255,0.06)'
                                : 'rgba(148,163,184,0.18)',
                          },
                          isSelected ? clay(isDark, 'sm') : clay(isDark, 'sm'),
                        ]}
                      >
                        <View
                          style={[
                            styles.chipIcon,
                            {
                              backgroundColor: isSelected
                                ? ss.color
                                : isDark
                                  ? 'rgba(255,255,255,0.08)'
                                  : ss.soft,
                            },
                          ]}
                        >
                          <MaterialIcons
                            name={ss.icon}
                            size={16}
                            color={isSelected ? '#FFFFFF' : ss.color}
                          />
                        </View>
                        <View style={styles.chipTextCol}>
                          <Text
                            style={[
                              styles.chipClass,
                              {
                                color: isSelected ? ss.color : theme.colors.textStrong,
                              },
                            ]}
                          >
                            {assign.class_name}-{assign.section_name}
                          </Text>
                          <Text
                            style={[
                              styles.chipSubject,
                              { color: theme.colors.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            {assign.subject_name}
                          </Text>
                        </View>
                        {isSelected ? (
                          <Ionicons name="checkmark-circle" size={18} color={ss.color} />
                        ) : null}
                      </PressScale>
                    </Animated.View>
                  );
                })}
              </ScrollView>
            </Animated.View>

            {/* Composer card */}
            <Animated.View
              entering={FadeInDown.delay(120).duration(360)}
              style={[styles.formCard, clayCard(isDark, 'md')]}
              onLayout={(event) => {
                composerTopRef.current = event.nativeEvent.layout.y;
              }}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']
                    : ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 0.6, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
                pointerEvents="none"
              />

              {/* Context strip */}
              {selectedAssignment ? (
                <View
                  style={[
                    styles.contextStrip,
                    {
                      backgroundColor: isDark ? subjectStyle.softDark : subjectStyle.soft,
                      borderColor: subjectStyle.color + '33',
                    },
                  ]}
                >
                  <LinearGradient colors={[...subjectStyle.gradient]} style={styles.contextIcon}>
                    <MaterialIcons name={subjectStyle.icon} size={16} color="#FFFFFF" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.contextLabel, { color: theme.colors.textTertiary }]}>
                      {existingEntry || isEditing ? TE.editingFor : TE.postingFor}
                    </Text>
                    <Text style={[styles.contextValue, { color: theme.colors.textStrong }]}>
                      {selectedAssignment.class_name}-{selectedAssignment.section_name}
                      {' · '}
                      {selectedAssignment.subject_name}
                    </Text>
                  </View>
                  {existingEntry && !isEditing ? (
                    <View style={styles.existingBadge}>
                      <View style={styles.existingDot} />
                      <Text style={styles.existingBadgeText}>{TE.existingEntry}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {isEditing ? (
                <Animated.View entering={FadeIn.duration(200)} style={styles.editBanner}>
                  <Ionicons name="create-outline" size={16} color="#B45309" />
                  <Text style={styles.editBannerText}>{TE.editModeHint}</Text>
                </Animated.View>
              ) : null}

              <View style={styles.formHeader}>
                <Text style={[styles.cardTitle, { color: theme.colors.textStrong }]}>
                  {existingEntry || isEditing ? TE.modify : TE.postNew}
                </Text>
              </View>

              <View
                style={[
                  styles.tipRow,
                  {
                    backgroundColor: isDark ? 'rgba(14,165,233,0.10)' : '#F0F9FF',
                    borderColor: isDark ? 'rgba(14,165,233,0.22)' : '#BAE6FD',
                  },
                ]}
              >
                <Ionicons name="sparkles-outline" size={15} color={isDark ? '#38BDF8' : '#0284C7'} />
                <Text style={[styles.tipText, { color: isDark ? '#7DD3FC' : '#0369A1' }]}>
                  {TE.teluguHint}
                </Text>
              </View>

              <View
                style={styles.inputGroup}
                onLayout={(event) => {
                  fieldTopRef.current.title = event.nativeEvent.layout.y;
                }}
              >
                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                  {TE.titleLabel}
                </Text>
                <AppTextInput
                  style={[
                    styles.field,
                    clayInset(isDark) as any,
                    {
                      backgroundColor: isDark ? '#0F1524' : '#F4F6FB',
                      color: theme.colors.text,
                      borderColor: titleFocused
                        ? theme.colors.primary
                        : isDark
                          ? 'rgba(99,102,241,0.18)'
                          : 'rgba(148,163,184,0.2)',
                      borderWidth: 1.5,
                    },
                  ]}
                  placeholder={TE.titlePlaceholder}
                  placeholderTextColor="#94A3B8"
                  value={title}
                  onChangeText={setTitle}
                  onFocus={() => {
                    setTitleFocused(true);
                    revealComposerField('title');
                  }}
                  onBlur={() => setTitleFocused(false)}
                />
              </View>

              <View
                style={styles.inputGroup}
                onLayout={(event) => {
                  fieldTopRef.current.description = event.nativeEvent.layout.y;
                }}
              >
                <View style={styles.labelRow}>
                  <Text style={[styles.label, { color: theme.colors.textSecondary, marginBottom: 0 }]}>
                    {TE.descLabel}
                    <Text style={{ color: '#EF4444' }}> *</Text>
                  </Text>
                  <Text
                    style={[
                      styles.charCount,
                      {
                        color:
                          description.length > 0
                            ? theme.colors.primary
                            : theme.colors.textTertiary,
                      },
                    ]}
                  >
                    {description.trim().length > 0 ? TE.readyToPost : TE.required}
                  </Text>
                </View>
                <AppTextInput
                  style={[
                    styles.field,
                    styles.textArea,
                    clayInset(isDark) as any,
                    {
                      backgroundColor: isDark ? '#0F1524' : '#F4F6FB',
                      color: theme.colors.text,
                      borderColor: descFocused
                        ? theme.colors.primary
                        : isDark
                          ? 'rgba(99,102,241,0.18)'
                          : 'rgba(148,163,184,0.2)',
                      borderWidth: 1.5,
                    },
                  ]}
                  placeholder={TE.descPlaceholder}
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={5}
                  value={description}
                  onChangeText={setDescription}
                  textAlignVertical="top"
                  onFocus={() => {
                    setDescFocused(true);
                    revealComposerField('description');
                  }}
                  onBlur={() => setDescFocused(false)}
                />
              </View>

              <View style={styles.row}>
                <AppDatePicker
                  label={TE.dueDate}
                  value={format(dueDate, 'yyyy-MM-dd')}
                  onChange={(ymd) => setDueDate(parseYMD(ymd))}
                  minimumDate={new Date()}
                  isDark={isDark}
                  containerStyle={{ flex: 1, marginBottom: 0 }}
                  wrapperStyle={{
                    ...(clayInset(isDark) as any),
                    backgroundColor: isDark ? '#0F1524' : '#F4F6FB',
                    borderWidth: 1.5,
                    borderColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.2)',
                    borderRadius: 16,
                  }}
                />
              </View>

              <PressScale onPress={handlePost} disabled={!canPost} style={{ opacity: canPost ? 1 : 0.55 }}>
                <LinearGradient
                  colors={
                    existingEntry || isEditing
                      ? (['#059669', '#10B981'] as const)
                      : ([theme.colors.primary, '#818CF8'] as const)
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.postButton, clay(isDark, 'sm')]}
                >
                  <LinearGradient
                    colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  {submitting ? (
                    <LogoLoader color="#fff" size={22} />
                  ) : (
                    <>
                      <Text style={styles.postButtonText}>
                        {existingEntry || isEditing ? TE.updateHomework : TE.postHomework}
                      </Text>
                      <Ionicons
                        name={existingEntry || isEditing ? 'checkmark-circle' : 'send'}
                        size={18}
                        color="#fff"
                        style={{ marginLeft: 8 }}
                      />
                    </>
                  )}
                </LinearGradient>
              </PressScale>
            </Animated.View>
          </>
        ) : null}

        {activeTab === 'history' ? (
          <DiaryHistoryDateSelectorButton
            selectedYmd={historyDate}
            onPress={() => setPickerVisible(true)}
            onSelect={setHistoryDate}
          />
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: theme.colors.textStrong, marginBottom: 2 }]}>
              {activeTab === 'today' ? TE.todayHomework : TE.historyHomework}
            </Text>
            <Text style={[styles.sectionHint, { color: theme.colors.textTertiary }]}>
              {activeTab === 'today' ? TE.todayListHint : TE.historyListHint}
            </Text>
          </View>
          <View
            style={[
              styles.countPill,
              {
                backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : '#EEF2FF',
              },
            ]}
          >
            <Text style={[styles.countPillText, { color: theme.colors.primary }]}>
              {activeTab === 'today' ? todayCount : historyCount}
            </Text>
          </View>
        </View>

        <HomeworkDayList
          theme={theme}
          isDark={isDark}
          styles={styles}
          diaryEntries={diaryEntries}
          displayYmd={activeTab === 'today' ? todayYmd : historyDate}
          onEdit={handleEdit}
          onDelete={handleDelete}
          labels={TE}
          emptyActionLabel={activeTab === 'today' ? TE.emptyCta : undefined}
          onEmptyAction={
            activeTab === 'today'
              ? () => scrollRef.current?.scrollTo({ y: 0, animated: true })
              : undefined
          }
        />
      </KeyboardAwareScreen>

      <DiaryHistoryDatePickerSheet
        visible={pickerVisible}
        selectedYmd={historyDate}
        availableYmds={calendarAvailableYmds}
        onSelect={setHistoryDate}
        onClose={() => setPickerVisible(false)}
        subtitle={TE.calendarHint}
      />
    </View>
  );
}

// ─── Homework list ───────────────────────────────────────────────────────────

function HomeworkDayList({
  theme,
  isDark,
  styles,
  diaryEntries,
  displayYmd,
  onEdit,
  onDelete,
  labels,
  emptyActionLabel,
  onEmptyAction,
}: {
  theme: Theme;
  isDark: boolean;
  styles: ReturnType<typeof getStyles>;
  diaryEntries: DiaryEntry[];
  displayYmd: string;
  onEdit: (entry: DiaryEntry) => void;
  onDelete: (entry: DiaryEntry) => void;
  labels: Record<string, string>;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}) {
  const items = diaryEntries.filter((e) => e.entry_date === displayYmd);

  if (items.length === 0) {
    return (
      <Animated.View entering={FadeInDown.duration(320)} style={styles.emptyCard}>
        <View
          style={[
            styles.emptyIconWrap,
            { backgroundColor: isDark ? 'rgba(99,102,241,0.14)' : '#EEF2FF' },
          ]}
        >
          <Ionicons name="book-outline" size={28} color={theme.colors.primary} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.colors.textStrong }]}>
          {labels.emptyTitle}
        </Text>
        <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
          {labels.noHomework}
        </Text>
        {emptyActionLabel && onEmptyAction ? (
          <PressScale onPress={onEmptyAction}>
            <View
              style={[
                styles.emptyCta,
                { backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : '#EEF2FF' },
              ]}
            >
              <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.emptyCtaText, { color: theme.colors.primary }]}>
                {emptyActionLabel}
              </Text>
            </View>
          </PressScale>
        ) : null}
      </Animated.View>
    );
  }

  return (
    <View style={styles.listContainer}>
      <View style={styles.dateHeader}>
        <View style={[styles.dateLine, { backgroundColor: theme.colors.border }]} />
        <Text style={[styles.dateLabel, { color: theme.colors.textSecondary }]}>
          {format(parseISO(displayYmd), 'EEE · MMM d, yyyy')}
        </Text>
        <View style={[styles.dateLine, { backgroundColor: theme.colors.border }]} />
      </View>

      {items.map((item, index) => {
        const ss = getSubjectStyle(item.subject_name);
        return (
          <Animated.View
            key={item.id}
            entering={FadeInDown.delay(80 + Math.min(index, 6) * 45).duration(320)}
            style={[styles.postCard, clayCard(isDark, 'sm')]}
          >
            <View style={[styles.postAccent, { backgroundColor: ss.color }]} />

            <View style={styles.postBody}>
              <View style={styles.postHeader}>
                <View
                  style={[
                    styles.classBadge,
                    { backgroundColor: isDark ? ss.softDark : ss.soft },
                  ]}
                >
                  <MaterialIcons name={ss.icon} size={12} color={ss.color} />
                  <Text style={[styles.postClass, { color: ss.color }]}>
                    {item.class_name}-{item.section_name}
                  </Text>
                </View>
                <Text style={[styles.postSubject, { color: theme.colors.textSecondary }]}>
                  {item.subject_name}
                </Text>
              </View>

              <Text style={[styles.postTitle, { color: theme.colors.textStrong }]}>
                {diaryDisplayTitle(item)}
              </Text>
              <Text
                style={[styles.postContent, { color: theme.colors.textSecondary }]}
                numberOfLines={3}
              >
                {diaryDisplayContent(item)}
              </Text>

              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

              <View style={styles.postFooter}>
                <View style={styles.footerInfo}>
                  <View style={styles.metaRow}>
                    <Ionicons name="alarm-outline" size={13} color="#EF4444" />
                    <Text style={styles.dueText}>
                      {labels.due}:{' '}
                      {item.homework_due_date
                        ? format(parseISO(item.homework_due_date), 'MMM d')
                        : 'N/A'}
                    </Text>
                  </View>
                  <Text style={[styles.createdText, { color: theme.colors.textTertiary }]}>
                    {labels.posted}: {format(parseISO(item.created_at), 'p')}
                  </Text>
                </View>

                <View style={styles.actionRow}>
                  <PressScale onPress={() => onEdit(item)}>
                    <View
                      style={[
                        styles.editButton,
                        { backgroundColor: isDark ? 'rgba(99,102,241,0.16)' : '#EEF2FF' },
                      ]}
                    >
                      <Ionicons name="create-outline" size={15} color={theme.colors.primary} />
                      <Text style={[styles.editText, { color: theme.colors.primary }]}>
                        {labels.edit}
                      </Text>
                    </View>
                  </PressScale>
                  <PressScale onPress={() => onDelete(item)}>
                    <View
                      style={[
                        styles.editButton,
                        {
                          backgroundColor: isDark ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.10)',
                        },
                      ]}
                    >
                      <Ionicons name="trash-outline" size={15} color={theme.colors.danger} />
                      <Text style={[styles.editText, { color: theme.colors.danger }]}>
                        {labels.delete}
                      </Text>
                    </View>
                  </PressScale>
                </View>
              </View>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const getStyles = (theme: Theme, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1 },
    centered: { justifyContent: 'center', alignItems: 'center' },
    scrollContent: {
      padding: Spacing.lg,
      paddingBottom: 64,
      maxWidth: 640,
      width: '100%',
      alignSelf: 'center',
    },
    tabWrap: { marginBottom: Spacing.md },

    selectionSection: { marginBottom: Spacing.lg },
    selectionLocked: { opacity: 0.55 },
    sectionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: Spacing.sm,
      gap: 12,
    },
    sectionTitle: {
      ...Typography.title,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.3,
      marginBottom: 2,
    },
    sectionHint: {
      fontSize: 12,
      fontWeight: '500',
      letterSpacing: -0.1,
      marginBottom: Spacing.sm,
    },
    cancelChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: Radii.pill,
      backgroundColor: isDark ? 'rgba(99,102,241,0.16)' : '#EEF2FF',
    },
    cancelChipText: { fontSize: 12, fontWeight: '700' },

    assignmentsScroll: {
      marginHorizontal: -Spacing.lg,
    },
    assignmentsContent: {
      paddingHorizontal: Spacing.lg,
      gap: 10,
      paddingVertical: 4,
    },
    assignmentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      paddingRight: 14,
      borderRadius: 18,
      borderWidth: 1.5,
      minHeight: 52,
      marginRight: 2,
    },
    chipIcon: {
      width: 32,
      height: 32,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipTextCol: { gap: 1, maxWidth: 110 },
    chipClass: { fontSize: 13, fontWeight: '800', letterSpacing: -0.2 },
    chipSubject: { fontSize: 11, fontWeight: '600' },

    formCard: {
      borderRadius: 24,
      padding: Spacing.lg,
      marginBottom: Spacing.xl,
      overflow: 'hidden',
    },
    contextStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      marginBottom: Spacing.md,
    },
    contextIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contextLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2, marginBottom: 1 },
    contextValue: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },

    editBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(245,158,11,0.25)' : '#FDE68A',
      marginBottom: Spacing.md,
    },
    editBannerText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#FBBF24' : '#92400E',
    },

    formHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.4,
    },
    existingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : '#DCFCE7',
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: Radii.pill,
    },
    existingDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#16A34A',
    },
    existingBadgeText: {
      fontSize: 10,
      color: isDark ? '#6EE7B7' : '#15803D',
      fontWeight: '800',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },

    tipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      marginBottom: Spacing.md,
    },
    tipText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 16 },

    inputGroup: { marginBottom: Spacing.md },
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    label: {
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 8,
      letterSpacing: -0.1,
    },
    charCount: { fontSize: 11, fontWeight: '700' },
    field: {
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'web' ? 14 : 12,
      fontSize: 15,
      fontWeight: '500',
    },
    textArea: { height: 120, paddingTop: 14 },

    row: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 15,
      marginBottom: Spacing.lg,
    },
    postButton: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      height: 54,
      borderRadius: 16,
      overflow: 'hidden',
    },
    postButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.2,
    },

    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: Spacing.md,
      gap: 12,
    },
    countPill: {
      minWidth: 32,
      height: 32,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    countPillText: { fontSize: 14, fontWeight: '800' },

    listContainer: { gap: Spacing.md, paddingBottom: 8 },

    emptyCard: {
      alignItems: 'center',
      paddingVertical: 40,
      paddingHorizontal: 24,
      gap: 8,
      borderRadius: 24,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.55)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.16)',
      borderStyle: 'dashed',
    },
    emptyIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    emptyTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
    emptyText: { fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 18 },
    emptyCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: Radii.pill,
    },
    emptyCtaText: { fontSize: 13, fontWeight: '700' },

    dateHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.sm,
      gap: 10,
    },
    dateLine: { flex: 1, height: StyleSheet.hairlineWidth },
    dateLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },

    postCard: {
      borderRadius: 20,
      overflow: 'hidden',
      flexDirection: 'row',
      marginBottom: 2,
    },
    postAccent: { width: 4 },
    postBody: { flex: 1, padding: Spacing.md },
    postHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
      flexWrap: 'wrap',
    },
    classBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    postClass: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.2,
      textTransform: 'uppercase',
    },
    postSubject: { fontSize: 13, fontWeight: '600' },
    postTitle: {
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.3,
      marginBottom: 4,
    },
    postContent: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
    divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.sm },
    postFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
    },
    footerInfo: { flex: 1, gap: 3 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    dueText: { fontSize: 12, color: '#EF4444', fontWeight: '700' },
    createdText: { fontSize: 11, fontWeight: '500' },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      minHeight: 36,
    },
    editText: { fontSize: 13, fontWeight: '700' },
  });
