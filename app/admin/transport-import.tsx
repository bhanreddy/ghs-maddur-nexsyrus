import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../src/components/AdminHeader';
import LogoLoader from '../../src/components/LogoLoader';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { api } from '../../src/services/apiClient';
import {
  TransportImportService,
  ImportPreviewRow,
  ImportPreviewSummary,
  ImportCommitResponse,
} from '../../src/services/transportImportService';

type Step = 'upload' | 'preview' | 'results';

export default function TransportImportScreen() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<Step>('upload');
  const [loading, setLoading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [academicYearLabel, setAcademicYearLabel] = useState<string>('Current year');
  const [academicYearId, setAcademicYearId] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportPreviewSummary | null>(null);
  const [rows, setRows] = useState<ImportPreviewRow[]>([]);
  const [commitResult, setCommitResult] = useState<ImportCommitResponse | null>(null);

  useEffect(() => {
    api.get<{ id: string; code: string }>('/transport/academic-years/current')
      .then((ay) => {
        if (ay?.id) {
          setAcademicYearId(ay.id);
          setAcademicYearLabel(ay.code || 'Current year');
        }
      })
      .catch(() => {
        setAcademicYearId(null);
        setAcademicYearLabel('No active year');
      });
  }, []);

  const onPickFileWeb = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const onWebFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setSelectedFileName(file.name);
    event.target.value = '';
  };

  const runPreview = useCallback(async () => {
    if (!selectedFile) {
      alertCompat('Select file', 'Choose an Excel file with Full Name, Admission Number, and Stop Name columns.');
      return;
    }
    try {
      setLoading(true);
      const result = await TransportImportService.previewFromFile(
        selectedFile,
        academicYearId || undefined,
      );
      setBatchId(result.batch_id);
      setSummary(result.summary);
      setRows(result.rows);
      setStep('preview');
    } catch (e: any) {
      alertCompat('Preview failed', e?.message || 'Could not parse Excel file');
    } finally {
      setLoading(false);
    }
  }, [selectedFile, academicYearId]);

  const runCommit = async () => {
    if (!batchId || !summary?.valid_rows) return;
    alertCompat(
      'Confirm import',
      `Assign transport for ${summary.valid_rows} student(s)? Invalid rows will be skipped.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: async () => {
            try {
              setLoading(true);
              const result = await TransportImportService.commit(batchId);
              setCommitResult(result);
              setStep('results');
            } catch (e: any) {
              alertCompat('Import failed', e?.message || 'Commit failed');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const downloadTemplate = async () => {
    try {
      await TransportImportService.downloadTemplate();
    } catch (e: any) {
      alertCompat('Download failed', e?.message || 'Could not download template');
    }
  };

  const downloadFailures = async () => {
    if (!batchId) return;
    try {
      await TransportImportService.downloadFailures(batchId);
    } catch (e: any) {
      alertCompat('Download failed', e?.message || 'Could not export failures');
    }
  };

  const resetFlow = () => {
    setStep('upload');
    setSelectedFile(null);
    setSelectedFileName(null);
    setBatchId(null);
    setSummary(null);
    setRows([]);
    setCommitResult(null);
  };

  const renderRow = ({ item }: { item: ImportPreviewRow }) => {
    const isInvalid = item.status === 'invalid';
    const hasWarning = !!item.warning_message;
    return (
      <View style={[styles.rowCard, isInvalid && styles.rowInvalid]}>
        <View style={styles.rowTop}>
          <Text style={styles.rowNum}>#{item.row_number}</Text>
          <View style={[styles.badge, isInvalid ? styles.badgeBad : styles.badgeOk]}>
            <Text style={styles.badgeText}>{item.status}</Text>
          </View>
        </View>
        <Text style={styles.rowTitle}>{item.full_name || '—'}</Text>
        <Text style={styles.rowMeta}>Adm: {item.admission_no} · Stop: {item.stop_name}</Text>
        {item.route_name ? <Text style={styles.rowRoute}>Route: {item.route_name}</Text> : null}
        {item.error_message ? <Text style={styles.rowError}>{item.error_message}</Text> : null}
        {hasWarning ? <Text style={styles.rowWarn}>{item.warning_message}</Text> : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      <TourTarget id="screen.admin-transport-import.overview"><AdminHeader title="Bulk Stop Assignment" showBackButton /></TourTarget>

      {loading ? (
        <View style={styles.loadingBanner}>
          <LogoLoader size={28} color="#6366F1" />
          <Text style={styles.loadingText}>
            Processing file… Large lists may take up to a minute.
          </Text>
        </View>
      ) : null}

      <TourTarget id="screen.admin-transport-import.workspace" native><TourScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Excel format</Text>
          <Text style={styles.infoText}>
            Columns: Full Name, Admission Number, Stop Name. Students are matched by Admission Number only.
            Stop names must exist on a route (if duplicated across routes, the first match by route name is used).
          </Text>
          <Text style={styles.infoAy}>Academic year: {academicYearLabel}</Text>
          <TouchableOpacity style={styles.templateBtn} onPress={downloadTemplate} activeOpacity={0.85}>
            <Ionicons name="download-outline" size={18} color="#6366F1" />
            <Text style={styles.templateBtnText}>Download sample Excel template</Text>
          </TouchableOpacity>
        </View>

        {step === 'upload' && (
          <View style={styles.panel}>
            <TouchableOpacity style={styles.fileBtn} onPress={onPickFileWeb} activeOpacity={0.85}>
              <Ionicons name="document-attach-outline" size={22} color="#6366F1" />
              <Text style={styles.fileBtnText}>
                {selectedFileName || 'Choose Excel file (.xlsx)'}
              </Text>
            </TouchableOpacity>

            {Platform.OS === 'web' && (
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={onWebFileChange}
              />
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, !selectedFile && styles.primaryBtnDisabled]}
              disabled={!selectedFile}
              onPress={runPreview}
            >
              <Text style={styles.primaryBtnText}>Parse & Preview</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'preview' && summary && (
          <View style={styles.panel}>
            <View style={styles.chips}>
              <Chip label="Total" value={summary.total_rows} />
              <Chip label="Valid" value={summary.valid_rows} tone="ok" />
              <Chip label="Invalid" value={summary.invalid_rows} tone="bad" />
              <Chip label="Warnings" value={summary.warning_rows} tone="warn" />
            </View>

            {rows.length === 0 ? (
              <Text style={styles.empty}>No preview rows</Text>
            ) : (
              rows.map((item) => <View key={item.row_number}>{renderRow({ item })}</View>)
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, summary.valid_rows === 0 && styles.primaryBtnDisabled]}
              disabled={summary.valid_rows === 0}
              onPress={runCommit}
            >
              <Text style={styles.primaryBtnText}>Import {summary.valid_rows} students</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={resetFlow}>
              <Text style={styles.secondaryBtnText}>Upload different file</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'results' && commitResult && summary && (
          <View style={styles.panel}>
            <View style={styles.resultHero}>
              <Ionicons name="checkmark-circle" size={48} color="#10B981" />
              <Text style={styles.resultTitle}>Import complete</Text>
              <Text style={styles.resultMeta}>
                Success: {commitResult.success_rows} · Failed/skipped: {commitResult.failed_rows + commitResult.skipped_rows}
              </Text>
            </View>

            {(summary.invalid_rows > 0 || commitResult.failed_rows > 0) && (
              <TouchableOpacity style={styles.primaryBtn} onPress={downloadFailures}>
                <Text style={styles.primaryBtnText}>Download failure report</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/admin/transport')}>
              <Text style={styles.primaryBtnText}>Back to Transport</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={resetFlow}>
              <Text style={styles.secondaryBtnText}>Import another file</Text>
            </TouchableOpacity>
          </View>
        )}
      </TourScrollView></TourTarget>
    </View>
  );
}

function Chip({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'bad' | 'warn' }) {
  const bg = tone === 'ok' ? '#ECFDF5' : tone === 'bad' ? '#FEF2F2' : tone === 'warn' ? '#FFFBEB' : '#EEF2FF';
  const color = tone === 'ok' ? '#059669' : tone === 'bad' ? '#DC2626' : tone === 'warn' ? '#D97706' : '#4F46E5';
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipValue, { color }]}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#EEF2FF',
    borderBottomWidth: 1,
    borderBottomColor: '#C7D2FE',
  },
  loadingText: { fontSize: 13, color: '#4338CA', fontWeight: '600', flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  infoBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 6 },
  infoText: { fontSize: 13, color: '#6B7280', lineHeight: 20 },
  infoAy: { marginTop: 8, fontSize: 12, fontWeight: '600', color: '#4F46E5' },
  templateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignSelf: 'flex-start',
  },
  templateBtnText: { fontSize: 13, fontWeight: '600', color: '#4F46E5' },
  panel: { gap: 12 },
  fileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  fileBtnText: { flex: 1, color: '#374151', fontSize: 14 },
  primaryBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
  },
  secondaryBtnText: { color: '#374151', fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: 72, alignItems: 'center' },
  chipValue: { fontSize: 18, fontWeight: '800' },
  chipLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  rowCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  rowInvalid: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  rowNum: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeOk: { backgroundColor: '#DCFCE7' },
  badgeBad: { backgroundColor: '#FEE2E2' },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  rowMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  rowRoute: { fontSize: 12, color: '#059669', marginTop: 4, fontWeight: '600' },
  rowError: { fontSize: 12, color: '#DC2626', marginTop: 6 },
  rowWarn: { fontSize: 12, color: '#D97706', marginTop: 4 },
  empty: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 20 },
  resultHero: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  resultTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  resultMeta: { fontSize: 14, color: '#6B7280' },
});
