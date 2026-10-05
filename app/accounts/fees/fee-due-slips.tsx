import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  RefreshControl,
  Platform,
  Alert,
} from 'react-native';
import { useTheme } from '../../../src/hooks/useTheme';
import { useAccountsWebChrome } from '../../../src/contexts/AccountsWebChromeContext';
import AdminHeader from '../../../src/components/AdminHeader';
import { FeeDueSlipsHeader, ActiveTab } from '../../../src/components/fee-due-slips/FeeDueSlipsHeader';
import { StudentFilterPanel, FeeFilterState, ClassWithSections } from '../../../src/components/fee-due-slips/StudentFilterPanel';
import { StudentDueTable } from '../../../src/components/fee-due-slips/StudentDueTable';
import { TemplateListView } from '../../../src/components/fee-due-slips/TemplateListView';
import { GenerationHistoryView } from '../../../src/components/fee-due-slips/GenerationHistoryView';
import { TemplateDesignerModal } from '../../../src/components/fee-due-slips/TemplateDesignerModal';
import { SlipPrintPreviewModal } from '../../../src/components/fee-due-slips/SlipPrintPreviewModal';
import { BatchGenerationProgressModal } from '../../../src/components/fee-due-slips/BatchGenerationProgressModal';
import { FeeDueSlipService } from '../../../src/services/feeDueSlipService';
import { ClassService } from '../../../src/services/classService';
import { api } from '../../../src/services/apiClient';
import { printSlipsOnWeb, downloadBlob } from '../../../src/utils/documentSlipPdf';
import type {
  DocumentTemplate,
  DueStudentItem,
  FeeDueSummary,
  DocumentGenerationJob,
} from '../../../src/types/documentTemplate';

const DEFAULT_SUMMARY: FeeDueSummary = {
  total_students: 0,
  total_fee: 0,
  total_concession: 0,
  total_paid: 0,
  total_due: 0,
  total_transport_pending: 0,
};

const DEFAULT_FILTERS: FeeFilterState = {
  fee_status: 'Pending',
  search: '',
  class_id: undefined,
  section_id: undefined,
  min_due: '',
  max_due: '',
  due_date_before: '',
  overdue_days_min: '',
};

export default function FeeDueSlipsScreen() {
  const { theme, isDark } = useTheme();
  const { shellActive } = useAccountsWebChrome();

  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<ActiveTab>('generate');

  // Filter State
  const [filters, setFilters] = useState<FeeFilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);

  // Metadata Sources
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [academicYears, setAcademicYears] = useState<Array<{ id: string; code: string; name?: string }>>([]);

  // Student Data
  const [students, setStudents] = useState<DueStudentItem[]>([]);
  const [summary, setSummary] = useState<FeeDueSummary>(DEFAULT_SUMMARY);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Template State
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // History State
  const [history, setHistory] = useState<DocumentGenerationJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Modals
  const [designerOpen, setDesignerOpen] = useState(false);
  const [designerTemplate, setDesignerTemplate] = useState<DocumentTemplate | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewStudentCount, setPreviewStudentCount] = useState<number>(1);

  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<number>(0);
  const [batchTotal, setBatchTotal] = useState<number>(0);
  const [batchProcessed, setBatchProcessed] = useState<number>(0);
  const [batchStatus, setBatchStatus] = useState<'processing' | 'completed' | 'failed' | 'cancelled'>('processing');
  const [batchError, setBatchError] = useState<string | null>(null);

  const pollIntervalRef = useRef<any>(null);

  // ─── Fetch Metadata ────────────────────────────────────────────────────────
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [clsData, ayData] = await Promise.all([
          ClassService.getClasses().catch(() => []),
          api.get<any[]>('/academics/academic-years').catch(() => []),
        ]);

        const enrichedClasses: ClassWithSections[] = Array.isArray(clsData)
          ? clsData.map((c) => ({ ...c, sections: [] }))
          : [];
        setClasses(enrichedClasses);

        if (Array.isArray(ayData)) {
          setAcademicYears(
            ayData.map((y) => ({
              id: y.id,
              code: y.code || y.name || y.academic_year || 'Current',
              name: y.name || y.code,
            }))
          );
        }
      } catch (err) {
        console.error('Failed to load classes or academic years:', err);
      }
    };
    loadMetadata();
  }, []);

  // ─── Fetch Templates ───────────────────────────────────────────────────────
  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const list = await FeeDueSlipService.fetchTemplates();
      setTemplates(list);
      if (list.length > 0) {
        const def = list.find((t: DocumentTemplate) => t.is_default) || list[0];
        setSelectedTemplate(def);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // ─── Fetch Students ────────────────────────────────────────────────────────
  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    try {
      const res = await FeeDueSlipService.fetchDueStudents({
        ...filters,
        page,
        limit,
      });
      setStudents(res.students || []);
      setSummary(res.summary || DEFAULT_SUMMARY);
      setTotalPages(res.pagination?.total_pages || 1);
    } catch (err) {
      console.error('Failed to load due students:', err);
    } finally {
      setStudentsLoading(false);
    }
  }, [filters, page, limit]);

  useEffect(() => {
    if (activeTab === 'generate') {
      loadStudents();
    }
  }, [activeTab, loadStudents]);

  // ─── Fetch History ─────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const list = await FeeDueSlipService.fetchJobHistory();
      setHistory(list);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  // ─── Selection Helpers ─────────────────────────────────────────────────────
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allVisibleSelected = students.every((s) => next.has(s.student_id));
      if (allVisibleSelected) {
        students.forEach((s) => next.delete(s.student_id));
      } else {
        students.forEach((s) => next.add(s.student_id));
      }
      return next;
    });
  }, [students]);

  const handleSelectAllFiltered = useCallback(() => {
    const all = new Set<string>();
    students.forEach((s) => all.add(s.student_id));
    setSelectedIds(all);
  }, [students]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ─── Preview & Single Actions ──────────────────────────────────────────────
  const openPreviewForHtml = useCallback((html: string, count: number) => {
    setPreviewHtml(html);
    setPreviewStudentCount(count);
    setPreviewOpen(true);
  }, []);

  const handleSinglePreview = useCallback(async (student: DueStudentItem) => {
    if (!selectedTemplate) return;
    try {
      const html = await FeeDueSlipService.previewHtml(selectedTemplate.id, {
        student_ids: [student.student_id],
      });
      openPreviewForHtml(html, 1);
    } catch (err: any) {
      Alert.alert('Preview Error', err.message || 'Failed to render preview');
    }
  }, [selectedTemplate, openPreviewForHtml]);

  const handleSinglePrint = useCallback(async (student: DueStudentItem) => {
    if (!selectedTemplate) return;
    try {
      const html = await FeeDueSlipService.previewHtml(selectedTemplate.id, {
        student_ids: [student.student_id],
      });
      printSlipsOnWeb(html);
    } catch (err: any) {
      Alert.alert('Print Error', err.message || 'Failed to print slip');
    }
  }, [selectedTemplate]);

  const handleSingleGenerate = useCallback(async (student: DueStudentItem) => {
    await handleSinglePrint(student);
  }, [handleSinglePrint]);

  // ─── Bulk Actions ──────────────────────────────────────────────────────────
  const handleBulkPrint = useCallback(async () => {
    if (!selectedTemplate) return;
    const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : students.map((s) => s.student_id);
    if (targetIds.length === 0) {
      Alert.alert('Selection Required', 'Please select at least one student.');
      return;
    }
    try {
      const html = await FeeDueSlipService.previewHtml(selectedTemplate.id, {
        student_ids: targetIds.slice(0, 50),
      });
      openPreviewForHtml(html, targetIds.length);
    } catch (err: any) {
      Alert.alert('Preview Error', err.message || 'Failed to load preview');
    }
  }, [selectedTemplate, selectedIds, students, openPreviewForHtml]);

  // ─── Batch Job Progress Polling ───────────────────────────────────────────
  const startJobPolling = useCallback((jobId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const job = await FeeDueSlipService.pollBatchJob(jobId);
        setBatchProgress(job.progress || 0);
        setBatchProcessed(job.processed_records || job.student_count || 0);
        setBatchTotal(job.total_records || job.student_count || 0);
        setBatchStatus(job.status as any);

        if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      } catch (err: any) {
        console.error('Job polling error:', err);
      }
    }, 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleBulkCombinedPdf = useCallback(async () => {
    if (!selectedTemplate) return;
    const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
    try {
      const res = await FeeDueSlipService.startBatchJob({
        template_id: selectedTemplate.id,
        format: 'pdf',
        student_ids: targetIds,
        filters: targetIds ? undefined : filters,
      });
      setActiveJobId(res.job_id);
      setBatchProgress(0);
      setBatchTotal(res.total_records || (targetIds ? targetIds.length : students.length));
      setBatchProcessed(0);
      setBatchStatus('processing');
      setBatchError(null);
      setBatchModalOpen(true);
      startJobPolling(res.job_id);
    } catch (err: any) {
      Alert.alert('Generation Error', err.message || 'Failed to start batch generation.');
    }
  }, [selectedTemplate, selectedIds, filters, students, startJobPolling]);

  const handleBulkZip = useCallback(async () => {
    if (!selectedTemplate) return;
    const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
    try {
      const res = await FeeDueSlipService.startBatchJob({
        template_id: selectedTemplate.id,
        format: 'zip',
        student_ids: targetIds,
        filters: targetIds ? undefined : filters,
      });
      setActiveJobId(res.job_id);
      setBatchProgress(0);
      setBatchTotal(res.total_records || (targetIds ? targetIds.length : students.length));
      setBatchProcessed(0);
      setBatchStatus('processing');
      setBatchError(null);
      setBatchModalOpen(true);
      startJobPolling(res.job_id);
    } catch (err: any) {
      Alert.alert('Generation Error', err.message || 'Failed to start ZIP generation.');
    }
  }, [selectedTemplate, selectedIds, filters, students, startJobPolling]);

  const handleExportExcel = useCallback(async () => {
    try {
      const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
      const blob = await FeeDueSlipService.downloadExcel({
        ...filters,
        student_ids: targetIds,
      });
      const filename = `Fee_Due_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      downloadBlob(blob, filename);
    } catch (err: any) {
      Alert.alert('Export Error', err.message || 'Failed to export Excel.');
    }
  }, [filters, selectedIds]);

  const handleExportCsv = useCallback(async () => {
    try {
      const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
      const csvContent = await FeeDueSlipService.downloadCsv({
        ...filters,
        student_ids: targetIds,
      });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const filename = `Fee_Due_List_${new Date().toISOString().slice(0, 10)}.csv`;
      downloadBlob(blob, filename);
    } catch (err: any) {
      Alert.alert('Export Error', err.message || 'Failed to export CSV.');
    }
  }, [filters, selectedIds]);

  // ─── Template Management ───────────────────────────────────────────────────
  const handleCreateNewTemplate = useCallback(() => {
    setDesignerTemplate(null);
    setDesignerOpen(true);
  }, []);

  const handleEditTemplate = useCallback((tpl: DocumentTemplate) => {
    setDesignerTemplate(tpl);
    setDesignerOpen(true);
  }, []);

  const handleDuplicateTemplate = useCallback(async (tpl: DocumentTemplate) => {
    try {
      const copy = await FeeDueSlipService.duplicateTemplate(tpl.id);
      await loadTemplates();
      Alert.alert('Duplicated', `Template created: "${copy.name}"`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to duplicate template');
    }
  }, [loadTemplates]);

  const handleSetDefaultTemplate = useCallback(async (tpl: DocumentTemplate) => {
    try {
      await FeeDueSlipService.setDefaultTemplate(tpl.id);
      await loadTemplates();
      Alert.alert('Default Updated', `"${tpl.name}" is now the default template.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to set default template');
    }
  }, [loadTemplates]);

  const handleArchiveTemplate = useCallback(async (tpl: DocumentTemplate) => {
    Alert.alert(
      'Archive Template',
      `Are you sure you want to archive "${tpl.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await FeeDueSlipService.deleteTemplate(tpl.id);
              await loadTemplates();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to archive template');
            }
          },
        },
      ]
    );
  }, [loadTemplates]);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0B0D14' : '#F8FAFC' }]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={isDark ? '#0F1117' : '#1E293B'}
      />
      {!shellActive && <AdminHeader title="Fee Due Slips" showBackButton />}

      {/* Screen Header & Mode Tabs */}
      <TourTarget id="screen.accounts-fees-fee-due-slips.overview"><FeeDueSlipsHeader
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        templatesCount={templates.length}
        historyCount={history.length}
        isDark={isDark}
      /></TourTarget>

      <TourTarget id="screen.accounts-fees-fee-due-slips.workspace" native><TourScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={studentsLoading || templatesLoading || historyLoading}
            onRefresh={() => {
              if (activeTab === 'generate') loadStudents();
              if (activeTab === 'templates') loadTemplates();
              if (activeTab === 'history') loadHistory();
            }}
            tintColor="#3B82F6"
          />
        }
      >
        {/* TAB 1: GENERATE SLIPS */}
        {activeTab === 'generate' && (
          <View style={styles.tabContent}>
            {/* Filter Panel */}
            <StudentFilterPanel
              filters={filters}
              onFilterChange={(updated) => {
                setFilters((prev) => ({ ...prev, ...updated }));
                setPage(1);
              }}
              onReset={() => {
                setFilters(DEFAULT_FILTERS);
                setPage(1);
              }}
              classes={classes}
              academicYears={academicYears}
              isDark={isDark}
            />

            {/* Students Table with Selection & Action Bar */}
            <StudentDueTable
              students={students}
              summary={summary}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onSelectAllVisible={handleSelectAllVisible}
              onSelectAllFiltered={handleSelectAllFiltered}
              onClearSelection={handleClearSelection}
              onSingleGenerate={handleSingleGenerate}
              onSinglePreview={handleSinglePreview}
              onSinglePrint={handleSinglePrint}
              onBulkGenerate={handleBulkCombinedPdf}
              onBulkPrint={handleBulkPrint}
              onBulkCombinedPdf={handleBulkCombinedPdf}
              onBulkZip={handleBulkZip}
              onExportExcel={handleExportExcel}
              onExportCsv={handleExportCsv}
              page={page}
              totalPages={totalPages}
              onPageChange={(p) => setPage(p)}
              loading={studentsLoading}
              isDark={isDark}
            />
          </View>
        )}

        {/* TAB 2: TEMPLATE LIST */}
        {activeTab === 'templates' && (
          <View style={styles.tabContent}>
            <TemplateListView
              templates={templates}
              loading={templatesLoading}
              onEdit={handleEditTemplate}
              onDuplicate={handleDuplicateTemplate}
              onSetDefault={handleSetDefaultTemplate}
              onArchive={handleArchiveTemplate}
              onPreview={async (tpl) => {
                setSelectedTemplate(tpl);
                try {
                  const html = await FeeDueSlipService.previewHtml(tpl.id, {});
                  openPreviewForHtml(html, 1);
                } catch {
                  // Fallback
                }
              }}
              onCreateNew={handleCreateNewTemplate}
              isDark={isDark}
            />
          </View>
        )}

        {/* TAB 3: GENERATION AUDIT HISTORY */}
        {activeTab === 'history' && (
          <View style={styles.tabContent}>
            <GenerationHistoryView
              history={history}
              loading={historyLoading}
              onRefresh={loadHistory}
              isDark={isDark}
            />
          </View>
        )}
      </TourScrollView></TourTarget>

      {/* MODAL 1: Template Designer */}
      {designerOpen && (
        <TemplateDesignerModal
          visible={designerOpen}
          initialTemplate={designerTemplate}
          onClose={() => setDesignerOpen(false)}
          onSaved={(saved) => {
            loadTemplates();
            setDesignerOpen(false);
          }}
          isDark={isDark}
        />
      )}

      {/* MODAL 2: Slip Print Preview */}
      {previewOpen && (
        <SlipPrintPreviewModal
          visible={previewOpen}
          html={previewHtml}
          templateName={selectedTemplate?.name || 'Standard Fee Due Slip'}
          studentCount={previewStudentCount}
          layoutMode={selectedTemplate?.page_settings?.slips_per_page || 1}
          onClose={() => setPreviewOpen(false)}
          isDark={isDark}
        />
      )}

      {/* MODAL 3: Batch Generation & Live Progress */}
      {batchModalOpen && (
        <BatchGenerationProgressModal
          visible={batchModalOpen}
          progress={batchProgress}
          totalStudents={batchTotal}
          generatedCount={batchProcessed}
          status={batchStatus}
          errorMessage={batchError}
          onPrint={() => {
            if (activeJobId) {
              // Direct print
            }
          }}
          onDownloadCombinedPdf={async () => {
            if (activeJobId) {
              const blob = await FeeDueSlipService.downloadBatchResult(activeJobId, 'pdf');
              downloadBlob(blob, `Batch_Fee_Due_Slips_${activeJobId}.pdf`);
            }
          }}
          onDownloadZip={async () => {
            if (activeJobId) {
              const blob = await FeeDueSlipService.downloadBatchResult(activeJobId, 'zip');
              downloadBlob(blob, `Batch_Fee_Due_Slips_${activeJobId}.zip`);
            }
          }}
          onCancel={async () => {
            if (activeJobId) {
              await FeeDueSlipService.cancelBatchJob(activeJobId);
              setBatchStatus('cancelled');
            }
          }}
          onClose={() => {
            setBatchModalOpen(false);
            loadHistory();
          }}
          isDark={isDark}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: Platform.select({ web: 24, default: 16 }),
    paddingBottom: 48,
  },
  tabContent: {
    gap: 16,
  },
});
