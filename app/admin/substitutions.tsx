import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import AdminHeader from '../../src/components/AdminHeader';
import AppDatePicker, { parseYMD, toYMD } from '../../src/components/AppDatePicker';
import AppTextInput from '../../src/components/AppTextInput';
import LogoLoader from '../../src/components/LogoLoader';
import { useTheme } from '../../src/hooks/useTheme';
import { useAdminWebChrome } from '../../src/contexts/AdminWebChromeContext';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import {
  CandidateResponse,
  SubstituteCandidate,
  SubstitutionBoard,
  SubstitutionService,
  SubstitutionSlot,
} from '../../src/services/substitutionService';
import { SchoolService } from '../../src/services/schoolService';
import {
  downloadSubstitutionReportPdf,
  SubstitutionReportMode,
} from '../../src/utils/substitutionReportPdf';
import { downloadSubstitutionReportCsv } from '../../src/utils/substitutionReportCsv';
import {
  buildPeriodDisplayMap,
  getSlotDisplayInfo,
} from '../../src/utils/substitutionPeriodNumbering';
import {
  filterManualPickerSlots,
  hasManualSubstitutionReason,
  isEligibleManualPickerSlot,
  isManualSubstitution,
  regularTeacherMetaLabel,
} from '../../src/utils/manualSubstitutionSlots';

type BoardView = 'time' | 'class';

function timeLabel(value?: string) {
  if (!value) return '';
  const [hourRaw, minute = '00'] = value.split(':');
  const hour = Number(hourRaw);
  if (Number.isNaN(hour)) return value.slice(0, 5);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function classLabel(slot: SubstitutionSlot) {
  return `${slot.class_name}-${slot.section_name}`;
}

function initials(name?: string | null) {
  const words = String(name || 'Teacher').trim().split(/\s+/);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('');
}

function scoreColor(score: number) {
  if (score >= 85) return '#10B981';
  if (score >= 70) return '#6366F1';
  return '#F59E0B';
}

export default function DailySubstitutionsScreen() {
  const { isDark } = useTheme();
  const { shellActive } = useAdminWebChrome();
  const { width } = useWindowDimensions();
  const c = useMemo(() => colors(isDark), [isDark]);
  const styles = useMemo(() => makeStyles(c), [c]);
  const today = useMemo(() => toYMD(new Date()), []);

  const [date, setDate] = useState(today);
  const [view, setView] = useState<BoardView>('time');
  const [board, setBoard] = useState<SubstitutionBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [reportVisible, setReportVisible] = useState(false);
  const [reportMode, setReportMode] = useState<SubstitutionReportMode>('complete');
  const [reportDownloading, setReportDownloading] = useState(false);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [targetSlot, setTargetSlot] = useState<SubstitutionSlot | null>(null);
  const [candidateData, setCandidateData] = useState<CandidateResponse | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<SubstituteCandidate | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [assignmentSource, setAssignmentSource] = useState<'board' | 'manual'>('board');
  const [manualVisible, setManualVisible] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [manualBoard, setManualBoard] = useState<SubstitutionBoard | null>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState('');

  const loadBoard = useCallback(async (nextDate = date, pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const data = await SubstitutionService.getBoard(nextDate, 'affected');
      setBoard(data);
    } catch (error: any) {
      const msg = error?.message || 'Please try again.';
      setLoadError(msg);
      alertCompat('Could not load substitutions', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date]);

  useEffect(() => {
    setTeacherFilter('');
    setManualVisible(false);
    setManualPaused(false);
    setSheetVisible(false);
    setAssignmentSource('board');
    loadBoard(date);
  }, [date, loadBoard]);

  const periodMap = useMemo(() => buildPeriodDisplayMap(board?.periods || []), [board?.periods]);

  const filteredSlots = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (board?.slots || []).filter((slot) => {
      if (teacherFilter && slot.regular_teacher_id !== teacherFilter) return false;
      if (!q) return true;
      return [
        slot.class_name,
        slot.section_name,
        slot.subject_name,
        slot.regular_teacher_name,
        slot.substitute_teacher_name,
      ].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [board?.slots, query, teacherFilter]);

  const groups = useMemo(() => {
    if (view === 'time') {
      return (board?.periods || [])
        .map((period) => {
          const info = getSlotDisplayInfo(period, periodMap);
          return {
            key: `period-${period.sort_order}`,
            title: info.displayLabel || period.name || `Period ${period.sort_order}`,
            subtitle: `${timeLabel(period.start_time)} – ${timeLabel(period.end_time)}`,
            icon: (info.isBreak ? 'cafe-outline' : 'time-outline') as keyof typeof Ionicons.glyphMap,
            slots: filteredSlots.filter((slot) => slot.period_number === period.sort_order),
          };
        })
        .filter((group) => group.slots.length > 0);
    }

    const map = new Map<string, SubstitutionSlot[]>();
    for (const slot of filteredSlots) {
      const key = `${slot.class_section_id}::${classLabel(slot)}`;
      const list = map.get(key) || [];
      list.push(slot);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([key, slots]) => ({
        key,
        title: classLabel(slots[0]),
        subtitle: `${slots.length} teaching period${slots.length === 1 ? '' : 's'}`,
        icon: 'school-outline' as const,
        slots: [...slots].sort((a, b) => a.period_number - b.period_number),
      }))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  }, [board?.periods, filteredSlots, periodMap, view]);

  const assignedSlots = useMemo(
    () => (board?.slots || []).filter((slot) => Boolean(slot.substitution_id && slot.substitute_teacher_name)),
    [board?.slots]
  );

  const downloadReport = async () => {
    if (!board || assignedSlots.length === 0 || reportDownloading) return;
    setReportDownloading(true);
    try {
      const schoolProfile = await SchoolService.getProfile().catch(() => null);
      await downloadSubstitutionReportPdf(board, reportMode, {
        schoolName: schoolProfile?.name,
        logoUrl: schoolProfile?.logo_url,
      });
      setReportVisible(false);
    } catch (error: any) {
      alertCompat('Could not create report', error?.message || 'Please try again.');
    } finally {
      setReportDownloading(false);
    }
  };

  const downloadCsv = async () => {
    if (!board || assignedSlots.length === 0 || reportDownloading) return;
    setReportDownloading(true);
    try {
      await downloadSubstitutionReportCsv(board);
      setReportVisible(false);
    } catch (error: any) {
      alertCompat('Could not export CSV', error?.message || 'Please try again.');
    } finally {
      setReportDownloading(false);
    }
  };

  const closeCandidateSheet = () => {
    if (saving) return;
    setSheetVisible(false);
    if (assignmentSource === 'manual') setManualPaused(false);
  };

  const openManualPicker = async () => {
    setManualVisible(true);
    setManualPaused(false);
    setManualQuery('');
    setManualError(null);
    setManualBoard(null);
    setManualLoading(true);
    try {
      const data = await SubstitutionService.getBoard(date, 'all');
      setManualBoard(data);
    } catch (error: any) {
      setManualError(error?.message || 'Please try again.');
    } finally {
      setManualLoading(false);
    }
  };

  const openAssignment = async (slot: SubstitutionSlot, source: 'board' | 'manual' = 'board') => {
    if (!slot.regular_teacher_id) {
      alertCompat('Regular teacher required', 'Assign a regular teacher in the timetable before arranging cover.');
      if (source === 'manual') setManualPaused(false);
      return;
    }
    setAssignmentSource(source);
    setTargetSlot(slot);
    setCandidateData(null);
    setSelectedCandidate(null);
    setReason(slot.substitution_id ? (slot.reason || '') : '');
    setSheetVisible(true);
    setCandidatesLoading(true);
    try {
      const data = await SubstitutionService.getCandidates(date, slot.slot_id);
      setCandidateData(data);
      if (data.candidates.length > 0) setSelectedCandidate(data.candidates[0]);
    } catch (error: any) {
      alertCompat('Could not find available teachers', error?.message || 'Please try again.');
      setSheetVisible(false);
      if (source === 'manual') setManualPaused(false);
    } finally {
      setCandidatesLoading(false);
    }
  };

  const reasonRequired = assignmentSource === 'manual' || (targetSlot ? isManualSubstitution(targetSlot) : false);

  const assign = async () => {
    if (!targetSlot || !selectedCandidate) return;
    if (reasonRequired && !hasManualSubstitutionReason(reason)) {
      alertCompat('Reason required', 'Enter a short reason so this manual substitution can be audited.');
      return;
    }
    setSaving(true);
    try {
      await SubstitutionService.assign({
        date,
        slot_id: targetSlot.slot_id,
        substitute_teacher_id: selectedCandidate.id,
        reason: reason.trim(),
        supersede_substitution_id:
          targetSlot.substitution_id && !targetSlot.is_auto_suggested
            ? targetSlot.substitution_id
            : undefined,
      });
      setSheetVisible(false);
      setManualVisible(false);
      setManualPaused(false);
      setManualBoard(null);
      setAssignmentSource('board');
      await loadBoard(date);
      alertCompat(
        'Cover assigned',
        `${selectedCandidate.teacher_name} will cover ${classLabel(targetSlot)} for this date only.`
      );
    } catch (error: any) {
      alertCompat('Could not assign cover', error?.message || 'Please refresh and try again.');
    } finally {
      setSaving(false);
    }
  };

  const cancelAssignment = (slot: SubstitutionSlot) => {
    if (!slot.substitution_id) return;
    alertCompat(
      'Cancel this substitution?',
      `${slot.substitute_teacher_name} will be removed from ${classLabel(slot)} for ${date}.`,
      [
        { text: 'Keep assignment', style: 'cancel' },
        {
          text: 'Cancel substitution',
          style: 'destructive',
          onPress: async () => {
            try {
              await SubstitutionService.cancel(slot.substitution_id!);
              await loadBoard(date);
            } catch (error: any) {
              alertCompat('Could not cancel', error?.message || 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const cardBasis = width >= 1200 ? '31.8%' : width >= 760 ? '48.5%' : '100%';
  const selectedDateLabel = parseYMD(date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <View style={styles.screen}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={c.page} />
      {!shellActive && <AdminHeader title="Daily Substitutions" showBackButton />}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadBoard(date, true)}
            tintColor={c.primary}
          />
        }
      >
        <LinearGradient
          colors={isDark ? ['#1E1B4B', '#172554'] : ['#312E81', '#4F46E5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroGlowOne} />
          <View style={styles.heroGlowTwo} />
          <View style={styles.heroTop}>
            <View style={styles.heroCopy}>
              <View style={styles.eyebrow}>
                <Ionicons name="sparkles" size={13} color="#C7D2FE" />
                <Text style={styles.eyebrowText}>SMART COVER DESK</Text>
              </View>
              <Text style={styles.heroTitle}>Keep every class moving.</Text>
              <Text style={styles.heroSubtitle}>
                Find genuinely free teachers, balance cover duties, and grant attendance access for one day only.
              </Text>
            </View>
            <View style={styles.resetBadge}>
              <Ionicons name="refresh-circle" size={22} color="#A7F3D0" />
              <View>
                <Text style={styles.resetTitle}>Auto resets</Text>
                <Text style={styles.resetText}>Regular timetable resumes next day</Text>
              </View>
            </View>
          </View>

          <View style={styles.heroStats}>
            <Stat value={board?.summary.covered_slots || 0} label="Covered today" />
            <View style={styles.statDivider} />
            <Stat
              value={board?.summary.uncovered_slots ?? (board ? board.summary.total_slots - board.summary.covered_slots : 0)}
              label="Uncovered classes"
            />
            <View style={styles.statDivider} />
            <Stat
              value={board?.summary.unavailable_teachers_count ?? (board?.unavailable_teachers?.length || 0)}
              label="Unavailable staff"
            />
          </View>
        </LinearGradient>

        <View style={styles.controlCard}>
          <View style={styles.controlTop}>
            <View style={styles.dateCell}>
              <Text style={styles.controlLabel}>COVER DATE</Text>
              <AppDatePicker
                value={date}
                onChange={setDate}
                label={selectedDateLabel}
                isDark={isDark}
                containerStyle={{ marginBottom: 0 }}
                wrapperStyle={styles.datePicker}
                accentColor={c.primary}
              />
            </View>
            <View style={styles.viewCell}>
              <Text style={styles.controlLabel}>ORGANISE BY</Text>
              <View style={styles.segment}>
                <SegmentButton
                  active={view === 'time'}
                  icon="time-outline"
                  label="Time wise"
                  onPress={() => setView('time')}
                  c={c}
                />
                <SegmentButton
                  active={view === 'class'}
                  icon="school-outline"
                  label="Class wise"
                  onPress={() => setView('class')}
                  c={c}
                />
              </View>
            </View>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={c.muted} />
            <AppTextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search class, subject or teacher"
              placeholderTextColor={c.muted}
              style={styles.searchInput}
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} style={styles.clearSearch}>
                <Ionicons name="close" size={15} color={c.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={[styles.controlLabel, { marginTop: 18 }]}>UNAVAILABLE TEACHER</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teacherChips}>
            <FilterChip
              label="All teachers"
              active={!teacherFilter}
              onPress={() => setTeacherFilter('')}
              c={c}
            />
            {(board?.unavailable_teachers && board.unavailable_teachers.length > 0
              ? board.unavailable_teachers
              : (board?.teachers || []).map((t) => ({ id: t.id, teacher_name: t.teacher_name, source_label: 'Unavailable' }))
            ).map((teacher) => (
              <FilterChip
                key={teacher.id}
                label={teacher.teacher_name}
                sublabel={teacher.source_label}
                active={teacherFilter === teacher.id}
                onPress={() => setTeacherFilter(teacherFilter === teacher.id ? '' : teacher.id)}
                c={c}
              />
            ))}
          </ScrollView>

          <TouchableOpacity
            onPress={openManualPicker}
            activeOpacity={0.85}
            style={styles.manualButton}
            accessibilityRole="button"
            accessibilityLabel="Add manual substitution"
          >
            <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
            <Text style={styles.manualButtonText}>Add manual substitution</Text>
          </TouchableOpacity>

          <View style={styles.reportCallout}>
            <View style={styles.reportCalloutIcon}>
              <Ionicons name="document-text-outline" size={20} color={c.primary} />
            </View>
            <View style={styles.reportCalloutCopy}>
              <Text style={styles.reportCalloutTitle}>Substitution duty register</Text>
              <Text style={styles.reportCalloutText}>
                Download all {assignedSlots.length} confirmed {assignedSlots.length === 1 ? 'assignment' : 'assignments'} as a branded PDF or CSV.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setReportVisible(true)}
              disabled={loading || assignedSlots.length === 0}
              activeOpacity={0.82}
              style={[styles.reportButton, (loading || assignedSlots.length === 0) && styles.reportButtonDisabled]}
            >
              <Ionicons name="download-outline" size={17} color="#FFFFFF" />
              <Text style={styles.reportButtonText}>Download list</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Informational Banner: Attendance not recorded */}
        {board && board.attendance_recorded === false ? (
          <View style={styles.attendanceBanner}>
            <Ionicons name="information-circle-outline" size={20} color={c.infoText} />
            <View style={{ flex: 1 }}>
              <Text style={styles.attendanceBannerTitle}>Staff attendance not recorded for this date</Text>
              <Text style={styles.attendanceBannerText}>
                Unavailable teachers and affected classes are identified automatically using approved staff leave records.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Advisory Banner: Classes needing substitute cover */}
        {board && board.summary.uncovered_slots > 0 ? (
          <View style={styles.advisoryBanner}>
            <Ionicons name="alert-circle" size={22} color={c.warningText} />
            <View style={{ flex: 1 }}>
              <Text style={styles.advisoryBannerTitle}>
                Action Required: {board.summary.uncovered_slots} {board.summary.uncovered_slots === 1 ? 'class needs' : 'classes need'} substitute cover
              </Text>
              <Text style={styles.advisoryBannerText}>
                Assign available teachers to cover all affected periods for {selectedDateLabel} to ensure student classes are covered.
              </Text>
            </View>
          </View>
        ) : board && board.summary.total_slots > 0 && board.summary.uncovered_slots === 0 ? (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={22} color={c.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.successBannerTitle}>All affected classes covered</Text>
              <Text style={styles.successBannerText}>
                All {board.summary.total_slots} affected {board.summary.total_slots === 1 ? 'period has' : 'periods have'} confirmed substitute teachers for this date.
              </Text>
            </View>
          </View>
        ) : null}

        {loadError ? (
          <Animated.View entering={FadeIn.duration(220)} style={styles.errorState}>
            <View style={styles.errorIcon}>
              <Ionicons name="cloud-offline-outline" size={32} color={c.danger} />
            </View>
            <Text style={styles.errorTitle}>Unable to load cover board</Text>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity onPress={() => loadBoard(date)} style={styles.retryButton}>
              <Ionicons name="refresh" size={16} color="#FFFFFF" />
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : loading ? (
          <View style={styles.loadingState}>
            <LogoLoader size={52} color={c.primary} />
            <Text style={styles.loadingText}>Analyzing teacher availability and timetable…</Text>
          </View>
        ) : (board?.unavailable_teachers?.length || 0) === 0 && (board?.slots?.length || 0) === 0 ? (
          <Animated.View entering={FadeIn.duration(220)} style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: c.successSoft }]}>
              <Ionicons name="checkmark-done-circle" size={32} color={c.success} />
            </View>
            <Text style={styles.emptyTitle}>All teachers available</Text>
            <Text style={styles.emptyText}>
              No teachers are on approved leave or marked absent for {selectedDateLabel}. You can still add a manual substitution for any scheduled class. It applies to this date only, and the regular timetable resumes the next day.
            </Text>
            <TouchableOpacity
              onPress={openManualPicker}
              activeOpacity={0.85}
              style={[styles.manualButton, { marginTop: 16 }]}
              accessibilityRole="button"
              accessibilityLabel="Add manual substitution"
            >
              <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.manualButtonText}>Add manual substitution</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (board?.unavailable_teachers?.length || 0) > 0 && (board?.slots?.length || 0) === 0 ? (
          <Animated.View entering={FadeIn.duration(220)} style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: c.infoSoft }]}>
              <Ionicons name="people-outline" size={32} color={c.infoText} />
            </View>
            <Text style={styles.emptyTitle}>No affected classes require cover</Text>
            <Text style={styles.emptyText}>
              {board?.unavailable_teachers?.length} {board?.unavailable_teachers?.length === 1 ? 'teacher is' : 'teachers are'} unavailable on {selectedDateLabel} ({board?.unavailable_teachers?.map((t) => `${t.teacher_name} [${t.source_label}]`).join(', ')}), but none have teaching periods scheduled in the timetable for this day.
            </Text>
          </Animated.View>
        ) : groups.length === 0 ? (
          <Animated.View entering={FadeIn.duration(220)} style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="calendar-outline" size={30} color={c.primary} />
            </View>
            <Text style={styles.emptyTitle}>No matching classes</Text>
            <Text style={styles.emptyText}>
              No classes match the current search or teacher filter. Try clearing the filters.
            </Text>
            <TouchableOpacity onPress={() => { setQuery(''); setTeacherFilter(''); }} style={styles.clearFilterButton}>
              <Text style={styles.clearFilterButtonText}>Clear filters</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <View style={styles.groups}>
            {groups.map((group, groupIndex) => (
              <Animated.View
                key={group.key}
                entering={FadeInDown.delay(Math.min(groupIndex, 5) * 45).duration(280)}
                style={styles.group}
              >
                <View style={styles.groupHeader}>
                  <View style={styles.groupIcon}>
                    <Ionicons name={group.icon} size={17} color={c.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupTitle}>{group.title}</Text>
                    <Text style={styles.groupSubtitle}>{group.subtitle}</Text>
                  </View>
                  <View style={styles.groupCount}>
                    <Text style={styles.groupCountText}>{group.slots.length}</Text>
                  </View>
                </View>
                <View style={styles.slotGrid}>
                  {group.slots.map((slot) => {
                    const slotPeriodInfo = getSlotDisplayInfo(slot, periodMap);
                    return (
                      <SubstitutionCard
                        key={slot.slot_id}
                        slot={slot}
                        periodDisplayLabel={slotPeriodInfo.displayLabel}
                        basis={cardBasis}
                        c={c}
                        styles={styles}
                        onAssign={() => openAssignment(slot)}
                        onCancel={() => cancelAssignment(slot)}
                      />
                    );
                  })}
                </View>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>

      <ManualPickerSheet
        visible={manualVisible && !manualPaused}
        dateLabel={selectedDateLabel}
        board={manualBoard}
        loading={manualLoading}
        error={manualError}
        query={manualQuery}
        onQueryChange={setManualQuery}
        onSelect={(slot) => {
          setManualPaused(true);
          openAssignment(slot, 'manual');
        }}
        onRetry={openManualPicker}
        onClose={() => {
          setManualVisible(false);
          setManualPaused(false);
          setAssignmentSource('board');
        }}
        c={c}
      />

      <CandidateSheet
        visible={sheetVisible}
        target={targetSlot}
        data={candidateData}
        loading={candidatesLoading}
        selected={selectedCandidate}
        onSelect={setSelectedCandidate}
        reason={reason}
        onReasonChange={setReason}
        reasonRequired={reasonRequired}
        saving={saving}
        onAssign={assign}
        onClose={closeCandidateSheet}
        isDark={isDark}
        c={c}
      />

      <ReportSheet
        visible={reportVisible}
        mode={reportMode}
        onModeChange={setReportMode}
        assignedSlots={assignedSlots}
        periods={board?.periods || []}
        downloading={reportDownloading}
        onDownloadPdf={downloadReport}
        onDownloadCsv={downloadCsv}
        onClose={() => !reportDownloading && setReportVisible(false)}
        c={c}
      />
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={staticStyles.stat}>
      <Text style={staticStyles.statValue}>{value}</Text>
      <Text style={staticStyles.statLabel}>{label}</Text>
    </View>
  );
}

function SegmentButton({
  active,
  icon,
  label,
  onPress,
  c,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  c: ReturnType<typeof colors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[staticStyles.segmentButton, active && { backgroundColor: c.primary }]}
    >
      <Ionicons name={icon} size={15} color={active ? '#FFFFFF' : c.muted} />
      <Text style={[staticStyles.segmentLabel, { color: active ? '#FFFFFF' : c.text }]}>{label}</Text>
    </Pressable>
  );
}

function FilterChip({
  label,
  sublabel,
  active,
  onPress,
  c,
}: {
  label: string;
  sublabel?: string | null;
  active: boolean;
  onPress: () => void;
  c: ReturnType<typeof colors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        staticStyles.filterChip,
        { backgroundColor: active ? c.primarySoft : c.card, borderColor: active ? c.primary : c.border },
      ]}
    >
      {active ? <Ionicons name="checkmark-circle" size={14} color={c.primary} /> : null}
      <Text style={[staticStyles.filterChipText, { color: active ? c.primary : c.text }]} numberOfLines={1}>
        {label}
      </Text>
      {sublabel ? (
        <View style={[staticStyles.chipSublabel, { backgroundColor: active ? c.primary : c.cardAlt }]}>
          <Text style={[staticStyles.chipSublabelText, { color: active ? '#FFFFFF' : c.muted }]} numberOfLines={1}>
            {sublabel}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const REPORT_OPTIONS: {
  value: SubstitutionReportMode;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    value: 'complete',
    title: 'Complete list',
    description: 'Every assigned duty in chronological order',
    icon: 'list-outline',
  },
  {
    value: 'teacher',
    title: 'Teacher wise',
    description: 'Group duties under each substitute teacher',
    icon: 'people-outline',
  },
  {
    value: 'period',
    title: 'Period wise',
    description: 'Group duties by bell period and time',
    icon: 'time-outline',
  },
  {
    value: 'class',
    title: 'Class wise',
    description: 'Group duties by class and section',
    icon: 'school-outline',
  },
];

function ReportSheet({
  visible,
  mode,
  onModeChange,
  assignedSlots,
  periods,
  downloading,
  onDownloadPdf,
  onDownloadCsv,
  onClose,
  c,
}: {
  visible: boolean;
  mode: SubstitutionReportMode;
  onModeChange: (mode: SubstitutionReportMode) => void;
  assignedSlots: SubstitutionSlot[];
  periods: SubstitutionBoard['periods'];
  downloading: boolean;
  onDownloadPdf: () => void;
  onDownloadCsv: () => void;
  onClose: () => void;
  c: ReturnType<typeof colors>;
}) {
  if (!visible) return null;
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
  const styles = makeStyles(c);
  const teacherCount = new Set(
    assignedSlots.map((slot) => slot.substitute_teacher_id || slot.substitute_teacher_name)
  ).size;
  const assignedPeriodCount = new Set(assignedSlots.map((slot) => slot.period_number)).size;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <Animated.View
        entering={SlideInDown.springify().damping(24).stiffness(260)}
        exiting={SlideOutDown.duration(180)}
        style={[styles.sheet, styles.reportSheet]}
      >
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <View style={styles.reportSheetHeading}>
            <View style={styles.reportSheetIcon}>
              <Ionicons name={format === 'pdf' ? "document-text-outline" : "grid-outline"} size={22} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetEyebrow}>SUBSTITUTION REPORT EXPORT</Text>
              <Text style={styles.sheetTitle}>Download duty register</Text>
              <Text style={styles.sheetSubtitle}>Choose export format and layout for confirmed duties.</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} disabled={downloading} style={styles.sheetClose}>
            <Ionicons name="close" size={19} color={c.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.reportSheetBody} showsVerticalScrollIndicator={false}>
          <View style={styles.formatSegment}>
            <Pressable
              onPress={() => setFormat('pdf')}
              style={[styles.formatBtn, format === 'pdf' && styles.formatBtnActive]}
            >
              <Ionicons name="document-text-outline" size={16} color={format === 'pdf' ? '#FFFFFF' : c.muted} />
              <Text style={[styles.formatBtnText, format === 'pdf' && styles.formatBtnTextActive]}>Branded PDF</Text>
            </Pressable>
            <Pressable
              onPress={() => setFormat('csv')}
              style={[styles.formatBtn, format === 'csv' && styles.formatBtnActive]}
            >
              <Ionicons name="grid-outline" size={16} color={format === 'csv' ? '#FFFFFF' : c.muted} />
              <Text style={[styles.formatBtnText, format === 'csv' && styles.formatBtnTextActive]}>CSV Spreadsheet</Text>
            </Pressable>
          </View>

          <View style={styles.reportSummary}>
            <ReportMetric value={assignedSlots.length} label="Assignments" c={c} />
            <ReportMetric value={teacherCount} label="Substitutes" c={c} />
            <ReportMetric value={assignedPeriodCount} label={`of ${periods.length} periods`} c={c} />
          </View>

          {format === 'pdf' ? (
            <>
              <View style={styles.reportOptions}>
                {REPORT_OPTIONS.map((option) => {
                  const active = mode === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => onModeChange(option.value)}
                      style={[
                        styles.reportOption,
                        active && { borderColor: c.primary, backgroundColor: c.primarySoft },
                      ]}
                    >
                      <View style={[styles.reportOptionIcon, active && { backgroundColor: c.primary }]}>
                        <Ionicons name={option.icon} size={18} color={active ? '#FFFFFF' : c.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reportOptionTitle}>{option.title}</Text>
                        <Text style={styles.reportOptionText}>{option.description}</Text>
                      </View>
                      <Ionicons
                        name={active ? 'radio-button-on' : 'radio-button-off'}
                        size={21}
                        color={active ? c.primary : c.muted}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.reportBrandNote}>
                <Ionicons name="shield-checkmark-outline" size={15} color={c.success} />
                <Text style={styles.reportBrandNoteText}>
                  Teaching periods are continuously numbered (breaks do not increment). School logo and branding are included automatically.
                </Text>
              </View>

              <TouchableOpacity
                onPress={onDownloadPdf}
                disabled={downloading || assignedSlots.length === 0}
                activeOpacity={0.85}
                style={{ opacity: downloading || assignedSlots.length === 0 ? 0.55 : 1 }}
              >
                <LinearGradient colors={['#312E81', '#4F46E5']} style={styles.confirmButton}>
                  {downloading ? (
                    <LogoLoader size={22} color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.confirmText}>Create premium PDF</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.csvExplainer}>
                <View style={styles.csvExplainerIcon}>
                  <Ionicons name="document-attach-outline" size={24} color={c.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.csvExplainerTitle}>Spreadsheet export (CSV)</Text>
                  <Text style={styles.csvExplainerText}>
                    Exports confirmed assignments in chronological timetable order with continuous teaching period numbers (Period 1, Period 2, etc.). Breaks and non-teaching slots are excluded from period numbers.
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={onDownloadCsv}
                disabled={downloading || assignedSlots.length === 0}
                activeOpacity={0.85}
                style={{ opacity: downloading || assignedSlots.length === 0 ? 0.55 : 1 }}
              >
                <LinearGradient colors={['#059669', '#10B981']} style={styles.confirmButton}>
                  {downloading ? (
                    <LogoLoader size={22} color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.confirmText}>Export CSV spreadsheet</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function ReportMetric({ value, label, c }: { value: number; label: string; c: ReturnType<typeof colors> }) {
  return (
    <View style={[staticStyles.reportMetric, { borderColor: c.border, backgroundColor: c.cardAlt }]}>
      <Text style={[staticStyles.reportMetricValue, { color: c.text }]}>{value}</Text>
      <Text style={[staticStyles.reportMetricLabel, { color: c.muted }]}>{label}</Text>
    </View>
  );
}

function SubstitutionCard({
  slot,
  periodDisplayLabel,
  basis,
  c,
  styles,
  onAssign,
  onCancel,
}: {
  slot: SubstitutionSlot;
  periodDisplayLabel?: string;
  basis: string;
  c: ReturnType<typeof colors>;
  styles: ReturnType<typeof makeStyles>;
  onAssign: () => void;
  onCancel: () => void;
}) {
  const covered = Boolean(slot.substitution_id);
  const isUncovered = !covered;

  return (
    <View
      style={[
        styles.slotCard,
        { flexBasis: basis as any },
        isUncovered && styles.slotCardUncovered,
      ]}
    >
      <View
        style={[
          styles.slotAccent,
          { backgroundColor: covered ? c.success : c.warning },
        ]}
      />
      <View style={styles.slotTop}>
        <View style={styles.slotTopLeft}>
          <View style={[styles.classBadge, { backgroundColor: covered ? c.successSoft : c.primarySoft }]}>
            <Ionicons name="school" size={12} color={covered ? c.success : c.primary} />
            <Text style={[styles.classBadgeText, { color: covered ? c.success : c.primary }]}>
              {classLabel(slot)}
            </Text>
          </View>
          {periodDisplayLabel ? (
            <View style={styles.periodPill}>
              <Text style={styles.periodPillText}>{periodDisplayLabel}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.slotTopRight}>
          <Text style={styles.slotTime}>{timeLabel(slot.start_time)}</Text>
          {isUncovered ? (
            <View style={styles.uncoveredBadge}>
              <Ionicons name="alert-circle" size={11} color={c.danger} />
              <Text style={styles.uncoveredBadgeText}>NEEDS SUBSTITUTE</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Text style={styles.subjectName}>{slot.subject_name}</Text>
      <View style={styles.teacherRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(slot.regular_teacher_name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.metaLabel}>{regularTeacherMetaLabel(slot)}</Text>
          <Text style={styles.teacherName} numberOfLines={1}>
            {slot.regular_teacher_name || 'Teacher not assigned'}
          </Text>
          {slot.unavailability_label ? (
            <View style={styles.unavailabilitySourcePill}>
              <Ionicons name="information-circle-outline" size={11} color={c.warningText} />
              <Text style={styles.unavailabilitySourceText}>{slot.unavailability_label}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {covered ? (
        <View style={[styles.coverPanel, slot.is_auto_suggested ? { borderColor: '#F59E0B', borderWidth: 1 } : null]}>
          <View style={[styles.coverCheck, slot.is_auto_suggested ? { backgroundColor: '#F59E0B' } : null]}>
            <Ionicons name={slot.is_auto_suggested ? "flash" : "checkmark"} size={14} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.coverLabel, slot.is_auto_suggested ? { color: '#D97706' } : null]}>
              {slot.is_auto_suggested ? 'AUTO-SUGGESTED (LEAVE)' : 'COVERED BY'}
            </Text>
            <Text style={styles.coverName}>{slot.substitute_teacher_name}</Text>
            {slot.reason ? <Text style={styles.coverReason} numberOfLines={1}>{slot.reason}</Text> : null}
          </View>
          {slot.is_auto_suggested ? (
            <TouchableOpacity onPress={onAssign} style={[styles.cancelButton, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]} accessibilityLabel="Confirm or change suggested substitute">
              <Ionicons name="checkmark-done" size={16} color="#D97706" />
            </TouchableOpacity>
          ) : (
            <View style={styles.coverActions}>
              <TouchableOpacity onPress={onAssign} style={styles.changeButton} accessibilityLabel="Change substitute">
                <Ionicons name="create-outline" size={14} color={c.primary} />
                <Text style={styles.changeButtonText}>Change</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onCancel} style={styles.cancelButton} accessibilityLabel="Cancel substitution">
                <Ionicons name="close" size={16} color={c.danger} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <TouchableOpacity onPress={onAssign} activeOpacity={0.82}>
          <LinearGradient
            colors={['#4F46E5', '#6366F1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.assignButton}
          >
            <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
            <Text style={styles.assignButtonText}>Find available cover</Text>
            <Ionicons name="arrow-forward" size={15} color="#C7D2FE" />
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
}

function ManualPickerSheet({
  visible,
  dateLabel,
  board,
  loading,
  error,
  query,
  onQueryChange,
  onSelect,
  onRetry,
  onClose,
  c,
}: {
  visible: boolean;
  dateLabel: string;
  board: SubstitutionBoard | null;
  loading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (slot: SubstitutionSlot) => void;
  onRetry: () => void;
  onClose: () => void;
  c: ReturnType<typeof colors>;
}) {
  const styles = makeStyles(c);
  const periodMap = useMemo(() => buildPeriodDisplayMap(board?.periods || []), [board?.periods]);
  const eligibleCount = useMemo(
    () => (board?.slots || []).filter(isEligibleManualPickerSlot).length,
    [board?.slots],
  );
  const slots = useMemo(
    () => filterManualPickerSlots(
      board?.slots || [],
      query,
      (slot) => getSlotDisplayInfo(slot, periodMap).displayLabel,
    ).sort((a, b) => a.period_number - b.period_number || classLabel(a).localeCompare(classLabel(b), undefined, { numeric: true })),
    [board?.slots, periodMap, query],
  );

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <Animated.View
        entering={SlideInDown.springify().damping(24).stiffness(260)}
        exiting={SlideOutDown.duration(180)}
        style={styles.sheet}
      >
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetEyebrow}>MANUAL SUBSTITUTION</Text>
            <Text style={styles.sheetTitle}>Choose a class to cover</Text>
            <Text style={styles.sheetSubtitle}>
              {dateLabel}. This does not change the permanent timetable.
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.sheetClose} accessibilityLabel="Close manual substitution">
            <Ionicons name="close" size={19} color={c.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={c.muted} />
          <AppTextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search class, section, subject, period or teacher"
            placeholderTextColor={c.muted}
            style={styles.searchInput}
          />
          {query ? (
            <TouchableOpacity onPress={() => onQueryChange('')} style={styles.clearSearch}>
              <Ionicons name="close" size={15} color={c.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.candidateLoading}>
            <LogoLoader size={46} color={c.primary} />
            <Text style={styles.loadingText}>Loading scheduled classes…</Text>
          </View>
        ) : error ? (
          <View style={styles.noCandidate}>
            <Text style={styles.emptyTitle}>Could not load classes</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
              <Ionicons name="refresh" size={16} color="#FFFFFF" />
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : eligibleCount === 0 ? (
          <View style={styles.noCandidate}>
            <Text style={styles.emptyTitle}>No class needs a new cover</Text>
            <Text style={styles.emptyText}>
              Breaks, periods without a regular teacher, and classes that already have a substitution are hidden.
            </Text>
          </View>
        ) : slots.length === 0 ? (
          <View style={styles.noCandidate}>
            <Text style={styles.emptyTitle}>No matching classes</Text>
            <Text style={styles.emptyText}>Try another class, section, subject, period, or teacher.</Text>
          </View>
        ) : (
          <ScrollView style={styles.candidateList} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
            {slots.map((slot) => {
              const period = getSlotDisplayInfo(slot, periodMap);
              return (
                <Pressable
                  key={slot.slot_id}
                  onPress={() => onSelect(slot)}
                  style={styles.pickerRow}
                  accessibilityRole="button"
                  accessibilityLabel={`Cover ${classLabel(slot)} ${slot.subject_name}`}
                >
                  <View style={styles.pickerPeriod}>
                    <Text style={styles.pickerPeriodText}>{period.shortLabel || period.displayLabel}</Text>
                    <Text style={styles.pickerTime}>{timeLabel(slot.start_time)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.pickerTitle}>{classLabel(slot)} · {slot.subject_name}</Text>
                    <Text style={styles.pickerMeta} numberOfLines={1}>
                      {slot.regular_teacher_name}
                      {period.displayLabel ? ` · ${period.displayLabel}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={c.muted} />
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  );
}

function CandidateSheet({
  visible,
  target,
  data,
  loading,
  selected,
  onSelect,
  reason,
  onReasonChange,
  reasonRequired,
  saving,
  onAssign,
  onClose,
  isDark,
  c,
}: {
  visible: boolean;
  target: SubstitutionSlot | null;
  data: CandidateResponse | null;
  loading: boolean;
  selected: SubstituteCandidate | null;
  onSelect: (candidate: SubstituteCandidate) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  reasonRequired: boolean;
  saving: boolean;
  onAssign: () => void;
  onClose: () => void;
  isDark: boolean;
  c: ReturnType<typeof colors>;
}) {
  if (!visible || !target) return null;
  const styles = makeStyles(c);

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <Animated.View
        entering={SlideInDown.springify().damping(24).stiffness(260)}
        exiting={SlideOutDown.duration(180)}
        style={styles.sheet}
      >
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetEyebrow}>ASSIGN ONE-DAY COVER</Text>
            <Text style={styles.sheetTitle}>{classLabel(target)} · {target.subject_name}</Text>
            <Text style={styles.sheetSubtitle}>
              {timeLabel(target.start_time)}–{timeLabel(target.end_time)} · replacing {target.regular_teacher_name}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} disabled={saving} style={styles.sheetClose}>
            <Ionicons name="close" size={19} color={c.text} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.candidateLoading}>
            <LogoLoader size={46} color={c.primary} />
            <Text style={styles.loadingText}>Checking every teacher’s timetable…</Text>
          </View>
        ) : (data?.candidates.length || 0) === 0 ? (
          <View style={styles.noCandidate}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={28} color={c.primary} />
            </View>
            <Text style={styles.emptyTitle}>No teacher is free</Text>
            <Text style={styles.emptyText}>
              Everyone eligible is teaching, on leave, marked absent, or already covering another class in this period.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.rankExplainer}>
              <Ionicons name="analytics-outline" size={16} color={c.primary} />
              <Text style={styles.rankExplainerText}>
                Ranked by subject match, class familiarity, workload and recent cover fairness. Unavailable and conflicting teachers are automatically excluded.
              </Text>
            </View>
            <ScrollView style={styles.candidateList} contentContainerStyle={{ gap: 10 }}>
              {data?.candidates.map((candidate, index) => {
                const active = selected?.id === candidate.id;
                const accent = scoreColor(candidate.score);
                return (
                  <Pressable
                    key={candidate.id}
                    onPress={() => onSelect(candidate)}
                    style={[
                      styles.candidateCard,
                      active && { borderColor: c.primary, backgroundColor: c.primarySoft },
                    ]}
                  >
                    <View style={[styles.rankBadge, index === 0 && { backgroundColor: '#FEF3C7' }]}>
                      <Text style={[styles.rankText, index === 0 && { color: '#B45309' }]}>#{index + 1}</Text>
                    </View>
                    <View style={[styles.candidateAvatar, { backgroundColor: `${accent}20` }]}>
                      <Text style={[styles.candidateAvatarText, { color: accent }]}>
                        {initials(candidate.teacher_name)}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.candidateNameRow}>
                        <Text style={styles.candidateName} numberOfLines={1}>{candidate.teacher_name}</Text>
                        <Text style={[styles.recommendation, { color: accent }]}>{candidate.recommendation}</Text>
                      </View>
                      <View style={styles.reasonChips}>
                        {candidate.reasons.map((item) => (
                          <View key={item} style={styles.reasonChip}>
                            <Text style={styles.reasonChipText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <View style={[styles.scoreRing, { borderColor: accent }]}>
                      <Text style={[styles.scoreText, { color: accent }]}>{candidate.score}</Text>
                    </View>
                    <Ionicons
                      name={active ? 'radio-button-on' : 'radio-button-off'}
                      size={21}
                      color={active ? c.primary : c.muted}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.reasonField}>
              <Text style={styles.controlLabel}>
                {reasonRequired ? 'REASON (REQUIRED)' : 'NOTE / REASON (OPTIONAL)'}
              </Text>
              <AppTextInput
                value={reason}
                onChangeText={onReasonChange}
                placeholder={reasonRequired ? 'e.g. Called into a parent meeting' : 'e.g. Regular teacher on leave'}
                placeholderTextColor={c.muted}
                maxLength={500}
                style={styles.reasonInput}
              />
              {reasonRequired ? (
                <Text style={styles.reasonHint}>Enter at least 3 characters so this manual cover stays auditable.</Text>
              ) : null}
            </View>

            <TouchableOpacity
              onPress={onAssign}
              disabled={!selected || saving || (reasonRequired && !hasManualSubstitutionReason(reason))}
              activeOpacity={0.85}
              style={{ opacity: !selected || saving || (reasonRequired && !hasManualSubstitutionReason(reason)) ? 0.55 : 1 }}
            >
              <LinearGradient colors={['#4F46E5', '#6366F1']} style={styles.confirmButton}>
                {saving ? (
                  <LogoLoader size={22} color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="shield-checkmark-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.confirmText}>
                      Assign {selected?.teacher_name || 'selected teacher'}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.expiryNote}>
              <Ionicons name="information-circle-outline" size={12} /> Attendance access applies only to this class and date.
            </Text>
          </>
        )}
      </Animated.View>
    </Modal>
  );
}

function colors(isDark: boolean) {
  return {
    page: isDark ? '#080C16' : '#F3F5FA',
    card: isDark ? '#111827' : '#FFFFFF',
    cardAlt: isDark ? '#172033' : '#F8FAFC',
    text: isDark ? '#F8FAFC' : '#0F172A',
    subtext: isDark ? '#A8B2C5' : '#475569',
    muted: isDark ? '#6B7890' : '#94A3B8',
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.09)',
    primary: '#5B5CE2',
    primarySoft: isDark ? 'rgba(91,92,226,0.16)' : '#EEF2FF',
    success: '#10B981',
    successSoft: isDark ? 'rgba(16,185,129,0.15)' : '#ECFDF5',
    warning: '#F59E0B',
    warningSoft: isDark ? 'rgba(245,158,11,0.16)' : '#FEF3C7',
    warningText: isDark ? '#FBBF24' : '#B45309',
    infoSoft: isDark ? 'rgba(59,130,246,0.14)' : '#EFF6FF',
    infoText: isDark ? '#93C5FD' : '#1D4ED8',
    danger: '#EF4444',
    shadow: isDark ? '#000000' : '#64748B',
  };
}

function makeStyles(c: ReturnType<typeof colors>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.page },
    content: { padding: 20, paddingBottom: 80, width: '100%', maxWidth: 1280, alignSelf: 'center' },
    hero: { borderRadius: 28, padding: 26, overflow: 'hidden', marginBottom: 16 },
    heroGlowOne: { position: 'absolute', width: 230, height: 230, borderRadius: 115, backgroundColor: 'rgba(129,140,248,0.24)', right: -70, top: -90 },
    heroGlowTwo: { position: 'absolute', width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(14,165,233,0.15)', left: '38%', bottom: -120 },
    heroTop: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between' },
    heroCopy: { flex: 1, minWidth: 260, maxWidth: 710 },
    eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
    eyebrowText: { color: '#C7D2FE', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
    heroTitle: { color: '#FFFFFF', fontSize: Platform.OS === 'web' ? 30 : 25, fontWeight: '900', letterSpacing: -0.9 },
    heroSubtitle: { color: '#DDE4FF', fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: 650 },
    resetBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, alignSelf: 'flex-start' },
    resetTitle: { color: '#D1FAE5', fontSize: 12, fontWeight: '900' },
    resetText: { color: '#E0E7FF', fontSize: 10, marginTop: 2 },
    heroStats: { flexDirection: 'row', marginTop: 24, paddingTop: 18, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.13)' },
    statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginHorizontal: 18 },
    controlCard: { backgroundColor: c.card, borderRadius: 24, borderWidth: 1, borderColor: c.border, padding: 18, marginBottom: 20, shadowColor: c.shadow, shadowOpacity: Platform.OS === 'web' ? 0.08 : 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
    controlTop: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    dateCell: { flex: 1.2, minWidth: 260 },
    viewCell: { flex: 1, minWidth: 250 },
    controlLabel: { color: c.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginBottom: 8 },
    datePicker: { backgroundColor: c.cardAlt, borderRadius: 14, minHeight: 48 },
    segment: { flexDirection: 'row', padding: 4, backgroundColor: c.cardAlt, borderRadius: 14, minHeight: 48 },
    searchWrap: { height: 48, marginTop: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, backgroundColor: c.cardAlt, borderWidth: 1, borderColor: c.border },
    searchInput: { flex: 1, color: c.text, fontSize: 14, borderWidth: 0, paddingHorizontal: 0, backgroundColor: 'transparent', height: 46 },
    clearSearch: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: c.card },
    teacherChips: { gap: 8, paddingRight: 10 },
    reportCallout: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.border, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
    reportCalloutIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    reportCalloutCopy: { flex: 1, minWidth: 220 },
    reportCalloutTitle: { color: c.text, fontSize: 13, fontWeight: '900' },
    reportCalloutText: { color: c.subtext, fontSize: 10, lineHeight: 15, marginTop: 3 },
    reportButton: { minHeight: 42, paddingHorizontal: 15, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: c.primary },
    reportButtonDisabled: { opacity: 0.45 },
    reportButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
    manualButton: { marginTop: 16, minHeight: 46, borderRadius: 14, backgroundColor: c.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
    manualButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
    attendanceBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: c.infoSoft, borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)', marginBottom: 16 },
    attendanceBannerTitle: { color: c.infoText, fontSize: 13, fontWeight: '800' },
    attendanceBannerText: { color: c.subtext, fontSize: 11, marginTop: 2, lineHeight: 16 },
    advisoryBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: c.warningSoft, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', marginBottom: 16 },
    advisoryBannerTitle: { color: c.warningText, fontSize: 13, fontWeight: '900' },
    advisoryBannerText: { color: c.subtext, fontSize: 11, marginTop: 2, lineHeight: 16 },
    successBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: c.successSoft, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', marginBottom: 16 },
    successBannerTitle: { color: c.success, fontSize: 13, fontWeight: '900' },
    successBannerText: { color: c.subtext, fontSize: 11, marginTop: 2, lineHeight: 16 },
    errorState: { minHeight: 280, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: c.card, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', gap: 10 },
    errorIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: 'rgba(239,68,68,0.12)', alignItems: 'center', justifyContent: 'center' },
    errorTitle: { color: c.danger, fontSize: 18, fontWeight: '900' },
    errorText: { color: c.subtext, fontSize: 13, textAlign: 'center', maxWidth: 460, lineHeight: 19 },
    retryButton: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: c.primary },
    retryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
    loadingState: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 14 },
    loadingText: { color: c.subtext, fontSize: 13, fontWeight: '600' },
    emptyState: { minHeight: 270, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: c.card, borderRadius: 24, borderWidth: 1, borderColor: c.border },
    emptyIcon: { width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primarySoft, marginBottom: 14 },
    emptyTitle: { color: c.text, fontSize: 18, fontWeight: '900' },
    emptyText: { color: c.subtext, fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 460, marginTop: 6 },
    clearFilterButton: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 11, backgroundColor: c.cardAlt, borderWidth: 1, borderColor: c.border },
    clearFilterButtonText: { color: c.primary, fontSize: 12, fontWeight: '800' },
    groups: { gap: 26 },
    group: { gap: 12 },
    groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    groupIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primarySoft },
    groupTitle: { color: c.text, fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
    groupSubtitle: { color: c.muted, fontSize: 11, marginTop: 2 },
    groupCount: { minWidth: 30, height: 30, borderRadius: 11, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    groupCountText: { color: c.primary, fontWeight: '900', fontSize: 12 },
    slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    slotCard: { minWidth: 285, flexGrow: 1, backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 17, overflow: 'hidden', shadowColor: c.shadow, shadowOpacity: Platform.OS === 'web' ? 0.06 : 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
    slotCardUncovered: { borderColor: 'rgba(245,158,11,0.45)', backgroundColor: c.card },
    slotAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
    slotTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    slotTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    slotTopRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    classBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
    classBadgeText: { fontSize: 11, fontWeight: '900' },
    periodPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, backgroundColor: c.cardAlt },
    periodPillText: { color: c.subtext, fontSize: 10, fontWeight: '800' },
    slotTime: { color: c.muted, fontSize: 11, fontWeight: '800' },
    uncoveredBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: 'rgba(239,68,68,0.12)' },
    uncoveredBadgeText: { color: c.danger, fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
    unavailabilitySourcePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.warningSoft, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, marginTop: 4, alignSelf: 'flex-start' },
    unavailabilitySourceText: { color: c.warningText, fontSize: 9, fontWeight: '800' },
    subjectName: { color: c.text, fontSize: 18, fontWeight: '900', marginTop: 14, marginBottom: 13, letterSpacing: -0.4 },
    teacherRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 14 },
    avatar: { width: 36, height: 36, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: c.primary, fontSize: 11, fontWeight: '900' },
    metaLabel: { color: c.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
    teacherName: { color: c.subtext, fontSize: 13, fontWeight: '800', marginTop: 2 },
    assignButton: { minHeight: 44, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 14 },
    assignButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', flex: 1, textAlign: 'center' },
    coverPanel: { minHeight: 54, padding: 10, borderRadius: 13, backgroundColor: c.successSoft, flexDirection: 'row', alignItems: 'center', gap: 10 },
    coverCheck: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.success },
    coverLabel: { color: c.success, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
    coverName: { color: c.text, fontSize: 12, fontWeight: '900', marginTop: 1 },
    coverReason: { color: c.subtext, fontSize: 9, marginTop: 2 },
    coverActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    changeButton: { minHeight: 31, paddingHorizontal: 8, borderRadius: 10, backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', gap: 4 },
    changeButtonText: { color: c.primary, fontSize: 10, fontWeight: '900' },
    cancelButton: { width: 31, height: 31, borderRadius: 10, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardAlt },
    pickerPeriod: { width: 64, alignItems: 'flex-start' },
    pickerPeriodText: { color: c.primary, fontSize: 12, fontWeight: '900' },
    pickerTime: { color: c.muted, fontSize: 10, fontWeight: '700', marginTop: 2 },
    pickerTitle: { color: c.text, fontSize: 14, fontWeight: '900' },
    pickerMeta: { color: c.subtext, fontSize: 11, marginTop: 3 },
    reasonHint: { color: c.muted, fontSize: 10, marginTop: 6 },
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,23,0.58)' },
    sheet: { position: 'absolute', bottom: 0, alignSelf: 'center', width: '100%', maxWidth: 820, maxHeight: '92%', backgroundColor: c.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: Platform.OS === 'ios' ? 34 : 24, borderWidth: 1, borderColor: c.border },
    reportSheet: { maxWidth: 680 },
    reportSheetBody: { flexShrink: 1 },
    sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: c.border, alignSelf: 'center', marginBottom: 18 },
    sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
    reportSheetHeading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    reportSheetIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    sheetEyebrow: { color: c.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
    sheetTitle: { color: c.text, fontSize: 20, fontWeight: '900', marginTop: 4, letterSpacing: -0.5 },
    sheetSubtitle: { color: c.subtext, fontSize: 11, marginTop: 5 },
    sheetClose: { width: 38, height: 38, borderRadius: 13, backgroundColor: c.cardAlt, alignItems: 'center', justifyContent: 'center' },
    formatSegment: { flexDirection: 'row', backgroundColor: c.cardAlt, borderRadius: 13, padding: 4, gap: 6, marginBottom: 14 },
    formatBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10, borderRadius: 10 },
    formatBtnActive: { backgroundColor: c.primary },
    formatBtnText: { color: c.muted, fontSize: 12, fontWeight: '800' },
    formatBtnTextActive: { color: '#FFFFFF' },
    candidateLoading: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 14 },
    noCandidate: { minHeight: 280, alignItems: 'center', justifyContent: 'center', padding: 24 },
    rankExplainer: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.primarySoft, padding: 11, borderRadius: 12, marginBottom: 12 },
    rankExplainerText: { color: c.subtext, fontSize: 10, lineHeight: 15, flex: 1, fontWeight: '600' },
    candidateList: { maxHeight: 350 },
    candidateCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.cardAlt },
    rankBadge: { width: 27, height: 27, borderRadius: 9, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    rankText: { color: c.muted, fontSize: 10, fontWeight: '900' },
    candidateAvatar: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    candidateAvatarText: { fontSize: 12, fontWeight: '900' },
    candidateNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    candidateName: { color: c.text, fontSize: 13, fontWeight: '900', flexShrink: 1 },
    recommendation: { fontSize: 9, fontWeight: '900' },
    reasonChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
    reasonChip: { backgroundColor: c.card, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: c.border },
    reasonChipText: { color: c.subtext, fontSize: 8, fontWeight: '700' },
    scoreRing: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    scoreText: { fontSize: 11, fontWeight: '900' },
    reasonField: { marginTop: 14 },
    reasonInput: { color: c.text, backgroundColor: c.cardAlt, borderRadius: 13, borderWidth: 1, borderColor: c.border, paddingHorizontal: 13, minHeight: 46 },
    confirmButton: { minHeight: 50, borderRadius: 15, marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
    confirmText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
    expiryNote: { color: c.muted, fontSize: 9, textAlign: 'center', marginTop: 9 },
    reportSummary: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    reportOptions: { gap: 9 },
    reportOption: { minHeight: 66, padding: 11, borderRadius: 15, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.cardAlt, flexDirection: 'row', alignItems: 'center', gap: 11 },
    reportOptionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    reportOptionTitle: { color: c.text, fontSize: 12, fontWeight: '900' },
    reportOptionText: { color: c.subtext, fontSize: 9, lineHeight: 13, marginTop: 2 },
    reportBrandNote: { marginTop: 13, padding: 10, borderRadius: 12, backgroundColor: c.successSoft, flexDirection: 'row', alignItems: 'center', gap: 8 },
    reportBrandNoteText: { flex: 1, color: c.subtext, fontSize: 9, lineHeight: 13, fontWeight: '600' },
    csvExplainer: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, backgroundColor: c.cardAlt, borderWidth: 1, borderColor: c.border, marginTop: 8, marginBottom: 14 },
    csvExplainerIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    csvExplainerTitle: { color: c.text, fontSize: 13, fontWeight: '900' },
    csvExplainerText: { color: c.subtext, fontSize: 10, lineHeight: 15, marginTop: 3 },
  });
}

const staticStyles = StyleSheet.create({
  stat: { flex: 1 },
  statValue: { color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  statLabel: { color: '#C7D2FE', fontSize: 10, marginTop: 3, fontWeight: '700' },
  segmentButton: { flex: 1, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10, minHeight: 40 },
  segmentLabel: { fontSize: 11, fontWeight: '900' },
  filterChip: { height: 36, maxWidth: 210, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterChipText: { fontSize: 11, fontWeight: '800', maxWidth: 120 },
  chipSublabel: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  chipSublabelText: { fontSize: 8, fontWeight: '800' },
  reportMetric: { flex: 1, minWidth: 0, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1 },
  reportMetricValue: { fontSize: 16, fontWeight: '900' },
  reportMetricLabel: { fontSize: 8, fontWeight: '800', marginTop: 2 },
});
