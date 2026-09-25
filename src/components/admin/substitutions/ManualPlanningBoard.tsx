import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../hooks/useTheme';
import LogoLoader from '../../LogoLoader';
import { SubstitutionBoard, SubstitutionSlot } from '../../../services/substitutionService';
import { buildPeriodDisplayMap, getSlotDisplayInfo, isNonTeachingPeriod } from '../../../utils/substitutionPeriodNumbering';
import { isEligibleManualPickerSlot } from '../../../utils/manualSubstitutionSlots';
import {
  EMPTY_PLANNING_FILTERS,
  PlanningFilterState,
  PlanningPeriod,
  PlanningViewMode,
  countActivePlanningFilters,
  filterPlanningSlots,
  formatTimeRange,
  interleaveClassBreaks,
  isPlanningBreakVisible,
  numberingPeriods,
  planningClassOptions,
  planningDisabledReason,
  planningSectionOptions,
  planningSlotStatus,
  planningSubjectOptions,
  planningTeacherOptions,
  planningTimelinePeriods,
} from '../../../utils/manualPlanningSlots';
import PlanningFilters from './PlanningFilters';
import PlanningSlotCard from './PlanningSlotCard';
import { planningColors } from './planningTheme';

export default function ManualPlanningBoard({
  dateLabel,
  board,
  loading,
  refreshing,
  error,
  notice,
  onDismissNotice,
  onRetry,
  onBack,
  onSelectSlot,
}: {
  dateLabel: string;
  board: SubstitutionBoard | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  notice: { slotId: string; title: string; detail: string } | null;
  onDismissNotice: () => void;
  onRetry: () => void;
  onBack: () => void;
  onSelectSlot: (slot: SubstitutionSlot) => void;
}) {
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const c = useMemo(() => planningColors(isDark), [isDark]);
  const styles = useMemo(() => makeStyles(c), [c]);
  const [filters, setFilters] = useState<PlanningFilterState>(EMPTY_PLANNING_FILTERS);
  const [view, setView] = useState<PlanningViewMode>('period');
  const wide = width >= 1040;
  const columns = width >= 1320 ? 3 : width >= 720 ? 2 : 1;
  const basis = columns === 3 ? '31.8%' : columns === 2 ? '48.5%' : '100%';

  const periods = useMemo(
    () => planningTimelinePeriods(board?.periods || [], board?.slots || []),
    [board?.periods, board?.slots],
  );
  const periodMap = useMemo(
    () => buildPeriodDisplayMap(numberingPeriods(board?.periods || [], board?.slots || [])),
    [board?.periods, board?.slots],
  );
  const slots = board?.slots || [];

  const updateFilters = (patch: Partial<PlanningFilterState>) => {
    setFilters((current) => {
      const next = { ...current, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'className') && patch.className !== current.className) {
        const allowed = planningSectionOptions(slots, next.className);
        if (next.sectionName && !allowed.includes(next.sectionName)) next.sectionName = '';
      }
      return next;
    });
  };

  const filteredSlots = useMemo(
    () => filterPlanningSlots(slots, filters, (slot) => {
      const info = getSlotDisplayInfo(slot, periodMap);
      return `${info.displayLabel} ${info.shortLabel} ${info.name}`;
    }),
    [slots, filters, periodMap],
  );

  const classOptions = useMemo(
    () => planningClassOptions(slots).map((name) => ({ value: name, label: name })),
    [slots],
  );
  const sectionOptions = useMemo(
    () => planningSectionOptions(slots, filters.className).map((name) => ({ value: name, label: name })),
    [slots, filters.className],
  );
  const teacherOptions = useMemo(
    () => planningTeacherOptions(slots).map((teacher) => ({ value: teacher.id, label: teacher.name })),
    [slots],
  );
  const subjectOptions = useMemo(
    () => planningSubjectOptions(slots).map((name) => ({ value: name, label: name })),
    [slots],
  );
  const periodOptions = useMemo(
    () => periods.map((period) => {
      const info = getSlotDisplayInfo(period, periodMap);
      const time = formatTimeRange(period.start_time, period.end_time);
      return {
        value: String(period.sort_order),
        label: time ? `${info.displayLabel} · ${time}` : info.displayLabel,
      };
    }),
    [periods, periodMap],
  );

  const visibleBreaks = useMemo(
    () => periods.filter((period) => isPlanningBreakVisible(period, getSlotDisplayInfo(period, periodMap), filters)),
    [periods, periodMap, filters],
  );
  const teachingTotal = slots.filter((slot) => !isNonTeachingPeriod(slot)).length;
  const teachingShown = filteredSlots.length;
  const filtersActive = countActivePlanningFilters(filters) > 0;
  const resultLabel = teachingShown === 0 && visibleBreaks.length > 0
    ? `${visibleBreaks.length} non-teaching ${visibleBreaks.length === 1 ? 'period' : 'periods'}`
    : `Showing ${teachingShown} of ${teachingTotal}`;
  const timetableEmpty = !loading && !error && periods.length === 0 && slots.length === 0;
  const noMatches = !loading && !timetableEmpty && filtersActive && teachingShown === 0 && visibleBreaks.length === 0;

  return (
    <View style={styles.board} testID="manual-planning-board">
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>MANUAL SUBSTITUTION</Text>
          <Text style={styles.title} accessibilityRole="header">Plan cover for {dateLabel}</Text>
          <Text style={styles.subtitle}>
            Every period on this day is listed below. A manual assignment applies to this date only and leaves the permanent timetable unchanged.
          </Text>
          {refreshing ? <Text style={styles.refreshing}>Refreshing timetable…</Text> : null}
        </View>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to substitutions overview"
          testID="planning-back"
          style={(state) => [styles.backButton, Boolean((state as { focused?: boolean }).focused) && styles.focused]}
        >
          <Ionicons name="arrow-back" size={16} color={c.indigo} />
          <Text style={styles.backText}>Back to overview</Text>
        </Pressable>
      </View>

      {board && board.attendance_recorded === false ? (
        <View style={styles.infoNote}>
          <Ionicons name="information-circle-outline" size={18} color={c.indigo} />
          <Text style={styles.infoText}>
            Staff attendance is not recorded for this date. Classes that need cover are identified from approved leave.
          </Text>
        </View>
      ) : null}

      {notice ? (
        <View style={styles.successNote} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={20} color={c.teal} />
          <View style={{ flex: 1 }}>
            <Text style={styles.successTitle}>{notice.title}</Text>
            <Text style={styles.successDetail}>{notice.detail}</Text>
          </View>
          <Pressable
            onPress={onDismissNotice}
            style={styles.dismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss cover assigned message"
          >
            <Ionicons name="close" size={16} color={c.teal} />
          </Pressable>
        </View>
      ) : null}

      {error && board ? (
        <View style={styles.errorNote}>
          <Ionicons name="cloud-offline-outline" size={18} color={c.danger} />
          <Text style={styles.errorNoteText}>{error}</Text>
          <Pressable onPress={onRetry} style={styles.retryInline} accessibilityRole="button" accessibilityLabel="Retry loading timetable">
            <Text style={styles.retryInlineText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.stateCard}>
          <LogoLoader size={52} color={c.indigo} />
          <Text style={styles.stateTitle}>Loading the full timetable…</Text>
          <Text style={styles.stateText}>Collecting every class, break, and teacher for {dateLabel}.</Text>
        </View>
      ) : error && !board ? (
        <View style={styles.stateCard}>
          <View style={[styles.stateIcon, { backgroundColor: c.dangerSoft }]}>
            <Ionicons name="cloud-offline-outline" size={28} color={c.danger} />
          </View>
          <Text style={styles.stateTitle}>Could not load the timetable</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable
            onPress={onRetry}
            style={styles.retryButton}
            accessibilityRole="button"
            accessibilityLabel="Retry loading timetable"
          >
            <Ionicons name="refresh" size={16} color="#FFFFFF" />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : timetableEmpty ? (
        <View style={styles.stateCard}>
          <View style={[styles.stateIcon, { backgroundColor: c.slateSoft }]}>
            <Ionicons name="calendar-outline" size={28} color={c.slate} />
          </View>
          <Text style={styles.stateTitle}>No timetable for this date</Text>
          <Text style={styles.stateText}>
            There are no scheduled periods for {dateLabel}. Check the academic calendar, or choose another cover date.
          </Text>
        </View>
      ) : (
        <>
          <PlanningFilters
            filters={filters}
            onChange={updateFilters}
            onClear={() => setFilters(EMPTY_PLANNING_FILTERS)}
            classOptions={classOptions}
            sectionOptions={sectionOptions}
            periodOptions={periodOptions}
            teacherOptions={teacherOptions}
            subjectOptions={subjectOptions}
            resultLabel={resultLabel}
            view={view}
            onViewChange={setView}
          />
          {noMatches ? (
            <View style={styles.stateCard}>
              <View style={[styles.stateIcon, { backgroundColor: c.indigoSoft }]}>
                <Ionicons name="funnel-outline" size={28} color={c.indigo} />
              </View>
              <Text style={styles.stateTitle}>No periods match these filters</Text>
              <Text style={styles.stateText}>
                Nothing on this timetable fits the current class, section, period, teacher, subject, status, or search.
              </Text>
              <Pressable
                onPress={() => setFilters(EMPTY_PLANNING_FILTERS)}
                style={styles.secondaryButton}
                accessibilityRole="button"
                accessibilityLabel="Clear filters"
              >
                <Text style={styles.secondaryText}>Clear filters</Text>
              </Pressable>
            </View>
          ) : view === 'period' ? (
            <PeriodLayout
              periods={periods}
              periodMap={periodMap}
              filteredSlots={filteredSlots}
              filters={filters}
              filtersActive={filtersActive}
              visibleBreaks={visibleBreaks}
              wide={wide}
              basis={basis}
              highlightedSlotId={notice?.slotId || null}
              onSelectSlot={onSelectSlot}
              styles={styles}
              c={c}
            />
          ) : (
            <ClassLayout
              filteredSlots={filteredSlots}
              visibleBreaks={visibleBreaks}
              periodMap={periodMap}
              wide={wide}
              basis={basis}
              highlightedSlotId={notice?.slotId || null}
              onSelectSlot={onSelectSlot}
              styles={styles}
              c={c}
            />
          )}
        </>
      )}
    </View>
  );
}

function PeriodLayout({
  periods,
  periodMap,
  filteredSlots,
  filters,
  filtersActive,
  visibleBreaks,
  wide,
  basis,
  highlightedSlotId,
  onSelectSlot,
  styles,
  c,
}: {
  periods: PlanningPeriod[];
  periodMap: ReturnType<typeof buildPeriodDisplayMap>;
  filteredSlots: SubstitutionSlot[];
  filters: PlanningFilterState;
  filtersActive: boolean;
  visibleBreaks: PlanningPeriod[];
  wide: boolean;
  basis: string;
  highlightedSlotId: string | null;
  onSelectSlot: (slot: SubstitutionSlot) => void;
  styles: ReturnType<typeof makeStyles>;
  c: ReturnType<typeof planningColors>;
}) {
  const visibleIds = new Set(visibleBreaks.map((period) => period.sort_order));
  return (
    <View style={styles.sections}>
      {periods.map((period) => {
        const info = getSlotDisplayInfo(period, periodMap);
        if (info.isBreak) {
          if (!visibleIds.has(period.sort_order)) return null;
          return (
            <BreakRow
              key={period.id || `break-${period.sort_order}`}
              label={info.displayLabel}
              time={formatTimeRange(period.start_time, period.end_time)}
              styles={styles}
              c={c}
            />
          );
        }
        const periodSlots = filteredSlots
          .filter((slot) => slot.period_number === period.sort_order)
          .sort((a, b) => classSort(a, b));
        if (filtersActive && periodSlots.length === 0) return null;
        if (filters.periodSortOrder != null && filters.periodSortOrder !== period.sort_order) return null;
        return (
          <View key={period.id || `period-${period.sort_order}`} style={wide ? styles.railRow : styles.stackSection}>
            <View style={wide ? styles.rail : styles.stackHeader}>
              <View style={styles.railIcon}>
                <Ionicons name="time-outline" size={16} color={c.indigo} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.railTitle}>{info.displayLabel}</Text>
                <Text style={styles.railMeta}>{formatTimeRange(period.start_time, period.end_time)}</Text>
                {info.name && info.name !== info.displayLabel ? (
                  <Text style={styles.railMeta}>{info.name}</Text>
                ) : null}
              </View>
              <Text style={styles.railCount}>{periodSlots.length}</Text>
            </View>
            {periodSlots.length === 0 ? (
              <View style={styles.emptyPeriod}>
                <Ionicons name="remove-circle-outline" size={16} color={c.muted} />
                <Text style={styles.emptyPeriodText}>No classes scheduled in this period.</Text>
              </View>
            ) : (
              <View style={styles.cardGrid}>
                {periodSlots.map((slot) => (
                  <SlotCard
                    key={slot.slot_id}
                    slot={slot}
                    periodMap={periodMap}
                    basis={basis}
                    highlightedSlotId={highlightedSlotId}
                    onSelectSlot={onSelectSlot}
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function ClassLayout({
  filteredSlots,
  visibleBreaks,
  periodMap,
  wide,
  basis,
  highlightedSlotId,
  onSelectSlot,
  styles,
  c,
}: {
  filteredSlots: SubstitutionSlot[];
  visibleBreaks: PlanningPeriod[];
  periodMap: ReturnType<typeof buildPeriodDisplayMap>;
  wide: boolean;
  basis: string;
  highlightedSlotId: string | null;
  onSelectSlot: (slot: SubstitutionSlot) => void;
  styles: ReturnType<typeof makeStyles>;
  c: ReturnType<typeof planningColors>;
}) {
  const groups = new Map<string, SubstitutionSlot[]>();
  for (const slot of filteredSlots) {
    const key = slot.class_section_id || `${slot.class_name}-${slot.section_name}`;
    const list = groups.get(key) || [];
    list.push(slot);
    groups.set(key, list);
  }
  const ordered = [...groups.entries()].sort((a, b) => classSort(a[1][0], b[1][0]));
  const breakEntries = visibleBreaks.map((period) => ({ sortOrder: period.sort_order, period }));

  return (
    <View style={styles.sections}>
      {visibleBreaks.length > 0 && ordered.length === 0
        ? visibleBreaks.map((period) => {
          const info = getSlotDisplayInfo(period, periodMap);
          return (
            <BreakRow
              key={period.id || `break-${period.sort_order}`}
              label={info.displayLabel}
              time={formatTimeRange(period.start_time, period.end_time)}
              styles={styles}
              c={c}
            />
          );
        })
        : null}
      {ordered.map(([key, groupSlots]) => {
        const sample = groupSlots[0];
        const timeline = interleaveClassBreaks(groupSlots, breakEntries);
        return (
          <View key={key} style={wide ? styles.railRow : styles.stackSection}>
            <View style={wide ? styles.rail : styles.stackHeader}>
              <View style={styles.railIcon}>
                <Ionicons name="school-outline" size={16} color={c.indigo} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.railTitle}>Class {sample.class_name}</Text>
                <Text style={styles.railMeta}>Section {sample.section_name}</Text>
              </View>
              <Text style={styles.railCount}>{groupSlots.length}</Text>
            </View>
            <View style={styles.cardGrid}>
              {timeline.map((item) => {
                if (item.kind === 'break') {
                  const info = getSlotDisplayInfo(item.period, periodMap);
                  return (
                    <View key={`break-${item.period.sort_order}`} style={styles.breakSlot}>
                      <BreakRow
                        label={info.displayLabel}
                        time={formatTimeRange(item.period.start_time, item.period.end_time)}
                        styles={styles}
                        c={c}
                      />
                    </View>
                  );
                }
                return (
                  <SlotCard
                    key={item.slot.slot_id}
                    slot={item.slot}
                    periodMap={periodMap}
                    basis={basis}
                    highlightedSlotId={highlightedSlotId}
                    onSelectSlot={onSelectSlot}
                  />
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SlotCard({
  slot,
  periodMap,
  basis,
  highlightedSlotId,
  onSelectSlot,
}: {
  slot: SubstitutionSlot;
  periodMap: ReturnType<typeof buildPeriodDisplayMap>;
  basis: string;
  highlightedSlotId: string | null;
  onSelectSlot: (slot: SubstitutionSlot) => void;
}) {
  const info = getSlotDisplayInfo(slot, periodMap);
  return (
    <PlanningSlotCard
      slot={slot}
      periodLabel={info.displayLabel}
      timeLabel={formatTimeRange(slot.start_time, slot.end_time)}
      status={planningSlotStatus(slot)}
      disabledReason={isEligibleManualPickerSlot(slot) ? null : planningDisabledReason(slot)}
      highlighted={highlightedSlotId === slot.slot_id}
      basis={basis}
      onSelect={onSelectSlot}
    />
  );
}

function BreakRow({
  label,
  time,
  styles,
  c,
}: {
  label: string;
  time: string;
  styles: ReturnType<typeof makeStyles>;
  c: ReturnType<typeof planningColors>;
}) {
  return (
    <View
      style={styles.breakRow}
      accessibilityRole="text"
      accessibilityLabel={`${label}${time ? `, ${time}` : ''}. Non-teaching period. Unavailable for manual cover.`}
    >
      <View style={styles.breakIcon}>
        <Ionicons name="cafe-outline" size={18} color={c.slate} />
      </View>
      <View style={styles.breakCopy}>
        <Text style={styles.breakKicker}>NON-TEACHING</Text>
        <Text style={styles.breakTitle}>{label}</Text>
        {time ? <Text style={styles.breakTime}>{time}</Text> : null}
      </View>
      <View style={styles.breakBadge}>
        <Ionicons name="remove-circle-outline" size={14} color={c.slate} />
        <Text style={styles.breakBadgeText}>Unavailable</Text>
      </View>
      <Text style={styles.breakNote}>
        Breaks and other non-teaching periods cannot take a substitute. Teaching numbers continue after this row.
      </Text>
    </View>
  );
}

function classSort(a: SubstitutionSlot, b: SubstitutionSlot) {
  const classCompare = String(a.class_name || '').localeCompare(String(b.class_name || ''), undefined, { numeric: true });
  if (classCompare !== 0) return classCompare;
  return String(a.section_name || '').localeCompare(String(b.section_name || ''), undefined, { numeric: true });
}

function makeStyles(c: ReturnType<typeof planningColors>) {
  return StyleSheet.create({
    board: { gap: 16, marginTop: 4 },
    header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' },
    headerCopy: { flex: 1, minWidth: 240, gap: 4 },
    eyebrow: { color: c.indigo, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
    title: { color: c.text, fontSize: Platform.OS === 'web' ? 28 : 24, fontWeight: '800', letterSpacing: -0.6 },
    subtitle: { color: c.subtext, fontSize: 14, lineHeight: 21, maxWidth: 720, marginTop: 4 },
    refreshing: { color: c.indigo, fontSize: 12, fontWeight: '700', marginTop: 6 },
    backButton: {
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.indigo,
      backgroundColor: c.card,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    backText: { color: c.indigo, fontSize: 13, fontWeight: '800' },
    focused: Platform.OS === 'web'
      ? ({ outlineStyle: 'solid', outlineWidth: 2, outlineColor: c.focus, outlineOffset: 2 } as object)
      : { borderColor: c.focus },
    infoNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 12,
      borderRadius: 14,
      backgroundColor: c.indigoSoft,
    },
    infoText: { color: c.subtext, fontSize: 13, lineHeight: 18, flex: 1 },
    successNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 14,
      borderRadius: 16,
      backgroundColor: c.tealSoft,
      borderWidth: 1,
      borderColor: c.teal,
    },
    successTitle: { color: c.teal, fontSize: 14, fontWeight: '800' },
    successDetail: { color: c.subtext, fontSize: 13, lineHeight: 18, marginTop: 2 },
    dismiss: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    errorNote: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderRadius: 14,
      backgroundColor: c.dangerSoft,
    },
    errorNoteText: { color: c.danger, fontSize: 13, fontWeight: '700', flex: 1 },
    retryInline: { minHeight: 36, paddingHorizontal: 12, justifyContent: 'center' },
    retryInlineText: { color: c.danger, fontSize: 13, fontWeight: '800' },
    stateCard: {
      minHeight: 240,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 28,
      borderRadius: 20,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    stateIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    stateTitle: { color: c.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
    stateText: { color: c.subtext, fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 460 },
    retryButton: {
      marginTop: 8,
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: c.indigo,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    secondaryButton: {
      marginTop: 8,
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.indigo,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: { color: c.indigo, fontSize: 13, fontWeight: '800' },
    sections: { gap: 18 },
    railRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
    rail: { width: 180, minHeight: 72, gap: 6 },
    stackSection: { gap: 12 },
    stackHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    railIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: c.indigoSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    railTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
    railMeta: { color: c.muted, fontSize: 12, fontWeight: '600', marginTop: 2 },
    railCount: {
      minWidth: 28,
      height: 28,
      borderRadius: 9,
      textAlign: 'center',
      lineHeight: 28,
      overflow: 'hidden',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      color: c.indigo,
      fontSize: 12,
      fontWeight: '800',
    },
    cardGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12, minWidth: 0 },
    emptyPeriod: {
      flex: 1,
      minHeight: 64,
      borderRadius: 16,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
      backgroundColor: c.cardAlt,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    emptyPeriodText: { color: c.muted, fontSize: 13, fontWeight: '600' },
    breakRow: {
      width: '100%',
      borderRadius: 16,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
      backgroundColor: c.slateSoft,
      padding: 14,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 12,
    },
    breakIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    breakCopy: { minWidth: 140, flexGrow: 1 },
    breakKicker: { color: c.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
    breakTitle: { color: c.text, fontSize: 16, fontWeight: '800', marginTop: 2 },
    breakTime: { color: c.subtext, fontSize: 12, fontWeight: '600', marginTop: 2 },
    breakBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: c.card,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    breakBadgeText: { color: c.slate, fontSize: 12, fontWeight: '800' },
    breakNote: { color: c.subtext, fontSize: 12, lineHeight: 17, flexBasis: '100%' },
    breakSlot: { width: '100%' },
  });
}
