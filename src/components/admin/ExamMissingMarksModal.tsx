import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useTheme } from '../../hooks/useTheme';
import { Theme } from '../../theme/themes';
import {
  ExamResultReadiness,
  ExamResultReadinessPaper,
  ExamResultReadinessSection,
} from '../../services/examService';
import {
  buildFollowUpItems,
  filterFollowUpItems,
  FollowUpFilterType,
  FollowUpItem,
} from '../../utils/examReadinessViewModel';

export interface ExamMissingMarksModalProps {
  visible: boolean;
  onClose: () => void;
  readiness?: ExamResultReadiness | null;
  examName: string;
  exportingMissingMarks?: boolean;
  onExportMissingMarks: () => void;
  onAssignTeacher?: (paper: ExamResultReadinessPaper, section: ExamResultReadinessSection) => void;
}

export function ExamMissingMarksModal({
  visible,
  onClose,
  readiness,
  examName,
  exportingMissingMarks = false,
  onExportMissingMarks,
  onAssignTeacher,
}: ExamMissingMarksModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTabletOrDesktop = width >= 768;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<FollowUpFilterType>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');

  const allItems = useMemo(() => buildFollowUpItems(readiness), [readiness]);

  // Unique classes present in follow-up items
  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of allItems) {
      if (item.class_id && item.class_name) {
        map.set(item.class_id, item.class_name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allItems]);

  // Category counts
  const counts = useMemo(() => {
    let missingUploads = 0;
    let unassigned = 0;
    let unresolved = 0;
    for (const item of allItems) {
      if (item.type === 'assigned') missingUploads += 1;
      else if (item.type === 'unassigned') unassigned += 1;
      else if (item.type === 'unresolved') unresolved += 1;
    }
    return {
      all: allItems.length,
      missingUploads,
      unassigned,
      unresolved,
    };
  }, [allItems]);

  // Filtered and searched items (memoized for high-performance handling of 500+ items)
  const filteredItems = useMemo(() => {
    return filterFollowUpItems(allItems, {
      query: searchQuery,
      filter: selectedFilter,
      classId: selectedClassId,
    });
  }, [allItems, searchQuery, selectedFilter, selectedClassId]);

  const totalMissing = readiness?.missing_entries ?? 0;

  const styles = useMemo(
    () => createStyles(theme, isTabletOrDesktop, insets),
    [theme, isTabletOrDesktop, insets]
  );

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedFilter('all');
    setSelectedClassId('all');
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FollowUpItem }) => {
      const isUnassigned = item.type === 'unassigned';
      const isUnresolved = item.type === 'unresolved';

      return (
        <View
          style={[
            styles.itemCard,
            isUnassigned && styles.itemCardUnassigned,
            isUnresolved && styles.itemCardUnresolved,
          ]}
          testID={`follow-up-item-${item.id}`}
        >
          <View style={styles.itemTopRow}>
            {/* Avatar or status icon */}
            <View
              style={[
                styles.itemAvatar,
                isUnassigned
                  ? { backgroundColor: `${theme.colors.warning}18` }
                  : isUnresolved
                    ? { backgroundColor: `${theme.colors.border}50` }
                    : { backgroundColor: `${theme.colors.primary}18` },
              ]}
            >
              {isUnassigned ? (
                <Ionicons name="warning" size={17} color={theme.colors.warning} />
              ) : isUnresolved ? (
                <Ionicons name="help-circle" size={17} color={theme.colors.textSecondary} />
              ) : (
                <Text style={[styles.itemAvatarText, { color: theme.colors.primary }]}>
                  {(item.teacher_name || 'T').slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>

            {/* Main title & badges */}
            <View style={styles.itemTitleGroup}>
              <View style={styles.itemHeaderLine}>
                <Text style={styles.itemTitleText}>
                  {isUnassigned
                    ? (item.status_label || 'Teacher not assigned')
                    : isUnresolved
                      ? 'Assignment unresolved'
                      : item.teacher_name}
                </Text>
                {/* Missing count badge */}
                {typeof item.missing_entries === 'number' && item.missing_entries > 0 ? (
                  <View style={styles.missingCountBadge}>
                    <Text style={styles.missingCountBadgeText}>
                      {item.missing_entries} missing
                    </Text>
                  </View>
                ) : isUnassigned ? (
                  <View style={styles.unassignedBadge}>
                    <Text style={styles.unassignedBadgeText}>Action needed</Text>
                  </View>
                ) : null}
              </View>

              {/* Class, Section, and Subject */}
              <View style={styles.itemMetaLine}>
                <View style={styles.classChip}>
                  <Text style={styles.classChipText}>
                    {item.class_name}
                    {item.section_names && item.section_names.length > 0
                      ? ` · ${item.section_names.join(', ')}`
                      : item.section_name
                        ? ` · ${item.section_name}`
                        : ''}
                  </Text>
                </View>
                <Text style={styles.subjectText}>{item.subject_name}</Text>
              </View>
            </View>
          </View>

          {/* Bottom details & action */}
          <View style={styles.itemBottomRow}>
            {isUnassigned ? (
              <Text style={styles.unassignedHelpText}>
                No teacher is assigned to this section. Marks ownership must be configured in Timetable.
              </Text>
            ) : isUnresolved ? (
              <Text style={styles.unassignedHelpText}>
                Marks are expected ({item.entered_entries ?? 0} of {item.expected_entries ?? 0} uploaded), but no teacher assignment could be determined.
              </Text>
            ) : (
              <View style={styles.progressInfoWrap}>
                <Ionicons name="stats-chart-outline" size={13} color={theme.colors.textSecondary} />
                <Text style={styles.progressInfoText}>
                  {item.expected_entries
                    ? `${item.entered_entries ?? 0} of ${item.expected_entries} marks uploaded`
                    : `${item.entered_entries ?? 0} marks uploaded`}
                </Text>
              </View>
            )}

            {/* Assign Teacher CTA when applicable */}
            {isUnassigned && onAssignTeacher && item.raw_section && (
              <TouchableOpacity
                style={styles.assignCtaBtn}
                onPress={() => {
                  onClose();
                  onAssignTeacher(item.raw_paper, item.raw_section!);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Assign teacher for ${item.class_name} section ${item.section_name}`}
              >
                <Ionicons name="person-add" size={13} color="#FFFFFF" />
                <Text style={styles.assignCtaBtnText}>Assign teacher</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    },
    [theme, styles, onAssignTeacher, onClose]
  );

  return (
    <Modal
      visible={visible}
      animationType={isTabletOrDesktop ? 'fade' : 'slide'}
      transparent={isTabletOrDesktop}
      onRequestClose={onClose}
    >
      <View style={styles.overlayContainer}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.dialogCard}
        >
          {/* ── Fixed Top Header ──────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close unuploaded marks dialog"
              >
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
              <View style={styles.headerTitleContainer}>
                <Text style={styles.titleText}>Unuploaded marks</Text>
                <Text style={styles.subtitleText} numberOfLines={1}>
                  {examName} · {totalMissing} missing across {allItems.length} follow-up item{allItems.length === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            {/* ── Search Input ────────────────────────────────────────── */}
            <View style={styles.searchBar}>
              <Ionicons
                name="search-outline"
                size={17}
                color={theme.colors.textSecondary}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Search teacher, class, section, subject..."
                placeholderTextColor={theme.colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
                accessibilityLabel="Search unuploaded marks"
                returnKeyType="search"
              />
              {searchQuery.length > 0 && Platform.OS !== 'ios' && (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  style={styles.clearSearchBtn}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search text"
                >
                  <Ionicons name="close-circle" size={17} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* ── Category Filter Tabs ─────────────────────────────────── */}
            <View style={styles.filterTabsRow}>
              <TouchableOpacity
                style={[
                  styles.filterTab,
                  selectedFilter === 'all' && styles.filterTabActive,
                ]}
                onPress={() => setSelectedFilter('all')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`All follow-ups, ${counts.all} items`}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    selectedFilter === 'all' && styles.filterTabTextActive,
                  ]}
                >
                  All ({counts.all})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterTab,
                  selectedFilter === 'missing_uploads' && styles.filterTabActive,
                ]}
                onPress={() => setSelectedFilter('missing_uploads')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Missing uploads, ${counts.missingUploads} items`}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    selectedFilter === 'missing_uploads' && styles.filterTabTextActive,
                  ]}
                >
                  Missing uploads ({counts.missingUploads})
                </Text>
              </TouchableOpacity>

              {counts.unassigned > 0 && (
                <TouchableOpacity
                  style={[
                    styles.filterTab,
                    selectedFilter === 'unassigned' && styles.filterTabActive,
                  ]}
                  onPress={() => setSelectedFilter('unassigned')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Teacher not assigned, ${counts.unassigned} items`}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      selectedFilter === 'unassigned' && styles.filterTabTextActive,
                      selectedFilter !== 'unassigned' && { color: theme.colors.warning },
                    ]}
                  >
                    Unassigned ({counts.unassigned})
                  </Text>
                </TouchableOpacity>
              )}

              {counts.unresolved > 0 && (
                <TouchableOpacity
                  style={[
                    styles.filterTab,
                    selectedFilter === 'unresolved' && styles.filterTabActive,
                  ]}
                  onPress={() => setSelectedFilter('unresolved')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Unresolved, ${counts.unresolved} items`}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      selectedFilter === 'unresolved' && styles.filterTabTextActive,
                    ]}
                  >
                    Unresolved ({counts.unresolved})
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── Class Filter Chips (shown if multiple classes) ──────── */}
            {classOptions.length > 1 && (
              <View style={styles.classChipsScrollWrap}>
                <TouchableOpacity
                  style={[
                    styles.classFilterChip,
                    selectedClassId === 'all' && styles.classFilterChipActive,
                  ]}
                  onPress={() => setSelectedClassId('all')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.classFilterChipText,
                      selectedClassId === 'all' && styles.classFilterChipTextActive,
                    ]}
                  >
                    All classes
                  </Text>
                </TouchableOpacity>
                {classOptions.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.classFilterChip,
                      selectedClassId === c.id && styles.classFilterChipActive,
                    ]}
                    onPress={() => setSelectedClassId(c.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.classFilterChipText,
                        selectedClassId === c.id && styles.classFilterChipTextActive,
                      ]}
                    >
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Results count label */}
            <View style={styles.resultsCountBar}>
              <Text style={styles.resultsCountText}>
                Showing {filteredItems.length} of {allItems.length} follow-up items
              </Text>
              {(searchQuery.length > 0 || selectedFilter !== 'all' || selectedClassId !== 'all') && (
                <TouchableOpacity
                  onPress={handleClearFilters}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all filters"
                >
                  <Text style={styles.resetFiltersText}>Reset filters</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Virtualized Follow-up List ───────────────────────────── */}
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            initialNumToRender={15}
            maxToRenderPerBatch={20}
            windowSize={10}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name={allItems.length === 0 ? 'checkmark-circle-outline' : 'search-outline'}
                  size={44}
                  color={allItems.length === 0 ? theme.colors.success : theme.colors.textTertiary}
                />
                <Text style={styles.emptyTitle}>
                  {allItems.length === 0
                    ? 'All marks are uploaded!'
                    : 'No matching follow-ups'}
                </Text>
                <Text style={styles.emptyText}>
                  {allItems.length === 0
                    ? 'There are no pending marks or unassigned sections for this exam.'
                    : 'Try clearing your search query or changing active category filters.'}
                </Text>
                {allItems.length > 0 && (
                  <TouchableOpacity
                    style={styles.emptyResetBtn}
                    onPress={handleClearFilters}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search and filter chips"
                  >
                    <Text style={styles.emptyResetBtnText}>Clear filters</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />

          {/* ── Persistent Sticky Footer with Excel Download ─────────── */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.downloadBtn,
                exportingMissingMarks && styles.downloadBtnDisabled,
              ]}
              onPress={onExportMissingMarks}
              disabled={exportingMissingMarks || allItems.length === 0}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Download Excel follow-up list for ${examName}`}
            >
              {exportingMissingMarks ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.downloadBtnText}>Preparing Excel…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="download-outline" size={17} color="#FFFFFF" />
                  <Text style={styles.downloadBtnText}>Download follow-up Excel</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function createStyles(theme: Theme, isTabletOrDesktop: boolean, insets: { top: number; bottom: number }) {
  return StyleSheet.create({
    overlayContainer: {
      flex: 1,
      backgroundColor: isTabletOrDesktop ? 'rgba(0,0,0,0.5)' : theme.colors.background,
      justifyContent: isTabletOrDesktop ? 'center' : 'flex-end',
      alignItems: isTabletOrDesktop ? 'center' : 'stretch',
    },
    dialogCard: {
      flex: 1,
      backgroundColor: theme.colors.background,
      ...(isTabletOrDesktop
        ? {
            width: '90%',
            maxWidth: 760,
            maxHeight: '90%',
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: theme.colors.border,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.15,
            shadowRadius: 24,
            elevation: 10,
          }
        : {
            paddingTop: insets.top,
          }),
    },
    header: {
      backgroundColor: theme.colors.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.borderLight,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 8,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    closeBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.borderLight,
    },
    headerTitleContainer: {
      flex: 1,
    },
    titleText: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.colors.textStrong,
      letterSpacing: -0.3,
    },
    subtitleText: {
      fontSize: 12.5,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 12,
      height: 44,
      marginBottom: 10,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 13.5,
      color: theme.colors.text,
      height: '100%',
    },
    clearSearchBtn: {
      padding: 4,
    },
    filterTabsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
      marginBottom: 8,
    },
    filterTab: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 9,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.borderLight,
      minHeight: 34,
      justifyContent: 'center',
    },
    filterTabActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    filterTabText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    filterTabTextActive: {
      color: '#FFFFFF',
    },
    classChipsScrollWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
      marginBottom: 8,
      paddingTop: 2,
    },
    classFilterChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: `${theme.colors.borderLight}50`,
      minHeight: 30,
      justifyContent: 'center',
    },
    classFilterChipActive: {
      backgroundColor: `${theme.colors.primary}18`,
      borderColor: theme.colors.primary,
      borderWidth: 1,
    },
    classFilterChipText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    classFilterChipTextActive: {
      color: theme.colors.primary,
      fontWeight: '800',
    },
    resultsCountBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    resultsCountText: {
      fontSize: 12,
      color: theme.colors.textTertiary,
      fontWeight: '600',
    },
    resetFiltersText: {
      fontSize: 12,
      color: theme.colors.primary,
      fontWeight: '700',
    },
    listContent: {
      padding: 16,
      gap: 12,
    },
    itemCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.borderLight,
      padding: 14,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    itemCardUnassigned: {
      borderColor: `${theme.colors.warning}40`,
      backgroundColor: `${theme.colors.warning}05`,
    },
    itemCardUnresolved: {
      borderColor: `${theme.colors.border}60`,
    },
    itemTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    itemAvatar: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemAvatarText: {
      fontSize: 16,
      fontWeight: '800',
    },
    itemTitleGroup: {
      flex: 1,
    },
    itemHeaderLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    itemTitleText: {
      fontSize: 14.5,
      fontWeight: '800',
      color: theme.colors.textStrong,
      flex: 1,
    },
    missingCountBadge: {
      backgroundColor: `${theme.colors.warning}18`,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
    },
    missingCountBadgeText: {
      fontSize: 11.5,
      fontWeight: '800',
      color: theme.colors.warning,
    },
    unassignedBadge: {
      backgroundColor: `${theme.colors.danger}14`,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
    },
    unassignedBadgeText: {
      fontSize: 11.5,
      fontWeight: '800',
      color: theme.colors.danger,
    },
    itemMetaLine: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 4,
    },
    classChip: {
      backgroundColor: `${theme.colors.primary}12`,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
    },
    classChipText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    subjectText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    itemBottomRow: {
      marginTop: 10,
      borderTopWidth: 1,
      borderTopColor: theme.colors.borderLight,
      paddingTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    progressInfoWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    progressInfoText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    unassignedHelpText: {
      flex: 1,
      fontSize: 11.5,
      color: theme.colors.textTertiary,
      lineHeight: 16,
    },
    assignCtaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.colors.warning,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 9,
      minHeight: 44,
      minWidth: 44,
      justifyContent: 'center',
    },
    assignCtaBtnText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
      gap: 10,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.textStrong,
      marginTop: 6,
    },
    emptyText: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },
    emptyResetBtn: {
      marginTop: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: `${theme.colors.primary}15`,
    },
    emptyResetBtnText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    footer: {
      backgroundColor: theme.colors.card,
      borderTopWidth: 1,
      borderTopColor: theme.colors.borderLight,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: isTabletOrDesktop ? 16 : Math.max(insets.bottom, 16),
    },
    downloadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
      borderRadius: 14,
      paddingVertical: 13,
      paddingHorizontal: 20,
      minHeight: 48,
      gap: 8,
      width: '100%',
    },
    downloadBtnDisabled: {
      opacity: 0.7,
    },
    downloadBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
    },
  });
}
