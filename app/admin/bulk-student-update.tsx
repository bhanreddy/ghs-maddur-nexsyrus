import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import {
  StudentBulkUpdateCommit,
  StudentBulkUpdateField,
  StudentBulkUpdateFile,
  StudentBulkUpdatePreview,
  StudentBulkUpdatePreviewRow,
  StudentBulkUpdateService,
} from '../../src/services/studentBulkUpdateService';

type FlowStep = 'setup' | 'preview' | 'complete';

const FIELD_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  aadhaar_number: 'card-outline',
  admission_date: 'calendar-outline',
  date_of_birth: 'gift-outline',
  gender: 'male-female-outline',
  mobile_number: 'call-outline',
  first_name: 'person-outline',
  middle_name: 'person-outline',
  last_name: 'person-outline',
  father_name: 'man-outline',
  admission_number: 'id-card-outline',
  pen_number: 'key-outline',
  apar_number: 'finger-print-outline',
  village: 'location-outline',
  tc_number: 'document-text-outline',
  previous_school: 'school-outline',
  category: 'layers-outline',
  religion: 'people-outline',
  blood_group: 'water-outline',
};

export default function BulkStudentUpdateScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const isWide = width >= 900;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fields, setFields] = useState<StudentBulkUpdateField[]>([]);
  const [selectedField, setSelectedField] = useState<StudentBulkUpdateField | null>(null);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<StudentBulkUpdateFile | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [clearBlank, setClearBlank] = useState(false);
  const [step, setStep] = useState<FlowStep>('setup');
  const [preview, setPreview] = useState<StudentBulkUpdatePreview | null>(null);
  const [commitResult, setCommitResult] = useState<StudentBulkUpdateCommit | null>(null);
  const [loadingFields, setLoadingFields] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let active = true;
    StudentBulkUpdateService.listFields()
      .then((availableFields) => {
        if (!active) return;
        setFields(availableFields);
        if (availableFields.length) setSelectedField(availableFields[0]);
      })
      .catch((error: any) => {
        if (active) alertCompat('Could not load fields', error?.message || 'Try opening the screen again.');
      })
      .finally(() => {
        if (active) setLoadingFields(false);
      });
    return () => { active = false; };
  }, []);

  const resetFileAndPreview = useCallback(() => {
    setSelectedFile(null);
    setSelectedFileName('');
    setPreview(null);
    setCommitResult(null);
    setStep('setup');
  }, []);

  const chooseField = (field: StudentBulkUpdateField) => {
    setSelectedField(field);
    setClearBlank(false);
    resetFileAndPreview();
    setFieldPickerOpen(false);
  };

  const pickFile = async () => {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click();
      return;
    }
    try {
      const DocumentPicker = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'text/comma-separated-values',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setSelectedFile({ uri: asset.uri, name: asset.name, type: asset.mimeType });
      setSelectedFileName(asset.name);
    } catch (error: any) {
      alertCompat('File picker unavailable', error?.message || 'Could not open the document picker.');
    }
  };

  const onWebFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setSelectedFileName(file.name);
    }
    event.target.value = '';
  };

  const downloadTemplate = async () => {
    if (!selectedField) return;
    try {
      setProcessing(true);
      await StudentBulkUpdateService.downloadTemplate(selectedField);
    } catch (error: any) {
      alertCompat('Template failed', error?.message || 'Could not download the template.');
    } finally {
      setProcessing(false);
    }
  };

  const runPreview = async () => {
    if (!selectedField || !selectedFile) {
      alertCompat('File required', 'Select the field, then choose an Excel or CSV file.');
      return;
    }
    try {
      setProcessing(true);
      const result = await StudentBulkUpdateService.preview(selectedFile, selectedField.key, clearBlank);
      setPreview(result);
      setStep('preview');
    } catch (error: any) {
      alertCompat('Preview failed', error?.message || 'The workbook could not be validated.');
    } finally {
      setProcessing(false);
    }
  };

  const commitUpdates = () => {
    if (!preview?.batch_id || preview.summary.valid_rows < 1) return;
    alertCompat(
      'Apply bulk update?',
      `${preview.summary.valid_rows} student record${preview.summary.valid_rows === 1 ? '' : 's'} will be updated for ${selectedField?.label}. Invalid and unchanged rows will not be touched.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Update ${preview.summary.valid_rows}`,
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessing(true);
              const result = await StudentBulkUpdateService.commit(preview.batch_id);
              setCommitResult(result);
              setStep('complete');
            } catch (error: any) {
              alertCompat(
                'Update not confirmed',
                error?.message || 'The server did not confirm completion. You can safely tap Update again; the same batch cannot be applied twice.',
              );
            } finally {
              setProcessing(false);
            }
          },
        },
      ],
    );
  };

  const downloadErrors = async () => {
    if (!preview?.batch_id) return;
    try {
      setProcessing(true);
      await StudentBulkUpdateService.downloadErrors(preview.batch_id);
    } catch (error: any) {
      alertCompat('Download failed', error?.message || 'Could not create the error report.');
    } finally {
      setProcessing(false);
    }
  };

  const startAnother = () => {
    resetFileAndPreview();
    setClearBlank(false);
  };

  if (loadingFields) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <AdminHeader title="Bulk Student Update" showBackButton />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading editable student fields…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <TourTarget id="screen.admin-bulk-student-update.overview"><AdminHeader title="Bulk Student Update" showBackButton /></TourTarget>

      {processing ? (
        <View style={styles.processingBanner}>
          <ActivityIndicator size="small" color="#4F46E5" />
          <Text style={styles.processingText}>Validating and processing securely…</Text>
        </View>
      ) : null}

      <TourTarget id="screen.admin-bulk-student-update.workspace" native><TourScrollView
        contentContainerStyle={[styles.page, isWide && styles.pageWide]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.hero, isWide && styles.heroWide]}>
          <LinearGradient
            colors={isDark ? ['#312E81', '#1E1B4B'] : ['#EEF2FF', '#F5F3FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroIcon}>
            <Ionicons name="cloud-upload-outline" size={25} color="#4F46E5" />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>CONTROLLED EXCEL UPDATE</Text>
            <Text style={styles.heroTitle}>Change one student detail across the roster</Text>
            <Text style={styles.heroBody}>
              Match every row by Admission Number, validate the proposed values, review changes, then confirm once.
            </Text>
          </View>
          <View style={styles.limitPill}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#047857" />
            <Text style={styles.limitText}>Preview first · max 2,000 rows</Text>
          </View>
        </View>

        <View style={[styles.stepRail, isWide && styles.stepRailWide]}>
          <StepMarker number={1} label="Choose & upload" active={step === 'setup'} complete={step !== 'setup'} />
          <View style={styles.stepLine} />
          <StepMarker number={2} label="Review changes" active={step === 'preview'} complete={step === 'complete'} />
          <View style={styles.stepLine} />
          <StepMarker number={3} label="Completed" active={step === 'complete'} complete={false} />
        </View>

        {step === 'setup' && selectedField ? (
          <View style={[styles.contentGrid, isWide && styles.contentGridWide]}>
            <View style={[styles.card, styles.mainCard]}>
              <SectionHeading
                icon="options-outline"
                title="1. Select the detail"
                subtitle="The workbook may update only this one field."
              />

              <TouchableOpacity
                style={styles.fieldSelector}
                onPress={() => setFieldPickerOpen(true)}
                activeOpacity={0.82}
              >
                <View style={styles.fieldIcon}>
                  <Ionicons name={FIELD_ICONS[selectedField.key] || 'create-outline'} size={20} color="#4F46E5" />
                </View>
                <View style={styles.fieldSelectorCopy}>
                  <Text style={styles.fieldSelectorLabel}>DETAIL TO UPDATE</Text>
                  <Text style={styles.fieldSelectorValue}>{selectedField.label}</Text>
                  <Text style={styles.fieldSelectorRule}>{selectedField.rule}</Text>
                </View>
                <Ionicons name="chevron-down" size={20} color="#64748B" />
              </TouchableOpacity>

              {selectedField.options?.length ? (
                <View style={styles.allowedBox}>
                  <Text style={styles.allowedTitle}>Accepted values</Text>
                  <Text style={styles.allowedValues}>
                    {selectedField.options.map((option) => option.name).join('  ·  ')}
                  </Text>
                </View>
              ) : null}

              <View style={styles.divider} />

              <SectionHeading
                icon="document-attach-outline"
                title="2. Upload the workbook"
                subtitle={`Required columns: Admission Number + ${selectedField.template_header}`}
              />

              <TouchableOpacity style={styles.uploadBox} onPress={pickFile} activeOpacity={0.82}>
                <View style={[styles.uploadGlyph, selectedFile && styles.uploadGlyphReady]}>
                  <Ionicons
                    name={selectedFile ? 'checkmark-circle-outline' : 'document-outline'}
                    size={27}
                    color={selectedFile ? '#059669' : '#4F46E5'}
                  />
                </View>
                <Text style={styles.uploadTitle}>{selectedFileName || 'Choose Excel or CSV file'}</Text>
                <Text style={styles.uploadHint}>
                  {selectedFile ? 'Tap to replace this file' : '.xlsx, .xls or .csv · maximum 5 MB'}
                </Text>
              </TouchableOpacity>

              {Platform.OS === 'web' ? (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  onChange={onWebFileChange}
                />
              ) : null}

              {selectedField.nullable ? (
                <View style={[styles.clearRow, clearBlank && styles.clearRowActive]}>
                  <View style={styles.clearIcon}>
                    <Ionicons name="remove-circle-outline" size={20} color={clearBlank ? '#B45309' : '#64748B'} />
                  </View>
                  <View style={styles.clearCopy}>
                    <Text style={styles.clearTitle}>Clear existing values when the cell is blank</Text>
                    <Text style={styles.clearHint}>Off by default. Turn this on only when blank means “remove data.”</Text>
                  </View>
                  <Switch
                    value={clearBlank}
                    onValueChange={setClearBlank}
                    trackColor={{ false: '#CBD5E1', true: '#FBBF24' }}
                    thumbColor={clearBlank ? '#92400E' : '#FFFFFF'}
                  />
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryButton, (!selectedFile || processing) && styles.buttonDisabled]}
                disabled={!selectedFile || processing}
                onPress={runPreview}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#4F46E5', '#7C3AED']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons name="scan-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Validate & preview changes</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.card, styles.sideCard]}>
              <Text style={styles.sideEyebrow}>START WITH THE RIGHT FORMAT</Text>
              <Text style={styles.sideTitle}>Use the field-specific template</Text>
              <Text style={styles.sideText}>
                It includes the exact column names, two examples, validation rules, and allowed reference values where relevant.
              </Text>
              <TouchableOpacity style={styles.templateButton} onPress={downloadTemplate} disabled={processing}>
                <Ionicons name="download-outline" size={18} color="#4F46E5" />
                <Text style={styles.templateButtonText}>Download {selectedField.label} template</Text>
              </TouchableOpacity>

              <View style={styles.safetyList}>
                <SafetyItem text="Students are matched only by Admission Number." />
                <SafetyItem text="Invalid rows are never applied." />
                <SafetyItem text="The final update is transactional: all valid rows succeed or none do." />
              </View>

              <View style={styles.scopeNote}>
                <Ionicons name="information-circle-outline" size={18} color="#0369A1" />
                <Text style={styles.scopeText}>
                  Class, section, passed-out/withdrawn status, passwords, photos and other parent details (phone, occupation) remain in their dedicated screens because they require additional decisions.
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {step === 'preview' && preview && selectedField ? (
          <View style={styles.card}>
            <SectionHeading
              icon="eye-outline"
              title={`Review ${selectedField.label} changes`}
              subtitle="Only rows marked Ready will be updated."
            />

            <View style={styles.statsRow}>
              <StatBox label="Uploaded" value={preview.summary.total_rows} tone="neutral" />
              <StatBox label="Ready" value={preview.summary.valid_rows} tone="good" />
              <StatBox label="Invalid" value={preview.summary.invalid_rows} tone="bad" />
              <StatBox label="Unchanged" value={preview.summary.unchanged_rows} tone="warn" />
            </View>

            {preview.preview_truncated ? (
              <View style={styles.truncatedNote}>
                <Ionicons name="information-circle-outline" size={17} color="#1D4ED8" />
                <Text style={styles.truncatedText}>Showing the first 250 rows. All rows were still validated.</Text>
              </View>
            ) : null}

            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeadText, styles.tableAdmission]}>Admission</Text>
              <Text style={[styles.tableHeadText, styles.tableValue]}>Current → New</Text>
              <Text style={[styles.tableHeadText, styles.tableStatus]}>Result</Text>
            </View>
            <View style={styles.rowList}>
              {preview.rows.map((row) => <PreviewRow key={`${row.row_number}-${row.admission_no}`} row={row} />)}
            </View>

            <View style={styles.previewActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={startAnother} disabled={processing}>
                <Ionicons name="arrow-back-outline" size={18} color="#475569" />
                <Text style={styles.secondaryButtonText}>Choose another file</Text>
              </TouchableOpacity>
              {preview.summary.invalid_rows > 0 ? (
                <TouchableOpacity style={styles.errorButton} onPress={downloadErrors} disabled={processing}>
                  <Ionicons name="download-outline" size={18} color="#B91C1C" />
                  <Text style={styles.errorButtonText}>Download errors</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.primaryButton, styles.commitButton, preview.summary.valid_rows === 0 && styles.buttonDisabled]}
                disabled={preview.summary.valid_rows === 0 || processing}
                onPress={commitUpdates}
              >
                <LinearGradient colors={['#059669', '#047857']} style={StyleSheet.absoluteFill} />
                <Ionicons name="checkmark-done-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Update {preview.summary.valid_rows} students</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {step === 'complete' && commitResult ? (
          <View style={[styles.card, styles.completeCard]}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-done" size={42} color="#047857" />
            </View>
            <Text style={styles.completeEyebrow}>BULK UPDATE COMPLETE</Text>
            <Text style={styles.completeTitle}>{commitResult.success_rows} student records updated</Text>
            <Text style={styles.completeBody}>
              {commitResult.field_label} was changed successfully. {commitResult.invalid_rows} invalid and {commitResult.unchanged_rows} unchanged rows were left untouched.
            </Text>
            <View style={styles.completeActions}>
              {commitResult.invalid_rows > 0 ? (
                <TouchableOpacity style={styles.errorButton} onPress={downloadErrors}>
                  <Ionicons name="download-outline" size={18} color="#B91C1C" />
                  <Text style={styles.errorButtonText}>Download error report</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.secondaryButton} onPress={startAnother}>
                <Ionicons name="repeat-outline" size={18} color="#475569" />
                <Text style={styles.secondaryButtonText}>Update another detail</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, styles.finishButton]} onPress={() => router.replace('/admin/students')}>
                <LinearGradient colors={['#4F46E5', '#7C3AED']} style={StyleSheet.absoluteFill} />
                <Ionicons name="people-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Back to students</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </TourScrollView></TourTarget>

      <Modal visible={fieldPickerOpen} transparent animationType="fade" onRequestClose={() => setFieldPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFieldPickerOpen(false)}>
          <Pressable style={styles.pickerCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.pickerHeader}>
              <View>
                <Text style={styles.pickerEyebrow}>STUDENT DETAIL</Text>
                <Text style={styles.pickerTitle}>What do you want to update?</Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setFieldPickerOpen(false)}>
                <Ionicons name="close" size={21} color="#475569" />
              </TouchableOpacity>
            </View>
            <TourScrollView contentContainerStyle={styles.fieldGrid}>
              {fields.map((field) => {
                const active = field.key === selectedField?.key;
                return (
                  <TouchableOpacity
                    key={field.key}
                    style={[styles.fieldOption, active && styles.fieldOptionActive]}
                    onPress={() => chooseField(field)}
                    activeOpacity={0.82}
                  >
                    <View style={[styles.fieldOptionIcon, active && styles.fieldOptionIconActive]}>
                      <Ionicons
                        name={FIELD_ICONS[field.key] || 'create-outline'}
                        size={19}
                        color={active ? '#FFFFFF' : '#4F46E5'}
                      />
                    </View>
                    <View style={styles.fieldOptionCopy}>
                      <Text style={[styles.fieldOptionTitle, active && styles.fieldOptionTitleActive]}>{field.label}</Text>
                      <Text style={styles.fieldOptionRule} numberOfLines={2}>{field.rule}</Text>
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={20} color="#4F46E5" /> : null}
                  </TouchableOpacity>
                );
              })}
            </TourScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SectionHeading({
  icon,
  title,
  subtitle,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
}) {
  const { isDark } = useTheme();
  return (
    <View style={shared.headingRow}>
      <View style={shared.headingIcon}><Ionicons name={icon} size={18} color="#4F46E5" /></View>
      <View style={shared.headingCopy}>
        <Text style={[shared.headingTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{title}</Text>
        <Text style={[shared.headingSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

function StepMarker({ number, label, active, complete }: { number: number; label: string; active: boolean; complete: boolean }) {
  return (
    <View style={shared.stepMarker}>
      <View style={[shared.stepCircle, active && shared.stepCircleActive, complete && shared.stepCircleComplete]}>
        {complete ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
        {!complete ? <Text style={[shared.stepNumber, active && shared.stepNumberActive]}>{number}</Text> : null}
      </View>
      <Text style={[shared.stepLabel, active && shared.stepLabelActive]}>{label}</Text>
    </View>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'good' | 'bad' | 'warn' }) {
  const colors = {
    neutral: { bg: '#EEF2FF', fg: '#4338CA' },
    good: { bg: '#ECFDF5', fg: '#047857' },
    bad: { bg: '#FEF2F2', fg: '#B91C1C' },
    warn: { bg: '#FFFBEB', fg: '#B45309' },
  }[tone];
  return (
    <View style={[shared.statBox, { backgroundColor: colors.bg }]}>
      <Text style={[shared.statValue, { color: colors.fg }]}>{value}</Text>
      <Text style={shared.statLabel}>{label}</Text>
    </View>
  );
}

function PreviewRow({ row }: { row: StudentBulkUpdatePreviewRow }) {
  const { isDark } = useTheme();
  const status = row.status === 'valid'
    ? { label: 'Ready', bg: '#ECFDF5', fg: '#047857', icon: 'checkmark-circle-outline' as const }
    : row.status === 'unchanged'
      ? { label: 'Same', bg: '#FFFBEB', fg: '#B45309', icon: 'remove-circle-outline' as const }
      : { label: 'Invalid', bg: '#FEF2F2', fg: '#B91C1C', icon: 'alert-circle-outline' as const };
  return (
    <View style={[
      shared.previewRow,
      { backgroundColor: isDark ? '#111827' : '#FFFFFF', borderBottomColor: isDark ? '#334155' : '#E2E8F0' },
      row.status === 'invalid' && { backgroundColor: isDark ? '#2A171B' : '#FFF7F7' },
    ]}>
      <View style={shared.previewAdmission}>
        <Text style={shared.rowNumber}>ROW {row.row_number}</Text>
        <Text style={[shared.admissionText, { color: isDark ? '#E2E8F0' : '#0F172A' }]}>{row.admission_no || 'Missing'}</Text>
      </View>
      <View style={shared.previewValue}>
        <Text style={[shared.currentText, { color: isDark ? '#94A3B8' : '#64748B' }]} numberOfLines={1}>{row.current_value || '—'}</Text>
        <Ionicons name="arrow-forward" size={13} color="#94A3B8" />
        <Text style={[shared.newText, { color: isDark ? '#F8FAFC' : '#0F172A' }]} numberOfLines={1}>{row.new_value || (row.status === 'invalid' ? row.raw_value || '—' : 'Clear')}</Text>
        {row.error_message ? <Text style={shared.errorText}>{row.error_message}</Text> : null}
      </View>
      <View style={[shared.statusBadge, { backgroundColor: status.bg }]}>
        <Ionicons name={status.icon} size={14} color={status.fg} />
        <Text style={[shared.statusText, { color: status.fg }]}>{status.label}</Text>
      </View>
    </View>
  );
}

function SafetyItem({ text }: { text: string }) {
  const { isDark } = useTheme();
  return (
    <View style={shared.safetyItem}>
      <View style={shared.safetyCheck}><Ionicons name="checkmark" size={12} color="#047857" /></View>
      <Text style={[shared.safetyText, { color: isDark ? '#CBD5E1' : '#475569' }]}>{text}</Text>
    </View>
  );
}

const shared = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  headingIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  headingCopy: { flex: 1 },
  headingTitle: { color: '#0F172A', fontSize: 17, lineHeight: 22, fontWeight: '800' },
  headingSubtitle: { color: '#64748B', fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  stepMarker: { alignItems: 'center', minWidth: 80 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#CBD5E1' },
  stepCircleActive: { backgroundColor: '#4F46E5' },
  stepCircleComplete: { backgroundColor: '#059669' },
  stepNumber: { color: '#475569', fontSize: 12, fontWeight: '800', position: 'absolute' },
  stepNumberActive: { color: '#FFFFFF' },
  stepLabel: { color: '#64748B', fontSize: 11, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  stepLabelActive: { color: '#4338CA' },
  statBox: { flex: 1, minWidth: 90, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  statValue: { fontSize: 24, lineHeight: 28, fontWeight: '900' },
  statLabel: { color: '#64748B', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  previewRowInvalid: { backgroundColor: '#FFF7F7' },
  previewAdmission: { width: 130 },
  rowNumber: { fontSize: 9.5, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.4 },
  admissionText: { color: '#0F172A', fontSize: 13, fontWeight: '800', marginTop: 2 },
  previewValue: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  currentText: { color: '#64748B', fontSize: 12.5, maxWidth: '35%' },
  newText: { color: '#0F172A', fontSize: 12.5, fontWeight: '800', maxWidth: '40%' },
  errorText: { width: '100%', color: '#B91C1C', fontSize: 11, lineHeight: 16 },
  statusBadge: { width: 82, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  safetyItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  safetyCheck: { width: 19, height: 19, borderRadius: 9.5, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  safetyText: { flex: 1, color: '#475569', fontSize: 12.5, lineHeight: 19 },
});

const makeStyles = (isDark: boolean) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: isDark ? '#0B0F19' : '#F4F6FB' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: isDark ? '#CBD5E1' : '#475569', fontSize: 13, fontWeight: '600' },
  processingBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderBottomWidth: 1, borderBottomColor: isDark ? '#3730A3' : '#C7D2FE', paddingVertical: 9, paddingHorizontal: 16, zIndex: 10 },
  processingText: { color: isDark ? '#C7D2FE' : '#4338CA', fontSize: 12.5, fontWeight: '700' },
  page: { width: '100%', padding: 14, paddingBottom: 50, gap: 16 },
  pageWide: { maxWidth: 1280, alignSelf: 'center', padding: 24, gap: 20 },
  hero: { overflow: 'hidden', borderRadius: 20, padding: 18, minHeight: 190, borderWidth: 1, borderColor: isDark ? '#3730A3' : '#DDE4FF', flexDirection: 'column', gap: 12 },
  heroWide: { minHeight: 150, padding: 24, flexDirection: 'row', alignItems: 'center' },
  heroIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#4338CA', shadowOpacity: 0.13, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  heroCopy: { flex: 1 },
  heroEyebrow: { color: isDark ? '#A5B4FC' : '#4F46E5', fontSize: 10.5, fontWeight: '900', letterSpacing: 1.1, marginBottom: 5 },
  heroTitle: { color: isDark ? '#F8FAFC' : '#172554', fontSize: 22, lineHeight: 28, fontWeight: '900', letterSpacing: -0.4 },
  heroBody: { color: isDark ? '#C7D2FE' : '#475569', fontSize: 13, lineHeight: 20, marginTop: 5, maxWidth: 680 },
  limitPill: { alignSelf: 'flex-start', borderRadius: 999, backgroundColor: '#ECFDF5', paddingHorizontal: 11, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6 },
  limitText: { color: '#047857', fontSize: 10.5, fontWeight: '800' },
  stepRail: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 4 },
  stepRailWide: { paddingHorizontal: 100 },
  stepLine: { flex: 1, height: 2, backgroundColor: isDark ? '#334155' : '#CBD5E1', marginTop: 13, maxWidth: 180 },
  contentGrid: { gap: 16 },
  contentGridWide: { flexDirection: 'row', alignItems: 'flex-start' },
  card: { borderRadius: 20, backgroundColor: isDark ? '#151B2B' : '#FFFFFF', padding: 18, borderWidth: 1, borderColor: isDark ? '#273449' : '#E2E8F0', shadowColor: '#0F172A', shadowOpacity: isDark ? 0.25 : 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  mainCard: { flex: 1.6 },
  sideCard: { flex: 1 },
  fieldSelector: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: isDark ? '#4F46E5' : '#C7D2FE', backgroundColor: isDark ? '#1E1B4B' : '#F8FAFF', borderRadius: 15, padding: 13 },
  fieldIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#312E81' : '#EEF2FF' },
  fieldSelectorCopy: { flex: 1, minWidth: 0 },
  fieldSelectorLabel: { color: '#818CF8', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.8 },
  fieldSelectorValue: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 15, fontWeight: '900', marginTop: 2 },
  fieldSelectorRule: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  allowedBox: { marginTop: 10, borderRadius: 12, backgroundColor: isDark ? '#172033' : '#F8FAFC', padding: 11 },
  allowedTitle: { color: isDark ? '#CBD5E1' : '#334155', fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  allowedValues: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 11.5, lineHeight: 18, marginTop: 4 },
  divider: { height: 1, backgroundColor: isDark ? '#273449' : '#E2E8F0', marginVertical: 20 },
  uploadBox: { minHeight: 126, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: isDark ? '#475569' : '#A5B4FC', backgroundColor: isDark ? '#101827' : '#FAFBFF', alignItems: 'center', justifyContent: 'center', padding: 16 },
  uploadGlyph: { width: 48, height: 48, borderRadius: 16, backgroundColor: isDark ? '#312E81' : '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  uploadGlyphReady: { backgroundColor: '#ECFDF5' },
  uploadTitle: { color: isDark ? '#E2E8F0' : '#1E293B', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  uploadHint: { color: '#64748B', fontSize: 11.5, marginTop: 4, textAlign: 'center' },
  clearRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#111827' : '#F8FAFC' },
  clearRowActive: { borderColor: '#F59E0B', backgroundColor: isDark ? '#2A1E0C' : '#FFFBEB' },
  clearIcon: { width: 34, alignItems: 'center' },
  clearCopy: { flex: 1 },
  clearTitle: { color: isDark ? '#E2E8F0' : '#1E293B', fontSize: 12.5, fontWeight: '800' },
  clearHint: { color: '#64748B', fontSize: 10.5, lineHeight: 15, marginTop: 2 },
  primaryButton: { minHeight: 48, borderRadius: 14, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 18, marginTop: 16 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
  buttonDisabled: { opacity: 0.42 },
  sideEyebrow: { color: '#4F46E5', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.9 },
  sideTitle: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 18, lineHeight: 24, fontWeight: '900', marginTop: 6 },
  sideText: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 12.5, lineHeight: 19, marginTop: 6 },
  templateButton: { marginTop: 16, borderRadius: 13, backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderWidth: 1, borderColor: isDark ? '#3730A3' : '#C7D2FE', minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  templateButtonText: { color: isDark ? '#C7D2FE' : '#4338CA', fontSize: 12, fontWeight: '800', flexShrink: 1 },
  safetyList: { gap: 10, marginTop: 18 },
  scopeNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 13, backgroundColor: isDark ? '#0C2A3B' : '#F0F9FF', padding: 11, marginTop: 18 },
  scopeText: { flex: 1, color: isDark ? '#BAE6FD' : '#075985', fontSize: 11, lineHeight: 17 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  truncatedNote: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 11, padding: 9, backgroundColor: '#EFF6FF', marginBottom: 10 },
  truncatedText: { color: '#1D4ED8', fontSize: 11.5, fontWeight: '600' },
  tableHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  tableHeadText: { color: isDark ? '#CBD5E1' : '#475569', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.45 },
  tableAdmission: { width: 130 },
  tableValue: { flex: 1 },
  tableStatus: { width: 82, textAlign: 'center' },
  rowList: { borderWidth: 1, borderTopWidth: 0, borderColor: isDark ? '#334155' : '#E2E8F0', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: 'hidden' },
  previewActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 16 },
  secondaryButton: { minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: isDark ? '#475569' : '#CBD5E1', backgroundColor: isDark ? '#1E293B' : '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14 },
  secondaryButtonText: { color: isDark ? '#CBD5E1' : '#475569', fontSize: 12, fontWeight: '800' },
  errorButton: { minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14 },
  errorButtonText: { color: '#B91C1C', fontSize: 12, fontWeight: '800' },
  commitButton: { marginTop: 0, minWidth: 210 },
  completeCard: { alignItems: 'center', paddingVertical: 38 },
  successIcon: { width: 82, height: 82, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D1FAE5', marginBottom: 18 },
  completeEyebrow: { color: '#059669', fontSize: 10.5, fontWeight: '900', letterSpacing: 1.1 },
  completeTitle: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 24, lineHeight: 30, fontWeight: '900', textAlign: 'center', marginTop: 6 },
  completeBody: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 620, marginTop: 8 },
  completeActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 22 },
  finishButton: { marginTop: 0, minHeight: 44 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.58)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  pickerCard: { width: '100%', maxWidth: 720, maxHeight: '84%', borderRadius: 22, backgroundColor: isDark ? '#151B2B' : '#FFFFFF', overflow: 'hidden' },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: isDark ? '#334155' : '#E2E8F0' },
  pickerEyebrow: { color: '#4F46E5', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.9 },
  pickerTitle: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 18, fontWeight: '900', marginTop: 3 },
  closeButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#1E293B' : '#F1F5F9' },
  fieldGrid: { padding: 14, gap: 8 },
  fieldOption: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 14, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#111827' : '#FFFFFF' },
  fieldOptionActive: { borderColor: '#818CF8', backgroundColor: isDark ? '#1E1B4B' : '#F5F3FF' },
  fieldOptionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#312E81' : '#EEF2FF' },
  fieldOptionIconActive: { backgroundColor: '#4F46E5' },
  fieldOptionCopy: { flex: 1 },
  fieldOptionTitle: { color: isDark ? '#E2E8F0' : '#1E293B', fontSize: 13.5, fontWeight: '800' },
  fieldOptionTitleActive: { color: isDark ? '#FFFFFF' : '#312E81' },
  fieldOptionRule: { color: '#64748B', fontSize: 10.5, lineHeight: 15, marginTop: 2 },
});
