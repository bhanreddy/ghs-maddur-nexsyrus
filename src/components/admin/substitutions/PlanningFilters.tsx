import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppTextInput from '../../AppTextInput';
import { useTheme } from '../../../hooks/useTheme';
import {
  PlanningFilterState,
  PlanningSlotStatus,
  PlanningViewMode,
  countActivePlanningFilters,
} from '../../../utils/manualPlanningSlots';
import { planningColors, statusVisual } from './planningTheme';

export interface FilterChoice {
  value: string;
  label: string;
}

const STATUS_OPTIONS: Array<PlanningSlotStatus | 'all'> = [
  'all',
  'scheduled',
  'needs_cover',
  'covered',
  'unavailable',
];

export default function PlanningFilters({
  filters,
  onChange,
  onClear,
  classOptions,
  sectionOptions,
  periodOptions,
  teacherOptions,
  subjectOptions,
  resultLabel,
  view,
  onViewChange,
}: {
  filters: PlanningFilterState;
  onChange: (patch: Partial<PlanningFilterState>) => void;
  onClear: () => void;
  classOptions: FilterChoice[];
  sectionOptions: FilterChoice[];
  periodOptions: FilterChoice[];
  teacherOptions: FilterChoice[];
  subjectOptions: FilterChoice[];
  resultLabel: string;
  view: PlanningViewMode;
  onViewChange: (view: PlanningViewMode) => void;
}) {
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const c = useMemo(() => planningColors(isDark), [isDark]);
  const styles = useMemo(() => makeStyles(c), [c]);
  const [menu, setMenu] = useState<{ title: string; options: FilterChoice[]; selected: string; apply: (value: string) => void } | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const activeCount = countActivePlanningFilters(filters);
  const sectionDisabled = !filters.className;

  const dropdownActiveCount = useMemo(() => {
    let count = 0;
    if (filters.className) count += 1;
    if (filters.sectionName) count += 1;
    if (filters.periodSortOrder != null) count += 1;
    if (filters.teacherId) count += 1;
    if (filters.subject) count += 1;
    return count;
  }, [filters.className, filters.sectionName, filters.periodSortOrder, filters.teacherId, filters.subject]);

  const chips = activeChips(filters, { classOptions, periodOptions, teacherOptions, subjectOptions }, onChange);

  const openMenu = (
    title: string,
    options: FilterChoice[],
    selected: string,
    apply: (value: string) => void,
  ) => setMenu({ title, options, selected, apply });

  return (
    <View
      style={[
        styles.bar,
        isMobile && styles.barMobile,
        Platform.OS === 'web' && !isMobile ? styles.sticky : null,
      ]}
      accessibilityLabel="Timetable filters"
    >
      {isMobile ? (
        /* Mobile Layout: Compact, fast, non-blocking */
        <View style={styles.mobileWrap}>
          {/* Top row: Search bar + Filter toggle button */}
          <View style={styles.mobileTopRow}>
            <View style={styles.mobileSearchWrap}>
              <Ionicons name="search-outline" size={17} color={c.muted} />
              <AppTextInput
                value={filters.query}
                onChangeText={(query) => onChange({ query })}
                placeholder="Search class, subject, teacher..."
                placeholderTextColor={c.muted}
                style={styles.searchInput}
                accessibilityLabel="Search the timetable"
                returnKeyType="search"
              />
              {filters.query ? (
                <Pressable
                  onPress={() => onChange({ query: '' })}
                  style={styles.iconButton}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Ionicons name="close" size={15} color={c.muted} />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              onPress={() => setMobileExpanded((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel={`Filter options${dropdownActiveCount > 0 ? `, ${dropdownActiveCount} active` : ''}`}
              style={[
                styles.mobileFilterToggle,
                (mobileExpanded || dropdownActiveCount > 0) && styles.mobileFilterToggleActive,
              ]}
            >
              <Ionicons
                name={mobileExpanded ? 'chevron-up' : 'options-outline'}
                size={16}
                color={mobileExpanded || dropdownActiveCount > 0 ? '#FFFFFF' : c.text}
              />
              <Text
                style={[
                  styles.mobileFilterToggleText,
                  (mobileExpanded || dropdownActiveCount > 0) && { color: '#FFFFFF' },
                ]}
              >
                Filters
              </Text>
              {dropdownActiveCount > 0 && !mobileExpanded ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{dropdownActiveCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          {/* Quick horizontal scrollable status chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statusRowScroll}
          >
            {STATUS_OPTIONS.map((status) => {
              const active = filters.status === status;
              const visual = status === 'all' ? null : statusVisual(status, c);
              return (
                <Pressable
                  key={status}
                  onPress={() => onChange({ status })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={status === 'all' ? 'All statuses' : visual?.label}
                  style={[
                    styles.statusChipMobile,
                    active && {
                      backgroundColor: status === 'all' ? c.indigoSoft : visual?.soft,
                      borderColor: status === 'all' ? c.indigo : visual?.color,
                    },
                  ]}
                >
                  <Ionicons
                    name={status === 'all' ? 'layers-outline' : visual!.icon}
                    size={13}
                    color={active ? (status === 'all' ? c.indigo : visual!.color) : c.muted}
                  />
                  <Text
                    style={[
                      styles.statusTextMobile,
                      { color: active ? (status === 'all' ? c.indigo : visual!.color) : c.text },
                    ]}
                  >
                    {status === 'all' ? 'All' : visual!.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Collapsible detailed dropdown filters panel on mobile */}
          {mobileExpanded ? (
            <View style={styles.mobileDropdownDrawer}>
              <View style={styles.mobileDrawerHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="funnel-outline" size={15} color={c.indigo} />
                  <Text style={styles.mobileDrawerTitle}>Detailed Filters</Text>
                </View>
                {dropdownActiveCount > 0 ? (
                  <Pressable
                    onPress={() =>
                      onChange({
                        className: '',
                        sectionName: '',
                        periodSortOrder: null,
                        teacherId: '',
                        subject: '',
                      })
                    }
                  >
                    <Text style={styles.mobileResetText}>Reset fields</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.fieldGrid}>
                <FilterField
                  label="Class"
                  value={labelFor(classOptions, filters.className)}
                  placeholder="All classes"
                  onPress={() => openMenu('Class', classOptions, filters.className, (className) => onChange({ className }))}
                  styles={styles}
                  c={c}
                />
                <FilterField
                  label="Section"
                  value={labelFor(sectionOptions, filters.sectionName)}
                  placeholder={sectionDisabled ? 'Select a class first' : 'All sections'}
                  disabled={sectionDisabled}
                  onPress={() => openMenu('Section', sectionOptions, filters.sectionName, (sectionName) => onChange({ sectionName }))}
                  styles={styles}
                  c={c}
                />
                <FilterField
                  label="Period"
                  value={labelFor(periodOptions, filters.periodSortOrder == null ? '' : String(filters.periodSortOrder))}
                  placeholder="All periods"
                  onPress={() => openMenu(
                    'Period',
                    periodOptions,
                    filters.periodSortOrder == null ? '' : String(filters.periodSortOrder),
                    (value) => onChange({ periodSortOrder: value ? Number(value) : null }),
                  )}
                  styles={styles}
                  c={c}
                />
                <FilterField
                  label="Regular teacher"
                  value={labelFor(teacherOptions, filters.teacherId)}
                  placeholder="All teachers"
                  onPress={() => openMenu('Regular teacher', teacherOptions, filters.teacherId, (teacherId) => onChange({ teacherId }))}
                  styles={styles}
                  c={c}
                />
                <FilterField
                  label="Subject"
                  value={labelFor(subjectOptions, filters.subject)}
                  placeholder="All subjects"
                  onPress={() => openMenu('Subject', subjectOptions, filters.subject, (subject) => onChange({ subject }))}
                  styles={styles}
                  c={c}
                />
              </View>

              <Pressable
                onPress={() => setMobileExpanded(false)}
                style={styles.mobileApplyBtn}
                accessibilityRole="button"
                accessibilityLabel="Apply filters and close panel"
              >
                <Text style={styles.mobileApplyBtnText}>Apply & Close</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Active filter chips */}
          {chips.length > 0 ? (
            <View style={styles.chipRow} accessibilityLabel="Active filters">
              {chips.map((chip) => (
                <Pressable
                  key={chip.key}
                  onPress={chip.onClear}
                  style={styles.activeChip}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${chip.label} filter`}
                >
                  <Text style={styles.activeChipText}>{chip.label}</Text>
                  <Ionicons name="close" size={13} color={c.indigo} />
                </Pressable>
              ))}
              {activeCount > 1 ? (
                <Pressable
                  onPress={onClear}
                  style={styles.clearAllChip}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all filters"
                >
                  <Text style={styles.clearAllChipText}>Clear all</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Mobile Toolbar: View segment + Result count */}
          <View style={styles.mobileToolbar}>
            <View style={styles.segmentMobile} accessibilityLabel="Timetable layout">
              <Segment
                active={view === 'period'}
                icon="time-outline"
                label="Period view"
                onPress={() => onViewChange('period')}
                styles={styles}
                c={c}
              />
              <Segment
                active={view === 'class'}
                icon="school-outline"
                label="Class view"
                onPress={() => onViewChange('class')}
                styles={styles}
                c={c}
              />
            </View>
            <Text style={styles.resultCountMobile} accessibilityLiveRegion="polite">{resultLabel}</Text>
          </View>
        </View>
      ) : (
        /* Desktop Layout */
        <>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={c.muted} />
            <AppTextInput
              value={filters.query}
              onChangeText={(query) => onChange({ query })}
              placeholder="Search class, section, subject, teacher, or period"
              placeholderTextColor={c.muted}
              style={styles.searchInput}
              accessibilityLabel="Search the timetable"
              returnKeyType="search"
            />
            {filters.query ? (
              <Pressable
                onPress={() => onChange({ query: '' })}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close" size={16} color={c.muted} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.fieldGrid}>
            <FilterField
              label="Class"
              value={labelFor(classOptions, filters.className)}
              placeholder="All classes"
              onPress={() => openMenu('Class', classOptions, filters.className, (className) => onChange({ className }))}
              styles={styles}
              c={c}
            />
            <FilterField
              label="Section"
              value={labelFor(sectionOptions, filters.sectionName)}
              placeholder={sectionDisabled ? 'Select a class first' : 'All sections'}
              disabled={sectionDisabled}
              onPress={() => openMenu('Section', sectionOptions, filters.sectionName, (sectionName) => onChange({ sectionName }))}
              styles={styles}
              c={c}
            />
            <FilterField
              label="Period"
              value={labelFor(periodOptions, filters.periodSortOrder == null ? '' : String(filters.periodSortOrder))}
              placeholder="All periods"
              onPress={() => openMenu(
                'Period',
                periodOptions,
                filters.periodSortOrder == null ? '' : String(filters.periodSortOrder),
                (value) => onChange({ periodSortOrder: value ? Number(value) : null }),
              )}
              styles={styles}
              c={c}
            />
            <FilterField
              label="Regular teacher"
              value={labelFor(teacherOptions, filters.teacherId)}
              placeholder="All teachers"
              onPress={() => openMenu('Regular teacher', teacherOptions, filters.teacherId, (teacherId) => onChange({ teacherId }))}
              styles={styles}
              c={c}
            />
            <FilterField
              label="Subject"
              value={labelFor(subjectOptions, filters.subject)}
              placeholder="All subjects"
              onPress={() => openMenu('Subject', subjectOptions, filters.subject, (subject) => onChange({ subject }))}
              styles={styles}
              c={c}
            />
          </View>

          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((status) => {
              const active = filters.status === status;
              const visual = status === 'all' ? null : statusVisual(status, c);
              return (
                <Pressable
                  key={status}
                  onPress={() => onChange({ status })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={status === 'all' ? 'All statuses' : visual?.label}
                  style={(state) => [
                    styles.statusChip,
                    active && { backgroundColor: status === 'all' ? c.indigoSoft : visual?.soft, borderColor: status === 'all' ? c.indigo : visual?.color },
                    Boolean((state as { focused?: boolean }).focused) && styles.focused,
                  ]}
                >
                  <Ionicons
                    name={status === 'all' ? 'layers-outline' : visual!.icon}
                    size={14}
                    color={active ? (status === 'all' ? c.indigo : visual!.color) : c.muted}
                  />
                  <Text style={[styles.statusText, { color: active ? (status === 'all' ? c.indigo : visual!.color) : c.text }]}>
                    {status === 'all' ? 'All' : visual!.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {chips.length > 0 ? (
            <View style={styles.chipRow} accessibilityLabel="Active filters">
              {chips.map((chip) => (
                <Pressable
                  key={chip.key}
                  onPress={chip.onClear}
                  style={styles.activeChip}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${chip.label} filter`}
                >
                  <Text style={styles.activeChipText}>{chip.label}</Text>
                  <Ionicons name="close" size={13} color={c.indigo} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.toolbar}>
            <View style={styles.segment} accessibilityLabel="Timetable layout">
              <Segment
                active={view === 'period'}
                icon="time-outline"
                label="Period view"
                onPress={() => onViewChange('period')}
                styles={styles}
                c={c}
              />
              <Segment
                active={view === 'class'}
                icon="school-outline"
                label="Class view"
                onPress={() => onViewChange('class')}
                styles={styles}
                c={c}
              />
            </View>
            <Text style={styles.resultCount} accessibilityLiveRegion="polite">{resultLabel}</Text>
            <Pressable
              onPress={onClear}
              disabled={activeCount === 0}
              accessibilityRole="button"
              accessibilityState={{ disabled: activeCount === 0 }}
              accessibilityLabel="Clear filters"
              style={(state) => [
                styles.clearButton,
                activeCount === 0 && styles.clearDisabled,
                Boolean((state as { focused?: boolean }).focused) && styles.focused,
              ]}
            >
              <Ionicons name="close-circle-outline" size={16} color={activeCount === 0 ? c.muted : c.indigo} />
              <Text style={[styles.clearText, activeCount === 0 && { color: c.muted }]}>Clear filters</Text>
            </Pressable>
          </View>
        </>
      )}

      <FilterMenu
        menu={menu}
        onClose={() => setMenu(null)}
        styles={styles}
        c={c}
      />
    </View>
  );
}

function FilterField({
  label,
  value,
  placeholder,
  disabled,
  onPress,
  styles,
  c,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  c: ReturnType<typeof planningColors>;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={disabled ? `${label} filter. Select a class first` : `${label} filter, ${value || placeholder}`}
        accessibilityState={{ disabled: Boolean(disabled) }}
        style={(state) => [
          styles.fieldButton,
          disabled && styles.fieldDisabled,
          Boolean((state as { focused?: boolean }).focused) && styles.focused,
        ]}
      >
        <Text numberOfLines={1} style={[styles.fieldValue, !value && { color: c.muted }]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={c.muted} />
      </Pressable>
    </View>
  );
}

function Segment({
  active,
  icon,
  label,
  onPress,
  styles,
  c,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  c: ReturnType<typeof planningColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={(state) => [
        styles.segmentButton,
        active && { backgroundColor: c.indigo },
        Boolean((state as { focused?: boolean }).focused) && styles.focused,
      ]}
    >
      <Ionicons name={icon} size={15} color={active ? '#FFFFFF' : c.muted} />
      <Text style={[styles.segmentText, { color: active ? '#FFFFFF' : c.text }]}>{label}</Text>
    </Pressable>
  );
}

function FilterMenu({
  menu,
  onClose,
  styles,
  c,
}: {
  menu: { title: string; options: FilterChoice[]; selected: string; apply: (value: string) => void } | null;
  onClose: () => void;
  styles: ReturnType<typeof makeStyles>;
  c: ReturnType<typeof planningColors>;
}) {
  if (!menu) return null;
  const options = [{ value: '', label: 'Show all' }, ...menu.options];
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Close filter menu" />
      <View style={styles.menu}>
        <View style={styles.menuHeader}>
          <Text style={styles.menuTitle}>{menu.title}</Text>
          <Pressable onPress={onClose} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={18} color={c.text} />
          </Pressable>
        </View>
        <ScrollView style={styles.menuList} keyboardShouldPersistTaps="handled">
          {options.length === 1 ? (
            <Text style={styles.menuEmpty}>Nothing to choose yet.</Text>
          ) : options.map((option) => {
            const selected = option.value === menu.selected;
            return (
              <Pressable
                key={option.value || 'all'}
                onPress={() => {
                  menu.apply(option.value);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={(state) => [
                  styles.menuOption,
                  selected && { backgroundColor: c.indigoSoft },
                  Boolean((state as { focused?: boolean }).focused) && styles.focused,
                ]}
              >
                <Text style={[styles.menuOptionText, selected && { color: c.indigo }]}>{option.label}</Text>
                {selected ? <Ionicons name="checkmark" size={18} color={c.indigo} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

function labelFor(options: FilterChoice[], value: string) {
  if (!value) return '';
  return options.find((option) => option.value === value)?.label || value;
}

function activeChips(
  filters: PlanningFilterState,
  lists: {
    classOptions: FilterChoice[];
    periodOptions: FilterChoice[];
    teacherOptions: FilterChoice[];
    subjectOptions: FilterChoice[];
  },
  onChange: (patch: Partial<PlanningFilterState>) => void,
) {
  const chips: { key: string; label: string; onClear: () => void }[] = [];
  if (filters.query.trim()) {
    chips.push({ key: 'query', label: `Search “${filters.query.trim()}”`, onClear: () => onChange({ query: '' }) });
  }
  if (filters.className) {
    chips.push({
      key: 'class',
      label: `Class ${labelFor(lists.classOptions, filters.className) || filters.className}`,
      onClear: () => onChange({ className: '', sectionName: '' }),
    });
  }
  if (filters.sectionName) chips.push({ key: 'section', label: `Section ${filters.sectionName}`, onClear: () => onChange({ sectionName: '' }) });
  if (filters.periodSortOrder != null) {
    chips.push({
      key: 'period',
      label: labelFor(lists.periodOptions, String(filters.periodSortOrder)) || 'Period',
      onClear: () => onChange({ periodSortOrder: null }),
    });
  }
  if (filters.teacherId) chips.push({ key: 'teacher', label: labelFor(lists.teacherOptions, filters.teacherId) || 'Teacher', onClear: () => onChange({ teacherId: '' }) });
  if (filters.subject) chips.push({ key: 'subject', label: labelFor(lists.subjectOptions, filters.subject) || filters.subject, onClear: () => onChange({ subject: '' }) });
  if (filters.status !== 'all') {
    const names: Record<PlanningSlotStatus, string> = {
      scheduled: 'Scheduled',
      needs_cover: 'Needs cover',
      covered: 'Covered',
      unavailable: 'Unavailable',
    };
    chips.push({ key: 'status', label: names[filters.status], onClear: () => onChange({ status: 'all' }) });
  }
  return chips;
}

function makeStyles(c: ReturnType<typeof planningColors>) {
  return StyleSheet.create({
    bar: {
      backgroundColor: c.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      gap: 12,
      shadowColor: c.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    barMobile: {
      padding: 12,
      borderRadius: 16,
      gap: 10,
    },
    sticky: { position: 'sticky', top: 0, zIndex: 20 },
    mobileWrap: {
      gap: 10,
    },
    mobileTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    mobileSearchWrap: {
      flex: 1,
      minHeight: 44,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 12,
      backgroundColor: c.cardAlt,
      borderWidth: 1,
      borderColor: c.border,
    },
    mobileFilterToggle: {
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.cardAlt,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    mobileFilterToggleActive: {
      backgroundColor: c.indigo,
      borderColor: c.indigo,
    },
    mobileFilterToggleText: {
      color: c.text,
      fontSize: 13,
      fontWeight: '800',
    },
    filterBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: c.indigo,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    filterBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '900',
    },
    statusRowScroll: {
      gap: 6,
      paddingVertical: 2,
    },
    statusChipMobile: {
      minHeight: 34,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.cardAlt,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    statusTextMobile: {
      fontSize: 11,
      fontWeight: '800',
    },
    mobileDropdownDrawer: {
      marginTop: 2,
      padding: 12,
      borderRadius: 14,
      backgroundColor: c.cardAlt,
      borderWidth: 1,
      borderColor: c.border,
      gap: 10,
    },
    mobileDrawerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    mobileDrawerTitle: {
      color: c.text,
      fontSize: 13,
      fontWeight: '800',
    },
    mobileResetText: {
      color: c.indigo,
      fontSize: 12,
      fontWeight: '800',
    },
    mobileApplyBtn: {
      minHeight: 40,
      borderRadius: 10,
      backgroundColor: c.indigo,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    mobileApplyBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '800',
    },
    clearAllChip: {
      minHeight: 34,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearAllChipText: {
      color: c.muted,
      fontSize: 11,
      fontWeight: '800',
    },
    mobileToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 2,
    },
    segmentMobile: {
      flexDirection: 'row',
      padding: 3,
      backgroundColor: c.cardAlt,
      borderRadius: 11,
      flex: 1,
      maxWidth: 240,
    },
    resultCountMobile: {
      color: c.subtext,
      fontSize: 12,
      fontWeight: '700',
    },
    searchWrap: {
      minHeight: 48,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 14,
      backgroundColor: c.cardAlt,
      borderWidth: 1,
      borderColor: c.border,
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: 14,
      borderWidth: 0,
      paddingHorizontal: 0,
      backgroundColor: 'transparent',
      minHeight: 44,
    },
    iconButton: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    field: { flexGrow: 1, flexBasis: 160, minWidth: 148 },
    fieldLabel: { color: c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' },
    fieldButton: {
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.cardAlt,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    fieldDisabled: { opacity: 0.72 },
    fieldValue: { color: c.text, fontSize: 13, fontWeight: '700', flex: 1 },
    statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statusChip: {
      minHeight: 40,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.cardAlt,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statusText: { fontSize: 12, fontWeight: '800' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    activeChip: {
      minHeight: 34,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: c.indigoSoft,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    activeChipText: { color: c.indigo, fontSize: 12, fontWeight: '800' },
    toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
    segment: { flexDirection: 'row', padding: 4, backgroundColor: c.cardAlt, borderRadius: 14, flexGrow: 1, minWidth: 240 },
    segmentButton: {
      flex: 1,
      minHeight: 40,
      borderRadius: 11,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 10,
    },
    segmentText: { fontSize: 12, fontWeight: '800' },
    resultCount: { color: c.subtext, fontSize: 13, fontWeight: '700', flexGrow: 1 },
    clearButton: {
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.card,
    },
    clearDisabled: { opacity: 0.55 },
    clearText: { color: c.indigo, fontSize: 13, fontWeight: '800' },
    focused: Platform.OS === 'web'
      ? ({ outlineStyle: 'solid', outlineWidth: 2, outlineColor: c.focus, outlineOffset: 2 } as object)
      : { borderColor: c.focus },
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,23,0.45)' },
    menu: {
      position: 'absolute',
      top: '12%',
      alignSelf: 'center',
      width: '92%',
      maxWidth: 440,
      maxHeight: '70%',
      backgroundColor: c.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
    },
    menuHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    menuTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
    menuList: { flexGrow: 0 },
    menuOption: {
      minHeight: 46,
      borderRadius: 12,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    menuOptionText: { color: c.text, fontSize: 14, fontWeight: '700', flex: 1 },
    menuEmpty: { color: c.muted, fontSize: 13, padding: 12 },
  });
}
