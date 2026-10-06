import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AdminHeader from '../../src/components/AdminHeader';
import HtmlPreview from '../../src/components/HtmlPreview';
import AccountsMarksFilterSelect from '../../src/components/accounts/AccountsMarksFilterSelect';
import { printAssessmentMarks } from '../../src/utils/assessmentMarksPrint';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import { useTheme } from '../../src/hooks/useTheme';
import type { Theme } from '../../src/theme/themes';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import {
  AccountsMarksClassSection,
  AccountsMarksExam,
  AccountsMarksPrintDocument,
  AccountsMarksPrintMode,
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
  const compact = useWindowDimensions().width < 600;
  const styles = useMemo(() => createStyles(theme, isDark, compact), [theme, isDark, compact]);
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
  const [preparingPrint, setPreparingPrint] = useState(false);
  const [printMarksMode, setPrintMarksMode] = useState<AccountsMarksPrintMode>('original');
  const [printing, setPrinting] = useState(false);
  const [printDocument, setPrintDocument] = useState<AccountsMarksPrintDocument | null>(null);
  const [printExamName, setPrintExamName] = useState('');
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
  ])).values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [examSections]);
  const sectionOptions = useMemo(() => [...new Map(examSections
    .filter((section) => !selectedClassId || section.class_id === selectedClassId)
    .map((section) => [section.section_id, { id: section.section_id, name: section.section_name }])).values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  [examSections, selectedClassId]);
  const filteredSections = useMemo(() => examSections.filter((section) =>
    (!selectedClassId || section.class_id === selectedClassId)
    && (!selectedSectionId || section.section_id === selectedSectionId),
  ), [examSections, selectedClassId, selectedSectionId]);
  const filteredClassCount = useMemo(() => new Set(filteredSections.map((section) => section.class_id)).size, [filteredSections]);
  const selectedResultLabel = resultFilters.find((option) => option.value === resultFilter)?.label || 'All students';
  const hasActiveFilters = Boolean(selectedClassId || selectedSectionId || resultFilter !== 'all');
  const canPrintAssessment = selectedExam?.exam_type === 'fa_results' || selectedExam?.exam_type === 'sa_results';

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

  const previewPrint = useCallback(async () => {
    if (!selectedExam) return;
    try {
      setPreparingPrint(true);
      const document = await AccountsMarksService.getPrintDocument(selectedExam, {
        classId: selectedClassId || undefined,
        sectionId: selectedSectionId || undefined,
        resultStatus: resultFilter,
        marksMode: printMarksMode,
      });
      setPrintExamName(selectedExam.name);
      setPrintDocument(document);
    } catch (requestError: any) {
      alertCompat('Preview failed', requestError?.message || 'Could not prepare the assessment marks list.');
    } finally {
      setPreparingPrint(false);
    }
  }, [printMarksMode, resultFilter, selectedClassId, selectedExam, selectedSectionId]);

  const print = useCallback(async () => {
    if (!printDocument) return;
    try {
      setPrinting(true);
      await printAssessmentMarks(printDocument.html);
    } catch (printError: any) {
      alertCompat('Print failed', printError?.message || 'Could not print the assessment marks list.');
    } finally {
      setPrinting(false);
    }
  }, [printDocument]);

  return <View style={styles.screen}>
    <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
    {!shellActive && <AdminHeader title="School Marks Export" showBackButton />}
    <TourTarget id="screen.accounts-marks.workspace" native><View style={styles.workspace}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarContent}>
          <View style={styles.hero}>
            <View style={styles.heroIcon}><Ionicons name="school-outline" size={22} color="#FFFFFF" /></View>
            <View style={styles.heroCopy}>
              <TourTarget id="screen.accounts-marks.overview" native><Text style={styles.title}>School marks — print & export</Text></TourTarget>
              <Text style={styles.subtitle}>Choose the marks to include, then preview, print or download.</Text>
            </View>
          </View>
          {!loading && !error && selectedExam && <View style={styles.filtersCard}>
            <View style={styles.filtersHeader}>
              <Text style={styles.filtersTitle}>Print & export filters</Text>
              {(hasActiveFilters || (canPrintAssessment && printMarksMode !== 'original')) && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reset marks filters" onPress={() => { setSelectedClassId(''); setSelectedSectionId(''); setResultFilter('all'); setPrintMarksMode('original'); }}><Text style={styles.resetText}>Reset filters</Text></TouchableOpacity>}
            </View>
            <View style={styles.filterRow}>
              <AccountsMarksFilterSelect label="Exam" value={selectedExam.id} options={exams.map(exam => ({ value: exam.id, label: `${exam.name} · ${exam.academic_year}` }))} onChange={value => { const exam = exams.find(item => item.id === value); if (exam) chooseExam(exam); }} style={styles.examFilter} />
              <AccountsMarksFilterSelect label="Class" value={selectedClassId} options={[{ value: '', label: 'All classes' }, ...classOptions.map(option => ({ value: option.id, label: option.name }))]} onChange={value => { setSelectedClassId(value); setSelectedSectionId(''); }} />
              <AccountsMarksFilterSelect label="Section" value={selectedSectionId} options={[{ value: '', label: 'All sections' }, ...sectionOptions.map(option => ({ value: option.id, label: option.name }))]} onChange={setSelectedSectionId} />
              <AccountsMarksFilterSelect label="Result status" value={resultFilter} options={resultFilters} onChange={value => setResultFilter(value as AccountsMarksResultFilter)} style={styles.resultFilter} />
              {canPrintAssessment && <AccountsMarksFilterSelect label="Printed marks" value={printMarksMode} options={[{ value: 'original', label: 'Original marks' }, { value: 'passing_criteria', label: 'Passing criteria (36%)' }]} onChange={value => setPrintMarksMode(value as AccountsMarksPrintMode)} disabled={preparingPrint} style={styles.printModeFilter} />}
            </View>
          </View>}
        </View>
      </View>
      <TourScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? <View style={styles.stateCard}><ActivityIndicator color="#2563EB" /><Text style={styles.stateText}>Loading school exams…</Text></View> : error ? (
          <View style={styles.stateCard}>
            <Ionicons name="alert-circle-outline" size={26} color="#DC2626" />
            <Text style={[styles.stateText, { color: '#DC2626' }]}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={load}><Text style={styles.retryText}>Try again</Text></TouchableOpacity>
          </View>
        ) : exams.length === 0 ? <View style={styles.stateCard}><Ionicons name="document-outline" size={28} color={theme.colors.textTertiary} /><Text style={styles.stateText}>No exams with configured subjects are available.</Text></View> : selectedExam && <View style={styles.selectedCard}>
          <View style={styles.selectedTop}>
            <View style={styles.selectedIcon}><Ionicons name="document-text-outline" size={23} color="#2563EB" /></View>
            <View style={styles.selectedCopy}>
              <Text style={styles.selectedName}>{selectedExam.name}</Text>
              <Text style={styles.selectedMeta}>{examTypeLabel(selectedExam.exam_type)} · {selectedExam.academic_year}</Text>
            </View>
            {selectedExam.results_published && <View style={styles.publishedBadge}><Text style={styles.publishedText}>Published</Text></View>}
          </View>
          <View style={styles.scopeRow}>
            <Text style={styles.scopeText}>{filteredClassCount} {filteredClassCount === 1 ? 'class' : 'classes'} · {filteredSections.length} {filteredSections.length === 1 ? 'section' : 'sections'} · {selectedResultLabel}</Text>
            <Text style={styles.rankingText}>{rankingLabels[rankingMethod]}</Text>
          </View>
          <View style={styles.actionGrid}>
            {canPrintAssessment && <View style={styles.printCard}>
              <View style={styles.actionHeading}><Ionicons name="print-outline" size={19} color="#047857" /><Text style={styles.filtersTitle}>Assessment marks list</Text></View>
              <Text style={styles.actionHint}>{selectedExam.exam_type === 'sa_results'
                ? 'A4 landscape register with subject totals, grand total, grade, GPA and rank. Classes 6–10 include the FA contribution.'
                : 'A4 landscape register with subject marks and sample grades including A2. Classes 6–10 show Grade in place of 20%.'}</Text>
              <View style={styles.modeNote}>
                <Text style={styles.modeTitle}>{printMarksMode === 'passing_criteria' ? 'Passing criteria (36%)' : 'Original marks'}</Text>
                <Text style={styles.actionHint}>{printMarksMode === 'passing_criteria'
                  ? 'Low Slip Test or direct marks print at 36%, with totals, grades and ranks recalculated. Saved marks stay original; absent and missing entries stay unchanged.'
                  : 'Print the saved marks. Choose Passing criteria (36%) above to adjust low marks for printing.'}</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" disabled={preparingPrint} style={[styles.printButton, preparingPrint && styles.disabled]} onPress={previewPrint}>
                {preparingPrint ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="print-outline" size={20} color="#FFFFFF" />}
                <Text style={styles.downloadText}>{preparingPrint ? 'Preparing marks list…' : 'Preview & print marks list'}</Text>
              </TouchableOpacity>
            </View>}
            <View style={styles.exportCard}>
              <View style={styles.actionHeading}><Ionicons name="download-outline" size={19} color="#2563EB" /><Text style={styles.filtersTitle}>Excel workbook</Text></View>
              <Text style={styles.actionHint}>One workbook for the selected classes and sections, including marks, grades, totals, percentages and original class ranks.</Text>
              <View style={styles.modeNote}>
                <Text style={styles.modeTitle}>Original marks</Text>
                <Text style={styles.actionHint}>Excel always uses saved marks. Exam, class, section and result filters apply to this download.</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" disabled={downloading} style={[styles.downloadButton, downloading && styles.disabled]} onPress={download}>
                {downloading ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="download-outline" size={20} color="#FFFFFF" />}
                <Text style={styles.downloadText}>{downloading ? 'Creating marks workbook…' : hasActiveFilters ? 'Download filtered marks' : 'Download all classes & sections'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>}
      </TourScrollView>
    </View></TourTarget>
    <Modal visible={printDocument !== null} animationType="slide" onRequestClose={() => setPrintDocument(null)}>
      <View style={styles.previewScreen}>
        <View style={styles.previewHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.filtersTitle}>{printExamName} — Print preview</Text>
            <Text style={styles.filtersHint}>{printDocument?.student_count} students · {printDocument?.page_count} pages · A4 landscape · {printDocument?.marks_mode === 'passing_criteria' ? 'Passing criteria (36%)' : 'Original marks'}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close print preview" onPress={() => setPrintDocument(null)} style={styles.closeButton}><Ionicons name="close" size={24} color={theme.colors.textStrong} /></TouchableOpacity>
        </View>
        {printDocument && <HtmlPreview html={printDocument.html} />}
        <View style={styles.previewFooter}>
          <Text style={styles.filtersHint}>Print at 100% scale on A4 landscape with browser headers and footers off. Choose Save as PDF in the print dialog to save a copy.</Text>
          <TouchableOpacity accessibilityRole="button" disabled={printing} style={[styles.printButton, printing && styles.disabled]} onPress={print}>
            {printing ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="print-outline" size={20} color="#FFFFFF" />}
            <Text style={styles.downloadText}>{printing ? 'Opening print dialog…' : 'Print marks list'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  </View>;
}

const createStyles = (theme: Theme, isDark: boolean, compact: boolean) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  workspace: { flex: 1, minHeight: 0 },
  scroll: { flex: 1, minHeight: 0 },
  toolbar: { backgroundColor: theme.colors.background, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  toolbarContent: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: compact ? 16 : 24, paddingTop: 16, paddingBottom: 16, gap: 16 },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: compact ? 16 : 24, paddingBottom: 40, gap: 18 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB' },
  heroCopy: { flex: 1 },
  title: { color: theme.colors.textStrong, fontSize: compact ? 18 : 21, fontWeight: '800' },
  subtitle: { marginTop: 4, color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 },
  filtersCard: { padding: 16, gap: 14, borderRadius: 16, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  filtersHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  filtersTitle: { color: theme.colors.textStrong, fontSize: 14, fontWeight: '800' },
  filtersHint: { marginTop: 2, color: theme.colors.textSecondary, fontSize: 11, lineHeight: 16 },
  resetText: { color: isDark ? '#93C5FD' : '#2563EB', fontSize: 11, fontWeight: '800' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  examFilter: { flexGrow: 1.5, flexBasis: compact ? '100%' : 220 },
  resultFilter: { flexBasis: compact ? 130 : 165 },
  printModeFilter: { flexBasis: compact ? 130 : 190 },
  stateCard: { minHeight: 170, padding: 24, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  stateText: { color: theme.colors.textSecondary, fontSize: 13, textAlign: 'center' },
  retryButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 11, backgroundColor: '#2563EB' },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  selectedCard: { padding: compact ? 16 : 20, borderRadius: 18, gap: 16, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  selectedTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  selectedIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(37,99,235,.16)' : '#DBEAFE' },
  selectedCopy: { flex: 1, minWidth: 0 },
  selectedName: { color: theme.colors.textStrong, fontSize: 18, fontWeight: '800' },
  selectedMeta: { marginTop: 3, color: theme.colors.textSecondary, fontSize: 11.5, lineHeight: 17 },
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  scopeText: { color: theme.colors.textStrong, fontSize: 12, fontWeight: '600' },
  rankingText: { color: theme.colors.textSecondary, fontSize: 11 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  printCard: { flex: 1, flexBasis: 300, minWidth: compact ? 0 : 280, padding: 16, gap: 12, borderRadius: 14, borderWidth: 1, borderColor: isDark ? '#065F46' : '#A7F3D0', backgroundColor: isDark ? 'rgba(4,120,87,.06)' : '#F6FCF9' },
  exportCard: { flex: 1, flexBasis: 300, minWidth: compact ? 0 : 280, padding: 16, gap: 12, borderRadius: 14, borderWidth: 1, borderColor: isDark ? '#1E40AF' : '#BFDBFE', backgroundColor: isDark ? 'rgba(37,99,235,.06)' : '#F8FAFF' },
  actionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionHint: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 },
  modeNote: { flexGrow: 1, gap: 5 },
  modeTitle: { color: theme.colors.textStrong, fontSize: 12, fontWeight: '700' },
  downloadButton: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#2563EB' },
  printButton: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#047857' },
  downloadText: { flexShrink: 1, textAlign: 'center', color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  disabled: { opacity: .58 },
  previewScreen: { flex: 1, backgroundColor: theme.colors.background },
  previewHeader: { padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  closeButton: { padding: 8 },
  previewFooter: { padding: 18, gap: 12, borderTopWidth: 1, borderTopColor: theme.colors.border },
  publishedBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, backgroundColor: isDark ? 'rgba(16,185,129,.14)' : '#D1FAE5' },
  publishedText: { color: isDark ? '#6EE7B7' : '#047857', fontSize: 9, fontWeight: '800' },
});
