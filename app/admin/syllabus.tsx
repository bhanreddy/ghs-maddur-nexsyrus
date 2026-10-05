import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import * as Haptics from '../../src/utils/haptics';
import { ClassService, ClassInfo } from '../../src/services/classService';
import {
  SyllabusService,
  SyllabusOverviewItem,
  SyllabusChapter,
  SyllabusHealth,
} from '../../src/services/syllabusService';

const STATUS_FILTERS: { id: string; label: string; icon: string; color: string }[] = [
  { id: 'ALL', label: 'All Statuses', icon: 'apps-outline', color: '#2563eb' },
  { id: 'ON_TRACK', label: 'On Track', icon: 'checkmark-circle-outline', color: '#10b981' },
  { id: 'AT_RISK', label: 'At Risk', icon: 'warning-outline', color: '#f59e0b' },
  { id: 'DELAYED', label: 'Delayed', icon: 'alert-circle-outline', color: '#ef4444' },
  { id: 'PLANNING_INCOMPLETE', label: 'Incomplete', icon: 'help-circle-outline', color: '#64748b' },
];

export default function SyllabusScreen() {
  const { isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<SyllabusOverviewItem[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Chapter structure modal
  const [selectedItem, setSelectedItem] = useState<SyllabusOverviewItem | null>(null);
  const [structureModalVisible, setStructureModalVisible] = useState(false);
  const [chapters, setChapters] = useState<SyllabusChapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);

  // Add Chapter modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newChapterNum, setNewChapterNum] = useState('');
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterPeriods, setNewChapterPeriods] = useState('4');
  const [newChapterDate, setNewChapterDate] = useState('');
  const [submittingChapter, setSubmittingChapter] = useState(false);

  // Load Classes once
  useEffect(() => {
    let mounted = true;
    ClassService.getClasses()
      .then((res) => {
        if (mounted && Array.isArray(res)) setClasses(res);
      })
      .catch((err) => {
        console.warn('Failed to load classes for syllabus tracker', err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      const data = await SyllabusService.getCoordinatorOverview();
      setOverview(data || []);
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOverview();
  };

  // Inspect Chapter Structure
  const handleSelectSubject = async (item: SyllabusOverviewItem) => {
    Haptics.selectionAsync();
    setSelectedItem(item);
    setStructureModalVisible(true);
    setLoadingChapters(true);
    try {
      const data = await SyllabusService.getStructure(item.class_id, item.subject_id);
      setChapters(data || []);
    } catch {
      alertCompat('Error', 'Failed to load curriculum chapters');
    } finally {
      setLoadingChapters(false);
    }
  };

  const handleAddChapter = async () => {
    if (!selectedItem || !newChapterNum.trim() || !newChapterTitle.trim()) {
      alertCompat('Missing Fields', 'Chapter number and title are required.');
      return;
    }

    setSubmittingChapter(true);
    try {
      await SyllabusService.createChapter({
        class_id: selectedItem.class_id,
        subject_id: selectedItem.subject_id,
        chapter_number: Number(newChapterNum),
        title: newChapterTitle.trim(),
        estimated_periods: Number(newChapterPeriods) || 1,
        target_completion_date: newChapterDate.trim() || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      alertCompat('Success', 'Chapter added to curriculum successfully.');
      setAddModalVisible(false);
      setNewChapterNum('');
      setNewChapterTitle('');

      // Refresh chapters & overview
      handleSelectSubject(selectedItem);
      fetchOverview();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      alertCompat('Error', e.message || 'Failed to add chapter');
    } finally {
      setSubmittingChapter(false);
    }
  };

  // Multi-level filtering
  const filteredOverview = useMemo(() => {
    return overview.filter((item) => {
      // Status filter
      if (selectedStatus !== 'ALL' && item.status !== selectedStatus) {
        return false;
      }

      // Class filter
      if (selectedClassId && String(item.class_id) !== String(selectedClassId)) {
        return false;
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesClass = (item.class_name || '').toLowerCase().includes(q);
        const matchesSubject = (item.subject_name || '').toLowerCase().includes(q);
        const matchesTeacher = (item.teacher_name || '').toLowerCase().includes(q);

        if (!matchesClass && !matchesSubject && !matchesTeacher) {
          return false;
        }
      }

      return true;
    });
  }, [overview, selectedStatus, selectedClassId, search]);

  const getStatusBadge = (status: SyllabusHealth) => {
    switch (status) {
      case 'ON_TRACK':
        return {
          bg: '#ecfdf5',
          text: '#059669',
          border: '#a7f3d0',
          label: 'On Track',
          icon: 'checkmark-circle',
        };
      case 'AT_RISK':
        return {
          bg: '#fffbeb',
          text: '#d97706',
          border: '#fde68a',
          label: 'At Risk',
          icon: 'warning',
        };
      case 'DELAYED':
        return {
          bg: '#fef2f2',
          text: '#dc2626',
          border: '#fecaca',
          label: 'Delayed',
          icon: 'alert-circle',
        };
      default:
        return {
          bg: '#f1f5f9',
          text: '#64748b',
          border: '#e2e8f0',
          label: 'Incomplete',
          icon: 'help-circle',
        };
    }
  };

  const resetFilters = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedStatus('ALL');
    setSelectedClassId(null);
    setSearch('');
  };

  const hasActiveFilters = Boolean(
    selectedStatus !== 'ALL' || selectedClassId || search
  );

  return (
    <View style={[styles.container, isDark ? styles.darkBg : styles.lightBg]}>
      <TourTarget id="screen.admin-syllabus.overview"><AdminHeader
        title="Syllabus Tracker"
        rightAction={{
          icon: 'refresh-outline',
          onPress: onRefresh,
        }}
      /></TourTarget>

      <FlatList
        data={filteredOverview}
        keyExtractor={(item) => `${item.class_id}-${item.subject_id}`}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2563eb"
            colors={['#2563eb']}
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            {/* KPI Metric Strip */}
            <View style={styles.kpiGrid}>
              <View style={[styles.kpiCard, isDark ? styles.kpiCardDark : styles.kpiCardLight]}>
                <LinearGradient colors={['#10b981', '#059669']} style={styles.kpiIconBox}>
                  <Ionicons name="checkmark-done" size={16} color="#ffffff" />
                </LinearGradient>
                <Text style={[styles.kpiVal, { color: '#10b981' }]}>
                  {overview.filter((o) => o.status === 'ON_TRACK').length}
                </Text>
                <Text style={[styles.kpiLabel, isDark && { color: '#94a3b8' }]}>On Track</Text>
              </View>

              <View style={[styles.kpiCard, isDark ? styles.kpiCardDark : styles.kpiCardLight]}>
                <LinearGradient colors={['#f59e0b', '#d97706']} style={styles.kpiIconBox}>
                  <Ionicons name="warning" size={16} color="#ffffff" />
                </LinearGradient>
                <Text style={[styles.kpiVal, { color: '#f59e0b' }]}>
                  {overview.filter((o) => o.status === 'AT_RISK').length}
                </Text>
                <Text style={[styles.kpiLabel, isDark && { color: '#94a3b8' }]}>At Risk</Text>
              </View>

              <View style={[styles.kpiCard, isDark ? styles.kpiCardDark : styles.kpiCardLight]}>
                <LinearGradient colors={['#ef4444', '#dc2626']} style={styles.kpiIconBox}>
                  <Ionicons name="alert-circle" size={16} color="#ffffff" />
                </LinearGradient>
                <Text style={[styles.kpiVal, { color: '#ef4444' }]}>
                  {overview.filter((o) => o.status === 'DELAYED').length}
                </Text>
                <Text style={[styles.kpiLabel, isDark && { color: '#94a3b8' }]}>Delayed</Text>
              </View>

              <View style={[styles.kpiCard, isDark ? styles.kpiCardDark : styles.kpiCardLight]}>
                <LinearGradient colors={['#64748b', '#475569']} style={styles.kpiIconBox}>
                  <Ionicons name="help-circle" size={16} color="#ffffff" />
                </LinearGradient>
                <Text style={[styles.kpiVal, isDark && { color: '#cbd5e1' }]}>
                  {overview.filter((o) => o.status === 'PLANNING_INCOMPLETE').length}
                </Text>
                <Text style={[styles.kpiLabel, isDark && { color: '#94a3b8' }]}>Incomplete</Text>
              </View>
            </View>

            {/* Search Input */}
            <TourTarget id="screen.admin-syllabus.workspace" native><View
              style={[
                styles.searchContainer,
                isDark ? styles.searchContainerDark : styles.searchContainerLight,
              ]}
            >
              <Ionicons name="search" size={18} color={isDark ? '#94a3b8' : '#64748b'} />
              <TextInput
                style={[styles.searchInput, isDark && { color: '#f8fafc' }]}
                placeholder="Search by subject, teacher, or class name..."
                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={18} color={isDark ? '#64748b' : '#94a3b8'} />
                </TouchableOpacity>
              )}
            </View></TourTarget>

            {/* Dynamic Class Cohort Filter Chips */}
            <View style={styles.filterSection}>
              <View style={styles.filterSectionHeader}>
                <Text style={[styles.filterSectionTitle, isDark && { color: '#cbd5e1' }]}>
                  Class Cohort
                </Text>
                {selectedClassId && (
                  <TouchableOpacity onPress={() => setSelectedClassId(null)}>
                    <Text style={styles.clearFilterText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={[{ id: null, name: 'All Classes' }, ...classes.map((c) => ({ id: String(c.id), name: c.name }))]}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.chipsScrollContent}
                renderItem={({ item }) => {
                  const isSelected = selectedClassId === item.id;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.chip,
                        isSelected
                          ? styles.chipActive
                          : isDark
                          ? styles.chipDark
                          : styles.chipLight,
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedClassId(item.id);
                      }}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          isSelected
                            ? styles.chipTextActive
                            : isDark
                            ? styles.chipTextDark
                            : styles.chipTextLight,
                        ]}
                      >
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>

            {/* Status Filter Chips */}
            <View style={styles.filterSection}>
              <View style={styles.filterSectionHeader}>
                <Text style={[styles.filterSectionTitle, isDark && { color: '#cbd5e1' }]}>
                  Curriculum Status
                </Text>
                {selectedStatus !== 'ALL' && (
                  <TouchableOpacity onPress={() => setSelectedStatus('ALL')}>
                    <Text style={styles.clearFilterText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={STATUS_FILTERS}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.chipsScrollContent}
                renderItem={({ item }) => {
                  const isSelected = selectedStatus === item.id;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.chip,
                        isSelected
                          ? styles.chipActive
                          : isDark
                          ? styles.chipDark
                          : styles.chipLight,
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedStatus(item.id);
                      }}
                    >
                      <Ionicons
                        name={item.icon as any}
                        size={13}
                        color={isSelected ? '#ffffff' : item.color}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.chipText,
                          isSelected
                            ? styles.chipTextActive
                            : isDark
                            ? styles.chipTextDark
                            : styles.chipTextLight,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>

            {/* Section Header */}
            <View style={styles.listHeaderRow}>
              <Text style={[styles.listHeaderTitle, isDark && { color: '#f8fafc' }]}>
                Tracked Curriculum Subjects ({filteredOverview.length})
              </Text>
              {hasActiveFilters && (
                <TouchableOpacity onPress={resetFilters}>
                  <Text style={styles.resetFiltersText}>Reset Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const badge = getStatusBadge(item.status);
          const variance =
            item.actual_pct != null && item.expected_pct != null
              ? Math.round(item.actual_pct - item.expected_pct)
              : null;

          return (
            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.subjectCard,
                isDark ? styles.subjectCardDark : styles.subjectCardLight,
              ]}
              onPress={() => handleSelectSubject(item)}
            >
              {/* Header */}
              <View style={styles.subjectCardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.subjectName, isDark && { color: '#f8fafc' }]}>
                    {item.subject_name}
                  </Text>
                  <Text style={[styles.subjectClass, isDark && { color: '#94a3b8' }]}>
                    {item.class_name} • Assigned to {item.teacher_name || 'Teacher'}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : badge.bg,
                      borderColor: badge.border,
                    },
                  ]}
                >
                  <Ionicons name={badge.icon as any} size={13} color={badge.text} />
                  <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                    {badge.label}
                  </Text>
                </View>
              </View>

              {/* Progress Metric Bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressLabelRow}>
                  <Text style={[styles.progressLabel, isDark && { color: '#cbd5e1' }]}>
                    Curriculum Completed
                  </Text>
                  <Text style={[styles.progressValues, isDark && { color: '#f8fafc' }]}>
                    <Text style={{ fontWeight: '800', color: badge.text }}>
                      {item.actual_pct}%
                    </Text>{' '}
                    / Target {item.expected_pct ?? 0}%
                  </Text>
                </View>

                {/* Progress Bar Track */}
                <View style={[styles.progressTrack, isDark && { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(100, Math.max(0, item.actual_pct))}%`,
                        backgroundColor: badge.text,
                      },
                    ]}
                  />
                  {item.expected_pct != null && item.expected_pct > 0 && (
                    <View
                      style={[
                        styles.targetMarker,
                        { left: `${Math.min(100, item.expected_pct)}%` },
                      ]}
                    />
                  )}
                </View>

                {/* Bottom stats row */}
                <View style={styles.subjectBottomRow}>
                  <Text style={[styles.topicsCountText, isDark && { color: '#94a3b8' }]}>
                    📚 {item.completed_topics} of {item.total_topics} topics completed
                  </Text>

                  {variance !== null && (
                    <View
                      style={[
                        styles.variancePill,
                        variance >= 0
                          ? styles.varianceAhead
                          : variance >= -10
                          ? styles.varianceCaution
                          : styles.varianceBehind,
                      ]}
                    >
                      <Text
                        style={[
                          styles.varianceText,
                          variance >= 0
                            ? styles.varianceTextAhead
                            : variance >= -10
                            ? styles.varianceTextCaution
                            : styles.varianceTextBehind,
                        ]}
                      >
                        {variance >= 0 ? `+${variance}% ahead` : `${variance}% lagging`}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={[styles.emptySubtitle, isDark && { color: '#94a3b8' }]}>
                Analyzing syllabus completion metrics...
              </Text>
            </View>
          ) : (
            <View style={[styles.emptyContainer, isDark ? styles.emptyDark : styles.emptyLight]}>
              <Ionicons name="book-outline" size={54} color="#94a3b8" />
              <Text style={[styles.emptyTitle, isDark && { color: '#f8fafc' }]}>
                No Subjects Matching Filters
              </Text>
              <Text style={[styles.emptySubtitle, isDark && { color: '#94a3b8' }]}>
                Try adjusting the class cohort or status filter to see other curriculum plans.
              </Text>
              {hasActiveFilters && (
                <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
                  <Text style={styles.resetBtnText}>Clear All Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        }
        ListFooterComponent={<View style={{ height: 40 }} />}
      />

      {/* Chapters & Topics Breakdown Modal */}
      <Modal visible={structureModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.structureModalCard, isDark ? styles.modalCardDark : styles.modalCardLight]}>
            {/* Header */}
            <View style={styles.structureModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.structureModalTitle, isDark && { color: '#f8fafc' }]}>
                  {selectedItem?.subject_name}
                </Text>
                <Text style={[styles.structureModalSub, isDark && { color: '#94a3b8' }]}>
                  {selectedItem?.class_name} • Chapter Structure & Progression
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.closeModalBtn, isDark && styles.closeModalBtnDark]}
                onPress={() => setStructureModalVisible(false)}
              >
                <Ionicons name="close" size={20} color={isDark ? '#cbd5e1' : '#475569'} />
              </TouchableOpacity>
            </View>

            {/* Content List */}
            {loadingChapters ? (
              <View style={styles.modalLoadingBox}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={[styles.emptySubtitle, isDark && { color: '#94a3b8' }]}>
                  Loading curriculum chapters...
                </Text>
              </View>
            ) : chapters.length === 0 ? (
              <View style={styles.modalEmptyBox}>
                <Ionicons name="documents-outline" size={44} color="#94a3b8" />
                <Text style={[styles.modalEmptyTitle, isDark && { color: '#f8fafc' }]}>
                  No Chapters Configured
                </Text>
                <Text style={[styles.modalEmptySub, isDark && { color: '#94a3b8' }]}>
                  Begin planning by adding the first chapter to this syllabus.
                </Text>
              </View>
            ) : (
              <TourScrollView style={styles.chaptersScroll}>
                {chapters.map((ch) => (
                  <View
                    key={ch.id}
                    style={[
                      styles.chapterCard,
                      isDark ? styles.chapterCardDark : styles.chapterCardLight,
                    ]}
                  >
                    <View style={styles.chapterCardHeader}>
                      <View style={styles.chapterNumBadge}>
                        <Text style={styles.chapterNumText}>Ch {ch.chapter_number}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.chapterTitle, isDark && { color: '#f8fafc' }]}>
                          {ch.title}
                        </Text>
                        <Text style={[styles.chapterMeta, isDark && { color: '#94a3b8' }]}>
                          {ch.estimated_periods} periods target
                          {ch.target_completion_date ? ` • Target: ${ch.target_completion_date}` : ''}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.chStatusPill,
                          ch.status === 'COMPLETED'
                            ? styles.chCompleted
                            : ch.status === 'IN_PROGRESS'
                            ? styles.chInProgress
                            : styles.chNotStarted,
                        ]}
                      >
                        <Text style={styles.chStatusText}>{ch.status}</Text>
                      </View>
                    </View>

                    {/* Topics inside chapter */}
                    {ch.topics && ch.topics.length > 0 && (
                      <View style={styles.topicsList}>
                        {ch.topics.map((tp) => (
                          <View key={tp.id} style={styles.topicRow}>
                            <Ionicons
                              name={tp.status === 'COMPLETED' ? 'checkmark-circle' : 'ellipse-outline'}
                              size={14}
                              color={tp.status === 'COMPLETED' ? '#10b981' : '#94a3b8'}
                            />
                            <Text
                              style={[
                                styles.topicTitle,
                                isDark && { color: '#cbd5e1' },
                                tp.status === 'COMPLETED' && styles.topicCompletedText,
                              ]}
                            >
                              {tp.topic_number}. {tp.title}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </TourScrollView>
            )}

            {/* Footer button to Add Chapter */}
            <View style={[styles.structureModalFooter, isDark && { borderTopColor: 'rgba(255,255,255,0.06)' }]}>
              <TouchableOpacity
                style={styles.addChapterBtn}
                onPress={() => setAddModalVisible(true)}
              >
                <Ionicons name="add-circle-outline" size={16} color="#ffffff" />
                <Text style={styles.addChapterBtnText}>Add New Chapter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Chapter Form Modal */}
      <Modal visible={addModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.addChapterModalCard, isDark ? styles.modalCardDark : styles.modalCardLight]}>
            <Text style={[styles.addChapterModalTitle, isDark && { color: '#f8fafc' }]}>
              Add Chapter to {selectedItem?.subject_name}
            </Text>

            <Text style={[styles.inputLabel, isDark && { color: '#cbd5e1' }]}>Chapter Number</Text>
            <TextInput
              style={[styles.modalInput, isDark ? styles.modalInputDark : styles.modalInputLight]}
              placeholder="e.g. 1, 2, 3"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={newChapterNum}
              onChangeText={setNewChapterNum}
              keyboardType="numeric"
            />

            <Text style={[styles.inputLabel, isDark && { color: '#cbd5e1' }]}>Chapter Title</Text>
            <TextInput
              style={[styles.modalInput, isDark ? styles.modalInputDark : styles.modalInputLight]}
              placeholder="e.g. Chemical Reactions and Equations"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={newChapterTitle}
              onChangeText={setNewChapterTitle}
            />

            <Text style={[styles.inputLabel, isDark && { color: '#cbd5e1' }]}>Estimated Periods</Text>
            <TextInput
              style={[styles.modalInput, isDark ? styles.modalInputDark : styles.modalInputLight]}
              placeholder="e.g. 6"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={newChapterPeriods}
              onChangeText={setNewChapterPeriods}
              keyboardType="numeric"
            />

            <Text style={[styles.inputLabel, isDark && { color: '#cbd5e1' }]}>Target Date (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.modalInput, isDark ? styles.modalInputDark : styles.modalInputLight]}
              placeholder="e.g. 2026-10-15"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={newChapterDate}
              onChangeText={setNewChapterDate}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, isDark && styles.modalCancelBtnDark]}
                onPress={() => setAddModalVisible(false)}
                disabled={submittingChapter}
              >
                <Text style={[styles.modalCancelText, isDark && { color: '#94a3b8' }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleAddChapter}
                disabled={submittingChapter}
              >
                {submittingChapter ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Save Chapter</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  lightBg: {
    backgroundColor: '#f8fafc',
  },
  darkBg: {
    backgroundColor: '#0b0f17',
  },
  listContent: {
    padding: 16,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  kpiCardLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  kpiCardDark: {
    backgroundColor: '#161e2e',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  kpiIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kpiVal: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  kpiLabel: {
    fontSize: 10.5,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    marginBottom: 12,
    gap: 10,
  },
  searchContainerLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  searchContainerDark: {
    backgroundColor: '#161e2e',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
  },
  filterSection: {
    marginBottom: 12,
  },
  filterSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  filterSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearFilterText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563eb',
  },
  chipsScrollContent: {
    gap: 6,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  chipDark: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextLight: {
    color: '#475569',
  },
  chipTextDark: {
    color: '#cbd5e1',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 2,
  },
  listHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  resetFiltersText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },
  subjectCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 16px rgba(15,23,42,0.04)',
      },
      default: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.04,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  subjectCardLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  subjectCardDark: {
    backgroundColor: '#161e2e',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  subjectCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  subjectName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  subjectClass: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressContainer: {
    marginTop: 2,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  progressValues: {
    fontSize: 12,
    color: '#0f172a',
  },
  progressTrack: {
    height: 7,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  targetMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#0f172a',
  },
  subjectBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  topicsCountText: {
    fontSize: 11.5,
    color: '#64748b',
  },
  variancePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  varianceAhead: {
    backgroundColor: '#ecfdf5',
  },
  varianceCaution: {
    backgroundColor: '#fffbeb',
  },
  varianceBehind: {
    backgroundColor: '#fef2f2',
  },
  varianceText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  varianceTextAhead: {
    color: '#059669',
  },
  varianceTextCaution: {
    color: '#d97706',
  },
  varianceTextBehind: {
    color: '#dc2626',
  },
  emptyContainer: {
    borderRadius: 16,
    padding: 36,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
  },
  emptyLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  emptyDark: {
    backgroundColor: '#161e2e',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 360,
  },
  resetBtn: {
    marginTop: 14,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resetBtnText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  structureModalCard: {
    width: '100%',
    maxWidth: 580,
    maxHeight: '85%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  modalCardLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  modalCardDark: {
    backgroundColor: '#161e2e',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  structureModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  structureModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  structureModalSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  closeModalBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeModalBtnDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modalLoadingBox: {
    padding: 40,
    alignItems: 'center',
  },
  modalEmptyBox: {
    padding: 40,
    alignItems: 'center',
  },
  modalEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  modalEmptySub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
  },
  chaptersScroll: {
    maxHeight: 380,
  },
  chapterCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  chapterCardLight: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  chapterCardDark: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  chapterCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chapterNumBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chapterNumText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  chapterTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0f172a',
  },
  chapterMeta: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  chStatusPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  chCompleted: {
    backgroundColor: '#d1fae5',
  },
  chInProgress: {
    backgroundColor: '#fef3c7',
  },
  chNotStarted: {
    backgroundColor: '#f1f5f9',
  },
  chStatusText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#334155',
  },
  topicsList: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    gap: 4,
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topicTitle: {
    fontSize: 12,
    color: '#475569',
  },
  topicCompletedText: {
    textDecorationLine: 'line-through',
    opacity: 0.7,
  },
  structureModalFooter: {
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    marginTop: 10,
  },
  addChapterBtn: {
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  addChapterBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  addChapterModalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  addChapterModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  modalInput: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    borderWidth: 1,
    marginBottom: 12,
  },
  modalInputLight: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    color: '#0f172a',
  },
  modalInputDark: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#f8fafc',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalCancelBtnDark: {
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  modalConfirmBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  modalConfirmText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
