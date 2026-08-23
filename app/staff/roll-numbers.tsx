import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import StaffHeader from '../../src/components/StaffHeader';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { useTheme } from '../../src/hooks/useTheme';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import {
  RollNumberRoster,
  RollNumberService,
  RollNumberStudent,
} from '../../src/services/rollNumberService';

const PRIMARY = '#4F46E5';
const SUCCESS = '#059669';
const DANGER = '#DC2626';

type RollInputs = Record<string, string>;

function initials(name: string) {
  return String(name || 'Student')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function valuesFromRoster(roster: RollNumberRoster): RollInputs {
  return Object.fromEntries(
    roster.students.map((student, index) => [
      student.enrollment_id,
      String(student.roll_number ?? roster.class_section.roll_number_start + index),
    ]),
  );
}

function validateInputs(students: RollNumberStudent[], values: RollInputs): string | null {
  if (students.length === 0) return 'This class has no active students.';
  const numbers = students.map((student) => Number(values[student.enrollment_id]));
  if (numbers.some((number) => !Number.isSafeInteger(number) || number < 1 || number > 9999)) {
    return 'Enter a whole number from 1 to 9999 for every student.';
  }
  if (new Set(numbers).size !== numbers.length) {
    return 'Two students cannot have the same roll number.';
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  if (sorted.some((number, index) => number !== sorted[0] + index)) {
    return 'Roll numbers must be continuous without gaps. Valid examples: 1, 2, 3 or 21, 22, 23.';
  }
  return null;
}

export default function RollNumbersScreen() {
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const { isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
  const [roster, setRoster] = useState<RollNumberRoster | null>(null);
  const [values, setValues] = useState<RollInputs>({});
  const [startAt, setStartAt] = useState('1');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const palette = useMemo(() => ({
    page: isDark ? '#0B1120' : '#F5F7FB',
    card: isDark ? '#172033' : '#FFFFFF',
    inset: isDark ? '#111827' : '#F8FAFC',
    text: isDark ? '#F8FAFC' : '#111827',
    muted: isDark ? '#94A3B8' : '#64748B',
    border: isDark ? '#29344A' : '#E2E8F0',
  }), [isDark]);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const data = await RollNumberService.getRoster();
      setRoster(data);
      setValues(valuesFromRoster(data));
      setStartAt(String(data.students[0]?.roll_number ?? data.class_section.roll_number_start ?? 1));
    } catch (error: any) {
      setRoster(null);
      setValues({});
      setLoadError(error?.message || 'Could not load your class roster.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const validationError = useMemo(
    () => roster ? validateInputs(roster.students, values) : null,
    [roster, values],
  );

  const fillContinuous = () => {
    if (!roster) return;
    const start = Number(startAt);
    if (!Number.isSafeInteger(start) || start < 1 || start + roster.students.length - 1 > 9999) {
      alertCompat('Invalid starting number', 'Use a whole number that keeps the complete class range between 1 and 9999.');
      return;
    }
    setValues(Object.fromEntries(
      roster.students.map((student, index) => [student.enrollment_id, String(start + index)]),
    ));
  };

  const save = async () => {
    if (!roster) return;
    const error = validateInputs(roster.students, values);
    if (error) {
      alertCompat('Fix roll numbers', error);
      return;
    }
    setSaving(true);
    try {
      const saved = await RollNumberService.save(
        roster.students.map((student) => ({
          enrollment_id: student.enrollment_id,
          roll_number: Number(values[student.enrollment_id]),
        })),
      );
      setRoster(saved);
      setValues(valuesFromRoster(saved));
      alertCompat('Roll numbers saved', saved.message || 'Every student now has the new roll number.');
    } catch (error: any) {
      alertCompat('Could not save roll numbers', error?.message || 'Please check the sequence and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.page, { backgroundColor: palette.page }]}>
      <StaffHeader title="Roll Numbers" subtitle="Set your class order" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingHorizontal: compact ? 16 : 28 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={PRIMARY} />}
      >
        {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}

        {loading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator color={PRIMARY} />
            <Text style={[styles.stateText, { color: palette.muted }]}>Loading class roster…</Text>
          </View>
        ) : loadError ? (
          <View style={[styles.emptyCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Ionicons name="school-outline" size={34} color={palette.muted} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>No class roster available</Text>
            <Text style={[styles.emptyText, { color: palette.muted }]}>{loadError}</Text>
            <Pressable onPress={() => void load()} style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : roster ? (
          <>
            <View style={[styles.hero, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <View style={styles.heroIcon}><Ionicons name="list" size={24} color="#FFFFFF" /></View>
              <View style={styles.flex}>
                <Text style={[styles.heroTitle, { color: palette.text }]}>Class {roster.class_section.class_name} · Section {roster.class_section.section_name}</Text>
                <Text style={[styles.heroMeta, { color: palette.muted }]}>Academic year {roster.class_section.academic_year} · {roster.students.length} students</Text>
              </View>
              {roster.class_section.manual_roll_numbers && (
                <View style={styles.manualBadge}><Text style={styles.manualBadgeText}>CUSTOM</Text></View>
              )}
            </View>

            <View style={[styles.guide, { backgroundColor: isDark ? '#172554' : '#EEF2FF', borderColor: isDark ? '#3730A3' : '#C7D2FE' }]}>
              <Ionicons name="information-circle-outline" size={21} color={isDark ? '#A5B4FC' : PRIMARY} />
              <Text style={[styles.guideText, { color: isDark ? '#C7D2FE' : '#3730A3' }]}>Assign every student a unique, gap-free range. Valid: 1, 2, 3 or 21, 22, 23. Invalid: 1, 3, 4 or 5, 5, 6.</Text>
            </View>

            <View style={[styles.fillCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <View style={styles.flex}>
                <Text style={[styles.fillTitle, { color: palette.text }]}>Quick fill</Text>
                <Text style={[styles.fillMeta, { color: palette.muted }]}>Keep the order below and generate a continuous range.</Text>
              </View>
              <View style={styles.fillControls}>
                <View style={[styles.startBox, { borderColor: palette.border, backgroundColor: palette.inset }]}>
                  <Text style={[styles.startLabel, { color: palette.muted }]}>START</Text>
                  <TextInput
                    value={startAt}
                    onChangeText={(text) => setStartAt(text.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    maxLength={4}
                    selectTextOnFocus
                    style={[styles.startInput, { color: palette.text }]}
                    accessibilityLabel="Starting roll number"
                  />
                </View>
                <Pressable onPress={fillContinuous} style={styles.fillButton}>
                  <Ionicons name="flash-outline" size={17} color="#FFFFFF" />
                  <Text style={styles.fillButtonText}>Fill continuous</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Student roll numbers</Text>
              <Text style={[styles.sectionCount, { color: palette.muted }]}>{roster.students.length} total</Text>
            </View>

            <View style={[styles.studentList, { backgroundColor: palette.card, borderColor: palette.border }]}>
              {roster.students.map((student, index) => (
                <View
                  key={student.enrollment_id}
                  style={[styles.studentRow, index > 0 && { borderTopWidth: 1, borderTopColor: palette.border }]}
                >
                  <View style={[styles.avatar, { backgroundColor: isDark ? '#312E81' : '#E0E7FF' }]}>
                    <Text style={[styles.avatarText, { color: isDark ? '#C7D2FE' : '#4338CA' }]}>{initials(student.student_name)}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.studentName, { color: palette.text }]} numberOfLines={1}>{student.student_name}</Text>
                    <Text style={[styles.studentMeta, { color: palette.muted }]}>Admission {student.admission_no}</Text>
                  </View>
                  <View style={styles.rollFieldWrap}>
                    <Text style={[styles.rollLabel, { color: palette.muted }]}>ROLL NO.</Text>
                    <TextInput
                      value={values[student.enrollment_id] ?? ''}
                      onChangeText={(text) => setValues((current) => ({
                        ...current,
                        [student.enrollment_id]: text.replace(/[^0-9]/g, ''),
                      }))}
                      keyboardType="number-pad"
                      maxLength={4}
                      selectTextOnFocus
                      style={[
                        styles.rollInput,
                        { color: palette.text, borderColor: validationError ? `${DANGER}66` : palette.border, backgroundColor: palette.inset },
                      ]}
                      accessibilityLabel={`Roll number for ${student.student_name}`}
                    />
                  </View>
                </View>
              ))}
            </View>

            {!!validationError && (
              <View style={styles.validationRow}>
                <Ionicons name="alert-circle" size={17} color={DANGER} />
                <Text style={styles.validationText}>{validationError}</Text>
              </View>
            )}

            <Pressable
              disabled={saving || !!validationError || roster.students.length === 0}
              onPress={save}
              style={[styles.saveButton, (saving || !!validationError || roster.students.length === 0) && styles.disabled]}
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="save-outline" size={20} color="#FFFFFF" />}
              <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save new roll numbers'}</Text>
            </Pressable>
            <Text style={[styles.footnote, { color: palette.muted }]}>Saving changes the roll number everywhere it is used, including attendance, results, student profiles, and hall tickets when enabled.</Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { width: '100%', maxWidth: 980, alignSelf: 'center', paddingTop: 18, paddingBottom: 48 },
  flex: { flex: 1 },
  stateWrap: { minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateText: { fontSize: 13 },
  emptyCard: { marginTop: 28, padding: 28, borderWidth: 1, borderRadius: 20, alignItems: 'center' },
  emptyTitle: { marginTop: 12, fontSize: 17, fontWeight: '800' },
  emptyText: { marginTop: 6, maxWidth: 460, textAlign: 'center', fontSize: 13, lineHeight: 19 },
  retryButton: { marginTop: 16, backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, padding: 16, ...Platform.select({ web: { boxShadow: '0 6px 20px rgba(15,23,42,0.06)' } as any, android: { elevation: 2 } }) },
  heroIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 17, fontWeight: '800' },
  heroMeta: { marginTop: 3, fontSize: 12.5 },
  manualBadge: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  manualBadgeText: { color: SUCCESS, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.8 },
  guide: { marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 14, borderWidth: 1 },
  guideText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  fillCard: { marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 16, padding: 14 },
  fillTitle: { fontSize: 14, fontWeight: '800' },
  fillMeta: { marginTop: 3, fontSize: 11.5 },
  fillControls: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  startBox: { minWidth: 82, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 6 },
  startLabel: { fontSize: 8.5, fontWeight: '900', letterSpacing: 0.7 },
  startInput: { minWidth: 54, padding: 0, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  fillButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: PRIMARY, borderRadius: 11, paddingHorizontal: 14 },
  fillButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  sectionHeader: { marginTop: 22, marginBottom: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  sectionCount: { fontSize: 11.5, fontWeight: '700' },
  studentList: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  studentRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 10 },
  avatar: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12.5, fontWeight: '900' },
  studentName: { fontSize: 14, fontWeight: '750' as any },
  studentMeta: { marginTop: 3, fontSize: 11.5 },
  rollFieldWrap: { alignItems: 'flex-end' },
  rollLabel: { marginBottom: 3, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.7 },
  rollInput: { width: 78, height: 40, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 8, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  validationRow: { marginTop: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  validationText: { flex: 1, color: DANGER, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  saveButton: { marginTop: 18, minHeight: 50, borderRadius: 14, backgroundColor: SUCCESS, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...Platform.select({ web: { cursor: 'pointer' } as any, android: { elevation: 3 } }) },
  saveText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  footnote: { paddingHorizontal: 14, marginTop: 9, textAlign: 'center', fontSize: 11.5, lineHeight: 17 },
});
