import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AppTextInput from '../AppTextInput';
import { PayrollEntry } from '../../types/payroll';
import { APIError } from '../../services/apiClient';
import { AttendancePreview, PayrollService } from '../../services/payrollService';
import { alertCompat } from '../../utils/crossPlatformAlert';
import {
  AttendanceAdjustForm,
  AttendanceSourceMode,
  holidayOverrideNeedsConfirm,
  stepAttendanceCount,
  validateAttendanceForm,
} from '../../utils/payrollAttendanceAdjust';
import { Radii, Shadows } from '../../theme/themes';

type Props = {
  visible: boolean;
  item: PayrollEntry | null;
  isDark: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type Tone = 'indigo' | 'teal' | 'emerald' | 'rose' | 'amber' | 'sky';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const emptyForm = (): AttendanceAdjustForm => ({
  mode: 'SYSTEM_DAILY',
  clDays: '0',
  nonClDays: '0',
  lateCount: '0',
  holidayCount: '0',
  providerName: '',
  reference: '',
  reason: '',
  verified: false,
});

function formFromItem(item: PayrollEntry): AttendanceAdjustForm {
  const summary = item.attendance_summary;
  const manual = summary?.input_mode === 'MANUAL_SUMMARY';
  return {
    mode: manual ? 'MANUAL_SUMMARY' : 'SYSTEM_DAILY',
    clDays: manual ? String(summary?.cl_days ?? '0') : '0',
    nonClDays: manual ? String(summary?.non_cl_days ?? '0') : '0',
    lateCount: manual ? String(summary?.late_count ?? 0) : '0',
    holidayCount: item.holiday_override ? String(item.holiday_override.holiday_count) : '',
    providerName: summary?.provider_name || '',
    reference: summary?.supporting_reference || '',
    reason: summary?.reason || '',
    verified: Boolean(summary?.verified),
  };
}

function errorText(err: unknown): { message: string; code?: string } {
  if (err instanceof APIError) return { message: err.message, code: err.code };
  if (err instanceof Error) return { message: err.message };
  return { message: 'Could not update attendance totals.' };
}

function summarizeBlocks(blocks: { code: string; message: string }[]): string[] {
  const missing = blocks.filter((entry) => entry.code === 'INCOMPLETE_ATTENDANCE');
  const rest = blocks.filter((entry) => entry.code !== 'INCOMPLETE_ATTENDANCE').map((entry) => entry.message);
  if (missing.length === 1) rest.unshift(missing[0].message);
  if (missing.length > 1) {
    rest.unshift(`${missing.length} working days have no approved attendance. Mark those days before this payslip can be approved.`);
  }
  return rest;
}

function money(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function deltaLabel(current: number | null, next: number | null): string {
  if (current == null || next == null || Number.isNaN(current) || Number.isNaN(next)) return '';
  const diff = Math.round((next - current) * 100) / 100;
  if (Math.abs(diff) < 0.005) return 'No change from the current payslip';
  const formatted = money(Math.abs(diff));
  return diff < 0 ? `${formatted} less than the current payslip` : `${formatted} more than the current payslip`;
}

const FORM_BLOCK_CODES = new Set(['MANUAL_SUMMARY_REASON', 'MANUAL_SUMMARY_UNVERIFIED']);

function toneSet(isDark: boolean, tone: Tone) {
  const sets = {
    indigo: isDark
      ? { ink: '#C7D2FE', wash: 'rgba(99,102,241,0.16)', line: 'rgba(129,140,248,0.45)' }
      : { ink: '#3730A3', wash: '#EEF2FF', line: '#C7D2FE' },
    teal: isDark
      ? { ink: '#99F6E4', wash: 'rgba(13,148,136,0.16)', line: 'rgba(45,212,191,0.4)' }
      : { ink: '#0F766E', wash: '#F0FDFA', line: '#99F6E4' },
    emerald: isDark
      ? { ink: '#6EE7B7', wash: 'rgba(5,150,105,0.16)', line: 'rgba(52,211,153,0.4)' }
      : { ink: '#047857', wash: '#ECFDF5', line: '#A7F3D0' },
    rose: isDark
      ? { ink: '#FDA4AF', wash: 'rgba(225,29,72,0.16)', line: 'rgba(251,113,133,0.4)' }
      : { ink: '#BE123C', wash: '#FFF1F2', line: '#FECDD3' },
    amber: isDark
      ? { ink: '#FCD34D', wash: 'rgba(217,119,6,0.16)', line: 'rgba(251,191,36,0.4)' }
      : { ink: '#B45309', wash: '#FFFBEB', line: '#FDE68A' },
    sky: isDark
      ? { ink: '#7DD3FC', wash: 'rgba(2,132,199,0.16)', line: 'rgba(56,189,248,0.4)' }
      : { ink: '#0369A1', wash: '#F0F9FF', line: '#BAE6FD' },
  };
  return sets[tone];
}

export default function PayrollAttendanceAdjustModal({ visible, item, isDark, onClose, onSaved }: Props) {
  const { height, width } = useWindowDimensions();
  const wide = width >= 980;
  const sheetHeight = Math.min(height * 0.9, wide ? 840 : height * 0.92);
  const [form, setForm] = useState<AttendanceAdjustForm>(emptyForm);
  const [preview, setPreview] = useState<AttendancePreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [formError, setFormError] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [anchorNet, setAnchorNet] = useState<number | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustmentKind, setAdjustmentKind] = useState<'EARNING' | 'DEDUCTION'>('EARNING');
  const [adjustmentName, setAdjustmentName] = useState('');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const holidaySeeded = React.useRef(false);

  const canvas = isDark ? '#0F1422' : '#F4F6FB';
  const ink = isDark ? '#F8FAFC' : '#0F172A';
  const muted = isDark ? '#94A3B8' : '#64748B';
  const line = isDark ? 'rgba(148,163,184,0.18)' : '#E6E9F2';
  const card = isDark ? '#151B2B' : '#FFFFFF';
  const field = isDark ? '#0E1320' : '#FFFFFF';

  useEffect(() => {
    if (!item || !visible) return;
    const next = formFromItem(item);
    setForm(next);
    setPreview(null);
    setPreviewError('');
    setFormError('');
    setJustSaved(false);
    setAnchorNet(Number(item.net_salary));
    setShowSource(Boolean(next.providerName || next.reference));
    setShowAdjustment(false);
    setAdjustmentName('');
    setAdjustmentAmount('');
    setAdjustmentReason('');
    holidaySeeded.current = false;
  }, [item, visible]);

  useEffect(() => {
    if (!item || !visible) return;
    let cancelled = false;
    setPreviewing(true);
    const handle = setTimeout(() => {
      PayrollService.previewAttendanceSummary(item.id, form)
        .then((next) => {
          if (cancelled) return;
          setPreview(next);
          setPreviewError('');
          setForm((current) => {
            if (holidaySeeded.current || current.holidayCount.trim() !== '' || next.payrollHolidayCount == null) return current;
            holidaySeeded.current = true;
            return { ...current, holidayCount: String(next.payrollHolidayCount) };
          });
        })
        .catch((err: unknown) => {
          if (!cancelled) setPreviewError(errorText(err).message);
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [form, item, visible]);

  const patch = (partial: Partial<AttendanceAdjustForm>) => {
    setFormError('');
    setJustSaved(false);
    setForm((current) => ({ ...current, ...partial }));
  };
  const manual = form.mode === 'MANUAL_SUMMARY';
  const system = preview?.system;
  const attendance = preview?.calculation.attendance;
  const versions = {
    summaryVersion: preview?.summaryVersion ?? item?.attendance_summary?.version ?? null,
    holidayVersion: preview?.holidayVersion ?? item?.holiday_override?.version ?? null,
  };
  const holidayShifted = holidayOverrideNeedsConfirm(
    preview?.payrollHolidayCount ?? item?.holiday_override?.holiday_count ?? system?.officialHolidays ?? null,
    form.holidayCount,
  );
  const blocks = preview?.calculation.validation.filter((entry) => entry.severity === 'block') || [];

  const saveAttendance = async (confirmHoliday: boolean) => {
    if (!item) return;
    const invalid = validateAttendanceForm(form, preview?.calculation.calendarDays ?? null);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    const baseline = preview?.payrollHolidayCount ?? item.holiday_override?.holiday_count ?? null;
    if (!confirmHoliday && holidayOverrideNeedsConfirm(baseline, form.holidayCount)) {
      alertCompat(
        'Shared holiday count',
        'This holiday count applies to every teacher in the payroll month. Saving it recalculates draft and validated payrolls. Approved, locked, and paid payrolls stay unchanged.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Recalculate month', onPress: () => { void saveAttendance(true); } },
        ],
      );
      return;
    }
    setSaving(true);
    try {
      const saved = await PayrollService.saveAttendanceSummary(item.id, form, versions, confirmHoliday);
      const savedPayroll = saved.payroll;
      if (savedPayroll?.netSalary != null) {
        setAnchorNet(Number(savedPayroll.netSalary));
        setPreview((current) => current ? {
          ...current,
          summaryVersion: saved.summaryVersion ?? current.summaryVersion,
          holidayVersion: saved.holidayVersion ?? current.holidayVersion,
          calculation: {
            ...current.calculation,
            netSalary: savedPayroll.netSalary ?? current.calculation.netSalary,
            totalDeductions: savedPayroll.totalDeductions ?? current.calculation.totalDeductions,
            grossContract: savedPayroll.grossContract ?? current.calculation.grossContract,
            grossEarnings: savedPayroll.grossEarnings ?? current.calculation.grossEarnings,
            perDaySalary: savedPayroll.perDaySalary ?? current.calculation.perDaySalary,
            blocked: savedPayroll.blocked ?? current.calculation.blocked,
            validation: savedPayroll.validation ?? current.calculation.validation,
            attendance: savedPayroll.attendance ?? current.calculation.attendance,
            lineItems: savedPayroll.lineItems ?? current.calculation.lineItems,
          },
        } : current);
      } else {
        setPreview((current) => current ? {
          ...current,
          summaryVersion: saved.summaryVersion ?? current.summaryVersion,
          holidayVersion: saved.holidayVersion ?? current.holidayVersion,
        } : current);
      }
      setJustSaved(true);
      setFormError('');
      const skipped = saved.skipped?.length || 0;
      const blocked = saved.blocked?.length || 0;
      if (skipped || blocked) {
        alertCompat(
          'Attendance saved',
          `${saved.recalculated?.length || 0} payrolls recalculated. ${blocked} need review. ${skipped} were left unchanged.`,
        );
      }
      onSaved();
    } catch (err) {
      const parsed = errorText(err);
      if (parsed.code === 'HOLIDAY_CONFIRMATION_REQUIRED' && !confirmHoliday) {
        alertCompat('Shared holiday count', parsed.message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Recalculate month', onPress: () => { void saveAttendance(true); } },
        ]);
      } else {
        alertCompat('Could not save', parsed.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const revert = () => {
    if (!item) return;
    alertCompat('Use SchoolIMS attendance', 'Daily attendance will replace these manual totals for this payslip. Enter the reason in the reason field first.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revert',
        onPress: async () => {
          if (!form.reason.trim()) {
            alertCompat('Reason required', 'Enter a reason before returning to SchoolIMS attendance.');
            return;
          }
          setSaving(true);
          try {
            const saved = await PayrollService.revertAttendanceSummary(item.id, form.reason.trim(), versions.summaryVersion);
            if (saved.payroll?.netSalary != null) setAnchorNet(Number(saved.payroll.netSalary));
            setForm((current) => ({ ...current, mode: 'SYSTEM_DAILY', verified: false }));
            setJustSaved(true);
            onSaved();
          } catch (err) {
            alertCompat('Could not revert', errorText(err).message);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const saveMoney = async () => {
    if (!item) return;
    if (!adjustmentName.trim() || !adjustmentReason.trim() || !Number(adjustmentAmount)) {
      alertCompat('Adjustment incomplete', 'Enter a name, an amount greater than zero, and a reason.');
      return;
    }
    setSaving(true);
    const result = await PayrollService.addTeacherAdjustment(item.id, {
      kind: adjustmentKind,
      name: adjustmentName.trim(),
      amount: adjustmentAmount.trim(),
      reason: adjustmentReason.trim(),
    });
    setSaving(false);
    if (!result.ok) {
      alertCompat('Could not save adjustment', result.message || 'Failed to save adjustment.');
      return;
    }
    alertCompat('Adjustment recorded', 'The earning or deduction is stored separately from attendance. It is included after approval when school policy requires it.');
    setAdjustmentName('');
    setAdjustmentAmount('');
    setAdjustmentReason('');
    onSaved();
  };

  const person = item?.staff?.person;
  const name = person?.display_name || `${person?.first_name || ''} ${person?.last_name || ''}`.trim() || 'Staff';
  const role = item?.staff?.designation?.name;
  const period = item ? `${MONTHS[(item.payroll_month || 1) - 1]} ${item.payroll_year}` : '';
  const netValue = preview?.calculation.netSalary ?? item?.net_salary;
  const policyBlocks = blocks.filter((entry) => !FORM_BLOCK_CODES.has(entry.code));
  const formBlocks = blocks.filter((entry) => FORM_BLOCK_CODES.has(entry.code));
  const ledger = (preview?.calculation.lineItems || []).filter((line) => line.code !== 'GROSS_CONTRACT' && Number(line.amount) !== 0);
  const change = deltaLabel(anchorNet, netValue == null ? null : Number(netValue));
  const unpaidDays = Number(attendance?.unpaidLeave || 0);
  const lateDays = Number(attendance?.lateDeductionDays || 0);
  const deductionTotal = Number(preview?.calculation.totalDeductions || 0);
  const deductionBits = [
    unpaidDays > 0 ? `${attendance?.unpaidLeave} unpaid days` : '',
    lateDays > 0 ? `${attendance?.lateDeductionDays} late-deduction days` : '',
  ].filter(Boolean);
  const impact = !preview || previewing
    ? ''
    : deductionTotal > 0
      ? `Save applies ${money(deductionTotal)} in deductions${deductionBits.length ? ` (${deductionBits.join(', ')})` : ''}.`
      : Number(preview.calculation.attendanceBonus || 0) > 0
        ? `Save adds ${money(preview.calculation.attendanceBonus)} attendance bonus.`
        : 'These totals leave the contract amount unchanged.';
  const attendanceLine = attendance
    ? [
      `CL ${attendance.clUsed ?? '—'} of ${attendance.paidClEntitlement ?? '—'} paid`,
      Number(attendance.excessClDays) > 0 ? `${attendance.excessClDays} excess CL` : '',
      `${attendance.nonClUnpaidDays ?? 0} non-CL unpaid`,
      Number(attendance.totalLates) > 0 ? `${attendance.totalLates} lates` : '',
    ].filter(Boolean).join(' · ')
    : '';

  const Rail = wide ? ScrollView : View;
  const previewPanel = (
    <Rail
      style={[styles.rail, wide && styles.railWide, !wide && styles.railBody, { backgroundColor: isDark ? '#101626' : '#F8F7FF', borderColor: line }]}
      {...(wide ? { contentContainerStyle: styles.railBody } : {})}
    >
      <Text style={[styles.eyebrow, { color: muted }]}>{justSaved ? 'Saved payslip' : 'Revised payslip'}</Text>
      <Text style={[styles.netFigure, { color: ink }]}>{money(netValue)}</Text>
      <Text style={[styles.netCaption, { color: justSaved ? (isDark ? '#6EE7B7' : '#047857') : muted }]}>
        {previewing ? 'Recalculating…' : justSaved ? 'Saved from these totals' : preview ? `${money(preview.calculation.perDaySalary)} per day` : 'Calculating from attendance…'}
      </Text>
      {change ? (
        <Text style={[styles.delta, {
          color: change.startsWith('No change')
            ? muted
            : change.includes('less')
              ? (isDark ? '#FDA4AF' : '#E11D48')
              : (isDark ? '#6EE7B7' : '#047857'),
        }]}
        >
          {change}
        </Text>
      ) : null}

      <View style={[styles.ledger, { borderColor: line }]}>
        <PreviewLine label="Gross" value={money(preview?.calculation.grossContract ?? item?.base_salary)} ink={ink} muted={muted} />
        {ledger.map((lineItem) => (
          <PreviewLine
            key={`${lineItem.code}-${lineItem.name}`}
            label={lineItem.name}
            value={`${lineItem.kind === 'deduction' ? '−' : ''}${money(lineItem.amount)}`}
            ink={ink}
            muted={muted}
            warn={lineItem.kind === 'deduction'}
          />
        ))}
      </View>
      {attendanceLine ? <Text style={[styles.reasonNote, { color: muted }]}>{attendanceLine}</Text> : null}
      {attendance?.clEntitlementReason ? (
        <Text style={[styles.reasonNote, { color: muted }]}>{String(attendance.clEntitlementReason)}</Text>
      ) : null}
      {manual && Number(attendance?.totalLates) > 0 && attendance?.permittedLates == null ? (
        <Notice tone="amber" isDark={isDark} text="Late deductions apply after a LOCAL or NON_LOCAL classification is set. Leave is already in this amount." />
      ) : null}
      {previewError ? <Notice tone="rose" isDark={isDark} text={previewError} /> : null}
      {summarizeBlocks(policyBlocks).map((text) => <Notice key={text} tone="amber" isDark={isDark} text={text} />)}
    </Rail>
  );

  const saveDock = (
    <View style={[styles.saveDock, { backgroundColor: card, borderColor: line }]}>
      {formError ? <Notice tone="rose" isDark={isDark} text={formError} /> : null}
      {!formError && formBlocks.map((entry) => <Notice key={entry.code} tone="rose" isDark={isDark} text={entry.message} />)}
      <Pressable
        onPress={() => { void saveAttendance(false); }}
        disabled={saving}
        style={[styles.saveBtn, saving && { opacity: 0.65 }]}
        accessibilityRole="button"
        accessibilityLabel="Save and recalculate"
      >
        <LinearGradient colors={['#4338CA', '#0F766E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveFill}>
          <Ionicons name={justSaved ? 'checkmark-circle' : 'calculator'} size={18} color="#fff" />
          <Text style={styles.saveText}>{saving ? 'Saving…' : justSaved ? 'Saved' : 'Save and recalculate'}</Text>
        </LinearGradient>
      </Pressable>
      {item?.attendance_summary?.input_mode === 'MANUAL_SUMMARY' ? (
        <Pressable onPress={revert} disabled={saving} accessibilityRole="button" accessibilityLabel="Revert to SchoolIMS attendance">
          <Text style={[styles.revert, { color: isDark ? '#A5B4FC' : '#4338CA' }]}>Return to SchoolIMS attendance</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { backgroundColor: card, height: sheetHeight, maxWidth: wide ? 1080 : 680 }, Shadows.lg]}>
          <LinearGradient colors={isDark ? ['#1E1B4B', '#134E4A'] : ['#312E81', '#0F766E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.kicker}>Adjust payroll · {period}</Text>
              <Text style={styles.title}>{name}</Text>
              {role ? <Text style={styles.headerRole}>{role}</Text> : null}
            </View>
            <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close adjust payroll">
              <Ionicons name="close" size={18} color="#E0E7FF" />
            </Pressable>
          </LinearGradient>

          <View style={[styles.columns, { flexDirection: wide ? 'row' : 'column', backgroundColor: canvas }]}>
            <View style={styles.editorColumn}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.editor} keyboardShouldPersistTaps="handled">
                <Text style={[styles.section, { color: ink }]}>Attendance totals</Text>
                <View style={[styles.segment, { backgroundColor: isDark ? '#0E1320' : '#EEF2FF', borderColor: line }]}>
                  {([
                    ['SYSTEM_DAILY', 'calendar', 'SchoolIMS', 'Daily attendance'],
                    ['MANUAL_SUMMARY', 'create', 'Manual summary', 'Monthly totals'],
                  ] as const).map(([mode, icon, label, hint]) => {
                    const active = form.mode === mode;
                    const tone = mode === 'SYSTEM_DAILY' ? toneSet(isDark, 'indigo') : toneSet(isDark, 'teal');
                    return (
                      <Pressable
                        key={mode}
                        onPress={() => patch({ mode: mode as AttendanceSourceMode })}
                        style={[styles.segmentBtn, active && { backgroundColor: tone.wash, borderColor: tone.line }]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={label}
                      >
                        <Ionicons name={icon} size={16} color={active ? tone.ink : muted} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: active ? tone.ink : ink, fontWeight: '800', fontSize: 14 }}>{label}</Text>
                          <Text style={{ color: muted, fontSize: 11, marginTop: 1 }}>{hint}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.metricGrid}>
                  <Metric
                    tone="emerald"
                    isDark={isDark}
                    icon="leaf"
                    label="CL days"
                    hint="Half days allowed"
                    value={manual ? form.clDays : String(system?.clUsed ?? '—')}
                    aside={manual && system ? `SchoolIMS ${system.clUsed}` : undefined}
                    editable={manual}
                    onChangeText={(clDays) => patch({ clDays })}
                    onStep={manual ? (direction) => patch({ clDays: stepAttendanceCount(form.clDays, direction, 0.5) }) : undefined}
                    ink={ink}
                    field={field}
                  />
                  <Metric
                    tone="rose"
                    isDark={isDark}
                    icon="remove-circle"
                    label="Non-CL leave"
                    hint="Unpaid, half days allowed"
                    value={manual ? form.nonClDays : String(system?.nonClUnpaidDays ?? '—')}
                    aside={manual && system ? `SchoolIMS ${system.nonClUnpaidDays}` : undefined}
                    editable={manual}
                    onChangeText={(nonClDays) => patch({ nonClDays })}
                    onStep={manual ? (direction) => patch({ nonClDays: stepAttendanceCount(form.nonClDays, direction, 0.5) }) : undefined}
                    ink={ink}
                    field={field}
                  />
                  <Metric
                    tone="amber"
                    isDark={isDark}
                    icon="time"
                    label="Times late"
                    hint="Whole arrivals"
                    value={manual ? form.lateCount : String(system?.totalLates ?? '—')}
                    aside={manual && system ? `SchoolIMS ${system.totalLates}` : undefined}
                    editable={manual}
                    onChangeText={(lateCount) => patch({ lateCount })}
                    onStep={manual ? (direction) => patch({ lateCount: stepAttendanceCount(form.lateCount, direction, 1) }) : undefined}
                    ink={ink}
                    field={field}
                  />
                  <Metric
                    tone="sky"
                    isDark={isDark}
                    icon="sunny"
                    label="Holidays"
                    hint="Shared this month"
                    value={form.holidayCount}
                    aside={system ? `Calendar ${system.officialHolidays}` : undefined}
                    editable
                    onChangeText={(holidayCount) => patch({ holidayCount })}
                    onStep={(direction) => patch({ holidayCount: stepAttendanceCount(form.holidayCount, direction, 1) })}
                    ink={ink}
                    field={field}
                    alert={holidayShifted}
                  />
                </View>

                {impact ? (
                  <View style={[styles.impact, { backgroundColor: deductionTotal > 0 ? toneSet(isDark, 'rose').wash : toneSet(isDark, 'emerald').wash, borderColor: deductionTotal > 0 ? toneSet(isDark, 'rose').line : toneSet(isDark, 'emerald').line }]}>
                    <Ionicons name="calculator-outline" size={16} color={deductionTotal > 0 ? toneSet(isDark, 'rose').ink : toneSet(isDark, 'emerald').ink} />
                    <Text style={{ flex: 1, color: deductionTotal > 0 ? toneSet(isDark, 'rose').ink : toneSet(isDark, 'emerald').ink, fontSize: 13, fontWeight: '700', lineHeight: 18 }}>{impact}</Text>
                  </View>
                ) : null}

                {holidayShifted ? (
                  <View style={[styles.holidayNote, { backgroundColor: isDark ? 'rgba(217,119,6,0.18)' : '#FFF7ED', borderColor: isDark ? 'rgba(251,191,36,0.28)' : '#FDE68A' }]}>
                    <Ionicons name="people" size={16} color={isDark ? '#FCD34D' : '#B45309'} />
                    <Text style={{ flex: 1, color: isDark ? '#FDE68A' : '#92400E', fontSize: 12.5, lineHeight: 18 }}>
                      This holiday count applies to every teacher this month and recalculates draft and validated payrolls.
                    </Text>
                  </View>
                ) : null}

                <LabeledInput
                  label="Reason"
                  value={form.reason}
                  onChangeText={(reason) => patch({ reason })}
                  ink={ink}
                  muted={muted}
                  field={field}
                  line={line}
                  placeholder="Why this payslip uses these totals"
                />

                {manual ? (
                  <Pressable
                    onPress={() => patch({ verified: !form.verified })}
                    style={[styles.verify, { backgroundColor: form.verified ? toneSet(isDark, 'emerald').wash : card, borderColor: form.verified ? toneSet(isDark, 'emerald').line : line }]}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: form.verified }}
                    accessibilityLabel="Attendance totals verified"
                  >
                    <Ionicons name={form.verified ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={form.verified ? toneSet(isDark, 'emerald').ink : muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: ink, fontWeight: '800' }}>Totals verified</Text>
                      <Text style={{ color: muted, fontSize: 12, marginTop: 2 }}>Confirm before saving a manual summary.</Text>
                    </View>
                  </Pressable>
                ) : null}

                {manual ? (
                  <View style={[styles.panel, { backgroundColor: card, borderColor: line }]}>
                    <Pressable onPress={() => setShowSource((open) => !open)} style={styles.disclosureHead} accessibilityRole="button" accessibilityState={{ expanded: showSource }}>
                      <Text style={{ color: ink, fontWeight: '800', flex: 1 }}>Source details</Text>
                      <Ionicons name={showSource ? 'chevron-up' : 'chevron-down'} size={16} color={muted} />
                    </Pressable>
                    {showSource ? (
                      <>
                        <LabeledInput label="Provider" value={form.providerName} onChangeText={(providerName) => patch({ providerName })} ink={ink} muted={muted} field={field} line={line} placeholder="Biometric vendor or office" />
                        <LabeledInput label="Report or reference" value={form.reference} onChangeText={(reference) => patch({ reference })} ink={ink} muted={muted} field={field} line={line} placeholder="File or report number" />
                      </>
                    ) : null}
                  </View>
                ) : null}

                <View style={[styles.panel, { backgroundColor: card, borderColor: line }]}>
                  <Pressable onPress={() => setShowAdjustment((open) => !open)} style={styles.disclosureHead} accessibilityRole="button" accessibilityState={{ expanded: showAdjustment }}>
                    <Text style={{ color: ink, fontWeight: '800', flex: 1 }}>Earning or deduction</Text>
                    <Ionicons name={showAdjustment ? 'chevron-up' : 'chevron-down'} size={16} color={muted} />
                  </Pressable>
                  {showAdjustment ? (
                    <>
                      <Text style={[styles.helper, { color: muted }]}>A separate ledger amount. It is included after approval when school policy requires it.</Text>
                      <View style={styles.segment}>
                        {(['EARNING', 'DEDUCTION'] as const).map((kind) => {
                          const active = adjustmentKind === kind;
                          const tone = toneSet(isDark, kind === 'EARNING' ? 'emerald' : 'rose');
                          return (
                            <Pressable
                              key={kind}
                              onPress={() => setAdjustmentKind(kind)}
                              style={[styles.segmentBtn, active && { backgroundColor: tone.wash, borderColor: tone.line }]}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                            >
                              <Ionicons name={kind === 'EARNING' ? 'add-circle' : 'remove-circle'} size={16} color={active ? tone.ink : muted} />
                              <Text style={{ color: active ? tone.ink : ink, fontWeight: '800' }}>{kind === 'EARNING' ? 'Earning' : 'Deduction'}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <LabeledInput label="Name" value={adjustmentName} onChangeText={setAdjustmentName} ink={ink} muted={muted} field={field} line={line} placeholder="Special allowance, advance, penalty" />
                      <LabeledInput label="Amount" value={adjustmentAmount} onChangeText={setAdjustmentAmount} ink={ink} muted={muted} field={field} line={line} placeholder="0" numeric />
                      <LabeledInput label="Adjustment reason" value={adjustmentReason} onChangeText={setAdjustmentReason} ink={ink} muted={muted} field={field} line={line} placeholder="Why this amount is separate" />
                      <Pressable onPress={() => { void saveMoney(); }} disabled={saving} style={[styles.moneyBtn, { borderColor: adjustmentKind === 'EARNING' ? '#10B981' : '#FB7185' }]}>
                        <Text style={{ color: adjustmentKind === 'EARNING' ? (isDark ? '#6EE7B7' : '#047857') : (isDark ? '#FDA4AF' : '#BE123C'), fontWeight: '800' }}>
                          Save {adjustmentKind === 'EARNING' ? 'earning' : 'deduction'}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>

                {!wide ? previewPanel : null}
              </ScrollView>
              {saveDock}
            </View>
            {wide ? previewPanel : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Notice({ text, tone, isDark }: { text: string; tone: Tone; isDark: boolean }) {
  const colors = toneSet(isDark, tone);
  return (
    <Text style={[styles.notice, { color: colors.ink, backgroundColor: colors.wash }]}>{text}</Text>
  );
}

function PreviewLine({ label, value, ink, muted, warn }: { label: string; value: string | number | null | undefined; ink: string; muted: string; warn?: boolean }) {
  return (
    <View style={styles.previewLine}>
      <Text style={{ color: muted, fontSize: 12.5, flex: 1 }}>{label}</Text>
      <Text style={{ color: warn ? '#E11D48' : ink, fontWeight: '700', fontSize: 13 }}>{value ?? '—'}</Text>
    </View>
  );
}

function Metric({
  tone, isDark, icon, label, hint, value, aside, editable, onChangeText, onStep, ink, field, alert,
}: {
  tone: Tone;
  isDark: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  value: string;
  aside?: string;
  editable: boolean;
  onChangeText: (value: string) => void;
  onStep?: (direction: 1 | -1) => void;
  ink: string;
  field: string;
  alert?: boolean;
}) {
  const colors = toneSet(isDark, alert ? 'amber' : tone);
  return (
    <View style={[styles.metric, { backgroundColor: colors.wash, borderColor: colors.line }]}>
      <View style={styles.metricTop}>
        <Ionicons name={icon} size={15} color={colors.ink} />
        <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '800', flex: 1 }}>{label}</Text>
      </View>
      {editable ? (
        <View style={styles.stepper}>
          {onStep ? (
            <Pressable onPress={() => onStep(-1)} style={[styles.stepBtn, { backgroundColor: field, borderColor: colors.line }]} accessibilityRole="button" accessibilityLabel={`Decrease ${label}`}>
              <Ionicons name="remove" size={16} color={colors.ink} />
            </Pressable>
          ) : null}
          <AppTextInput
            value={value}
            onChangeText={onChangeText}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.ink}
            style={[styles.metricInput, { color: ink, backgroundColor: field, borderColor: colors.line }]}
          />
          {onStep ? (
            <Pressable onPress={() => onStep(1)} style={[styles.stepBtn, { backgroundColor: field, borderColor: colors.line }]} accessibilityRole="button" accessibilityLabel={`Increase ${label}`}>
              <Ionicons name="add" size={16} color={colors.ink} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.metricValue, { color: ink }]}>{value}</Text>
      )}
      <Text style={{ color: colors.ink, fontSize: 11, opacity: 0.85 }}>{aside || hint}</Text>
    </View>
  );
}

function LabeledInput({
  label, value, onChangeText, ink, muted, field, line, placeholder, multiline, numeric,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  ink: string;
  muted: string;
  field: string;
  line: string;
  placeholder?: string;
  multiline?: boolean;
  numeric?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: ink, fontWeight: '700', fontSize: 13 }}>{label}</Text>
      <AppTextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        placeholder={placeholder}
        placeholderTextColor={muted}
        style={[styles.input, multiline && { minHeight: 76, textAlignVertical: 'top' }, { color: ink, backgroundColor: field, borderColor: line }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  sheet: {
    width: '100%',
    borderRadius: 28,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  kicker: { color: '#C7D2FE', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  headerRole: { color: '#D1FAE5', fontSize: 13, fontWeight: '600' },
  close: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  columns: { flex: 1, minHeight: 0 },
  editorColumn: { flex: 1, minWidth: 0, minHeight: 0 },
  editor: { padding: 18, gap: 12 },
  section: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2, marginTop: 4 },
  helper: { fontSize: 12.5, lineHeight: 18 },
  segment: { flexDirection: 'row', gap: 8 },
  segmentBtn: {
    flex: 1,
    minHeight: 58,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: {
    width: '48%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    gap: 6,
    minWidth: 148,
  },
  metricTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 34,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 22,
    fontWeight: '800',
    minHeight: 40,
    textAlign: 'center',
  },
  impact: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  holidayNote: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  panel: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  disclosureHead: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8 },
  verify: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    minHeight: 46,
  },
  rail: { borderTopWidth: 1 },
  railBody: { padding: 16, gap: 8 },
  railWide: { width: 340, borderTopWidth: 0, borderLeftWidth: 1, alignSelf: 'stretch' },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  netFigure: { fontSize: 36, fontWeight: '800', letterSpacing: -0.8 },
  netCaption: { fontSize: 12, marginTop: -4 },
  delta: { fontSize: 13, fontWeight: '800' },
  ledger: { borderTopWidth: 1, paddingTop: 10, gap: 8, marginTop: 4 },
  saveDock: { borderTopWidth: 1, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, gap: 8 },
  notice: { fontSize: 12, lineHeight: 17, borderRadius: 10, padding: 8 },
  previewLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  reasonNote: { fontSize: 12, lineHeight: 17 },
  saveBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  saveFill: { minHeight: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  revert: { textAlign: 'center', fontWeight: '700', paddingVertical: 6 },
  moneyBtn: { minHeight: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
