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

  const loadBoard = useCallback(async (nextDate = date, pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await SubstitutionService.getBoard(nextDate);
      setBoard(data);
    } catch (error: any) {
      alertCompat('Could not load substitutions', error?.message || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date]);

  useEffect(() => {
    setTeacherFilter('');
    loadBoard(date);
  }, [date, loadBoard]);

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
        .map((period) => ({
          key: `period-${period.sort_order}`,
          title: period.name || `Period ${period.sort_order}`,
          subtitle: `${timeLabel(period.start_time)} – ${timeLabel(period.end_time)}`,
          icon: 'time-outline' as const,
          slots: filteredSlots.filter((slot) => slot.period_number === period.sort_order),
        }))
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
  }, [board?.periods, filteredSlots, view]);

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

  const openAssignment = async (slot: SubstitutionSlot) => {
    if (!slot.regular_teacher_id) {
      alertCompat('Regular teacher required', 'Assign a regular teacher in the timetable before arranging cover.');
      return;
    }
    setTargetSlot(slot);
    setCandidateData(null);
    setSelectedCandidate(null);
    setReason('');
    setSheetVisible(true);
    setCandidatesLoading(true);
    try {
      const data = await SubstitutionService.getCandidates(date, slot.slot_id);
      setCandidateData(data);
      if (data.candidates.length > 0) setSelectedCandidate(data.candidates[0]);
    } catch (error: any) {
      alertCompat('Could not find available teachers', error?.message || 'Please try again.');
      setSheetVisible(false);
    } finally {
      setCandidatesLoading(false);
    }
  };

  const assign = async () => {
    if (!targetSlot || !selectedCandidate) return;
    setSaving(true);
    try {
      await SubstitutionService.assign({
        date,
        slot_id: targetSlot.slot_id,
        substitute_teacher_id: selectedCandidate.id,
        reason,
      });
      setSheetVisible(false);
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
            <Stat value={board?.summary.total_slots || 0} label="Scheduled classes" />
            <View style={styles.statDivider} />
            <Stat value={board?.teachers.length || 0} label="Teachers on roster" />
          </View>
        </LinearGradient>

        <View style={styles.controlCard}>
          <View style={styles.controlTop}>
            <View style={styles.dateCell}>
              <Text style={styles.controlLabel}>COVER DATE</Text>
              <AppDatePicker
                value={date}
                onChange={setDate}
                minimumDate={today}
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

          <Text style={[styles.controlLabel, { marginTop: 18 }]}>ABSENT TEACHER</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teacherChips}>
            <FilterChip
              label="All teachers"
              active={!teacherFilter}
              onPress={() => setTeacherFilter('')}
              c={c}
            />
            {(board?.teachers || []).map((teacher) => (
              <FilterChip
                key={teacher.id}
                label={teacher.teacher_name}
                active={teacherFilter === teacher.id}
                onPress={() => setTeacherFilter(teacher.id)}
                c={c}
              />
            ))}
          </ScrollView>

          <View style={styles.reportCallout}>
            <View style={styles.reportCalloutIcon}>
              <Ionicons name="document-text-outline" size={20} color={c.primary} />
            </View>
            <View style={styles.reportCalloutCopy}>
              <Text style={styles.reportCalloutTitle}>Substitution duty register</Text>
              <Text style={styles.reportCalloutText}>
                Download all {assignedSlots.length} confirmed {assignedSlots.length === 1 ? 'assignment' : 'assignments'} as a branded PDF.
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

        {loading ? (
          <View style={styles.loadingState}>
            <LogoLoader size={52} color={c.primary} />
            <Text style={styles.loadingText}>Preparing the cover board…</Text>
          </View>
        ) : groups.length === 0 ? (
          <Animated.View entering={FadeIn.duration(220)} style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="calendar-outline" size={30} color={c.primary} />
            </View>
            <Text style={styles.emptyTitle}>No matching classes</Text>
            <Text style={styles.emptyText}>
              Try a different teacher or search term. Sundays and dates outside the academic year may have no schedule.
            </Text>
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
                  {group.slots.map((slot) => (
                    <SubstitutionCard
                      key={slot.slot_id}
                      slot={slot}
                      basis={cardBasis}
                      c={c}
                      styles={styles}
                      onAssign={() => openAssignment(slot)}
                      onCancel={() => cancelAssignment(slot)}
                    />
                  ))}
                </View>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>

      <CandidateSheet
        visible={sheetVisible}
        target={targetSlot}
        data={candidateData}
        loading={candidatesLoading}
        selected={selectedCandidate}
        onSelect={setSelectedCandidate}
        reason={reason}
        onReasonChange={setReason}
        saving={saving}
        onAssign={assign}
        onClose={() => !saving && setSheetVisible(false)}
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
        onDownload={downloadReport}
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
  active,
  onPress,
  c,
}: {
  label: string;
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
  onDownload,
  onClose,
  c,
}: {
  visible: boolean;
  mode: SubstitutionReportMode;
  onModeChange: (mode: SubstitutionReportMode) => void;
  assignedSlots: SubstitutionSlot[];
  periods: SubstitutionBoard['periods'];
  downloading: boolean;
  onDownload: () => void;
  onClose: () => void;
  c: ReturnType<typeof colors>;
}) {
  if (!visible) return null;
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
              <Ionicons name="document-text-outline" size={22} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetEyebrow}>BRANDED PDF REGISTER</Text>
              <Text style={styles.sheetTitle}>Download substitutes list</Text>
              <Text style={styles.sheetSubtitle}>Choose how the confirmed assignments should be arranged.</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} disabled={downloading} style={styles.sheetClose}>
            <Ionicons name="close" size={19} color={c.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.reportSheetBody} showsVerticalScrollIndicator={false}>
          <View style={styles.reportSummary}>
            <ReportMetric value={assignedSlots.length} label="Assignments" c={c} />
            <ReportMetric value={teacherCount} label="Substitutes" c={c} />
            <ReportMetric value={assignedPeriodCount} label={`of ${periods.length} periods`} c={c} />
          </View>

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
              The school name and logo are added automatically from this app&apos;s environment settings.
            </Text>
          </View>

          <TouchableOpacity
            onPress={onDownload}
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
  basis,
  c,
  styles,
  onAssign,
  onCancel,
}: {
  slot: SubstitutionSlot;
  basis: string;
  c: ReturnType<typeof colors>;
  styles: ReturnType<typeof makeStyles>;
  onAssign: () => void;
  onCancel: () => void;
}) {
  const covered = Boolean(slot.substitution_id);
  return (
    <View style={[styles.slotCard, { flexBasis: basis as any }]}>
      <View style={[styles.slotAccent, { backgroundColor: covered ? c.success : c.primary }]} />
      <View style={styles.slotTop}>
        <View style={[styles.classBadge, { backgroundColor: covered ? c.successSoft : c.primarySoft }]}>
          <Ionicons name="school" size={12} color={covered ? c.success : c.primary} />
          <Text style={[styles.classBadgeText, { color: covered ? c.success : c.primary }]}>
            {classLabel(slot)}
          </Text>
        </View>
        <Text style={styles.slotTime}>{timeLabel(slot.start_time)}</Text>
      </View>

      <Text style={styles.subjectName}>{slot.subject_name}</Text>
      <View style={styles.teacherRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(slot.regular_teacher_name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.metaLabel}>{covered ? 'ABSENT TEACHER' : 'REGULAR TEACHER'}</Text>
          <Text style={styles.teacherName} numberOfLines={1}>
            {slot.regular_teacher_name || 'Teacher not assigned'}
          </Text>
        </View>
      </View>

      {covered ? (
        <View style={styles.coverPanel}>
          <View style={styles.coverCheck}>
            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.coverLabel}>COVERED BY</Text>
            <Text style={styles.coverName}>{slot.substitute_teacher_name}</Text>
            {slot.reason ? <Text style={styles.coverReason} numberOfLines={1}>{slot.reason}</Text> : null}
          </View>
          <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
            <Ionicons name="close" size={16} color={c.danger} />
          </TouchableOpacity>
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

function CandidateSheet({
  visible,
  target,
  data,
  loading,
  selected,
  onSelect,
  reason,
  onReasonChange,
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
              Everyone eligible is teaching, absent, or already covering another class in this period.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.rankExplainer}>
              <Ionicons name="analytics-outline" size={16} color={c.primary} />
              <Text style={styles.rankExplainerText}>
                Ranked by subject match, class familiarity, workload and recent cover fairness.
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
              <Text style={styles.controlLabel}>NOTE / REASON (OPTIONAL)</Text>
              <AppTextInput
                value={reason}
                onChangeText={onReasonChange}
                placeholder="e.g. Regular teacher on leave"
                placeholderTextColor={c.muted}
                maxLength={500}
                style={styles.reasonInput}
              />
            </View>

            <TouchableOpacity
              onPress={onAssign}
              disabled={!selected || saving}
              activeOpacity={0.85}
              style={{ opacity: !selected || saving ? 0.55 : 1 }}
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
    controlCard: { backgroundColor: c.card, borderRadius: 24, borderWidth: 1, borderColor: c.border, padding: 18, marginBottom: 24, shadowColor: c.shadow, shadowOpacity: Platform.OS === 'web' ? 0.08 : 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
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
    loadingState: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 14 },
    loadingText: { color: c.subtext, fontSize: 13, fontWeight: '600' },
    emptyState: { minHeight: 270, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: c.card, borderRadius: 24, borderWidth: 1, borderColor: c.border },
    emptyIcon: { width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primarySoft, marginBottom: 14 },
    emptyTitle: { color: c.text, fontSize: 18, fontWeight: '900' },
    emptyText: { color: c.subtext, fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 440, marginTop: 6 },
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
    slotAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
    slotTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    classBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
    classBadgeText: { fontSize: 11, fontWeight: '900' },
    slotTime: { color: c.muted, fontSize: 11, fontWeight: '800' },
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
    cancelButton: { width: 31, height: 31, borderRadius: 10, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
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
  });
}

const staticStyles = StyleSheet.create({
  stat: { flex: 1 },
  statValue: { color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  statLabel: { color: '#C7D2FE', fontSize: 10, marginTop: 3, fontWeight: '700' },
  segmentButton: { flex: 1, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10, minHeight: 40 },
  segmentLabel: { fontSize: 11, fontWeight: '900' },
  filterChip: { height: 36, maxWidth: 190, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterChipText: { fontSize: 11, fontWeight: '800', maxWidth: 145 },
  reportMetric: { flex: 1, minWidth: 0, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1 },
  reportMetricValue: { fontSize: 16, fontWeight: '900' },
  reportMetricLabel: { fontSize: 8, fontWeight: '800', marginTop: 2 },
});
