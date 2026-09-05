import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AdminHeader from '../../src/components/AdminHeader';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import { useTheme } from '../../src/hooks/useTheme';
import type { Theme } from '../../src/theme/themes';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import {
  AccountsMarksClassSection,
  AccountsMarksExam,
  AccountsMarksResultFilter,
  AccountsMarksService,
} from '../../src/services/accountsMarksService';

const rankingLabels = {
  competition: 'Standard competition ranking',
  attendance_tiebreak: 'Marks, then attendance tie-break',
  dense: 'Consecutive ranking',
} as const;

const resultFilters: { value: AccountsMarksResultFilter; label: string }[] = [
  { value: 'all', label: 'All students' },
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail (incl. absent)' },
  { value: 'absent', label: 'Absent only' },
  { value: 'incomplete', label: 'Incomplete marks' },
];

const examTypeLabel = (type: string) => ({
  fa_results: 'Formative Assessment',
  sa_results: 'Summative Assessment',
  slip_test: 'Slip Test',
  special: 'Special Exam',
  weekend: 'Weekend Assessment',
}[type] || type.replaceAll('_', ' '));

export default function AccountsMarksExportScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const { shellActive } = useAccountsWebChrome();
  const [exams, setExams] = useState<AccountsMarksExam[]>([]);
  const [classSections, setClassSections] = useState<AccountsMarksClassSection[]>([]);
  const [selectedExam, setSelectedExam] = useState<AccountsMarksExam | null>(null);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [resultFilter, setResultFilter] = useState<AccountsMarksResultFilter>('all');
  const [rankingMethod, setRankingMethod] = useState<keyof typeof rankingLabels>('competition');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const context = await AccountsMarksService.getContext();
      setExams(context.exams);
      setClassSections(context.class_sections);
      setSelectedExam((current) => context.exams.find((exam) => exam.id === current?.id) || context.exams[0] || null);
      setRankingMethod(context.ranking_method);
    } catch (requestError: any) {
      setError(requestError?.message || 'Could not load the school exam list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const examSections = useMemo(() => classSections.filter((section) =>
    section.academic_year_id === selectedExam?.academic_year_id
    && (selectedExam.class_ids || []).includes(section.class_id),
  ), [classSections, selectedExam]);
  const classOptions = useMemo(() => [...new Map(examSections.map((section) => [
    section.class_id,
    { id: section.class_id, name: section.class_name },
  ])).values()], [examSections]);
  const sectionOptions = useMemo(() => [...new Map(examSections
    .filter((section) => !selectedClassId || section.class_id === selectedClassId)
    .map((section) => [section.section_id, { id: section.section_id, name: section.section_name }])).values()],
  [examSections, selectedClassId]);
  const filteredSections = useMemo(() => examSections.filter((section) =>
    (!selectedClassId || section.class_id === selectedClassId)
    && (!selectedSectionId || section.section_id === selectedSectionId),
  ), [examSections, selectedClassId, selectedSectionId]);
  const filteredClassCount = useMemo(() => new Set(filteredSections.map((section) => section.class_id)).size, [filteredSections]);
  const selectedResultLabel = resultFilters.find((option) => option.value === resultFilter)?.label || 'All students';
  const hasActiveFilters = Boolean(selectedClassId || selectedSectionId || resultFilter !== 'all');

  useEffect(() => {
    if (selectedClassId && !classOptions.some((option) => option.id === selectedClassId)) {
      setSelectedClassId('');
      setSelectedSectionId('');
      return;
    }
    if (selectedSectionId && !sectionOptions.some((option) => option.id === selectedSectionId)) {
      setSelectedSectionId('');
    }
  }, [classOptions, sectionOptions, selectedClassId, selectedSectionId]);

  const chooseExam = useCallback((exam: AccountsMarksExam) => {
    setSelectedExam(exam);
    setSelectedClassId('');
    setSelectedSectionId('');
    setResultFilter('all');
  }, []);

  const download = useCallback(async () => {
    if (!selectedExam) return;
    try {
      setDownloading(true);
      await AccountsMarksService.exportSchoolMarks(selectedExam, {
        classId: selectedClassId || undefined,
        sectionId: selectedSectionId || undefined,
        resultStatus: resultFilter,
      });
    } catch (requestError: any) {
      alertCompat('Download failed', requestError?.message || 'Could not create the school marks workbook.');
    } finally {
      setDownloading(false);
    }
  }, [resultFilter, selectedClassId, selectedExam, selectedSectionId]);

  return <View style={styles.screen}>
    <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
    {!shellActive && <AdminHeader title="School Marks Export" showBackButton />}
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="school-outline" size={27} color="#FFFFFF" /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>ACCOUNTS DEPARTMENT</Text>
          <Text style={styles.title}>Download complete school marks</Text>
          <Text style={styles.subtitle}>Select an exam to create one Excel workbook containing an overview and a separate marks sheet for every class and section.</Text>
        </View>
      </View>

      {loading ? <View style={styles.stateCard}><ActivityIndicator color="#2563EB" /><Text style={styles.stateText}>Loading school exams…</Text></View> : error ? (
        <View style={styles.stateCard}>
          <Ionicons name="alert-circle-outline" size={26} color="#DC2626" />
          <Text style={[styles.stateText, { color: '#DC2626' }]}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}><Text style={styles.retryText}>Try again</Text></TouchableOpacity>
        </View>
      ) : exams.length === 0 ? <View style={styles.stateCard}><Ionicons name="document-outline" size={28} color={theme.colors.textTertiary} /><Text style={styles.stateText}>No exams with configured subjects are available.</Text></View> : <>
        {selectedExam && <View style={styles.selectedCard}>
          <View style={styles.selectedTop}>
            <View style={styles.selectedIcon}><Ionicons name="document-text-outline" size={23} color="#2563EB" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedLabel}>SELECTED EXAM</Text>
              <Text style={styles.selectedName}>{selectedExam.name}</Text>
              <Text style={styles.selectedMeta}>{examTypeLabel(selectedExam.exam_type)} · {selectedExam.academic_year}</Text>
            </View>
          </View>
          <View style={styles.scopeGrid}>
            {[
              ['Classes', filteredClassCount],
              ['Sections', filteredSections.length],
              ['Student filter', selectedResultLabel],
              ['Ranking', rankingLabels[rankingMethod]],
            ].map(([label, value]) => <View key={String(label)} style={styles.scopeItem}><Text style={styles.scopeLabel}>{label}</Text><Text style={styles.scopeValue}>{value}</Text></View>)}
          </View>
          <View style={styles.filtersCard}>
            <View style={styles.filtersHeader}>
              <View><Text style={styles.filtersTitle}>Export filters</Text><Text style={styles.filtersHint}>Filters apply to the Excel workbook.</Text></View>
              {hasActiveFilters && <TouchableOpacity onPress={() => { setSelectedClassId(''); setSelectedSectionId(''); setResultFilter('all'); }}><Text style={styles.resetText}>Reset</Text></TouchableOpacity>}
            </View>
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Class</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                <TouchableOpacity onPress={() => { setSelectedClassId(''); setSelectedSectionId(''); }} style={[styles.filterChip, !selectedClassId && styles.filterChipActive]}><Text style={[styles.filterChipText, !selectedClassId && styles.filterChipTextActive]}>All classes</Text></TouchableOpacity>
                {classOptions.map((option) => <TouchableOpacity key={option.id} onPress={() => { setSelectedClassId(option.id); setSelectedSectionId(''); }} style={[styles.filterChip, selectedClassId === option.id && styles.filterChipActive]}><Text style={[styles.filterChipText, selectedClassId === option.id && styles.filterChipTextActive]}>{option.name}</Text></TouchableOpacity>)}
              </ScrollView>
            </View>
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Section</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                <TouchableOpacity onPress={() => setSelectedSectionId('')} style={[styles.filterChip, !selectedSectionId && styles.filterChipActive]}><Text style={[styles.filterChipText, !selectedSectionId && styles.filterChipTextActive]}>All sections</Text></TouchableOpacity>
                {sectionOptions.map((option) => <TouchableOpacity key={option.id} onPress={() => setSelectedSectionId(option.id)} style={[styles.filterChip, selectedSectionId === option.id && styles.filterChipActive]}><Text style={[styles.filterChipText, selectedSectionId === option.id && styles.filterChipTextActive]}>{option.name}</Text></TouchableOpacity>)}
              </ScrollView>
            </View>
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Result status</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {resultFilters.map((option) => <TouchableOpacity key={option.value} onPress={() => setResultFilter(option.value)} style={[styles.filterChip, resultFilter === option.value && styles.resultChipActive]}><Text style={[styles.filterChipText, resultFilter === option.value && styles.filterChipTextActive]}>{option.label}</Text></TouchableOpacity>)}
              </ScrollView>
            </View>
          </View>
          <View style={styles.infoBanner}><Ionicons name="information-circle-outline" size={18} color="#1D4ED8" /><Text style={styles.infoText}>The workbook includes matching active students with direct and component marks, grades, totals, percentages, original class ranks, absences, and incomplete-entry status.</Text></View>
          <TouchableOpacity disabled={downloading} style={[styles.downloadButton, downloading && styles.disabled]} onPress={download}>
            {downloading ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="download-outline" size={20} color="#FFFFFF" />}
            <Text style={styles.downloadText}>{downloading ? 'Creating marks workbook…' : hasActiveFilters ? 'Download filtered marks' : 'Download all classes & sections'}</Text>
          </TouchableOpacity>
        </View>}

        <View style={styles.listCard}>
          <View style={styles.listHeader}><Text style={styles.listTitle}>Choose an exam</Text><Text style={styles.listCount}>{exams.length}</Text></View>
          {exams.map((exam) => {
            const active = exam.id === selectedExam?.id;
            return <TouchableOpacity key={exam.id} onPress={() => chooseExam(exam)} style={[styles.examRow, active && styles.examRowActive]}>
              <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioDot} />}</View>
              <View style={{ flex: 1 }}><Text style={[styles.examName, active && styles.examNameActive]}>{exam.name}</Text><Text style={styles.examMeta}>{examTypeLabel(exam.exam_type)} · {exam.academic_year} · {exam.class_count} classes · {exam.section_count} sections</Text></View>
              {exam.results_published && <View style={styles.publishedBadge}><Text style={styles.publishedText}>Published</Text></View>}
            </TouchableOpacity>;
          })}
        </View>
      </>}
    </ScrollView>
  </View>;
}

const createStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { width: '100%', maxWidth: 1050, alignSelf: 'center', padding: 24, paddingBottom: 50, gap: 18 },
  hero: { minHeight: 150, padding: 24, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 17, backgroundColor: isDark ? '#172554' : '#EFF6FF', borderWidth: 1, borderColor: isDark ? '#1E3A8A' : '#BFDBFE' },
  heroIcon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB' },
  heroCopy: { flex: 1 }, eyebrow: { color: '#2563EB', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { marginTop: 6, color: theme.colors.textStrong, fontSize: 24, fontWeight: '900' },
  subtitle: { marginTop: 7, maxWidth: 720, color: theme.colors.textSecondary, fontSize: 12.5, lineHeight: 19 },
  stateCard: { minHeight: 170, padding: 24, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  stateText: { color: theme.colors.textSecondary, fontSize: 13, textAlign: 'center' }, retryButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 11, backgroundColor: '#2563EB' }, retryText: { color: '#FFFFFF', fontWeight: '800' },
  selectedCard: { padding: 20, borderRadius: 22, gap: 17, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  selectedTop: { flexDirection: 'row', alignItems: 'center', gap: 13 }, selectedIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(37,99,235,.16)' : '#DBEAFE' },
  selectedLabel: { color: theme.colors.textTertiary, fontSize: 9, fontWeight: '900', letterSpacing: .8 }, selectedName: { marginTop: 3, color: theme.colors.textStrong, fontSize: 19, fontWeight: '900' }, selectedMeta: { marginTop: 3, color: theme.colors.textSecondary, fontSize: 11.5 },
  scopeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, scopeItem: { flexGrow: 1, flexBasis: '22%', minWidth: 130, padding: 13, borderRadius: 14, backgroundColor: isDark ? 'rgba(255,255,255,.04)' : '#F8FAFC' }, scopeLabel: { color: theme.colors.textTertiary, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' }, scopeValue: { marginTop: 5, color: theme.colors.textStrong, fontSize: 14, fontWeight: '900' },
  filtersCard: { padding: 15, gap: 14, borderRadius: 16, backgroundColor: isDark ? 'rgba(255,255,255,.025)' : '#FAFAFC', borderWidth: 1, borderColor: theme.colors.border }, filtersHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, filtersTitle: { color: theme.colors.textStrong, fontSize: 14, fontWeight: '900' }, filtersHint: { marginTop: 2, color: theme.colors.textSecondary, fontSize: 10.5 }, resetText: { color: '#2563EB', fontSize: 11, fontWeight: '900' },
  filterGroup: { gap: 7 }, filterLabel: { color: theme.colors.textTertiary, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: .5 }, chipsRow: { gap: 7, paddingRight: 8 }, filterChip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card }, filterChipActive: { borderColor: '#2563EB', backgroundColor: isDark ? 'rgba(37,99,235,.16)' : '#DBEAFE' }, resultChipActive: { borderColor: '#7C3AED', backgroundColor: isDark ? 'rgba(124,58,237,.16)' : '#EDE9FE' }, filterChipText: { color: theme.colors.textSecondary, fontSize: 10.5, fontWeight: '800' }, filterChipTextActive: { color: isDark ? '#DBEAFE' : '#1D4ED8' },
  infoBanner: { padding: 12, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: isDark ? 'rgba(37,99,235,.12)' : '#EFF6FF' }, infoText: { flex: 1, color: isDark ? '#BFDBFE' : '#1E40AF', fontSize: 11.5, lineHeight: 17, fontWeight: '600' },
  downloadButton: { minHeight: 52, paddingHorizontal: 18, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#2563EB' }, downloadText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' }, disabled: { opacity: .58 },
  listCard: { borderRadius: 22, overflow: 'hidden', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }, listHeader: { minHeight: 58, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: theme.colors.border }, listTitle: { color: theme.colors.textStrong, fontSize: 15, fontWeight: '900' }, listCount: { minWidth: 28, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 10, overflow: 'hidden', textAlign: 'center', color: '#2563EB', fontSize: 11, fontWeight: '900', backgroundColor: isDark ? 'rgba(37,99,235,.15)' : '#DBEAFE' },
  examRow: { minHeight: 72, paddingHorizontal: 18, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }, examRowActive: { backgroundColor: isDark ? 'rgba(37,99,235,.09)' : '#F8FAFF' }, radio: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.colors.border }, radioActive: { borderColor: '#2563EB' }, radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563EB' }, examName: { color: theme.colors.textStrong, fontSize: 13, fontWeight: '800' }, examNameActive: { color: '#2563EB' }, examMeta: { marginTop: 4, color: theme.colors.textSecondary, fontSize: 10.5 }, publishedBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, backgroundColor: isDark ? 'rgba(16,185,129,.14)' : '#D1FAE5' }, publishedText: { color: '#047857', fontSize: 9, fontWeight: '900' },
});
