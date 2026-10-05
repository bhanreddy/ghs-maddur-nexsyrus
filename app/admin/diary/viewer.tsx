import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { format } from 'date-fns';
import AdminHeader from '../../../src/components/AdminHeader';
import AppDatePicker, { parseYMD, toYMD } from '../../../src/components/AppDatePicker';
import AppTextInput from '../../../src/components/AppTextInput';
import LogoLoader from '../../../src/components/LogoLoader';
import { DiaryPhotoStrip, diaryPhotoUrls, diarySourceLabel, isPhotoOnlyDiary } from '../../../src/components/diary/DiaryPhotoStrip';
import { schoolColorWithAlpha } from '../../../src/constants/schoolConfig';
import { useTheme, type SchoolTheme } from '../../../src/hooks/useTheme';
import { api } from '../../../src/services/apiClient';
import { clay, clayCard } from '../../../src/theme/clayStyles';
import { alertCompat } from '../../../src/utils/crossPlatformAlert';

type DiaryMode = 'class' | 'subject';

interface DiarySubject {
  id: string;
  name: string;
  name_te?: string;
}

interface DiaryClassOption {
  class_section_id: string;
  class_id: string;
  class_name: string;
  class_sort_order?: number;
  section_id: string;
  section_name: string;
  academic_year_id: string;
  academic_year: string;
  subjects: DiarySubject[];
}

interface DiaryEntry {
  id: string;
  class_section_id: string;
  class_id: string;
  class_name: string;
  section_id: string;
  section_name: string;
  entry_date: string;
  subject_id?: string | null;
  subject_name?: string | null;
  title?: string | null;
  title_te?: string | null;
  content: string;
  content_te?: string | null;
  homework_due_date?: string | null;
  attachments?: unknown;
  entry_source?: string | null;
  created_by: string;
  created_at: string;
  updated_at?: string;
  teacher_name?: string | null;
}

function relativeLuminance(hex: string) {
  const normalized = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return 0;
  const channels = [0, 2, 4].map((offset) => {
    const value = parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(colorA: string, colorB: string) {
  const lighter = Math.max(relativeLuminance(colorA), relativeLuminance(colorB));
  const darker = Math.min(relativeLuminance(colorA), relativeLuminance(colorB));
  return (lighter + 0.05) / (darker + 0.05);
}

function themeTextOn(background: string, theme: SchoolTheme) {
  const candidates = [theme.colors.surface, theme.colors.background, theme.colors.textStrong];
  return candidates.reduce((best, candidate) =>
    contrastRatio(background, candidate) > contrastRatio(background, best) ? candidate : best,
  );
}

function entryTitle(entry: DiaryEntry) {
  return entry.title || entry.title_te || (entry.subject_name ? `${entry.subject_name} diary` : 'Class diary');
}

/** Format API dates without timezone shift (YYYY-MM-DD or ISO). */
function formatDisplayDate(raw?: string | null, pattern = 'MMM d, yyyy'): string | null {
  if (!raw) return null;
  const ymd = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return raw;
  try {
    return format(parseYMD(ymd), pattern);
  } catch {
    return ymd;
  }
}

function PressScale({
  children,
  onPress,
  style,
  disabled,
  hitSlop,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
  disabled?: boolean;
  hitSlop?: number;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      disabled={disabled}
      hitSlop={hitSlop ?? 6}
      onPress={onPress}
      onPressIn={() => {
        if (!disabled) scale.value = withTiming(0.97, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 120 });
      }}
    >
      <Animated.View style={[style, animatedStyle, disabled && { opacity: 0.5 }]}>{children}</Animated.View>
    </Pressable>
  );
}

export default function AdminDiaryViewerScreen() {
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const today = useMemo(() => toYMD(new Date()), []);
  const todayLabel = useMemo(() => format(new Date(), 'EEEE, MMM d'), []);

  const pageBg = isDark ? '#0E0F1A' : '#E9EDF6';
  const cardBg = isDark ? '#1A2332' : '#EFF2F9';
  const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)';
  const titleColor = theme.colors.textStrong;
  const subColor = theme.colors.textSecondary;
  const primary = theme.colors.primary;
  const onPrimary = themeTextOn(primary, theme);
  const primaryTint = schoolColorWithAlpha(primary, isDark ? 0.22 : 0.12);
  const fieldBg = isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
  const fieldBorder = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(148,163,184,0.42)';
  const trackBg = isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC';

  const [options, setOptions] = useState<DiaryClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedClassSectionId, setSelectedClassSectionId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DiaryEntry | null>(null);
  const [formClassId, setFormClassId] = useState('');
  const [formClassSectionId, setFormClassSectionId] = useState('');
  const [formMode, setFormMode] = useState<DiaryMode>('class');
  const [formSubjectId, setFormSubjectId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formDueDate, setFormDueDate] = useState(today);
  const [saving, setSaving] = useState(false);

  const classes = useMemo(() => {
    const seen = new Set<string>();
    return options.filter((option) => {
      if (seen.has(option.class_id)) return false;
      seen.add(option.class_id);
      return true;
    });
  }, [options]);

  const filteredSections = useMemo(
    () => (selectedClassId ? options.filter((option) => option.class_id === selectedClassId) : []),
    [options, selectedClassId],
  );

  const filteredSubjects = useMemo(() => {
    const relevantOptions = selectedClassSectionId
      ? options.filter((option) => option.class_section_id === selectedClassSectionId)
      : selectedClassId
        ? options.filter((option) => option.class_id === selectedClassId)
        : [];
    const subjects = new Map<string, DiarySubject>();
    relevantOptions.forEach((option) => {
      option.subjects.forEach((subject) => subjects.set(subject.id, subject));
    });
    return [...subjects.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [options, selectedClassId, selectedClassSectionId]);

  const selectedFormOption = useMemo(
    () => options.find((option) => option.class_section_id === formClassSectionId),
    [formClassSectionId, options],
  );

  const formSections = useMemo(
    () => (formClassId ? options.filter((option) => option.class_id === formClassId) : []),
    [formClassId, options],
  );

  const formTargetLabel = useMemo(() => {
    if (!selectedFormOption) return '';
    return `${selectedFormOption.class_name} · ${selectedFormOption.section_name}`;
  }, [selectedFormOption]);

  const selectedClassName = useMemo(
    () => classes.find((item) => item.class_id === selectedClassId)?.class_name || '',
    [classes, selectedClassId],
  );

  const selectedSectionName = useMemo(
    () => filteredSections.find((item) => item.class_section_id === selectedClassSectionId)?.section_name || '',
    [filteredSections, selectedClassSectionId],
  );

  const selectedSubjectName = useMemo(
    () => filteredSubjects.find((item) => item.id === selectedSubjectId)?.name || '',
    [filteredSubjects, selectedSubjectId],
  );

  const hasActiveFilters = Boolean(selectedClassId || selectedClassSectionId || selectedSubjectId);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (selectedClassName) parts.push(selectedClassName);
    if (selectedSectionName) parts.push(selectedSectionName);
    if (selectedSubjectName) parts.push(selectedSubjectName);
    return parts.length ? parts.join(' · ') : 'All classes';
  }, [selectedClassName, selectedSectionName, selectedSubjectName]);

  const groupedEntries = useMemo(() => {
    if (selectedClassSectionId || selectedClassId) {
      return [{ key: 'flat', label: null as string | null, items: entries }];
    }
    const groups = new Map<string, DiaryEntry[]>();
    entries.forEach((entry) => {
      const key = `${entry.class_name}-${entry.section_name}`;
      const list = groups.get(key) || [];
      list.push(entry);
      groups.set(key, list);
    });
    return [...groups.entries()].map(([key, items]) => ({ key, label: key, items }));
  }, [entries, selectedClassId, selectedClassSectionId]);

  const loadOptions = useCallback(async () => {
    try {
      const data = await api.get<DiaryClassOption[]>('/admin/diary/options');
      setOptions(Array.isArray(data) ? data : []);
    } catch (error: any) {
      alertCompat('Error', error.message || 'Failed to load class diary options');
    }
  }, []);

  const fetchEntries = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (selectedClassSectionId) params.class_section_id = selectedClassSectionId;
      else if (selectedClassId) params.class_id = selectedClassId;
      if (selectedSubjectId) params.subject_id = selectedSubjectId;
      const data = await api.get<DiaryEntry[]>('/admin/diary/today', params);
      setEntries(Array.isArray(data) ? data : []);
    } catch (error: any) {
      alertCompat('Error', error.message || 'Failed to fetch diary entries');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedClassId, selectedClassSectionId, selectedSubjectId]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void fetchEntries();
    }, [fetchEntries]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    Promise.all([loadOptions(), fetchEntries()]);
  };

  const clearFilters = () => {
    setSelectedClassId('');
    setSelectedClassSectionId('');
    setSelectedSubjectId('');
  };

  const resetComposer = () => {
    setEditingEntry(null);
    setFormClassId('');
    setFormClassSectionId('');
    setFormMode('class');
    setFormSubjectId('');
    setFormTitle('');
    setFormContent('');
    setFormDueDate(today);
  };

  const closeComposer = () => {
    if (saving) return;
    setComposerOpen(false);
    resetComposer();
  };

  const openCreate = () => {
    const preferred =
      options.find(
        (option) =>
          option.class_section_id === selectedClassSectionId &&
          (!selectedSubjectId || option.subjects.some((subject) => subject.id === selectedSubjectId)),
      ) ||
      options.find(
        (option) =>
          option.class_id === selectedClassId &&
          (!selectedSubjectId || option.subjects.some((subject) => subject.id === selectedSubjectId)),
      ) ||
      options[0];
    resetComposer();
    setFormClassId(preferred?.class_id || '');
    setFormClassSectionId(preferred?.class_section_id || '');
    if (selectedSubjectId) {
      setFormMode('subject');
      setFormSubjectId(selectedSubjectId);
    }
    setComposerOpen(true);
  };

  const openEdit = useCallback((entry: DiaryEntry) => {
    setEditingEntry(entry);
    setFormClassId(entry.class_id);
    setFormClassSectionId(entry.class_section_id);
    setFormMode(entry.subject_id ? 'subject' : 'class');
    setFormSubjectId(entry.subject_id || '');
    setFormTitle(entry.title || entry.title_te || '');
    setFormContent(entry.content || entry.content_te || '');
    setFormDueDate((entry.homework_due_date || entry.entry_date || today).slice(0, 10));
    setComposerOpen(true);
  }, [today]);

  const handleDelete = useCallback(
    (entry: DiaryEntry) => {
      alertCompat(
        'Delete diary entry?',
        'This entry will be removed permanently. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await api.delete(`/diary/${entry.id}`);
                if (editingEntry?.id === entry.id) {
                  setComposerOpen(false);
                  resetComposer();
                }
                alertCompat('Success', 'Diary entry deleted');
                await fetchEntries();
              } catch (error: any) {
                alertCompat('Error', error.message || 'Failed to delete diary entry');
              }
            },
          },
        ],
      );
    },
    [editingEntry?.id, fetchEntries],
  );

  const chooseFormClassGrade = (classId: string) => {
    if (editingEntry) return;
    setFormClassId(classId);
    setFormSubjectId('');
    const sectionsForClass = options.filter((option) => option.class_id === classId);
    if (sectionsForClass.length === 1) {
      setFormClassSectionId(sectionsForClass[0].class_section_id);
    } else {
      setFormClassSectionId('');
    }
  };

  const chooseFormSection = (classSectionId: string) => {
    if (editingEntry) return;
    setFormClassSectionId(classSectionId);
    setFormSubjectId('');
  };

  const chooseMode = (mode: DiaryMode) => {
    setFormMode(mode);
    if (mode === 'class') setFormSubjectId('');
  };

  const saveDiary = async () => {
    if (!formClassSectionId) {
      alertCompat('Class required', 'Select a class and section.');
      return;
    }
    if (formMode === 'subject' && !formSubjectId) {
      alertCompat('Subject required', 'Select a subject for this diary entry.');
      return;
    }
    if (!formContent.trim() && diaryPhotoUrls(editingEntry?.attachments).length === 0) {
      alertCompat('Details required', 'Enter the diary details or homework.');
      return;
    }

    const subject = selectedFormOption?.subjects.find((item) => item.id === formSubjectId);
    const photos = diaryPhotoUrls(editingEntry?.attachments);
    const payload = {
      class_section_id: formClassSectionId,
      entry_date: editingEntry?.entry_date || today,
      subject_id: formMode === 'subject' ? formSubjectId : null,
      title: formTitle.trim() || (formMode === 'subject' ? `${subject?.name || 'Subject'} diary` : 'Class diary'),
      content: formContent.trim() || (photos.length ? (editingEntry?.content || 'Please view the attached diary photo.') : ''),
      homework_due_date: formMode === 'subject' ? formDueDate || null : null,
      input_language: 'en' as const,
    };

    try {
      setSaving(true);
      if (editingEntry) {
        await api.put(`/diary/${editingEntry.id}`, payload);
      } else {
        await api.post('/diary', payload);
      }
      setComposerOpen(false);
      resetComposer();
      await fetchEntries();
      alertCompat('Success', editingEntry ? 'Diary entry updated.' : 'Diary entry added.');
    } catch (error: any) {
      alertCompat('Could not save diary', error.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  let entryAnimIndex = 0;

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <TourTarget id="screen.admin-diary-viewer.overview"><AdminHeader
        title="Class Diary"
        showBackButton
        rightAction={{ icon: 'calendar-outline', onPress: () => router.push('/admin/diary/history') }}
      /></TourTarget>

      <TourScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />}
      >
        <TourTarget id="screen.admin-diary-viewer.workspace"><Animated.View
          entering={FadeIn.duration(280)}
          style={[styles.filterPanel, clayCard(isDark, 'sm'), { backgroundColor: cardBg, borderColor: cardBorder }]}
        >
          <View style={styles.filterPanelHeader}>
            <View style={styles.filterPanelTitleRow}>
              <View style={[styles.filterIconWrap, { backgroundColor: primaryTint }]}>
                <Ionicons name="funnel-outline" size={16} color={primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.filterPanelTitle, { color: titleColor }]}>Browse today</Text>
                <Text style={[styles.filterPanelSub, { color: subColor }]} numberOfLines={1}>
                  {filterSummary}
                </Text>
              </View>
            </View>
            {hasActiveFilters ? (
              <PressScale onPress={clearFilters} hitSlop={10}>
                <View style={[styles.clearChip, { backgroundColor: primaryTint }]}>
                  <Ionicons name="close-circle" size={14} color={primary} />
                  <Text style={[styles.clearChipText, { color: primary }]}>Clear</Text>
                </View>
              </PressScale>
            ) : null}
          </View>

          <FilterRow label="Class" subColor={subColor}>
            <FilterChip
              label="All"
              selected={!selectedClassId}
              theme={theme}
              isDark={isDark}
              onPress={() => {
                setSelectedClassId('');
                setSelectedClassSectionId('');
                setSelectedSubjectId('');
              }}
            />
            {classes.map((item) => (
              <FilterChip
                key={item.class_id}
                label={item.class_name}
                selected={selectedClassId === item.class_id}
                theme={theme}
                isDark={isDark}
                onPress={() => {
                  setSelectedClassId(item.class_id);
                  setSelectedClassSectionId('');
                  setSelectedSubjectId('');
                }}
              />
            ))}
          </FilterRow>

          {selectedClassId ? (
            <FilterRow label="Section" subColor={subColor}>
              <FilterChip
                label="All"
                selected={!selectedClassSectionId}
                theme={theme}
                isDark={isDark}
                onPress={() => {
                  setSelectedClassSectionId('');
                  setSelectedSubjectId('');
                }}
              />
              {filteredSections.map((item) => (
                <FilterChip
                  key={item.class_section_id}
                  label={item.section_name}
                  selected={selectedClassSectionId === item.class_section_id}
                  theme={theme}
                  isDark={isDark}
                  onPress={() => {
                    setSelectedClassId(item.class_id);
                    setSelectedClassSectionId(item.class_section_id);
                    setSelectedSubjectId('');
                  }}
                />
              ))}
            </FilterRow>
          ) : null}

          {selectedClassId ? (
            <FilterRow label="Subject" subColor={subColor} last>
              <FilterChip
                label="All"
                selected={!selectedSubjectId}
                theme={theme}
                isDark={isDark}
                onPress={() => setSelectedSubjectId('')}
              />
              {filteredSubjects.map((subject) => (
                <FilterChip
                  key={subject.id}
                  label={subject.name}
                  selected={selectedSubjectId === subject.id}
                  theme={theme}
                  isDark={isDark}
                  onPress={() => setSelectedSubjectId(subject.id)}
                />
              ))}
              {filteredSubjects.length === 0 ? (
                <Text style={[styles.filterHint, { color: subColor }]}>No subjects assigned</Text>
              ) : null}
            </FilterRow>
          ) : (
            <Text style={[styles.filterHintPadded, { color: subColor }]}>
              Pick a class to filter by section or subject
            </Text>
          )}
        </Animated.View></TourTarget>

        <View style={styles.listHeading}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.listTitle, { color: titleColor }]}>Today&apos;s entries</Text>
            <Text style={[styles.listSubtitle, { color: subColor }]}>
              {todayLabel}
              {' · '}
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </Text>
          </View>
          <PressScale onPress={openCreate} disabled={options.length === 0}>
            <View
              style={[
                styles.addButton,
                clay(isDark, 'sm'),
                { backgroundColor: primary, shadowColor: primary },
                options.length === 0 && styles.disabledButton,
              ]}
            >
              <Ionicons name="add" size={18} color={onPrimary} />
              <Text style={[styles.addButtonText, { color: onPrimary }]}>Add diary</Text>
            </View>
          </PressScale>
        </View>

        {loading && !refreshing ? (
          <View style={styles.centerBox}>
            <LogoLoader size={40} color={primary} />
            <Text style={[styles.loadingLabel, { color: subColor }]}>Loading today&apos;s diary…</Text>
          </View>
        ) : entries.length === 0 ? (
          <Animated.View
            entering={ZoomIn.duration(280)}
            style={[styles.emptyBox, clayCard(isDark, 'md'), { backgroundColor: cardBg, borderColor: cardBorder }]}
          >
            <View style={[styles.emptyIcon, { backgroundColor: primaryTint }]}>
              <Ionicons name="book-outline" size={32} color={primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: titleColor }]}>No diary entries yet</Text>
            <Text style={[styles.emptySub, { color: subColor }]}>
              {hasActiveFilters
                ? 'Nothing matches these filters. Clear filters or add an entry for this class.'
                : 'Post a class-wide update or subject homework for today.'}
            </Text>
            {options.length > 0 ? (
              <PressScale onPress={hasActiveFilters ? clearFilters : openCreate}>
                <View style={[styles.emptyAction, clay(isDark, 'sm'), { backgroundColor: primary }]}>
                  <Text style={[styles.emptyActionText, { color: onPrimary }]}>
                    {hasActiveFilters ? 'Clear filters' : 'Create first entry'}
                  </Text>
                </View>
              </PressScale>
            ) : (
              <Text style={[styles.setupHint, { color: subColor }]}>
                Create a current class-section mapping in Academic Structure first.
              </Text>
            )}
          </Animated.View>
        ) : (
          groupedEntries.map((group) => (
            <View key={group.key} style={styles.groupBlock}>
              {group.label ? (
                <View style={styles.groupHeader}>
                  <View style={[styles.groupDot, { backgroundColor: primary }]} />
                  <Text style={[styles.groupLabel, { color: titleColor }]}>{group.label}</Text>
                  <Text style={[styles.groupCount, { color: subColor }]}>
                    {group.items.length}
                  </Text>
                </View>
              ) : null}
              {group.items.map((entry) => {
                const index = entryAnimIndex++;
                return (
                  <DiaryEntryCard
                    key={entry.id}
                    entry={entry}
                    index={index}
                    isDark={isDark}
                    theme={theme}
                    cardBg={cardBg}
                    titleColor={titleColor}
                    subColor={subColor}
                    primary={primary}
                    primaryTint={primaryTint}
                    showClassBadge={!selectedClassSectionId}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                  />
                );
              })}
            </View>
          ))
        )}
      </TourScrollView>

      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={closeComposer}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable
            style={[styles.backdrop, { backgroundColor: schoolColorWithAlpha(theme.colors.primaryDark, isDark ? 0.76 : 0.55) }]}
            onPress={closeComposer}
          />
          <View
            style={[
              styles.sheet,
              clayCard(isDark, 'lg'),
              { backgroundColor: cardBg, borderColor: cardBorder },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: theme.colors.border }]} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleRow}>
                <View style={[styles.sheetIcon, { backgroundColor: primaryTint }]}>
                  <Ionicons name={editingEntry ? 'create-outline' : 'book-outline'} size={20} color={primary} />
                </View>
                <View>
                  <Text style={[styles.sheetTitle, { color: titleColor }]}>
                    {editingEntry ? 'Edit diary entry' : 'Add diary entry'}
                  </Text>
                  <Text style={[styles.sheetSubtitle, { color: subColor }]}>
                    {formatDisplayDate(editingEntry?.entry_date || today, 'EEEE, MMM d') || today}
                  </Text>
                </View>
              </View>
              <PressScale onPress={closeComposer}>
                <View style={[styles.closeButton, styles.frameControl, { backgroundColor: fieldBg, borderColor: fieldBorder }]}>
                  <Ionicons name="close" size={20} color={subColor} />
                </View>
              </PressScale>
            </View>

            <TourScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {editingEntry ? (
                <View style={[styles.lockedClass, styles.fieldFrame, { backgroundColor: trackBg, borderColor: fieldBorder }]}>
                  <Ionicons name="lock-closed-outline" size={16} color={subColor} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lockedClassText, { color: titleColor }]}>
                      {editingEntry.class_name} · {editingEntry.section_name}
                    </Text>
                    <Text style={[styles.lockedHintInline, { color: subColor }]}>
                      Locked for this entry — post a new one for another class.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.composerTarget}>
                  <View style={styles.composerStep}>
                    <Text style={[styles.stepLabel, { color: subColor }]}>1. Class</Text>
                    <View style={[styles.chipTrack, { backgroundColor: trackBg, borderColor: fieldBorder }]}>
                      <TourScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.composerChipRow}
                      >
                        {classes.map((item) => (
                          <FilterChip
                            key={item.class_id}
                            label={item.class_name}
                            selected={formClassId === item.class_id}
                            theme={theme}
                            isDark={isDark}
                            onPress={() => chooseFormClassGrade(item.class_id)}
                          />
                        ))}
                      </TourScrollView>
                    </View>
                  </View>

                  {formClassId ? (
                    <View style={styles.composerStep}>
                      <Text style={[styles.stepLabel, { color: subColor }]}>
                        2. Section{formSections.length === 1 ? ' · auto-selected' : ''}
                      </Text>
                      <View style={[styles.chipTrack, { backgroundColor: trackBg, borderColor: fieldBorder }]}>
                        <TourScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.composerChipRow}
                        >
                          {formSections.map((item) => (
                            <FilterChip
                              key={item.class_section_id}
                              label={item.section_name}
                              selected={formClassSectionId === item.class_section_id}
                              theme={theme}
                              isDark={isDark}
                              onPress={() => chooseFormSection(item.class_section_id)}
                            />
                          ))}
                        </TourScrollView>
                      </View>
                    </View>
                  ) : (
                    <Text style={[styles.inlineHint, { color: subColor }]}>
                      Choose a class to continue.
                    </Text>
                  )}

                  {formTargetLabel ? (
                    <View style={[styles.targetPill, { backgroundColor: primaryTint, borderColor: schoolColorWithAlpha(primary, 0.28) }]}>
                      <Ionicons name="checkmark-circle" size={15} color={primary} />
                      <Text style={[styles.targetPillText, { color: primary }]}>Posting to {formTargetLabel}</Text>
                    </View>
                  ) : null}
                </View>
              )}

              <FieldLabel text="Diary type" color={titleColor} />
              <View style={[styles.modeSwitch, { backgroundColor: trackBg, borderColor: fieldBorder }]}>
                <ModeButton
                  icon="people-outline"
                  title="Whole class"
                  selected={formMode === 'class'}
                  onPress={() => chooseMode('class')}
                  theme={theme}
                  onPrimary={onPrimary}
                />
                <ModeButton
                  icon="library-outline"
                  title="Subject"
                  selected={formMode === 'subject'}
                  onPress={() => chooseMode('subject')}
                  theme={theme}
                  onPrimary={onPrimary}
                />
              </View>
              <Text style={[styles.modeHint, { color: subColor }]}>
                {formMode === 'class'
                  ? 'Visible to everyone in the class.'
                  : 'Shown under one subject for students and parents.'}
              </Text>

              {formMode === 'subject' ? (
                <>
                  <FieldLabel text="Subject" color={titleColor} />
                  {!selectedFormOption ? (
                    <Text style={[styles.inlineHint, { color: subColor }]}>Select class and section first.</Text>
                  ) : selectedFormOption.subjects.length === 0 ? (
                    <Text style={[styles.inlineHint, { color: theme.colors.danger }]}>
                      No subjects are assigned to this class-section.
                    </Text>
                  ) : (
                    <View style={[styles.chipTrack, { backgroundColor: trackBg, borderColor: fieldBorder }]}>
                      <TourScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.composerChipRow}
                      >
                        {selectedFormOption.subjects.map((subject) => (
                          <FilterChip
                            key={subject.id}
                            label={subject.name}
                            selected={formSubjectId === subject.id}
                            theme={theme}
                            isDark={isDark}
                            onPress={() => setFormSubjectId(subject.id)}
                          />
                        ))}
                      </TourScrollView>
                    </View>
                  )}
                </>
              ) : null}

              <FieldLabel text="Title" color={titleColor} mutedColor={theme.colors.textMuted} optional />
              <AppTextInput
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder={formMode === 'subject' ? 'e.g. Maths homework' : 'e.g. Half-day tomorrow'}
                placeholderTextColor={theme.colors.textMuted}
                style={[
                  styles.input,
                  styles.fieldFrame,
                  { backgroundColor: fieldBg, borderColor: fieldBorder, color: titleColor },
                ]}
              />

              <FieldLabel text="Details" color={titleColor} />
              <AppTextInput
                value={formContent}
                onChangeText={setFormContent}
                placeholder={
                  formMode === 'subject'
                    ? 'Homework, instructions, or reminders'
                    : 'Class update or announcement'
                }
                placeholderTextColor={theme.colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={[
                  styles.input,
                  styles.textArea,
                  styles.fieldFrame,
                  { backgroundColor: fieldBg, borderColor: fieldBorder, color: titleColor },
                ]}
              />

              {formMode === 'subject' ? (
                <AppDatePicker
                  label="Homework due date"
                  value={formDueDate}
                  onChange={setFormDueDate}
                  minimumDate={editingEntry?.entry_date || today}
                  isDark={isDark}
                  accentColor={primary}
                  containerStyle={styles.dateField}
                  wrapperStyle={{
                    ...styles.fieldFrame,
                    backgroundColor: fieldBg,
                    borderColor: fieldBorder,
                  }}
                />
              ) : null}
            </TourScrollView>

            <View style={[styles.sheetActions, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.25)' }]}>
              <PressScale onPress={closeComposer} disabled={saving}>
                <View style={[styles.cancelButton, styles.frameControl, { backgroundColor: fieldBg, borderColor: fieldBorder }]}>
                  <Text style={[styles.cancelButtonText, { color: titleColor }]}>Cancel</Text>
                </View>
              </PressScale>
              <PressScale onPress={saveDiary} disabled={saving}>
                <View
                  style={[
                    styles.saveButton,
                    {
                      backgroundColor: primary,
                      shadowColor: primary,
                      shadowOpacity: Platform.OS === 'web' ? 0.22 : 0.28,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 6 },
                      elevation: 4,
                    },
                    saving && styles.disabledButton,
                  ]}
                >
                  {saving ? (
                    <LogoLoader size={22} color={onPrimary} />
                  ) : (
                    <Ionicons name={editingEntry ? 'save-outline' : 'send-outline'} size={18} color={onPrimary} />
                  )}
                  <Text style={[styles.saveButtonText, { color: onPrimary }]}>
                    {saving ? 'Saving…' : editingEntry ? 'Save changes' : 'Post diary'}
                  </Text>
                </View>
              </PressScale>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const DiaryEntryCard = React.memo(function DiaryEntryCard({
  entry,
  index,
  isDark,
  theme,
  cardBg,
  titleColor,
  subColor,
  primary,
  primaryTint,
  showClassBadge,
  onEdit,
  onDelete,
}: {
  entry: DiaryEntry;
  index: number;
  isDark: boolean;
  theme: SchoolTheme;
  cardBg: string;
  titleColor: string;
  subColor: string;
  primary: string;
  primaryTint: string;
  showClassBadge: boolean;
  onEdit: (entry: DiaryEntry) => void;
  onDelete: (entry: DiaryEntry) => void;
}) {
  const dueLabel = formatDisplayDate(entry.homework_due_date, 'MMM d');
  const animateIn = index < 8;
  const danger = theme.colors.danger;
  const dangerTint = schoolColorWithAlpha(danger, isDark ? 0.22 : 0.12);
  const photos = diaryPhotoUrls(entry.attachments);
  const photoOnly = isPhotoOnlyDiary(entry.content, entry.attachments);
  const sourceLabel = diarySourceLabel(entry.entry_source, photos.length > 0);

  const body = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: cardBg,
          borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.18)',
        },
        // Soft clay on early rows; later rows stay border-light for scroll perf
        index < 12 ? clay(isDark, 'sm') : null,
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardIdentity}>
          {showClassBadge ? (
            <View style={[styles.classBadge, { backgroundColor: primaryTint }]}>
              <Text style={[styles.classBadgeText, { color: primary }]}>
                {entry.class_name}-{entry.section_name}
              </Text>
            </View>
          ) : null}
          <View
            style={[
              styles.typeBadge,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.32)',
              },
            ]}
          >
            <Ionicons
              name={entry.subject_id ? 'library-outline' : 'people-outline'}
              size={13}
              color={subColor}
            />
            <Text style={[styles.typeBadgeText, { color: subColor }]}>
              {entry.subject_name || 'Whole class'}
            </Text>
          </View>
          {sourceLabel ? (
            <View
              style={[
                styles.typeBadge,
                {
                  backgroundColor: isDark ? 'rgba(79,70,229,0.18)' : '#EEF2FF',
                  borderColor: 'transparent',
                },
              ]}
            >
              <Ionicons name={photos.length ? 'camera-outline' : 'sparkles-outline'} size={13} color={primary} />
              <Text style={[styles.typeBadgeText, { color: primary }]}>{sourceLabel}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.cardActions}>
          <PressScale onPress={() => onEdit(entry)} hitSlop={8}>
            <View style={[styles.editButton, { backgroundColor: primaryTint }]}>
              <Ionicons name="create-outline" size={15} color={primary} />
              <Text style={[styles.editButtonText, { color: primary }]}>Edit</Text>
            </View>
          </PressScale>
          <PressScale onPress={() => onDelete(entry)} hitSlop={8}>
            <View style={[styles.editButton, { backgroundColor: dangerTint }]}>
              <Ionicons name="trash-outline" size={15} color={danger} />
              <Text style={[styles.editButtonText, { color: danger }]}>Delete</Text>
            </View>
          </PressScale>
        </View>
      </View>

      <Text style={[styles.cardTitle, { color: titleColor }]}>{entryTitle(entry)}</Text>
      {photoOnly ? null : (
        <Text style={[styles.content, { color: subColor }]}>{entry.content || entry.content_te}</Text>
      )}
      <DiaryPhotoStrip attachments={entry.attachments} hintColor={subColor} />

      <View style={[styles.cardFooter, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.2)' }]}>
        <View style={styles.footerItem}>
          <View style={[styles.footerIcon, { backgroundColor: primaryTint }]}>
            <Ionicons name="person-outline" size={12} color={primary} />
          </View>
          <Text style={[styles.footerText, { color: subColor }]} numberOfLines={1}>
            {entry.teacher_name || 'Administrator'}
          </Text>
        </View>
        {dueLabel ? (
          <View style={styles.footerItem}>
            <View style={[styles.footerIcon, { backgroundColor: schoolColorWithAlpha(theme.colors.warning, isDark ? 0.22 : 0.14) }]}>
              <Ionicons name="calendar-outline" size={12} color={theme.colors.warning} />
            </View>
            <Text style={[styles.footerText, { color: subColor }]}>Due {dueLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  if (!animateIn) return body;

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 7) * 40).duration(280)}>
      {body}
    </Animated.View>
  );
});

function FilterRow({
  label,
  subColor,
  children,
  last,
}: {
  label: string;
  subColor: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.filterRow, last && { marginBottom: 0 }]}>
      <Text style={[styles.filterLabel, { color: subColor }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
        {children}
      </ScrollView>
    </View>
  );
}

function FilterChip({
  label,
  selected,
  theme,
  isDark,
  onPress,
}: {
  label: string;
  selected: boolean;
  theme: SchoolTheme;
  isDark: boolean;
  onPress: () => void;
}) {
  const selectedText = themeTextOn(theme.colors.primary, theme);
  const idleBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.38)';
  return (
    <PressScale onPress={onPress}>
      <View
        style={[
          styles.chip,
          selected
            ? {
                backgroundColor: theme.colors.primary,
                borderColor: theme.colors.primary,
              }
            : {
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                borderColor: idleBorder,
              },
        ]}
      >
        <Text style={[styles.chipText, { color: selected ? selectedText : theme.colors.textPrimary }]}>
          {label}
        </Text>
      </View>
    </PressScale>
  );
}

function FieldLabel({
  text,
  color,
  mutedColor,
  optional,
}: {
  text: string;
  color: string;
  mutedColor?: string;
  optional?: boolean;
}) {
  return (
    <Text style={[styles.fieldLabel, { color }]}>
      {text}
      {optional ? <Text style={[styles.optionalLabel, { color: mutedColor }]}>  Optional</Text> : null}
    </Text>
  );
}

function ModeButton({
  icon,
  title,
  selected,
  onPress,
  theme,
  onPrimary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  selected: boolean;
  onPress: () => void;
  theme: SchoolTheme;
  onPrimary: string;
}) {
  return (
    <PressScale onPress={onPress} style={{ flex: 1 }}>
      <View
        style={[
          styles.modeButton,
          selected && {
            backgroundColor: theme.colors.primary,
            shadowColor: theme.colors.primary,
            shadowOpacity: 0.2,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 2,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={16}
          color={selected ? onPrimary : theme.colors.textSecondary}
        />
        <Text
          style={[
            styles.modeTitle,
            { color: selected ? onPrimary : theme.colors.textStrong },
          ]}
        >
          {title}
        </Text>
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 96,
    gap: 4,
  },
  filterPanel: {
    padding: 16,
    marginBottom: 18,
  },
  filterPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  filterPanelTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minWidth: 0,
  },
  filterIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPanelTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  filterPanelSub: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  clearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  clearChipText: { fontSize: 12, fontWeight: '700' },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  filterLabel: {
    width: 64,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  filterHint: { fontSize: 12, fontWeight: '600', paddingVertical: 8, paddingRight: 12 },
  filterHintPadded: { fontSize: 12, fontWeight: '600', paddingTop: 2, paddingLeft: 2 },
  filterScroll: { paddingRight: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 8,
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  listHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  listTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  listSubtitle: { fontSize: 13, marginTop: 3, fontWeight: '500' },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    minHeight: 44,
  },
  addButtonText: { fontSize: 14, fontWeight: '800' },
  disabledButton: { opacity: 0.5 },
  centerBox: { paddingVertical: 80, alignItems: 'center', gap: 14 },
  loadingLabel: { fontSize: 13, fontWeight: '600' },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 28,
    gap: 10,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  emptySub: { maxWidth: 380, fontSize: 14, lineHeight: 21, textAlign: 'center', fontWeight: '500' },
  emptyAction: {
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  emptyActionText: { fontSize: 14, fontWeight: '800' },
  setupHint: { maxWidth: 420, marginTop: 8, fontSize: 13, textAlign: 'center' },
  groupBlock: { marginBottom: 6 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: 6,
  },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupLabel: { fontSize: 14, fontWeight: '800', flex: 1 },
  groupCount: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 22,
    textAlign: 'center',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
  },
  classBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  classBadgeText: { fontSize: 12, fontWeight: '800' },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  typeBadgeText: { fontSize: 12, fontWeight: '600' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    minHeight: 36,
  },
  editButtonText: { fontSize: 13, fontWeight: '800' },
  cardTitle: { fontSize: 16, fontWeight: '800', marginTop: 12, marginBottom: 6, letterSpacing: -0.2 },
  content: { fontSize: 14, lineHeight: 22, fontWeight: '500' },
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: '100%' },
  footerIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '92%',
    alignSelf: 'center',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
  },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 },
  sheetIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  sheetSubtitle: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: { paddingHorizontal: 20, paddingBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '800', marginTop: 14, marginBottom: 8 },
  optionalLabel: { fontSize: 11, fontWeight: '600' },
  formChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  composerTarget: { gap: 12, marginTop: 4 },
  composerStep: { gap: 8 },
  stepLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.35, textTransform: 'uppercase' },
  chipTrack: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 8,
    paddingLeft: 10,
    overflow: 'hidden',
  },
  composerChipRow: { paddingRight: 10, alignItems: 'center' },
  targetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  targetPillText: { fontSize: 12, fontWeight: '700' },
  lockedClass: {
    borderRadius: 14,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  lockedClassText: { fontSize: 14, fontWeight: '800' },
  lockedHint: { width: '100%', fontSize: 11, marginLeft: 23 },
  lockedHintInline: { fontSize: 11, marginTop: 2, fontWeight: '500' },
  modeSwitch: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    gap: 4,
    borderWidth: 1.5,
    minHeight: 52,
  },
  modeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 8,
  },
  modeIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTitle: { fontSize: 13, fontWeight: '800' },
  modeSubtitle: { fontSize: 10, marginTop: 2, fontWeight: '500' },
  modeHint: { fontSize: 12, marginTop: 8, fontWeight: '500', lineHeight: 17 },
  inlineHint: { fontSize: 13, paddingVertical: 4, fontWeight: '500' },
  fieldFrame: {
    borderWidth: 1.5,
    borderRadius: 14,
  },
  frameControl: {
    borderWidth: 1.5,
  },
  input: {
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '500',
  },
  textArea: { minHeight: 104, paddingTop: 13, paddingBottom: 13 },
  dateField: { marginTop: 14, marginBottom: 0 },
  scopeNote: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    borderRadius: 14,
    padding: 12,
    marginTop: 15,
  },
  scopeNoteText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  cancelButton: {
    minWidth: 100,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  cancelButtonText: { fontSize: 14, fontWeight: '800' },
  saveButton: {
    minWidth: 148,
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
  },
  saveButtonText: { fontSize: 14, fontWeight: '800' },
});
