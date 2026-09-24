import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { Theme } from '../../theme/themes';
import {
  ExamResultReadiness,
  ExamResultReadinessPaper,
  ExamResultReadinessSection,
} from '../../services/examService';
import {
  buildFollowUpItems,
  getReadinessBadgeInfo,
  getReadinessExplanation,
  FollowUpItem,
} from '../../utils/examReadinessViewModel';

export interface ExamMarksReadinessCardProps {
  readiness?: ExamResultReadiness | null;
  resultsPublished?: boolean;
  saving?: boolean;
  exportingMissingMarks?: boolean;
  onOpenFullList: () => void;
  onExportMissingMarks: () => void;
  onResultPublishToggle: () => void;
  onAssignTeacher?: (paper: ExamResultReadinessPaper, section: ExamResultReadinessSection) => void;
  examName: string;
}

export function ExamMarksReadinessCard({
  readiness,
  resultsPublished = false,
  saving = false,
  exportingMissingMarks = false,
  onOpenFullList,
  onExportMissingMarks,
  onResultPublishToggle,
  onAssignTeacher,
  examName,
}: ExamMarksReadinessCardProps) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isNarrow = width < 600;

  const followUpItems = useMemo(() => buildFollowUpItems(readiness), [readiness]);
  const previewItems = useMemo(() => followUpItems.slice(0, 3), [followUpItems]);

  const badgeInfo = useMemo(
    () => getReadinessBadgeInfo(readiness, resultsPublished),
    [readiness, resultsPublished]
  );

  const explanation = useMemo(
    () => getReadinessExplanation(readiness, resultsPublished),
    [readiness, resultsPublished]
  );

  const entered = readiness?.entered_entries ?? 0;
  const expected = readiness?.expected_entries ?? 0;
  const missing = readiness?.missing_entries ?? 0;
  const papersTotal = readiness?.papers_total ?? 0;
  const papersComplete = readiness?.papers_complete ?? 0;
  const resultsPublishable = readiness?.publishable ?? entered > 0;
  const isAllComplete = expected > 0 && missing === 0;

  const percent = expected > 0
    ? Math.min(100, Math.max(0, Math.round((entered / expected) * 100)))
    : entered > 0
      ? 100
      : 0;

  const badgeColor =
    badgeInfo.themeColor === 'success'
      ? theme.colors.success
      : badgeInfo.themeColor === 'primary'
        ? theme.colors.primary
        : badgeInfo.themeColor === 'warning'
          ? theme.colors.warning
          : theme.colors.textTertiary;

  const styles = useMemo(() => createStyles(theme, isNarrow), [theme, isNarrow]);

  // Determine publish button label
  const publishLabel = resultsPublished
    ? 'Unpublish results'
    : readiness?.ready
      ? 'Publish results'
      : resultsPublishable
        ? 'Publish partial results'
        : 'Not ready';

  const publishDisabled = saving || (!resultsPublished && !resultsPublishable);

  return (
    <View style={styles.cardContainer} testID="marks-readiness-card">
      {/* ── Top Header Row ────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <View style={[styles.headerIconChip, { backgroundColor: `${badgeColor}15` }]}>
            <Ionicons name="school-outline" size={18} color={badgeColor} />
          </View>
          <View style={styles.headerTextGroup}>
            <Text style={styles.headerTitle}>Marks readiness</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {papersTotal > 0
                ? `${papersComplete} of ${papersTotal} subjects complete`
                : 'Direct marks entry'}
            </Text>
          </View>
        </View>

        {/* State Badge with text and icon */}
        <View
          style={[styles.badgePill, { backgroundColor: `${badgeColor}15`, borderColor: `${badgeColor}30` }]}
          accessibilityRole="text"
          accessibilityLabel={`Readiness status: ${badgeInfo.label}`}
        >
          <Ionicons name={badgeInfo.icon as any} size={14} color={badgeColor} style={styles.badgeIcon} />
          <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeInfo.label}</Text>
        </View>
      </View>

      {/* ── Progress Bar & Percentage ─────────────────────────────────── */}
      <View style={styles.progressSection}>
        <View style={styles.progressLabelRow}>
          <Text style={styles.progressPercentText}>{percent}% complete</Text>
          <Text style={styles.progressEntriesText}>
            {expected > 0 ? `${entered} / ${expected} entries` : `${entered} entered`}
          </Text>
        </View>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${percent}%`,
                backgroundColor: isAllComplete
                  ? theme.colors.success
                  : percent > 50
                    ? theme.colors.primary
                    : theme.colors.warning,
              },
            ]}
          />
        </View>
      </View>

      {/* ── Metrics Strip (Responsive 3/4 box layout) ──────────────────── */}
      <View style={styles.metricsContainer}>
        <View style={styles.metricBox}>
          <Text style={styles.metricVal}>{entered}</Text>
          <Text style={styles.metricLbl}>Entered</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricBox}>
          <Text style={styles.metricVal}>{expected}</Text>
          <Text style={styles.metricLbl}>Expected</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricBox}>
          <Text
            style={[
              styles.metricVal,
              missing > 0 && { color: theme.colors.warning },
            ]}
          >
            {missing}
          </Text>
          <Text style={styles.metricLbl}>Missing</Text>
        </View>
        {papersTotal > 0 && (
          <>
            <View style={styles.metricDivider} />
            <View style={styles.metricBox}>
              <Text style={styles.metricVal}>{papersTotal - papersComplete}</Text>
              <Text style={styles.metricLbl}>Pending subs</Text>
            </View>
          </>
        )}
      </View>

      {/* ── Concise Explanatory Copy ──────────────────────────────────── */}
      <View style={styles.explanationBox}>
        <Ionicons
          name={isAllComplete ? 'checkmark-circle-outline' : 'information-circle-outline'}
          size={16}
          color={isAllComplete ? theme.colors.success : theme.colors.textSecondary}
          style={styles.explanationIcon}
        />
        <Text
          style={[
            styles.explanationText,
            isAllComplete && { color: theme.colors.success },
          ]}
        >
          {explanation}
        </Text>
      </View>

      {/* ── All Complete Success State ───────────────────────────────── */}
      {isAllComplete && (
        <View style={styles.successBanner}>
          <Ionicons name="trophy-outline" size={18} color={theme.colors.success} />
          <Text style={styles.successBannerText}>
            All student marks have been uploaded. Ready for review or immediate publication.
          </Text>
        </View>
      )}

      {/* ── Compact Follow-up Preview (Up to 3 items) ─────────────────── */}
      {missing > 0 && followUpItems.length > 0 && (
        <View style={styles.previewSection}>
          <View style={styles.previewHeaderRow}>
            <Text style={styles.previewHeaderTitle}>
              {`${missing} missing across ${followUpItems.length} follow-up item${
                followUpItems.length === 1 ? '' : 's'
              }`}
            </Text>
            <TouchableOpacity
              style={styles.excelQuickBtn}
              onPress={onExportMissingMarks}
              disabled={exportingMissingMarks}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Download Excel follow-up sheet"
            >
              {exportingMissingMarks ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={14} color={theme.colors.primary} />
                  <Text style={styles.excelQuickBtnText}>Excel</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Render up to 3 preview rows */}
          <View style={styles.previewList}>
            {previewItems.map((item, idx) => (
              <View
                key={item.id}
                style={[
                  styles.previewRow,
                  idx > 0 && styles.previewRowDivider,
                  item.type === 'unassigned' && styles.unassignedRowHighlight,
                ]}
              >
                {/* Left: Avatar or Warning Icon */}
                <View
                  style={[
                    styles.previewAvatar,
                    item.type === 'unassigned'
                      ? { backgroundColor: `${theme.colors.warning}18` }
                      : item.type === 'unresolved'
                        ? { backgroundColor: `${theme.colors.border}40` }
                        : { backgroundColor: `${theme.colors.primary}18` },
                  ]}
                >
                  {item.type === 'unassigned' ? (
                    <Ionicons name="warning-outline" size={16} color={theme.colors.warning} />
                  ) : item.type === 'unresolved' ? (
                    <Ionicons name="help-outline" size={16} color={theme.colors.textSecondary} />
                  ) : (
                    <Text style={[styles.previewAvatarText, { color: theme.colors.primary }]}>
                      {(item.teacher_name || 'T').slice(0, 1).toUpperCase()}
                    </Text>
                  )}
                </View>

                {/* Middle: Name, Class/Section, Subject */}
                <View style={styles.previewInfo}>
                  <Text style={styles.previewTeacherName} numberOfLines={1}>
                    {item.type === 'unassigned'
                      ? 'Teacher not assigned'
                      : item.type === 'unresolved'
                        ? 'Assignment unresolved'
                        : item.teacher_name}
                  </Text>
                  <Text style={styles.previewMetaText} numberOfLines={1}>
                    {item.class_name}
                    {item.section_names && item.section_names.length > 0
                      ? ` · Sec ${item.section_names.join(', ')}`
                      : item.section_name
                        ? ` · Sec ${item.section_name}`
                        : ''}
                    {` · ${item.subject_name}`}
                  </Text>
                </View>

                {/* Right: Missing Count or Assign Action */}
                <View style={styles.previewRightCol}>
                  {item.type === 'unassigned' ? (
                    onAssignTeacher && item.raw_section ? (
                      <TouchableOpacity
                        style={styles.assignTeacherBtn}
                        onPress={() => onAssignTeacher(item.raw_paper, item.raw_section!)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Assign teacher for ${item.class_name} ${item.subject_name}`}
                      >
                        <Ionicons name="person-add-outline" size={12} color={theme.colors.warning} />
                        <Text style={styles.assignTeacherBtnText}>Assign</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.missingBadgeWarning}>
                        <Text style={styles.missingBadgeWarningText}>Unassigned</Text>
                      </View>
                    )
                  ) : typeof item.missing_entries === 'number' ? (
                    <View style={styles.missingBadge}>
                      <Text style={styles.missingBadgeText}>{item.missing_entries} missing</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          {/* Primary Action: View All Follow-ups */}
          <TouchableOpacity
            style={styles.viewAllBtn}
            onPress={onOpenFullList}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`View all ${followUpItems.length} unuploaded mark follow-ups`}
          >
            <Ionicons name="list-outline" size={17} color="#FFFFFF" />
            <Text style={styles.viewAllBtnText}>
              {followUpItems.length > 3
                ? `View all ${followUpItems.length} follow-ups`
                : 'Open follow-up manager'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Result Publication Actions (Dedicated responsive row) ─────── */}
      <View style={styles.publishActionSection}>
        <TouchableOpacity
          style={[
            styles.publishActionBtn,
            resultsPublished
              ? styles.publishActionBtnUnpublish
              : resultsPublishable
                ? styles.publishActionBtnPrimary
                : styles.publishActionBtnDisabled,
          ]}
          disabled={publishDisabled}
          onPress={onResultPublishToggle}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`${publishLabel} for ${examName}`}
        >
          {saving ? (
            <ActivityIndicator size="small" color={resultsPublished ? theme.colors.text : '#FFFFFF'} />
          ) : (
            <>
              <Ionicons
                name={
                  resultsPublished
                    ? 'eye-off-outline'
                    : resultsPublishable
                      ? 'megaphone-outline'
                      : 'lock-closed-outline'
                }
                size={16}
                color={
                  resultsPublished
                    ? theme.colors.text
                    : resultsPublishable
                      ? '#FFFFFF'
                      : theme.colors.textTertiary
                }
              />
              <Text
                style={[
                  styles.publishActionBtnText,
                  resultsPublished
                    ? { color: theme.colors.text }
                    : resultsPublishable
                      ? { color: '#FFFFFF' }
                      : { color: theme.colors.textTertiary },
                ]}
              >
                {publishLabel}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(theme: Theme, isNarrow: boolean) {
  return StyleSheet.create({
    cardContainer: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      marginBottom: 16,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    headerRow: {
      flexDirection: isNarrow ? 'column' : 'row',
      alignItems: isNarrow ? 'flex-start' : 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    headerTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headerIconChip: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTextGroup: {
      flexDirection: 'column',
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.textStrong,
      letterSpacing: -0.2,
    },
    headerSubtitle: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    badgePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
      alignSelf: isNarrow ? 'flex-start' : 'auto',
    },
    badgeIcon: {
      marginRight: 5,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    progressSection: {
      marginTop: 14,
    },
    progressLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    progressPercentText: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.colors.textStrong,
    },
    progressEntriesText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    progressBarBg: {
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.borderLight,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 4,
    },
    metricsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      backgroundColor: theme.colors.background,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.borderLight,
      paddingVertical: 10,
      paddingHorizontal: 8,
      marginTop: 14,
    },
    metricBox: {
      flex: 1,
      alignItems: 'center',
    },
    metricVal: {
      fontSize: 15,
      fontWeight: '800',
      color: theme.colors.textStrong,
    },
    metricLbl: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    metricDivider: {
      width: 1,
      height: 24,
      backgroundColor: theme.colors.borderLight,
    },
    explanationBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: 12,
      paddingHorizontal: 4,
      gap: 6,
    },
    explanationIcon: {
      marginTop: 2,
    },
    explanationText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
    successBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: `${theme.colors.success}12`,
      borderColor: `${theme.colors.success}30`,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginTop: 14,
    },
    successBannerText: {
      flex: 1,
      fontSize: 12.5,
      fontWeight: '600',
      color: theme.colors.success,
      lineHeight: 18,
    },
    previewSection: {
      marginTop: 16,
      borderTopWidth: 1,
      borderTopColor: theme.colors.borderLight,
      paddingTop: 14,
    },
    previewHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    previewHeaderTitle: {
      fontSize: 12.5,
      fontWeight: '700',
      color: theme.colors.warning,
      flex: 1,
      marginRight: 8,
    },
    excelQuickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: `${theme.colors.primary}12`,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      minHeight: 32,
    },
    excelQuickBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    previewList: {
      backgroundColor: theme.colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.borderLight,
      overflow: 'hidden',
      marginBottom: 12,
    },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      gap: 10,
    },
    previewRowDivider: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.borderLight,
    },
    unassignedRowHighlight: {
      backgroundColor: `${theme.colors.warning}06`,
    },
    previewAvatar: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewAvatarText: {
      fontSize: 13,
      fontWeight: '800',
    },
    previewInfo: {
      flex: 1,
    },
    previewTeacherName: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textStrong,
    },
    previewMetaText: {
      fontSize: 11.5,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    previewRightCol: {
      alignItems: 'flex-end',
    },
    missingBadge: {
      backgroundColor: `${theme.colors.warning}18`,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    missingBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.warning,
    },
    missingBadgeWarning: {
      backgroundColor: `${theme.colors.danger}14`,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    missingBadgeWarningText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.danger,
    },
    assignTeacherBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: `${theme.colors.warning}18`,
      borderColor: `${theme.colors.warning}40`,
      borderWidth: 1,
      borderRadius: 7,
      paddingHorizontal: 8,
      paddingVertical: 5,
      minHeight: 44,
      justifyContent: 'center',
    },
    assignTeacherBtnText: {
      fontSize: 11,
      fontWeight: '800',
      color: theme.colors.warning,
    },
    viewAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      minHeight: 46,
      gap: 8,
    },
    viewAllBtnText: {
      color: '#FFFFFF',
      fontSize: 13.5,
      fontWeight: '800',
    },
    publishActionSection: {
      marginTop: 14,
      borderTopWidth: 1,
      borderTopColor: theme.colors.borderLight,
      paddingTop: 14,
    },
    publishActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      minHeight: 48,
      gap: 8,
      width: '100%',
    },
    publishActionBtnPrimary: {
      backgroundColor: theme.colors.primary,
    },
    publishActionBtnUnpublish: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    publishActionBtnDisabled: {
      backgroundColor: theme.colors.borderLight,
    },
    publishActionBtnText: {
      fontSize: 13.5,
      fontWeight: '800',
    },
  });
}
