import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import AppDatePicker from '@/src/components/AppDatePicker';

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StatusBar,
  FlatList,
  Modal,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp, Layout } from 'react-native-reanimated';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import * as Haptics from '../../src/utils/haptics';
import AdminHeader from '../../src/components/AdminHeader';
import { ADMIN_THEME } from '../../src/constants/adminTheme';
import { ClassService, ClassInfo, Section, AcademicYear } from '../../src/services/classService';
import { ResultService, Subject } from '../../src/services/commonServices';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';

type TabType = 'classes' | 'sections' | 'years' | 'subjects' | 'mappings';

const ACCENT = '#4F46E5';
const ACCENT_SOFT = '#EEF2FF';

const TABS: {
  key: TabType;
  label: string;
  short: string;
  icon: keyof typeof Ionicons.glyphMap;
  singular: string;
  addLabel: string;
  emptyTitle: string;
  emptyHint: string;
  hint: string;
}[] = [
  {
    key: 'classes',
    label: 'Classes',
    short: 'Classes',
    icon: 'school-outline',
    singular: 'class',
    addLabel: 'Add Class',
    emptyTitle: 'No classes yet',
    emptyHint: 'Start with Nursery / LKG and build up to your highest grade.',
    hint: 'Hold the grip and drag — lowest grade on top, graduates at the bottom.',
  },
  {
    key: 'sections',
    label: 'Sections',
    short: 'Sections',
    icon: 'grid-outline',
    singular: 'section',
    addLabel: 'Add Section',
    emptyTitle: 'No sections yet',
    emptyHint: 'Add sections like A, B, C that classes will be split into.',
    hint: 'Sections are shared across every class.',
  },
  {
    key: 'years',
    label: 'Years',
    short: 'Years',
    icon: 'calendar-outline',
    singular: 'year',
    addLabel: 'Add Year',
    emptyTitle: 'No academic years',
    emptyHint: 'Create the current academic year before mapping classes.',
    hint: 'The current year drives promotions, fees, and mappings.',
  },
  {
    key: 'subjects',
    label: 'Subjects',
    short: 'Subjects',
    icon: 'book-outline',
    singular: 'subject',
    addLabel: 'Add Subject',
    emptyTitle: 'No subjects yet',
    emptyHint: 'Add subjects taught at your school (Maths, English…).',
    hint: 'Reuse subjects across class timetables.',
  },
  {
    key: 'mappings',
    label: 'Mappings',
    short: 'Maps',
    icon: 'git-merge-outline',
    singular: 'mapping',
    addLabel: 'Add Mapping',
    emptyTitle: 'No class mappings',
    emptyHint: 'Link a class + section + year so students and timetables can attach.',
    hint: 'One mapping = class + section for an academic year.',
  },
];

export default function AcademicManagement() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === 'web' && width >= 768;

  const [activeTab, setActiveTab] = useState<TabType>('classes');
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<TabType, number>>({
    classes: 0,
    sections: 0,
    years: 0,
    subjects: 0,
    mappings: 0,
  });

  const [newItemName, setNewItemName] = useState('');
  const [newItemNameTe, setNewItemNameTe] = useState('');
  const [newItemCode, setNewItemCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [selClassId, setSelClassId] = useState('');
  const [selSectionId, setSelSectionId] = useState('');
  const [selYearId, setSelYearId] = useState('');
  const [reordering, setReordering] = useState(false);

  const tabMeta = TABS.find((t) => t.key === activeTab)!;

  const refreshCounts = useCallback(async () => {
    try {
      const [c, s, y, sub, m] = await Promise.all([
        ClassService.getClasses(),
        ClassService.getSections(),
        ClassService.getAcademicYears(),
        ResultService.getSubjects(),
        ClassService.getClassSections(),
      ]);
      setCounts({
        classes: c.length,
        sections: s.length,
        years: y.length,
        subjects: sub.length,
        mappings: m.length,
      });
    } catch {
      /* counts are non-critical */
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'classes') {
        const data = await ClassService.getClasses();
        setClasses(data);
        setCounts((prev) => ({ ...prev, classes: data.length }));
      } else if (activeTab === 'sections') {
        const data = await ClassService.getSections();
        setSections(data);
        setCounts((prev) => ({ ...prev, sections: data.length }));
      } else if (activeTab === 'years') {
        const data = await ClassService.getAcademicYears();
        setYears(data);
        setCounts((prev) => ({ ...prev, years: data.length }));
      } else if (activeTab === 'subjects') {
        const data = await ResultService.getSubjects();
        setSubjects(data);
        setCounts((prev) => ({ ...prev, subjects: data.length }));
      } else if (activeTab === 'mappings') {
        const [m, c, s, y] = await Promise.all([
          ClassService.getClassSections(),
          ClassService.getClasses(),
          ClassService.getSections(),
          ClassService.getAcademicYears(),
        ]);
        setMappings(m);
        setClasses(c);
        setSections(s);
        setYears(y);
        setCounts((prev) => ({
          ...prev,
          mappings: m.length,
          classes: c.length,
          sections: s.length,
          years: y.length,
        }));
        const current = y.find(
          (yr) => new Date(yr.start_date) <= new Date() && new Date(yr.end_date) >= new Date()
        );
        if (current) setSelYearId(current.id);
      }
    } catch {
      alertCompat('Error', 'Failed to load academic data');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setNewItemName('');
    setNewItemNameTe('');
    setNewItemCode('');
    setStartDate('');
    setEndDate('');
  };

  const handleAdd = async () => {
    if (!newItemName.trim() && activeTab !== 'years' && activeTab !== 'mappings') {
      alertCompat('Validation', 'Please enter a name');
      return;
    }
    if (activeTab === 'years' && !newItemCode.trim()) {
      alertCompat('Validation', 'Please enter an academic year code');
      return;
    }
    setSaving(true);
    try {
      if (activeTab === 'classes') {
        await ClassService.createClass({ name: newItemName, code: newItemCode });
      } else if (activeTab === 'sections') {
        await ClassService.createSection({ name: newItemName, code: newItemCode });
      } else if (activeTab === 'years') {
        await ClassService.createAcademicYear({
          code: newItemCode,
          start_date: startDate,
          end_date: endDate,
        });
      } else if (activeTab === 'subjects') {
        const trimmedCode = newItemCode.trim();
        await ResultService.createSubject({
          name: newItemName.trim(),
          name_te: newItemNameTe.trim() || undefined,
          ...(trimmedCode ? { code: trimmedCode } : {}),
        });
      } else if (activeTab === 'mappings') {
        if (!selClassId || !selSectionId || !selYearId) {
          alertCompat('Error', 'Please select Class, Section and Academic Year');
          return;
        }
        await ClassService.createClassSection({
          class_id: selClassId,
          section_id: selSectionId,
          academic_year_id: selYearId,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
      resetForm();
      await fetchData();
      refreshCounts();
    } catch (error: any) {
      alertCompat('Error', error.message || 'Failed to create item');
    } finally {
      setSaving(false);
    }
  };

  const handleReorderClasses = async (data: ClassInfo[]) => {
    const unchanged = data.every((c, i) => c.id === classes[i]?.id);
    if (unchanged) return;

    const prev = classes;
    setClasses(data.map((c, i) => ({ ...c, sort_order: i + 1 })));
    setReordering(true);
    try {
      const updated = await ClassService.reorderClasses(data.map((c) => c.id));
      setClasses(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error: any) {
      setClasses(prev);
      alertCompat('Error', error.message || 'Failed to update class order');
    } finally {
      setReordering(false);
    }
  };

  const handleMoveClass = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= classes.length) return;
    const reordered = [...classes];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    await handleReorderClasses(reordered);
  };

  const handleDelete = (id: string, name: string) => {
    alertCompat(
      'Confirm Delete',
      `Delete ${tabMeta.singular} "${name}"? This cannot be undone if nothing depends on it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (activeTab === 'classes') await ClassService.deleteClass(id);
              else if (activeTab === 'sections') await ClassService.deleteSection(id);
              else if (activeTab === 'years') await ClassService.deleteAcademicYear(id);
              else if (activeTab === 'subjects') await ResultService.deleteSubject(id);
              else if (activeTab === 'mappings') await ClassService.deleteClassSection(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await fetchData();
              refreshCounts();
            } catch (error: any) {
              alertCompat('Error', error.message || 'Failed to delete item');
            }
          },
        },
      ]
    );
  };

  const handleOpenModal = () => {
    if (activeTab === 'years' && years.length > 0) {
      try {
        const sorted = [...years].sort(
          (a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
        );
        const latestEnd = new Date(sorted[0].end_date);
        const nextStart = new Date(latestEnd);
        nextStart.setDate(nextStart.getDate() + 1);
        const nextEnd = new Date(nextStart);
        nextEnd.setFullYear(nextEnd.getFullYear() + 1);
        nextEnd.setDate(nextEnd.getDate() - 1);
        setStartDate(nextStart.toISOString().split('T')[0]);
        setEndDate(nextEnd.toISOString().split('T')[0]);
        setNewItemCode(`${nextStart.getFullYear()}-${nextEnd.getFullYear()}`);
      } catch {
        /* ignore prefill errors */
      }
    }
    if (activeTab === 'mappings') {
      setSelClassId('');
      setSelSectionId('');
    }
    setModalVisible(true);
  };

  const handleTabChange = (tab: TabType) => {
    if (tab === activeTab) return;
    Haptics.selectionAsync();
    setActiveTab(tab);
  };

  const listData =
    activeTab === 'classes'
      ? classes
      : activeTab === 'sections'
        ? sections
        : activeTab === 'years'
          ? years
          : activeTab === 'subjects'
            ? subjects
            : mappings;

  const setupSteps = useMemo(
    () =>
      TABS.map((t, i) => ({
        ...t,
        done: counts[t.key] > 0,
        step: i + 1,
      })),
    [counts]
  );
  const setupDoneCount = setupSteps.filter((s) => s.done).length;
  const nextIncomplete = setupSteps.find((s) => !s.done);
  const activeCount = counts[activeTab];

  const renderChipSelector = (
    label: string,
    items: { id: string; label: string }[],
    selectedId: string,
    onSelect: (id: string) => void,
    emptyMsg: string
  ) => (
    <View style={styles.chipBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {items.length === 0 ? (
        <Text style={styles.chipEmpty}>{emptyMsg}</Text>
      ) : (
        <View style={styles.chipWrap}>
          {items.map((item) => {
            const selected = selectedId === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  Haptics.selectionAsync();
                  onSelect(item.id);
                }}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderClassRow = ({ item, drag, isActive, getIndex }: RenderItemParams<ClassInfo>) => {
    const index = getIndex?.() ?? classes.findIndex((c) => c.id === item.id);
    const isFirst = index === 0;
    const isLast = index === classes.length - 1;
    const isOnly = classes.length === 1;

    return (
      <ScaleDecorator>
        <Animated.View
          layout={Layout.springify().damping(18)}
          style={[
            styles.row,
            isLast && styles.rowLast,
            isActive && styles.rowActive,
            isLast && !isOnly && styles.rowGraduating,
          ]}
        >
          {/* Ladder rail */}
          <View style={styles.railCol}>
            {!isFirst ? <View style={styles.railLineTop} /> : <View style={styles.railSpacer} />}
            <View style={[styles.railNode, isFirst && styles.railNodeEntry, isLast && styles.railNodeGrad]}>
              <Text style={[styles.railNodeText, (isFirst || isLast) && styles.railNodeTextEmphasis]}>
                {item.sort_order ?? index + 1}
              </Text>
            </View>
            {!isLast ? <View style={styles.railLineBottom} /> : <View style={styles.railSpacer} />}
          </View>

          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.metaRow}>
              {item.code ? <Text style={styles.rowSub}>{item.code}</Text> : null}
              {isFirst ? (
                <View style={[styles.tag, styles.tagEntry]}>
                  <Text style={styles.tagEntryText}>Entry</Text>
                </View>
              ) : null}
              {isLast ? (
                <View style={[styles.tag, styles.tagGrad]}>
                  <Ionicons name="school" size={10} color="#B45309" />
                  <Text style={styles.tagGradText}>Graduates</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.moveStack}>
            <TouchableOpacity
              style={[styles.moveBtn, (isFirst || reordering) && styles.moveBtnDisabled]}
              onPress={() => handleMoveClass(index, 'up')}
              disabled={isFirst || reordering}
              hitSlop={4}
              accessibilityLabel="Move up"
            >
              <Ionicons
                name="chevron-up"
                size={14}
                color={isFirst || reordering ? theme.colors.textTertiary : ACCENT}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.moveBtn, (isLast || reordering) && styles.moveBtnDisabled]}
              onPress={() => handleMoveClass(index, 'down')}
              disabled={isLast || reordering}
              hitSlop={4}
              accessibilityLabel="Move down"
            >
              <Ionicons
                name="chevron-down"
                size={14}
                color={isLast || reordering ? theme.colors.textTertiary : ACCENT}
              />
            </TouchableOpacity>
          </View>

          <Pressable
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              drag();
            }}
            delayLongPress={Platform.OS === 'web' ? 120 : 90}
            disabled={reordering}
            style={({ pressed }) => [
              styles.dragHandle,
              pressed && styles.dragHandlePressed,
              Platform.OS === 'web' && ({ cursor: 'grab' } as any),
            ]}
            accessibilityLabel="Drag to reorder"
          >
            <Ionicons name="reorder-two" size={20} color={theme.colors.textTertiary} />
          </Pressable>

          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(item.id, item.name)}
            hitSlop={6}
            accessibilityLabel="Delete class"
          >
            <Ionicons name="trash-outline" size={16} color="#EF4444" />
          </TouchableOpacity>
        </Animated.View>
      </ScaleDecorator>
    );
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const itemName = item.class_name
      ? `${item.class_name} · ${item.section_name}`
      : item.name || item.code;
    const isLast = index === listData.length - 1;

    return (
      <Animated.View
        entering={FadeInDown.delay(Math.min(index, 8) * 35).duration(260)}
        style={[styles.row, isLast && styles.rowLast]}
      >
        <View style={[styles.iconBadge]}>
          <Ionicons
            name={
              activeTab === 'sections'
                ? 'grid-outline'
                : activeTab === 'years'
                  ? 'calendar-outline'
                  : activeTab === 'subjects'
                    ? 'book-outline'
                    : 'link-outline'
            }
            size={16}
            color={ACCENT}
          />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {itemName}
          </Text>
          {item.code && item.name ? <Text style={styles.rowSub}>{item.code}</Text> : null}
          {activeTab === 'mappings' && item.academic_year ? (
            <Text style={styles.rowSub}>{item.academic_year}</Text>
          ) : null}
          {activeTab === 'years' ? (
            <Text style={styles.rowSub}>
              {item.start_date} → {item.end_date}
            </Text>
          ) : null}
          {activeTab === 'subjects' && item.name_te ? (
            <Text style={styles.rowSub}>{item.name_te}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item.id, itemName)}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={16} color="#EF4444" />
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const EmptyState = () => (
    <Animated.View entering={FadeInUp.duration(320)} style={styles.emptyWrap}>
      <LinearGradient
        colors={isDark ? ['rgba(79,70,229,0.2)', 'rgba(79,70,229,0.05)'] : [ACCENT_SOFT, '#F8FAFF']}
        style={styles.emptyIcon}
      >
        <Ionicons name={tabMeta.icon} size={32} color={ACCENT} />
      </LinearGradient>
      <Text style={styles.emptyTitle}>{tabMeta.emptyTitle}</Text>
      <Text style={styles.emptyHint}>{tabMeta.emptyHint}</Text>
      <TouchableOpacity style={styles.emptyCta} onPress={handleOpenModal} activeOpacity={0.88}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.emptyCtaText}>{tabMeta.addLabel}</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const ListHeader = (
    <View style={styles.headerBlock}>
      {setupDoneCount < TABS.length ? (
        <Animated.View entering={FadeInDown.duration(260)} style={styles.setupCard}>
          <View style={styles.setupTop}>
            <Text style={styles.setupTitle}>Structure setup</Text>
            <Text style={styles.setupCount}>
              {setupDoneCount}/{TABS.length}
            </Text>
          </View>
          <View style={styles.setupTrack}>
            <View style={[styles.setupFill, { width: `${(setupDoneCount / TABS.length) * 100}%` as any }]} />
          </View>
          <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.setupSteps}>
            {setupSteps.map((step, i) => (
              <TouchableOpacity
                key={step.key}
                onPress={() => handleTabChange(step.key)}
                style={[
                  styles.setupPill,
                  step.done && styles.setupPillDone,
                  activeTab === step.key && styles.setupPillActive,
                ]}
              >
                {step.done ? (
                  <Ionicons name="checkmark-circle" size={13} color="#059669" />
                ) : (
                  <Text style={styles.setupStepNum}>{i + 1}</Text>
                )}
                <Text
                  style={[
                    styles.setupPillText,
                    step.done && styles.setupPillTextDone,
                    activeTab === step.key && styles.setupPillTextActive,
                  ]}
                >
                  {step.label}
                </Text>
              </TouchableOpacity>
            ))}
          </TourScrollView>
          {nextIncomplete ? (
            <Text style={styles.setupHint}>Next up: {nextIncomplete.addLabel.toLowerCase()}</Text>
          ) : null}
        </Animated.View>
      ) : null}

      {/* Segmented tab track */}
      <View style={styles.segmentTrack}>
        <LinearGradient
          colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentScroll}>
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            const count = counts[tab.key];
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => handleTabChange(tab.key)}
                style={[styles.segment, active && styles.segmentActive]}
                activeOpacity={0.88}
              >
                <Ionicons name={tab.icon} size={14} color={active ? '#fff' : theme.colors.textSecondary} />
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {isWide ? tab.label : tab.short}
                </Text>
                {count > 0 ? (
                  <View style={[styles.countBadge, active && styles.countBadgeActive]}>
                    <Text style={[styles.countText, active && styles.countTextActive]}>{count}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </TourScrollView>
      </View>

      {/* Panel toolbar */}
      <View style={styles.panelToolbar}>
        <View style={styles.panelToolbarLeft}>
          <Text style={styles.panelTitle}>{tabMeta.label}</Text>
          {!loading && activeCount > 0 ? (
            <View style={styles.panelCountPill}>
              <Text style={styles.panelCountText}>{activeCount}</Text>
            </View>
          ) : null}
        </View>
        {isWide && !loading ? (
          <TouchableOpacity style={styles.inlineAdd} onPress={handleOpenModal} activeOpacity={0.88}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.inlineAddText}>{tabMeta.addLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!loading && listData.length > 0 ? (
        <View style={styles.hintBar}>
          <Ionicons
            name={activeTab === 'classes' ? 'hand-left-outline' : 'information-circle-outline'}
            size={13}
            color="#64748B"
          />
          <Text style={styles.hintText}>{tabMeta.hint}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
      <TourTarget id="screen.admin-academics.overview"><AdminHeader title="Academic Structure" showBackButton /></TourTarget>

      <TourTarget id="screen.admin-academics.workspace" native><View style={styles.content}>
        {loading ? (
          <View style={styles.loadingWrap}>
            {ListHeader}
            <View style={[styles.listShell, styles.listShellEmpty]}>
              <LogoLoader size={52} color={ACCENT} style={{ marginTop: 28, marginBottom: 28 }} />
            </View>
          </View>
        ) : activeTab === 'classes' ? (
          <DraggableFlatList
            data={classes}
            keyExtractor={(item) => item.id}
            onDragEnd={({ data }) => handleReorderClasses(data)}
            renderItem={renderClassRow}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <>
                {ListHeader}
                {classes.length > 0 ? <View style={styles.listShellTop} /> : null}
              </>
            }
            ListFooterComponent={classes.length > 0 ? <View style={styles.listShellBottom} /> : null}
            ListEmptyComponent={
              <View style={[styles.listShell, styles.listShellEmpty]}>
                <EmptyState />
              </View>
            }
            ItemSeparatorComponent={
              classes.length > 0
                ? () => <View style={styles.rowSeparatorWrap}><View style={styles.rowSeparator} /></View>
                : null
            }
            activationDistance={10}
            containerStyle={{ flex: 1 }}
          />
        ) : (
          <FlatList
            data={listData}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <>
                {ListHeader}
                {listData.length > 0 ? <View style={styles.listShellTop} /> : null}
              </>
            }
            ListFooterComponent={listData.length > 0 ? <View style={styles.listShellBottom} /> : null}
            ListEmptyComponent={
              <View style={[styles.listShell, styles.listShellEmpty]}>
                <EmptyState />
              </View>
            }
            ItemSeparatorComponent={
              listData.length > 0
                ? () => (
                    <View style={styles.rowSeparatorWrap}>
                      <View style={styles.rowSeparator} />
                    </View>
                  )
                : null
            }
            windowSize={7}
            maxToRenderPerBatch={10}
            initialNumToRender={12}
            removeClippedSubviews
          />
        )}
      </View></TourTarget>

      {/* Mobile FAB only — desktop uses toolbar button */}
      {!loading && listData.length > 0 && !isWide ? (
        <TouchableOpacity
          style={styles.fab}
          onPress={handleOpenModal}
          activeOpacity={0.9}
          accessibilityLabel={tabMeta.addLabel}
        >
          <LinearGradient colors={['#6366F1', '#4338CA']} style={styles.fabGradient}>
            <LinearGradient
              colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.6, y: 0.9 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Ionicons name="add" size={26} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.modalScrim} onPress={() => setModalVisible(false)} />
          <View style={[styles.modalContent, isWide && styles.modalContentWide]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrap}>
                <Ionicons name={tabMeta.icon} size={20} color={ACCENT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{tabMeta.addLabel}</Text>
                <Text style={styles.modalSub}>
                  {activeTab === 'mappings'
                    ? 'Connect class, section, and year'
                    : `New ${tabMeta.singular} for your school`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={10} style={styles.modalClose}>
                <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {activeTab !== 'years' && activeTab !== 'mappings' ? (
              <AppTextInput
                style={styles.input}
                placeholder={
                  activeTab === 'classes'
                    ? 'Name (e.g. L.K.G, Class 1)'
                    : activeTab === 'sections'
                      ? 'Name (e.g. A, B)'
                      : 'Name (e.g. Mathematics)'
                }
                value={newItemName}
                onChangeText={setNewItemName}
              />
            ) : null}

            {activeTab === 'subjects' ? (
              <AppTextInput
                style={styles.input}
                placeholder="Telugu name (optional)"
                value={newItemNameTe}
                onChangeText={setNewItemNameTe}
              />
            ) : null}

            {activeTab !== 'mappings' ? (
              <AppTextInput
                style={styles.input}
                placeholder={activeTab === 'years' ? 'Code (e.g. 2025-26)' : 'Code (optional)'}
                value={newItemCode}
                onChangeText={setNewItemCode}
              />
            ) : null}

            {activeTab === 'years' ? (
              <>
                <AppDatePicker
                  label="Start Date"
                  value={startDate}
                  onChange={setStartDate}
                  containerStyle={{ marginBottom: 12 }}
                />
                <AppDatePicker
                  label="End Date"
                  value={endDate}
                  onChange={setEndDate}
                  minimumDate={startDate || undefined}
                  containerStyle={{ marginBottom: 12 }}
                />
              </>
            ) : null}

            {activeTab === 'mappings' ? (
              <>
                {renderChipSelector(
                  'Class',
                  classes.map((c) => ({ id: c.id, label: c.name })),
                  selClassId,
                  setSelClassId,
                  'Add classes first in the Classes tab'
                )}
                {renderChipSelector(
                  'Section',
                  sections.map((s) => ({ id: s.id, label: s.name })),
                  selSectionId,
                  setSelSectionId,
                  'Add sections first in the Sections tab'
                )}
                {renderChipSelector(
                  'Academic Year',
                  years.map((y) => ({ id: y.id, label: y.code })),
                  selYearId,
                  setSelYearId,
                  'Add an academic year first'
                )}
              </>
            ) : null}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, saving && { opacity: 0.6 }]}
                onPress={handleAdd}
                disabled={saving}
              >
                <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const getStyles = (theme: Theme, isDark: boolean) => {
  const pageBg = isDark ? theme.colors.background : '#E8ECF4';
  const shellBg = isDark ? theme.colors.card : '#F7F8FC';
  const rowBg = isDark ? theme.colors.card : '#FFFFFF';
  const hairline = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: pageBg,
    },
    content: {
      flex: 1,
      width: '100%',
    },
    loadingWrap: {
      flex: 1,
      paddingHorizontal: Platform.OS === 'web' ? 24 : 16,
      paddingTop: 4,
    },
    listContent: {
      paddingHorizontal: Platform.OS === 'web' ? 24 : 16,
      paddingBottom: 100,
      flexGrow: 1,
    },
    headerBlock: {
      paddingTop: 8,
      paddingBottom: 10,
    },

    /* Setup */
    setupCard: {
      backgroundColor: isDark ? 'rgba(79,70,229,0.14)' : ACCENT_SOFT,
      borderRadius: 16,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(99,102,241,0.28)' : '#E0E7FF',
    },
    setupTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    setupTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#C7D2FE' : '#3730A3',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    setupCount: {
      fontSize: 12,
      fontWeight: '800',
      color: ACCENT,
    },
    setupTrack: {
      height: 3,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#C7D2FE',
      overflow: 'hidden',
      marginBottom: 10,
    },
    setupFill: {
      height: '100%',
      backgroundColor: ACCENT,
      borderRadius: 2,
    },
    setupSteps: { gap: 6, paddingRight: 4 },
    setupPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#fff',
      borderWidth: 1,
      borderColor: hairline,
    },
    setupPillDone: {
      borderColor: '#A7F3D0',
      backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5',
    },
    setupPillActive: {
      borderColor: ACCENT,
      backgroundColor: isDark ? 'rgba(99,102,241,0.25)' : '#E0E7FF',
    },
    setupStepNum: {
      fontSize: 11,
      fontWeight: '800',
      color: '#64748B',
      width: 14,
      textAlign: 'center',
    },
    setupPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    setupPillTextDone: { color: '#059669' },
    setupPillTextActive: { color: '#4338CA' },
    setupHint: {
      marginTop: 8,
      fontSize: 12,
      color: '#64748B',
    },

    /* Segmented tabs */
    segmentTrack: {
      backgroundColor: shellBg,
      borderRadius: 16,
      padding: 4,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: hairline,
      borderBottomWidth: 1.5,
      borderBottomColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(76,90,120,0.12)',
      overflow: 'hidden',
      ...Platform.select({
        ios: {
          shadowColor: '#6B7A99',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
        },
        android: { elevation: 2 },
        default: {},
      }),
    },
    segmentScroll: {
      gap: 2,
    },
    segment: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 9,
      paddingHorizontal: 11,
      borderRadius: 12,
    },
    segmentActive: {
      backgroundColor: ACCENT,
      ...Platform.select({
        ios: {
          shadowColor: ACCENT,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.28,
          shadowRadius: 8,
        },
        android: { elevation: 3 },
        default: {},
      }),
    },
    segmentText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    segmentTextActive: {
      color: '#fff',
      fontWeight: '700',
    },
    countBadge: {
      minWidth: 18,
      height: 17,
      paddingHorizontal: 5,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    countBadgeActive: {
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
    countText: {
      fontSize: 10,
      fontWeight: '800',
      color: theme.colors.textSecondary,
    },
    countTextActive: { color: '#fff' },

    /* Panel toolbar */
    panelToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
      paddingHorizontal: 2,
    },
    panelToolbarLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    panelTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: theme.colors.textStrong,
      letterSpacing: -0.3,
    },
    panelCountPill: {
      backgroundColor: ACCENT_SOFT,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
    },
    panelCountText: {
      fontSize: 11,
      fontWeight: '800',
      color: ACCENT,
    },
    inlineAdd: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: ACCENT,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderBottomWidth: 1.5,
      borderBottomColor: 'rgba(0,0,0,0.14)',
    },
    inlineAddText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
    },
    hintBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
      paddingHorizontal: 2,
    },
    hintText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 16,
      color: '#64748B',
    },

    /* Grouped list shell */
    listShell: {
      backgroundColor: rowBg,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: hairline,
      overflow: 'hidden',
    },
    listShellEmpty: {
      marginTop: 0,
    },
    listShellTop: {
      height: 8,
      backgroundColor: rowBg,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: hairline,
    },
    listShellBottom: {
      height: 8,
      backgroundColor: rowBg,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18,
      borderWidth: 1,
      borderTopWidth: 0,
      borderColor: hairline,
      marginBottom: 12,
      ...Platform.select({
        ios: {
          shadowColor: '#6B7A99',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.08,
          shadowRadius: 14,
        },
        android: { elevation: 2 },
        default: {},
      }),
    },
    rowSeparatorWrap: {
      backgroundColor: rowBg,
      paddingLeft: 52,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: hairline,
    },
    rowSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: hairline,
    },

    /* Rows */
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: rowBg,
      paddingVertical: 8,
      paddingLeft: 8,
      paddingRight: 10,
      gap: 4,
      minHeight: 50,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: hairline,
    },
    rowLast: {},
    rowActive: {
      backgroundColor: isDark ? 'rgba(79,70,229,0.18)' : '#F5F3FF',
    },
    rowGraduating: {
      backgroundColor: isDark ? 'rgba(245,158,11,0.08)' : '#FFFBEB',
    },

    /* Class ladder rail */
    railCol: {
      width: 32,
      alignItems: 'center',
      alignSelf: 'stretch',
      justifyContent: 'center',
    },
    railLineTop: {
      width: 2,
      flex: 1,
      backgroundColor: isDark ? 'rgba(99,102,241,0.35)' : '#C7D2FE',
    },
    railLineBottom: {
      width: 2,
      flex: 1,
      backgroundColor: isDark ? 'rgba(99,102,241,0.35)' : '#C7D2FE',
    },
    railSpacer: { flex: 1 },
    railNode: {
      width: 24,
      height: 24,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(99,102,241,0.22)' : ACCENT_SOFT,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(129,140,248,0.4)' : '#C7D2FE',
    },
    railNodeEntry: {
      backgroundColor: isDark ? 'rgba(37,99,235,0.25)' : '#DBEAFE',
      borderColor: '#93C5FD',
    },
    railNodeGrad: {
      backgroundColor: isDark ? 'rgba(245,158,11,0.22)' : '#FEF3C7',
      borderColor: '#FCD34D',
    },
    railNodeText: {
      fontSize: 11,
      fontWeight: '800',
      color: ACCENT,
    },
    railNodeTextEmphasis: {
      color: theme.colors.textStrong,
    },

    iconBadge: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : ACCENT_SOFT,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 4,
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 2,
    },
    rowTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.textStrong,
      letterSpacing: -0.25,
    },
    rowSub: {
      fontSize: 11,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 2,
    },
    tag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 5,
    },
    tagEntry: {
      backgroundColor: isDark ? 'rgba(59,130,246,0.18)' : '#EFF6FF',
    },
    tagEntryText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#2563EB',
    },
    tagGrad: {
      backgroundColor: isDark ? 'rgba(245,158,11,0.2)' : '#FEF3C7',
    },
    tagGradText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#B45309',
    },

    moveStack: {
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9',
      overflow: 'hidden',
    },
    moveBtn: {
      width: 28,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    moveBtnDisabled: { opacity: 0.3 },
    dragHandle: {
      width: 32,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    dragHandlePressed: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2FF',
    },
    deleteBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
    },

    /* Empty */
    emptyWrap: {
      alignItems: 'center',
      paddingVertical: 40,
      paddingHorizontal: 28,
    },
    emptyIcon: {
      width: 68,
      height: 68,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.textStrong,
      marginBottom: 6,
      letterSpacing: -0.2,
    },
    emptyHint: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: 18,
    },
    emptyCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: ACCENT,
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 14,
      borderBottomWidth: 1.5,
      borderBottomColor: 'rgba(0,0,0,0.14)',
    },
    emptyCtaText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14,
    },

    fab: {
      position: 'absolute',
      bottom: 28,
      right: 22,
      ...ADMIN_THEME.shadows.lg,
    },
    fabGradient: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderBottomWidth: 1.5,
      borderBottomColor: 'rgba(0,0,0,0.16)',
    },

    /* Modal */
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalScrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(15,23,42,0.45)',
    },
    modalContent: {
      backgroundColor: theme.colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingBottom: Platform.OS === 'ios' ? 34 : 24,
      paddingTop: 8,
      maxHeight: '88%',
    },
    modalContentWide: {
      maxWidth: 460,
      width: '100%',
      alignSelf: 'center',
      borderRadius: 24,
      marginBottom: 40,
      maxHeight: '80%',
      ...ADMIN_THEME.shadows.lg,
    },
    modalHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#E2E8F0',
      alignSelf: 'center',
      marginBottom: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 18,
    },
    modalIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : ACCENT_SOFT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.colors.textStrong,
      letterSpacing: -0.3,
    },
    modalSub: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    modalClose: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textStrong,
      marginBottom: 8,
    },
    chipBlock: { marginBottom: 14 },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    chipSelected: {
      backgroundColor: isDark ? 'rgba(99,102,241,0.25)' : ACCENT_SOFT,
      borderColor: ACCENT,
    },
    chipText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    chipTextSelected: { color: '#4338CA' },
    chipEmpty: {
      fontSize: 13,
      color: '#F59E0B',
      fontWeight: '500',
    },
    input: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      padding: 12,
      fontSize: 16,
      marginBottom: 14,
      color: theme.colors.text,
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    modalButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
    },
    saveButton: {
      backgroundColor: ACCENT,
      borderBottomWidth: 1.5,
      borderBottomColor: 'rgba(0,0,0,0.14)',
    },
    cancelButtonText: {
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    saveButtonText: {
      color: '#fff',
      fontWeight: '700',
    },
  });
};
