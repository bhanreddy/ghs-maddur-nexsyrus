import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import AppDatePicker from '@/src/components/AppDatePicker';

import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Platform, Switch } from 'react-native';
import { alertCompat } from '../../../src/utils/crossPlatformAlert';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../../src/components/AdminHeader';
import { ADMIN_THEME } from '../../../src/constants/adminTheme';
import { ClassService, AcademicYear, ClassSection } from '../../../src/services/classService';
import { FeeService, FeeType } from '../../../src/services/feeService';
import { api } from '../../../src/services/apiClient';
import { Class } from '../../../src/types/schema';
import { FeeMode, FeeStructure } from '../../../src/types/models';
import { useTheme } from '../../../src/hooks/useTheme';
import { Theme } from '../../../src/theme/themes';
import LogoLoader from '../../../src/components/LogoLoader';

export default function SetClassFeeScreen() {
  const { theme, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [feeMode, setFeeMode] = useState<FeeMode>('per_class');
  const [pendingFeeMode, setPendingFeeMode] = useState<FeeMode | null>(null);
  const loadFeeModeSeq = useRef(0);
  const displayFeeMode = pendingFeeMode ?? feeMode;
  const [missingSections, setMissingSections] = useState<any[]>([]);
  const [configuredFees, setConfiguredFees] = useState<FeeStructure[]>([]);
  const [listClassFilter, setListClassFilter] = useState('');

  const [classes, setClasses] = useState<Class[]>([]);
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [amount, setAmount] = useState('');
  const [feeTypeId, setFeeTypeId] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedYearId, setSelectedYearId] = useState('');

  const [showAddType, setShowAddType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeNameTe, setNewTypeNameTe] = useState('');
  const [addingType, setAddingType] = useState(false);

  const sectionsForClass = useMemo(() => {
    if (!selectedClassId || !selectedYearId) return [];
    return classSections.filter(
      (cs) => cs.class_id === selectedClassId && cs.academic_year_id === selectedYearId
    );
  }, [classSections, selectedClassId, selectedYearId]);

  const loadFeeMode = useCallback(async (yearId?: string) => {
    const seq = ++loadFeeModeSeq.current;
    try {
      const [mode, result] = await Promise.all([
        FeeService.getFeeMode(),
        FeeService.listStructures(yearId),
      ]);
      if (seq !== loadFeeModeSeq.current) return;

      const structures = result.structures ?? [];
      const hasSectionRows = structures.some((s) => s.section_id);
      const resolvedMode: FeeMode =
        mode === 'per_section' || hasSectionRows ? 'per_section' : 'per_class';

      setFeeMode(resolvedMode);
      setMissingSections(result.missing_sections ?? []);
      setConfiguredFees(structures);
    } catch {
      if (seq !== loadFeeModeSeq.current) return;
      const mode = await FeeService.getFeeMode().catch(() => 'per_class' as FeeMode);
      if (seq !== loadFeeModeSeq.current) return;
      setFeeMode(mode);
    }
  }, []);

  useEffect(() => { loadInitialData(); }, []);

  useEffect(() => {
    if (!selectedClassId || !selectedYearId || !feeTypeId) return;

    let cancelled = false;
    const defaultDue = new Date().toISOString().split('T')[0];
    setAmount('');
    setDueDate(defaultDue);

    (async () => {
      try {
        const sectionArg = displayFeeMode === 'per_section' ? selectedSectionId || undefined : undefined;
        const structures = await FeeService.getStructureByClass(
          selectedClassId,
          selectedYearId,
          sectionArg
        );
        if (cancelled) return;
        const match = structures.find((s) => String(s.fee_type_id) === String(feeTypeId));
        if (match) {
          setAmount(String(match.amount ?? ''));
          if (match.due_date) setDueDate(String(match.due_date).split('T')[0]);
        }
      } catch {
        // form stays cleared
      }
    })();

    return () => { cancelled = true; };
  }, [selectedClassId, selectedYearId, feeTypeId, selectedSectionId, displayFeeMode]);

  useEffect(() => {
    if (!selectedYearId) return;
    ClassService.getClassSections(selectedYearId)
      .then(setClassSections)
      .catch(() => setClassSections([]));
    void loadFeeMode(selectedYearId);
  }, [selectedYearId, loadFeeMode]);

  useEffect(() => {
    if (displayFeeMode !== 'per_section') {
      setSelectedSectionId('');
      return;
    }
    if (sectionsForClass.length === 0) {
      setSelectedSectionId('');
      return;
    }
    if (!sectionsForClass.some((s) => s.section_id === selectedSectionId)) {
      setSelectedSectionId(sectionsForClass[0].section_id);
    }
  }, [displayFeeMode, sectionsForClass, selectedSectionId]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [classesData, typesData, yearsData] = await Promise.all([
        ClassService.getClasses(),
        api.get<FeeType[]>('/fees/types'),
        ClassService.getAcademicYears(),
      ]);
      setClasses(classesData);
      setFeeTypes(typesData);
      setAcademicYears(yearsData);
      if (yearsData.length > 0) {
        const current = yearsData.find((y) => {
          const now = new Date();
          return new Date(y.start_date) <= now && new Date(y.end_date) >= now;
        });
        setSelectedYearId(current?.id || yearsData[0].id);
      }
    } catch {
      alertCompat('Error', 'Failed to load configuration data');
    } finally {
      setLoading(false);
    }
  };

  const confirmFeeModeChange = (nextMode: FeeMode) => {
    if (nextMode === feeMode) {
      setPendingFeeMode(null);
      return;
    }

    setPendingFeeMode(nextMode);

    if (nextMode === 'per_section') {
      alertCompat(
        'Switch to Per Section?',
        'Class fees are copied to each section so you can edit sections individually. Paid amounts carry over and class fees are kept hidden — switch back any time to restore them. Continue?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setPendingFeeMode(null) },
          { text: 'Continue', onPress: () => void applyFeeModeChange('per_section') },
        ]
      );
      return;
    }

    alertCompat(
      'Switch to Per Class?',
      'One fee applies to the whole class. Paid amounts carry over and your section fees are kept hidden — switch back any time to restore them.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setPendingFeeMode(null) },
        { text: 'Switch', onPress: () => void applyFeeModeChange('per_class') },
      ]
    );
  };

  const applyFeeModeChange = async (nextMode: FeeMode) => {
    try {
      setModeSaving(true);
      const result = await FeeService.setFeeMode(nextMode);
      setFeeMode(result.fee_mode);
      setPendingFeeMode(null);
      await loadFeeMode(selectedYearId);
      const migrationNote =
        result.migration ??
        (nextMode === 'per_section'
          ? `Per-section mode enabled. ${result.seeded_count ?? 0} section fee(s) added; paid amounts preserved.`
          : 'Per-class mode enabled. Paid amounts preserved.');
      alertCompat('Success', migrationNote);
    } catch (error: any) {
      setPendingFeeMode(null);
      alertCompat('Error', error?.message || error?.response?.data?.error || 'Failed to update fee mode');
    } finally {
      setModeSaving(false);
    }
  };

  const handleAddFeeType = async () => {
    const trimmed = newTypeName.trim();
    if (!trimmed) { alertCompat('Error', 'Please enter a fee type name'); return; }
    try {
      setAddingType(true);
      const payload: any = { name: trimmed };
      if (newTypeNameTe.trim()) payload.name_te = newTypeNameTe.trim();
      const created = await api.post<FeeType>('/fees/types', payload);
      setFeeTypes((prev) => [...prev, created]);
      setFeeTypeId(created.id);
      setNewTypeName('');
      setNewTypeNameTe('');
      setShowAddType(false);
    } catch (error: any) {
      alertCompat('Error', error.response?.data?.error || error.message || 'Failed to create fee type');
    } finally {
      setAddingType(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedClassId || !amount || !feeTypeId || !selectedYearId) {
      alertCompat('Error', 'Please fill all required fields');
      return;
    }
    if (pendingFeeMode && pendingFeeMode !== feeMode) {
      alertCompat('Error', 'Please confirm the fee mode change before saving fees.');
      return;
    }
    if (feeMode === 'per_section' && !selectedSectionId) {
      alertCompat('Error', 'Please select a section');
      return;
    }
    try {
      setSubmitting(true);
      await FeeService.createStructure({
        class_id: selectedClassId,
        amount: Number(amount),
        fee_type_id: feeTypeId,
        due_date: dueDate,
        academic_year_id: selectedYearId,
        ...(feeMode === 'per_section' ? { section_id: selectedSectionId } : {}),
      });
      await loadFeeMode(selectedYearId);
      alertCompat('Success', 'Fee structure saved successfully');
    } catch (error: any) {
      alertCompat('Error', error?.message || error?.response?.data?.error || 'Failed to save fee structure');
    } finally {
      setSubmitting(false);
    }
  };

  const missingForSelection = missingSections.filter(
    (m) =>
      (!selectedClassId || m.class_id === selectedClassId) &&
      (!selectedYearId || m.academic_year_id === selectedYearId)
  );

  const filteredConfiguredFees = useMemo(() => {
    let rows = configuredFees.filter((f) => !selectedYearId || f.academic_year_id === selectedYearId);
    if (listClassFilter) {
      rows = rows.filter((f) => f.class_id === listClassFilter);
    }
    return rows.sort((a, b) => {
      const classCmp = (a.class_name ?? '').localeCompare(b.class_name ?? '');
      if (classCmp !== 0) return classCmp;
      const secCmp = (a.section_name ?? '').localeCompare(b.section_name ?? '');
      if (secCmp !== 0) return secCmp;
      return (a.fee_type ?? '').localeCompare(b.fee_type ?? '');
    });
  }, [configuredFees, selectedYearId, listClassFilter]);

  const formatDueDate = (value?: string) => {
    if (!value) return '—';
    const datePart = String(value).split('T')[0];
    const [y, m, d] = datePart.split('-');
    if (!y || !m || !d) return datePart;
    return `${d}/${m}/${y}`;
  };

  const formatAmount = (value: number | string) =>
    `₹${Number(value).toLocaleString('en-IN')}`;

  const handleDeleteFee = (fee: FeeStructure) => {
    const label = `${fee.class_name ?? 'Class'}${
      feeMode === 'per_section' && fee.section_name ? ` · ${fee.section_name}` : ''
    } · ${fee.fee_type ?? 'Fee'}`;
    alertCompat(
      'Delete Fee Structure?',
      `Remove "${label}" (${formatAmount(fee.amount)})? Unpaid student fees for it will be removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setDeletingId(fee.id);
                await FeeService.deleteStructure(fee.id);
                await loadFeeMode(selectedYearId);
                alertCompat('Deleted', 'Fee structure removed successfully');
              } catch (error: any) {
                alertCompat(
                  'Error',
                  error?.response?.data?.error || error?.message || 'Failed to delete fee structure'
                );
              } finally {
                setDeletingId(null);
              }
            })();
          },
        },
      ]
    );
  };

  const handleSelectConfiguredFee = (fee: FeeStructure) => {
    setSelectedClassId(fee.class_id);
    setFeeTypeId(fee.fee_type_id);
    if (feeMode === 'per_section' && fee.section_id) {
      setSelectedSectionId(fee.section_id);
    }
    setAmount(String(fee.amount ?? ''));
    if (fee.due_date) setDueDate(String(fee.due_date).split('T')[0]);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AdminHeader title="Set Class Fee" showBackButton />
        <View style={styles.loaderWrap}>
          <LogoLoader />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AdminHeader title="Set Class Fee" showBackButton />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Fee Mode</Text>
          <View style={styles.modeRow}>
            <View style={styles.modeLabels}>
              <Text style={[styles.modeLabel, displayFeeMode === 'per_class' && styles.modeLabelActive]}>
                Per Class
              </Text>
              <Text style={[styles.modeHint, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                One fee applies to all sections
              </Text>
            </View>
            <Switch
              value={displayFeeMode === 'per_section'}
              onValueChange={(on) => confirmFeeModeChange(on ? 'per_section' : 'per_class')}
              disabled={modeSaving}
              trackColor={{ false: '#CBD5E1', true: ADMIN_THEME.colors.primary }}
            />
            <View style={styles.modeLabels}>
              <Text style={[styles.modeLabel, displayFeeMode === 'per_section' && styles.modeLabelActive]}>
                Per Section
              </Text>
              <Text style={[styles.modeHint, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                Different fees per section
              </Text>
            </View>
          </View>
          {modeSaving ? (
            <View style={styles.modeSavingRow}>
              <LogoLoader size={16} />
              <Text style={styles.modeSavingText}>Updating fee mode…</Text>
            </View>
          ) : null}
        </View>

        {displayFeeMode === 'per_section' && missingForSelection.length > 0 ? (
          <View style={[styles.card, styles.warningCard]}>
            <View style={styles.warningHeader}>
              <Ionicons name="warning-outline" size={18} color="#D97706" />
              <Text style={styles.warningTitle}>Missing section fees</Text>
            </View>
            <Text style={styles.warningBody}>
              Some sections have students but no per-section fee configured yet. They will fall back to class-level fees until set.
            </Text>
            {missingForSelection.slice(0, 5).map((m) => (
              <Text key={`${m.section_id}-${m.fee_type_id}`} style={styles.warningItem}>
                {m.class_name} · {m.section_name} · {m.fee_type}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Fee Details</Text>

          <Text style={styles.label}>Select Class</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {classes.map((cls) => (
              <TouchableOpacity
                key={cls.id}
                style={[styles.chip, selectedClassId === cls.id && styles.chipActive]}
                onPress={() => setSelectedClassId(cls.id)}
              >
                <Text style={[styles.chipText, selectedClassId === cls.id && styles.chipTextActive]}>
                  {cls.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {displayFeeMode === 'per_section' ? (
            <>
              <Text style={styles.label}>Select Section</Text>
              {sectionsForClass.length === 0 ? (
                <Text style={styles.emptyHint}>No sections for this class in the selected year.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {sectionsForClass.map((cs) => (
                    <TouchableOpacity
                      key={cs.id}
                      style={[styles.chip, selectedSectionId === cs.section_id && styles.chipActive]}
                      onPress={() => setSelectedSectionId(cs.section_id)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selectedSectionId === cs.section_id && styles.chipTextActive,
                        ]}
                      >
                        {cs.section_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </>
          ) : null}

          <Text style={styles.label}>Fee Type</Text>
          <View style={styles.typeGrid}>
            {feeTypes.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[styles.typeChip, feeTypeId === type.id && styles.typeChipActive]}
                onPress={() => setFeeTypeId(type.id)}
              >
                <Text style={[styles.typeChipText, feeTypeId === type.id && styles.typeChipTextActive]}>
                  {type.name}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.addTypeChip} onPress={() => setShowAddType(true)}>
              <Ionicons name="add" size={14} color={ADMIN_THEME.colors.primary} />
              <Text style={styles.addTypeChipText}>Add Type</Text>
            </TouchableOpacity>
          </View>

          <Modal transparent visible={showAddType} onRequestClose={() => setShowAddType(false)} animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>New Fee Type</Text>
                  <TouchableOpacity
                    onPress={() => { setShowAddType(false); setNewTypeName(''); setNewTypeNameTe(''); }}
                    style={styles.modalClose}
                  >
                    <Ionicons name="close" size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalHint}>e.g. Tuition Fee, Lab Fee, Transport, Exam Fee</Text>
                <AppTextInput
                  style={styles.modalInput}
                  value={newTypeName}
                  onChangeText={setNewTypeName}
                  placeholder="Enter fee type name"
                  placeholderTextColor="#94A3B8"
                  autoFocus
                />
                <AppTextInput
                  style={styles.modalInput}
                  value={newTypeNameTe}
                  onChangeText={setNewTypeNameTe}
                  placeholder="Telugu Name (optional)"
                  placeholderTextColor="#94A3B8"
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => { setShowAddType(false); setNewTypeName(''); setNewTypeNameTe(''); }}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSaveBtn, !newTypeName.trim() && { opacity: 0.5 }]}
                    onPress={handleAddFeeType}
                    disabled={addingType || !newTypeName.trim()}
                  >
                    {addingType ? (
                      <LogoLoader color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="add-circle-outline" size={16} color="#fff" />
                        <Text style={styles.modalSaveText}>Create</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <Text style={styles.label}>Amount (₹)</Text>
          <AppTextInput
            key={`${selectedClassId}-${selectedSectionId}-${selectedYearId}-${feeTypeId}`}
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="Enter amount"
            keyboardType="numeric"
            placeholderTextColor="#94A3B8"
          />

          <AppDatePicker
            label="Due Date"
            value={dueDate}
            onChange={setDueDate}
            isDark={isDark}
            containerStyle={{ marginBottom: 16 }}
          />

          <Text style={styles.label}>Academic Year</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {academicYears.map((ay) => (
              <TouchableOpacity
                key={ay.id}
                style={[styles.chip, selectedYearId === ay.id && styles.chipActive]}
                onPress={() => setSelectedYearId(ay.id)}
              >
                <Text style={[styles.chipText, selectedYearId === ay.id && styles.chipTextActive]}>
                  {ay.code}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
            {submitting ? <LogoLoader color="#fff" /> : <Text style={styles.submitBtnText}>Save Fee Structure</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.listHeaderRow}>
            <Text style={styles.sectionTitle}>Configured Fees</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{filteredConfiguredFees.length}</Text>
            </View>
          </View>
          <Text style={styles.listSubtitle}>
            Fees already set for{' '}
            {academicYears.find((y) => y.id === selectedYearId)?.code ?? 'this year'}
            {displayFeeMode === 'per_section' ? ' (per section)' : ' (per class)'}
          </Text>

          <Text style={styles.label}>Filter by Class</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            <TouchableOpacity
              style={[styles.chip, !listClassFilter && styles.chipActive]}
              onPress={() => setListClassFilter('')}
            >
              <Text style={[styles.chipText, !listClassFilter && styles.chipTextActive]}>All</Text>
            </TouchableOpacity>
            {classes.map((cls) => (
              <TouchableOpacity
                key={`filter-${cls.id}`}
                style={[styles.chip, listClassFilter === cls.id && styles.chipActive]}
                onPress={() => setListClassFilter(cls.id)}
              >
                <Text style={[styles.chipText, listClassFilter === cls.id && styles.chipTextActive]}>
                  {cls.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {filteredConfiguredFees.length === 0 ? (
            <View style={styles.emptyList}>
              <Ionicons name="receipt-outline" size={28} color="#94A3B8" />
              <Text style={styles.emptyListTitle}>No fees configured yet</Text>
              <Text style={styles.emptyListHint}>
                Set a fee above and it will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.feeList}>
              {filteredConfiguredFees.map((fee) => (
                <TouchableOpacity
                  key={fee.id}
                  style={styles.feeRow}
                  onPress={() => handleSelectConfiguredFee(fee)}
                  activeOpacity={0.7}
                >
                  <View style={styles.feeRowMain}>
                    <Text style={styles.feeRowClass}>
                      {fee.class_name ?? 'Class'}
                      {displayFeeMode === 'per_section' && fee.section_name ? ` · ${fee.section_name}` : ''}
                    </Text>
                    <Text style={styles.feeRowType}>{fee.fee_type ?? 'Fee'}</Text>
                  </View>
                  <View style={styles.feeRowMeta}>
                    <Text style={styles.feeRowAmount}>{formatAmount(fee.amount)}</Text>
                    <Text style={styles.feeRowDue}>Due {formatDueDate(fee.due_date)}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.feeRowDelete}
                    onPress={() => handleDeleteFee(fee)}
                    disabled={deletingId === fee.id}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {deletingId === fee.id ? (
                      <LogoLoader size={16} />
                    ) : (
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (theme: Theme, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 20, gap: 16 },
    card: {
      backgroundColor: isDark ? '#1E293B' : '#fff',
      borderRadius: 16,
      padding: 20,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
        android: { elevation: 3 },
      }),
    },
    warningCard: {
      borderWidth: 1,
      borderColor: 'rgba(217,119,6,0.35)',
      backgroundColor: isDark ? 'rgba(217,119,6,0.08)' : '#FFFBEB',
    },
    warningHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    warningTitle: { fontSize: 14, fontWeight: '700', color: '#D97706' },
    warningBody: { fontSize: 12, color: isDark ? '#FCD34D' : '#92400E', marginBottom: 8, lineHeight: 18 },
    warningItem: { fontSize: 12, color: isDark ? '#FDE68A' : '#B45309', marginTop: 2 },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: isDark ? '#F1F5F9' : '#1E293B',
      marginBottom: 16,
      letterSpacing: -0.3,
    },
    modeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    modeLabels: { flex: 1 },
    modeLabel: { fontSize: 14, fontWeight: '600', color: isDark ? '#94A3B8' : '#64748B' },
    modeLabelActive: { color: ADMIN_THEME.colors.primary, fontWeight: '800' },
    modeHint: { fontSize: 11, marginTop: 2 },
    modeSavingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    modeSavingText: { fontSize: 12, color: isDark ? '#94A3B8' : '#64748B' },
    label: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#94A3B8' : '#475569',
      marginBottom: 8,
      marginTop: 16,
    },
    emptyHint: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic' },
    input: {
      backgroundColor: isDark ? '#334155' : '#F8FAFC',
      borderWidth: 1,
      borderColor: isDark ? '#475569' : '#E2E8F0',
      borderRadius: 10,
      padding: 12,
      fontSize: 15,
      color: isDark ? '#F1F5F9' : '#1E293B',
    },
    chipScroll: { flexDirection: 'row', marginBottom: 4 },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: isDark ? '#334155' : '#F1F5F9',
      marginRight: 8,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    chipActive: {
      backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : '#EEF2FF',
      borderColor: ADMIN_THEME.colors.primary,
    },
    chipText: { fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', fontWeight: '600' },
    chipTextActive: { color: ADMIN_THEME.colors.primary, fontWeight: '700' },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    typeChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: isDark ? '#334155' : '#F8FAFC',
      borderWidth: 1.5,
      borderColor: isDark ? '#475569' : '#E2E8F0',
    },
    typeChipActive: {
      backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : '#EEF2FF',
      borderColor: ADMIN_THEME.colors.primary,
    },
    typeChipText: { fontSize: 13, fontWeight: '600', color: isDark ? '#94A3B8' : '#64748B' },
    typeChipTextActive: { color: ADMIN_THEME.colors.primary, fontWeight: '700' },
    addTypeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: ADMIN_THEME.colors.primary,
      borderStyle: 'dashed',
      backgroundColor: isDark ? 'rgba(99,102,241,0.08)' : '#F5F3FF',
    },
    addTypeChipText: { fontSize: 12, fontWeight: '700', color: ADMIN_THEME.colors.primary },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(10,14,30,0.55)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalCard: {
      width: '85%',
      backgroundColor: isDark ? '#1E293B' : '#fff',
      borderRadius: 20,
      padding: 22,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: isDark ? '#F1F5F9' : '#1E293B',
      letterSpacing: -0.3,
    },
    modalClose: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: isDark ? '#334155' : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalHint: { fontSize: 12, color: '#94A3B8', marginBottom: 14 },
    modalInput: {
      borderWidth: 1,
      borderColor: isDark ? '#475569' : '#E2E8F0',
      borderRadius: 10,
      padding: 12,
      fontSize: 15,
      color: isDark ? '#F1F5F9' : '#1E293B',
      backgroundColor: isDark ? '#334155' : '#F8FAFC',
      marginBottom: 16,
    },
    modalActions: { flexDirection: 'row', gap: 8 },
    modalCancelBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      paddingVertical: 12,
      backgroundColor: isDark ? '#334155' : '#F1F5F9',
      borderWidth: 1,
      borderColor: isDark ? '#475569' : '#E2E8F0',
    },
    modalCancelText: { fontSize: 14, fontWeight: '600', color: isDark ? '#94A3B8' : '#64748B' },
    modalSaveBtn: {
      flex: 1.5,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: ADMIN_THEME.colors.primary,
      borderRadius: 10,
      paddingVertical: 12,
    },
    modalSaveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    submitBtn: {
      backgroundColor: ADMIN_THEME.colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 26,
    },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    listHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    listSubtitle: {
      fontSize: 12,
      color: isDark ? '#64748B' : '#94A3B8',
      marginBottom: 4,
      lineHeight: 18,
    },
    countBadge: {
      minWidth: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(99,102,241,0.2)' : '#EEF2FF',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    countBadgeText: {
      fontSize: 13,
      fontWeight: '800',
      color: ADMIN_THEME.colors.primary,
    },
    emptyList: {
      alignItems: 'center',
      paddingVertical: 28,
      gap: 6,
    },
    emptyListTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: isDark ? '#94A3B8' : '#64748B',
      marginTop: 4,
    },
    emptyListHint: {
      fontSize: 12,
      color: '#94A3B8',
      textAlign: 'center',
    },
    feeList: { marginTop: 8, gap: 8 },
    feeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 14,
      borderRadius: 12,
      backgroundColor: isDark ? '#334155' : '#F8FAFC',
      borderWidth: 1,
      borderColor: isDark ? '#475569' : '#E2E8F0',
    },
    feeRowMain: { flex: 1 },
    feeRowClass: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#F1F5F9' : '#1E293B',
      marginBottom: 2,
    },
    feeRowType: {
      fontSize: 12,
      color: isDark ? '#94A3B8' : '#64748B',
      fontWeight: '600',
    },
    feeRowMeta: { alignItems: 'flex-end' },
    feeRowAmount: {
      fontSize: 14,
      fontWeight: '800',
      color: ADMIN_THEME.colors.primary,
    },
    feeRowDue: {
      fontSize: 11,
      color: '#94A3B8',
      marginTop: 2,
    },
    feeRowDelete: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
    },
  });
