import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import AppDatePicker from '@/src/components/AppDatePicker';

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Platform,
  Pressable,
} from 'react-native';
import KeyboardAwareScreen from '@/components/keyboard/KeyboardAwareScreen';
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
import { Theme, Elevation, Radii, Spacing } from '../../../src/theme/themes';
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
  const [showTypeOrder, setShowTypeOrder] = useState(false);

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
  const [reorderingTypes, setReorderingTypes] = useState(false);

  const sortedFeeTypes = useMemo(
    () =>
      [...feeTypes].sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
      ),
    [feeTypes]
  );

  const sectionsForClass = useMemo(() => {
    if (!selectedClassId || !selectedYearId) return [];
    return classSections.filter(
      (cs) => cs.class_id === selectedClassId && cs.academic_year_id === selectedYearId
    );
  }, [classSections, selectedClassId, selectedYearId]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId),
    [classes, selectedClassId]
  );
  const selectedFeeType = useMemo(
    () => sortedFeeTypes.find((t) => t.id === feeTypeId),
    [sortedFeeTypes, feeTypeId]
  );
  const selectedSection = useMemo(
    () => sectionsForClass.find((s) => s.section_id === selectedSectionId),
    [sectionsForClass, selectedSectionId]
  );
  const selectedYear = useMemo(
    () => academicYears.find((y) => y.id === selectedYearId),
    [academicYears, selectedYearId]
  );

  const formReady = Boolean(
    selectedClassId &&
      amount &&
      feeTypeId &&
      selectedYearId &&
      !(displayFeeMode === 'per_section' && !selectedSectionId) &&
      !(pendingFeeMode && pendingFeeMode !== feeMode)
  );

  const missingFieldHint = useMemo(() => {
    if (!selectedYearId) return 'Select an academic year';
    if (!selectedClassId) return 'Select a class';
    if (displayFeeMode === 'per_section' && !selectedSectionId) return 'Select a section';
    if (!feeTypeId) return 'Select a fee type';
    if (!amount) return 'Enter an amount';
    if (pendingFeeMode && pendingFeeMode !== feeMode) return 'Confirm fee mode change first';
    return null;
  }, [
    selectedYearId,
    selectedClassId,
    displayFeeMode,
    selectedSectionId,
    feeTypeId,
    amount,
    pendingFeeMode,
    feeMode,
  ]);

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

  useEffect(() => {
    loadInitialData();
  }, []);

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

    return () => {
      cancelled = true;
    };
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

  const handleMoveFeeType = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sortedFeeTypes.length) return;
    const reordered = [...sortedFeeTypes];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    setReorderingTypes(true);
    try {
      const updated = await FeeService.reorderFeeTypes(reordered.map((t) => t.id));
      setFeeTypes(updated);
    } catch (error: any) {
      alertCompat('Error', error.message || error?.response?.data?.error || 'Failed to update fee type order');
    } finally {
      setReorderingTypes(false);
    }
  };

  const handleAddFeeType = async () => {
    const trimmed = newTypeName.trim();
    if (!trimmed) {
      alertCompat('Error', 'Please enter a fee type name');
      return;
    }
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

  const selectionSummary = [
    selectedYear?.code,
    selectedClass?.name,
    displayFeeMode === 'per_section' ? selectedSection?.section_name : null,
    selectedFeeType?.name,
  ]
    .filter(Boolean)
    .join(' · ');

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
      <TourTarget id="screen.admin-fees-set-class-fee.overview"><AdminHeader title="Set Class Fee" showBackButton /></TourTarget>
      <TourTarget id="screen.admin-fees-set-class-fee.workspace" style={{ flex: 1 }}><KeyboardAwareScreen variant="scroll" contentContainerStyle={styles.content} bottomOffset={24}>
        {/* Context: Academic Year */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.iconBadge}>
                <Ionicons name="calendar-outline" size={16} color={ADMIN_THEME.colors.primary} />
              </View>
              <View>
                <Text style={styles.sectionTitle}>Academic Year</Text>
                <Text style={styles.sectionHint}>Fees are scoped to the year you select</Text>
              </View>
            </View>
          </View>
          <View style={styles.chipWrap}>
            {academicYears.map((ay) => {
              const active = selectedYearId === ay.id;
              return (
                <TouchableOpacity
                  key={ay.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSelectedYearId(ay.id)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{ay.code}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Fee Mode — segmented */}
        <View style={styles.card}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.iconBadge}>
              <Ionicons name="layers-outline" size={16} color={ADMIN_THEME.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Fee Mode</Text>
              <Text style={styles.sectionHint}>How fees apply across sections</Text>
            </View>
          </View>

          <View style={styles.segmented}>
            <Pressable
              onPress={() => confirmFeeModeChange('per_class')}
              disabled={modeSaving}
              style={[styles.segmentBtn, displayFeeMode === 'per_class' && styles.segmentBtnActive]}
            >
              <Ionicons
                name="school-outline"
                size={18}
                color={displayFeeMode === 'per_class' ? ADMIN_THEME.colors.primary : theme.colors.textTertiary}
              />
              <Text
                style={[
                  styles.segmentLabel,
                  displayFeeMode === 'per_class' && styles.segmentLabelActive,
                ]}
              >
                Per Class
              </Text>
              <Text
                style={[
                  styles.segmentDesc,
                  displayFeeMode === 'per_class' && styles.segmentDescActive,
                ]}
              >
                One fee for all sections
              </Text>
            </Pressable>
            <Pressable
              onPress={() => confirmFeeModeChange('per_section')}
              disabled={modeSaving}
              style={[styles.segmentBtn, displayFeeMode === 'per_section' && styles.segmentBtnActive]}
            >
              <Ionicons
                name="grid-outline"
                size={18}
                color={displayFeeMode === 'per_section' ? ADMIN_THEME.colors.primary : theme.colors.textTertiary}
              />
              <Text
                style={[
                  styles.segmentLabel,
                  displayFeeMode === 'per_section' && styles.segmentLabelActive,
                ]}
              >
                Per Section
              </Text>
              <Text
                style={[
                  styles.segmentDesc,
                  displayFeeMode === 'per_section' && styles.segmentDescActive,
                ]}
              >
                Different fees per section
              </Text>
            </Pressable>
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
              <View style={styles.warningIconWrap}>
                <Ionicons name="warning-outline" size={16} color="#D97706" />
              </View>
              <Text style={styles.warningTitle}>Missing section fees</Text>
            </View>
            <Text style={styles.warningBody}>
              Some sections have students but no per-section fee yet. They fall back to class-level
              fees until set.
            </Text>
            {missingForSelection.slice(0, 5).map((m) => (
              <Text key={`${m.section_id}-${m.fee_type_id}`} style={styles.warningItem}>
                · {m.class_name} · {m.section_name} · {m.fee_type}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Fee Type Order — collapsed by default */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.collapseHeader}
            onPress={() => setShowTypeOrder((v) => !v)}
            activeOpacity={0.75}
          >
            <View style={styles.cardHeaderLeft}>
              <View style={styles.iconBadge}>
                <Ionicons name="swap-vertical-outline" size={16} color={ADMIN_THEME.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitleNoMargin}>Fee Type Order</Text>
                <Text style={styles.sectionHint}>
                  {sortedFeeTypes.length} type{sortedFeeTypes.length === 1 ? '' : 's'} · ledger display
                </Text>
              </View>
            </View>
            <Ionicons
              name={showTypeOrder ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.colors.textTertiary}
            />
          </TouchableOpacity>

          {showTypeOrder ? (
            <View style={styles.collapseBody}>
              <Text style={styles.listSubtitle}>
                Top items appear first on the fee ledger during collection.
              </Text>
              {sortedFeeTypes.length === 0 ? (
                <Text style={styles.emptyHint}>Add fee types in Fee Details to configure order.</Text>
              ) : (
                <View style={styles.typeOrderList}>
                  {sortedFeeTypes.map((type, index) => (
                    <View key={type.id} style={styles.typeOrderRow}>
                      <View style={styles.orderBadge}>
                        <Text style={styles.orderBadgeText}>{type.sort_order ?? index + 1}</Text>
                      </View>
                      <Text style={styles.typeOrderName}>{type.name}</Text>
                      <View style={styles.orderControls}>
                        <TouchableOpacity
                          style={[
                            styles.orderBtn,
                            (index === 0 || reorderingTypes) && styles.orderBtnDisabled,
                          ]}
                          onPress={() => handleMoveFeeType(index, 'up')}
                          disabled={index === 0 || reorderingTypes}
                        >
                          <Ionicons
                            name="chevron-up"
                            size={18}
                            color={
                              index === 0 || reorderingTypes
                                ? theme.colors.textTertiary
                                : ADMIN_THEME.colors.primary
                            }
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.orderBtn,
                            (index === sortedFeeTypes.length - 1 || reorderingTypes) &&
                              styles.orderBtnDisabled,
                          ]}
                          onPress={() => handleMoveFeeType(index, 'down')}
                          disabled={index === sortedFeeTypes.length - 1 || reorderingTypes}
                        >
                          <Ionicons
                            name="chevron-down"
                            size={18}
                            color={
                              index === sortedFeeTypes.length - 1 || reorderingTypes
                                ? theme.colors.textTertiary
                                : ADMIN_THEME.colors.primary
                            }
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}
        </View>

        {/* Fee Details — primary form */}
        <View style={styles.card}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.iconBadge, styles.iconBadgeAccent]}>
              <Ionicons name="cash-outline" size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Set Fee</Text>
              <Text style={styles.sectionHint}>
                {selectionSummary || 'Pick class, type, and amount'}
              </Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>Class</Text>
          <View style={styles.chipWrap}>
            {classes.map((cls) => {
              const active = selectedClassId === cls.id;
              return (
                <TouchableOpacity
                  key={cls.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSelectedClassId(cls.id)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{cls.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {displayFeeMode === 'per_section' ? (
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Section</Text>
              {!selectedClassId ? (
                <View style={styles.inlineEmpty}>
                  <Ionicons name="information-circle-outline" size={16} color={theme.colors.textTertiary} />
                  <Text style={styles.inlineEmptyText}>Select a class to see its sections</Text>
                </View>
              ) : sectionsForClass.length === 0 ? (
                <View style={styles.emptyPanel}>
                  <View style={styles.emptyPanelIcon}>
                    <Ionicons name="albums-outline" size={22} color="#D97706" />
                  </View>
                  <Text style={styles.emptyPanelTitle}>No sections for this class</Text>
                  <Text style={styles.emptyPanelBody}>
                    Create sections under Academic Structure, or switch to Per Class if all sections
                    share the same fee.
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyPanelAction}
                    onPress={() => confirmFeeModeChange('per_class')}
                    disabled={modeSaving || feeMode === 'per_class'}
                  >
                    <Text style={styles.emptyPanelActionText}>Use Per Class instead</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.chipWrap}>
                  {sectionsForClass.map((cs) => {
                    const active = selectedSectionId === cs.section_id;
                    return (
                      <TouchableOpacity
                        key={cs.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setSelectedSectionId(cs.section_id)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {cs.section_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Fee Type</Text>
          <View style={styles.typeGrid}>
            {sortedFeeTypes.map((type) => {
              const active = feeTypeId === type.id;
              return (
                <TouchableOpacity
                  key={type.id}
                  style={[styles.typeChip, active && styles.typeChipActive]}
                  onPress={() => setFeeTypeId(type.id)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                    {type.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.addTypeChip} onPress={() => setShowAddType(true)}>
              <Ionicons name="add" size={15} color={ADMIN_THEME.colors.primary} />
              <Text style={styles.addTypeChipText}>Add Type</Text>
            </TouchableOpacity>
          </View>

          <Modal
            transparent
            visible={showAddType}
            onRequestClose={() => setShowAddType(false)}
            animationType="fade"
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>New Fee Type</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowAddType(false);
                      setNewTypeName('');
                      setNewTypeNameTe('');
                    }}
                    style={styles.modalClose}
                  >
                    <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalHint}>e.g. Tuition Fee, Lab Fee, Transport, Exam Fee</Text>
                <AppTextInput
                  style={styles.modalInput}
                  value={newTypeName}
                  onChangeText={setNewTypeName}
                  placeholder="Enter fee type name"
                  placeholderTextColor={theme.colors.textTertiary}
                  autoFocus
                />
                <AppTextInput
                  style={styles.modalInput}
                  value={newTypeNameTe}
                  onChangeText={setNewTypeNameTe}
                  placeholder="Telugu Name (optional)"
                  placeholderTextColor={theme.colors.textTertiary}
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => {
                      setShowAddType(false);
                      setNewTypeName('');
                      setNewTypeNameTe('');
                    }}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSaveBtn, !newTypeName.trim() && { opacity: 0.45 }]}
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

          <Text style={styles.fieldLabel}>Amount</Text>
          <View style={styles.amountRow}>
            <View style={styles.currencyBadge}>
              <Text style={styles.currencyBadgeText}>₹</Text>
            </View>
            <AppTextInput
              key={`${selectedClassId}-${selectedSectionId}-${selectedYearId}-${feeTypeId}`}
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              keyboardType="numeric"
              placeholderTextColor={theme.colors.textTertiary}
            />
          </View>

          <AppDatePicker
            label="Due Date"
            value={dueDate}
            onChange={setDueDate}
            isDark={isDark}
            containerStyle={{ marginBottom: Spacing.md, marginTop: Spacing.sm }}
          />

          {missingFieldHint && !formReady ? (
            <View style={styles.hintBar}>
              <Ionicons name="arrow-forward-circle-outline" size={16} color={ADMIN_THEME.colors.primary} />
              <Text style={styles.hintBarText}>{missingFieldHint}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.submitBtn, (!formReady || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting || !formReady}
            activeOpacity={0.88}
          >
            {submitting ? (
              <LogoLoader color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.submitBtnText}>Save Fee Structure</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Configured Fees */}
        <View style={styles.card}>
          <View style={styles.listHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.iconBadge}>
                <Ionicons name="list-outline" size={16} color={ADMIN_THEME.colors.primary} />
              </View>
              <View>
                <Text style={styles.sectionTitleNoMargin}>Configured Fees</Text>
                <Text style={styles.sectionHint}>
                  {selectedYear?.code ?? 'This year'}
                  {displayFeeMode === 'per_section' ? ' · per section' : ' · per class'}
                </Text>
              </View>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{filteredConfiguredFees.length}</Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>Filter by Class</Text>
          <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScrollContent}>
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
          </TourScrollView>

          {filteredConfiguredFees.length === 0 ? (
            <View style={styles.emptyList}>
              <View style={styles.emptyListIcon}>
                <Ionicons name="receipt-outline" size={28} color={theme.colors.textTertiary} />
              </View>
              <Text style={styles.emptyListTitle}>No fees configured yet</Text>
              <Text style={styles.emptyListHint}>Set a fee above and it will appear here.</Text>
            </View>
          ) : (
            <View style={styles.feeList}>
              {filteredConfiguredFees.map((fee) => (
                <TouchableOpacity
                  key={fee.id}
                  style={styles.feeRow}
                  onPress={() => handleSelectConfiguredFee(fee)}
                  activeOpacity={0.72}
                >
                  <View style={styles.feeRowMain}>
                    <Text style={styles.feeRowClass}>
                      {fee.class_name ?? 'Class'}
                      {displayFeeMode === 'per_section' && fee.section_name
                        ? ` · ${fee.section_name}`
                        : ''}
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
                      <Ionicons name="trash-outline" size={17} color="#EF4444" />
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </KeyboardAwareScreen></TourTarget>
    </View>
  );
}

const getStyles = (theme: Theme, isDark: boolean) => {
  const surface = isDark ? theme.colors.card : '#FFFFFF';
  const muted = isDark ? '#1E293B' : '#F1F5F9';
  const soft = isDark ? '#334155' : '#F8FAFC';
  const border = isDark ? '#334155' : '#E2E8F0';
  const primary = ADMIN_THEME.colors.primary;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },

    card: {
      backgroundColor: surface,
      borderRadius: Radii.xl,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
      ...Platform.select({
        ios: {
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.25 : 0.05,
          shadowRadius: 12,
        },
        android: { elevation: 3 },
        default: {},
      }),
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
    },
    cardHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    iconBadge: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(102,89,144,0.22)' : '#F3F0F8',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBadgeAccent: {
      backgroundColor: primary,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#F1F5F9' : '#0F172A',
      letterSpacing: -0.2,
      marginBottom: 2,
    },
    sectionTitleNoMargin: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#F1F5F9' : '#0F172A',
      letterSpacing: -0.2,
    },
    sectionHint: {
      fontSize: 12,
      color: isDark ? '#94A3B8' : '#64748B',
      lineHeight: 16,
      marginTop: 1,
    },

    // Segmented fee mode
    segmented: {
      flexDirection: 'row',
      gap: 8,
      marginTop: Spacing.md,
      padding: 4,
      borderRadius: Radii.lg,
      backgroundColor: muted,
    },
    segmentBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: Radii.md,
      gap: 4,
    },
    segmentBtnActive: {
      backgroundColor: surface,
      ...Elevation.level1,
    },
    segmentLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#94A3B8' : '#64748B',
    },
    segmentLabelActive: {
      color: primary,
    },
    segmentDesc: {
      fontSize: 10,
      color: isDark ? '#64748B' : '#94A3B8',
      textAlign: 'center',
      lineHeight: 13,
    },
    segmentDescActive: {
      color: isDark ? '#94A3B8' : '#64748B',
    },
    modeSavingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
    },
    modeSavingText: { fontSize: 12, color: isDark ? '#94A3B8' : '#64748B' },

    // Warning
    warningCard: {
      borderColor: 'rgba(217,119,6,0.35)',
      backgroundColor: isDark ? 'rgba(217,119,6,0.08)' : '#FFFBEB',
    },
    warningHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    warningIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: 'rgba(217,119,6,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    warningTitle: { fontSize: 14, fontWeight: '700', color: '#D97706' },
    warningBody: {
      fontSize: 12,
      color: isDark ? '#FCD34D' : '#92400E',
      marginBottom: 8,
      lineHeight: 18,
    },
    warningItem: { fontSize: 12, color: isDark ? '#FDE68A' : '#B45309', marginTop: 2 },

    // Collapse
    collapseHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    collapseBody: { marginTop: Spacing.md },

    // Fields
    fieldBlock: { marginTop: 4 },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#94A3B8' : '#475569',
      marginBottom: 8,
      marginTop: Spacing.md,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    emptyHint: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic' },

    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chipScrollContent: {
      flexDirection: 'row',
      gap: 8,
      paddingBottom: 4,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 40,
      borderRadius: Radii.md,
      backgroundColor: soft,
      borderWidth: 1.5,
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: {
      backgroundColor: isDark ? 'rgba(102,89,144,0.2)' : '#F3F0F8',
      borderColor: primary,
    },
    chipText: {
      fontSize: 13,
      color: isDark ? '#94A3B8' : '#475569',
      fontWeight: '600',
    },
    chipTextActive: { color: primary, fontWeight: '700' },

    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    typeChip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 40,
      borderRadius: Radii.md,
      backgroundColor: soft,
      borderWidth: 1.5,
      borderColor: border,
    },
    typeChipActive: {
      backgroundColor: isDark ? 'rgba(102,89,144,0.2)' : '#F3F0F8',
      borderColor: primary,
    },
    typeChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#94A3B8' : '#475569',
    },
    typeChipTextActive: { color: primary, fontWeight: '700' },
    addTypeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 40,
      borderRadius: Radii.md,
      borderWidth: 1.5,
      borderColor: primary,
      borderStyle: 'dashed',
      backgroundColor: isDark ? 'rgba(102,89,144,0.1)' : '#F8F6FC',
    },
    addTypeChipText: { fontSize: 12, fontWeight: '700', color: primary },

    // Empty states
    inlineEmpty: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: Radii.md,
      backgroundColor: soft,
    },
    inlineEmptyText: { fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', flex: 1 },
    emptyPanel: {
      alignItems: 'flex-start',
      padding: Spacing.md,
      borderRadius: Radii.lg,
      backgroundColor: isDark ? 'rgba(217,119,6,0.08)' : '#FFFBEB',
      borderWidth: 1,
      borderColor: 'rgba(217,119,6,0.25)',
      gap: 6,
    },
    emptyPanelIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: 'rgba(217,119,6,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    emptyPanelTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#FCD34D' : '#92400E',
    },
    emptyPanelBody: {
      fontSize: 12,
      color: isDark ? '#FDE68A' : '#B45309',
      lineHeight: 18,
    },
    emptyPanelAction: {
      marginTop: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: Radii.sm,
      backgroundColor: isDark ? 'rgba(102,89,144,0.25)' : '#F3F0F8',
    },
    emptyPanelActionText: {
      fontSize: 12,
      fontWeight: '700',
      color: primary,
    },

    // Amount
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: border,
      borderRadius: Radii.md,
      backgroundColor: soft,
      overflow: 'hidden',
    },
    currencyBadge: {
      width: 44,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(102,89,144,0.2)' : '#F3F0F8',
      borderRightWidth: 1,
      borderRightColor: border,
    },
    currencyBadgeText: {
      fontSize: 18,
      fontWeight: '800',
      color: primary,
    },
    amountInput: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#F1F5F9' : '#0F172A',
      letterSpacing: -0.3,
      ...Platform.select({
        web: { outlineStyle: 'none' as any },
        default: {},
      }),
    },

    hintBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: Radii.md,
      backgroundColor: isDark ? 'rgba(102,89,144,0.12)' : '#F8F6FC',
      marginBottom: 4,
    },
    hintBarText: {
      fontSize: 12,
      fontWeight: '600',
      color: primary,
      flex: 1,
    },

    submitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: primary,
      paddingVertical: 15,
      borderRadius: Radii.lg,
      marginTop: Spacing.sm,
      ...Platform.select({
        ios: {
          shadowColor: primary,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.28,
          shadowRadius: 12,
        },
        android: { elevation: 4 },
        default: {},
      }),
    },
    submitBtnDisabled: { opacity: 0.45 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(10,14,30,0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: surface,
      borderRadius: Radii.xxl,
      padding: 22,
      ...Elevation.level3,
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
      color: isDark ? '#F1F5F9' : '#0F172A',
      letterSpacing: -0.3,
    },
    modalClose: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalHint: { fontSize: 12, color: '#94A3B8', marginBottom: 14 },
    modalInput: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: Radii.md,
      padding: 12,
      fontSize: 15,
      color: isDark ? '#F1F5F9' : '#0F172A',
      backgroundColor: soft,
      marginBottom: 12,
    },
    modalActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
    modalCancelBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radii.md,
      paddingVertical: 12,
      minHeight: 48,
      backgroundColor: muted,
      borderWidth: 1,
      borderColor: border,
    },
    modalCancelText: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#94A3B8' : '#64748B',
    },
    modalSaveBtn: {
      flex: 1.5,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: primary,
      borderRadius: Radii.md,
      paddingVertical: 12,
      minHeight: 48,
    },
    modalSaveText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    // Configured list
    listHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
      gap: 12,
    },
    listSubtitle: {
      fontSize: 12,
      color: isDark ? '#64748B' : '#94A3B8',
      marginBottom: Spacing.sm,
      lineHeight: 18,
    },
    countBadge: {
      minWidth: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(102,89,144,0.25)' : '#F3F0F8',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    countBadgeText: {
      fontSize: 13,
      fontWeight: '800',
      color: primary,
    },
    emptyList: {
      alignItems: 'center',
      paddingVertical: 32,
      gap: 6,
    },
    emptyListIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: soft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
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
    feeList: { marginTop: Spacing.sm, gap: 8 },
    feeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 14,
      borderRadius: Radii.md,
      backgroundColor: soft,
      borderWidth: 1,
      borderColor: border,
    },
    feeRowMain: { flex: 1 },
    feeRowClass: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#F1F5F9' : '#0F172A',
      marginBottom: 2,
    },
    feeRowType: {
      fontSize: 12,
      color: isDark ? '#94A3B8' : '#64748B',
      fontWeight: '600',
    },
    feeRowMeta: { alignItems: 'flex-end' },
    feeRowAmount: {
      fontSize: 15,
      fontWeight: '800',
      color: primary,
      letterSpacing: -0.3,
    },
    feeRowDue: {
      fontSize: 11,
      color: '#94A3B8',
      marginTop: 2,
    },
    feeRowDelete: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
    },

    // Type order
    typeOrderList: { gap: 8 },
    typeOrderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: Radii.md,
      backgroundColor: soft,
      borderWidth: 1,
      borderColor: border,
    },
    typeOrderName: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#F1F5F9' : '#0F172A',
    },
    orderBadge: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(102,89,144,0.25)' : '#F3F0F8',
      alignItems: 'center',
      justifyContent: 'center',
    },
    orderBadgeText: {
      fontSize: 12,
      fontWeight: '800',
      color: primary,
    },
    orderControls: { flexDirection: 'row', gap: 4 },
    orderBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: border,
    },
    orderBtnDisabled: { opacity: 0.4 },
  });
};
