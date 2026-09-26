import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  StatusBar,
  Pressable,
  Switch,
  Platform,
  Modal,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { alertCompat } from '../../utils/crossPlatformAlert';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AdminHeader from '../AdminHeader';
import AppTextInput from '../AppTextInput';
import { usePayroll } from '../../hooks/usePayroll';
import { PayrollEntry } from '../../types/payroll';
import PayrollAttendanceAdjustModal from './PayrollAttendanceAdjustModal';
import { useTheme } from '../../hooks/useTheme';
import { useAccountsWebChrome } from '../../contexts/AccountsWebChromeContext';
import { AdminService } from '../../services/adminService';
import { Shadows } from '../../theme/themes';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type StatusFilter = 'all' | 'pending' | 'paid';
type SortKey = 'name' | 'role' | 'base' | 'deductions' | 'adjustment' | 'net' | 'status';
type SortDir = 'asc' | 'desc';
type PayPhase = 'review' | 'submitting' | 'success' | 'error';
type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

type Palette = {
  page: string;
  surface: string;
  text: string;
  secondary: string;
  border: string;
  primary: string;
  onPrimary: string;
  selectedWash: string;
  paidBg: string;
  paidFg: string;
  pendingBg: string;
  pendingFg: string;
  dangerBg: string;
  dangerFg: string;
  neutralBg: string;
  track: string;
  muted: string;
  hover: string;
};

function palette(isDark: boolean): Palette {
  if (isDark) {
    return {
      page: '#0F172A',
      surface: '#111827',
      text: '#F8FAFC',
      secondary: '#CBD5E1',
      border: '#334155',
      primary: '#4F46E5',
      onPrimary: '#FFFFFF',
      selectedWash: 'rgba(79,70,229,0.22)',
      paidBg: '#052E16',
      paidFg: '#86EFAC',
      pendingBg: '#451A03',
      pendingFg: '#FDE68A',
      dangerBg: '#450A0A',
      dangerFg: '#FECACA',
      neutralBg: '#1E293B',
      track: '#334155',
      muted: '#64748B',
      hover: 'rgba(248,250,252,0.04)',
    };
  }
  return {
    page: '#F8FAFC',
    surface: '#FFFFFF',
    text: '#0F172A',
    secondary: '#475569',
    border: '#E2E8F0',
    primary: '#4F46E5',
    onPrimary: '#FFFFFF',
    selectedWash: '#EEF2FF',
    paidBg: '#F0FDF4',
    paidFg: '#166534',
    pendingBg: '#FFFBEB',
    pendingFg: '#92400E',
    dangerBg: '#FEF2F2',
    dangerFg: '#B91C1C',
    neutralBg: '#F8FAFC',
    track: '#E2E8F0',
    muted: '#94A3B8',
    hover: '#F8FAFC',
  };
}

function focusRing(focused?: boolean) {
  if (!focused || Platform.OS !== 'web') return null;
  return {
    outlineWidth: 2,
    outlineStyle: 'solid' as const,
    outlineColor: '#4F46E5',
    outlineOffset: 2,
  };
}

function formatINR(value: number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '₹0';
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const hasFraction = Math.round(abs * 100) % 100 !== 0;
  const formatted = abs.toLocaleString('en-IN', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${negative ? '−' : ''}₹${formatted}`;
}

function formatDeduction(value: number) {
  const amount = Math.abs(Number(value) || 0);
  if (amount === 0) return { text: '₹0', negative: false, muted: true, positive: false };
  return { text: `−${formatINR(amount)}`, negative: true, muted: false, positive: false };
}

function formatAdjustment(value: number) {
  const amount = Number(value) || 0;
  if (amount === 0) return { text: '₹0', negative: false, muted: true, positive: false };
  if (amount < 0) return { text: formatINR(amount), negative: true, muted: false, positive: false };
  return { text: `+${formatINR(amount)}`, negative: false, muted: false, positive: true };
}

function formatPayDate(value?: string | null) {
  if (!value) return '';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function staffName(item: PayrollEntry) {
  const person = item.staff?.person;
  return (
    person?.display_name ||
    `${person?.first_name || ''} ${person?.last_name || ''}`.trim() ||
    'Staff member'
  );
}

function staffRole(item: PayrollEntry) {
  return item.staff?.designation?.name || 'Staff';
}

function periodLabel(month: number, year: number) {
  return `${MONTHS[month - 1] || 'Month'} ${year}`;
}

function needsPaySetup(item: PayrollEntry) {
  const teacherPayroll = item.calculation_engine === 'teacher-salary-v1';
  return Boolean(item.review_reason) || (teacherPayroll && item.workflow_status !== 'LOCKED');
}

function workflowLabel(status?: string | null) {
  if (!status) return '';
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    VALIDATED: 'Validated',
    APPROVED: 'Approved',
    LOCKED: 'Locked for payment',
    PAID: 'Paid',
  };
  return labels[status] || status;
}

function detailLines(item: PayrollEntry) {
  const lines: { label: string; value: string }[] = [];
  if (item.staff?.staff_code) lines.push({ label: 'Staff code', value: item.staff.staff_code });
  if (Number(item.bonus) > 0) lines.push({ label: 'Bonus', value: formatINR(item.bonus) });
  if (item.remarks) lines.push({ label: 'Remarks', value: item.remarks });
  if (item.review_reason) lines.push({ label: 'Review note', value: item.review_reason });
  const attendance = item.attendance_summary;
  if (attendance?.input_mode === 'MANUAL_SUMMARY') {
    lines.push({
      label: 'Attendance totals',
      value: `${attendance.cl_days ?? 0} casual leave, ${attendance.non_cl_days ?? 0} other leave, ${attendance.late_count ?? 0} late marks`,
    });
  }
  if (item.holiday_override) {
    lines.push({ label: 'Holiday count', value: String(item.holiday_override.holiday_count) });
  }
  if (item.payment_method) lines.push({ label: 'Payment method', value: item.payment_method });
  if (item.payment_reference) lines.push({ label: 'Transaction reference', value: item.payment_reference });
  if (item.workflow_status && item.status !== 'paid') {
    lines.push({ label: 'Payroll step', value: workflowLabel(item.workflow_status) });
  }
  return lines;
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

const AVATAR_TONES = [
  { bg: '#EEF2FF', fg: '#4338CA' },
  { bg: '#ECFDF5', fg: '#047857' },
  { bg: '#FFF7ED', fg: '#C2410C' },
  { bg: '#FDF2F8', fg: '#BE185D' },
  { bg: '#F0F9FF', fg: '#0369A1' },
  { bg: '#F5F3FF', fg: '#6D28D9' },
];

function avatarTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash];
}

function StaffAvatar({ url, name, colors }: { url?: string | null; name: string; colors: Palette }) {
  const [failed, setFailed] = useState(false);
  const tone = avatarTone(name);
  if (!url || failed) {
    return (
      <View style={[styles.avatar, { backgroundColor: colors.page === '#0F172A' ? colors.selectedWash : tone.bg }]}>
        <Text style={[styles.avatarText, { color: colors.page === '#0F172A' ? colors.primary : tone.fg }]}>{initials(name)}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: url }}
      accessibilityIgnoresInvertColors
      style={styles.avatarImage}
      onError={() => setFailed(true)}
    />
  );
}

function StatusBadge({
  paid,
  review,
  colors,
  date,
}: {
  paid: boolean;
  review?: boolean;
  colors: Palette;
  date?: string;
}) {
  const label = paid ? 'Paid' : review ? 'Needs review' : 'Pending';
  const bg = paid ? colors.paidBg : colors.pendingBg;
  const fg = paid ? colors.paidFg : colors.pendingFg;
  return (
    <View style={styles.badgeWrap}>
      <View style={[styles.badge, { backgroundColor: bg }]}>
        <Ionicons name={paid ? 'checkmark-circle' : review ? 'alert-circle' : 'time-outline'} size={13} color={fg} />
        <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
      </View>
      {paid && date ? (
        <Text style={[styles.paidDate, { color: colors.secondary }]}>{date}</Text>
      ) : null}
    </View>
  );
}

function MoneyText({
  value,
  negative,
  positive,
  muted,
  emphasis,
  colors,
}: {
  value: string;
  negative?: boolean;
  positive?: boolean;
  muted?: boolean;
  emphasis?: boolean;
  colors: Palette;
}) {
  const color = negative ? colors.dangerFg : positive ? colors.paidFg : muted ? colors.muted : colors.text;
  return (
    <Text style={[styles.money, emphasis && styles.moneyEmphasis, { color }]}>
      {value}
    </Text>
  );
}

function DisbursementHero({
  totalAmount,
  paidAmount,
  pendingAmount,
  staffCount,
  paidCount,
  pendingCount,
  amountPercent,
  stacked,
  colors,
}: {
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  staffCount: number;
  paidCount: number;
  pendingCount: number;
  amountPercent: number;
  stacked: boolean;
  colors: Palette;
}) {
  const width = `${Math.max(0, Math.min(100, amountPercent))}%` as `${number}%`;
  const complete = amountPercent >= 100 && staffCount > 0;
  return (
    <View
      accessibilityLabel={`Total payroll ${formatINR(totalAmount)}. Disbursed ${formatINR(paidAmount)}. Outstanding ${formatINR(pendingAmount)}. ${amountPercent}% of payroll disbursed. ${paidCount} of ${staffCount} staff paid.`}
      style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.heroStats, stacked && styles.heroStatsStack]}>
        <HeroStat label="Total payroll" value={formatINR(totalAmount)} hint={`${staffCount} staff`} colors={colors} />
        {stacked ? null : <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />}
        <HeroStat label="Disbursed" value={formatINR(paidAmount)} hint={`${paidCount} paid`} tone="paid" colors={colors} />
        {stacked ? null : <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />}
        <HeroStat label="Outstanding" value={formatINR(pendingAmount)} hint={`${pendingCount} pending`} tone="pending" colors={colors} />
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`${formatINR(paidAmount)} of ${formatINR(totalAmount)} disbursed`}
        accessibilityValue={{ min: 0, max: 100, now: amountPercent, text: `${amountPercent}%` }}
        style={styles.heroMeter}
      >
        <View style={[styles.meterTrack, { backgroundColor: colors.track }]}>
          <LinearGradient
            colors={complete ? ['#059669', '#10B981'] : ['#4F46E5', '#0D9488']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.meterFill, { width }]}
          />
        </View>
        <Text style={[styles.heroMeterCaption, { color: colors.secondary }]}>
          {amountPercent}% disbursed · {paidCount} of {staffCount} staff paid
        </Text>
      </View>
    </View>
  );
}

function HeroStat({
  label,
  value,
  hint,
  tone,
  colors,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'paid' | 'pending';
  colors: Palette;
}) {
  const valueColor = tone === 'paid' ? colors.paidFg : tone === 'pending' ? colors.pendingFg : colors.text;
  return (
    <View style={styles.heroStat} accessibilityLabel={`${label}, ${value}, ${hint}`}>
      <Text style={[styles.heroStatLabel, { color: colors.secondary }]}>{label}</Text>
      <Text style={[styles.heroStatValue, { color: valueColor }]}>{value}</Text>
      <Text style={[styles.heroStatHint, { color: colors.muted }]}>{hint}</Text>
    </View>
  );
}

function SortHeader({
  label,
  column,
  sort,
  align,
  columnStyle,
  colors,
  onSort,
}: {
  label: string;
  column: SortKey;
  sort: { key: SortKey; dir: SortDir } | null;
  align?: 'right';
  columnStyle: object | number;
  colors: Palette;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === column;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sort by ${label}${active ? `, ${sort?.dir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      onPress={() => onSort(column)}
      style={(state) => [styles.headBtn, columnStyle, align === 'right' && styles.headBtnRight, { alignItems: 'center' }, pressStyle(state)]}
    >
      <Text style={[styles.headText, { color: active ? colors.text : colors.secondary }]} numberOfLines={1}>{label}</Text>
      {active ? (
        <Ionicons name={sort?.dir === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} color={colors.primary} />
      ) : null}
    </Pressable>
  );
}

function comparePayroll(a: PayrollEntry, b: PayrollEntry, key: SortKey, dir: SortDir) {
  const sign = dir === 'asc' ? 1 : -1;
  const value = (item: PayrollEntry) => {
    switch (key) {
      case 'name': return staffName(item).toLowerCase();
      case 'role': return staffRole(item).toLowerCase();
      case 'base': return Number(item.base_salary) || 0;
      case 'deductions': return Number(item.deductions) || 0;
      case 'adjustment': return Number(item.salary_adjustment) || 0;
      case 'net': return Number(item.net_salary) || 0;
      case 'status': return item.status === 'paid' ? 1 : 0;
      default: return 0;
    }
  };
  const av = value(a);
  const bv = value(b);
  if (av < bv) return -1 * sign;
  if (av > bv) return 1 * sign;
  return staffName(a).localeCompare(staffName(b));
}

function DetailBlock({ item, colors, includeBreakdown }: { item: PayrollEntry; colors: Palette; includeBreakdown: boolean }) {
  const lines = detailLines(item);
  const deduction = formatDeduction(item.deductions);
  const adjustment = formatAdjustment(item.salary_adjustment);
  return (
    <View style={[styles.detailBlock, { backgroundColor: colors.neutralBg, borderTopColor: colors.border }]}>
      {includeBreakdown ? (
        <View style={styles.detailGrid}>
          <DetailPair label="Base salary" value={formatINR(item.base_salary ?? item.net_salary)} colors={colors} />
          <DetailPair label="Deductions" value={deduction.text} negative={deduction.negative} muted={deduction.muted} colors={colors} />
          <DetailPair label="Adjustments" value={adjustment.text} negative={adjustment.negative} positive={adjustment.positive} muted={adjustment.muted} colors={colors} />
        </View>
      ) : null}
      {lines.length === 0 && !includeBreakdown ? (
        <Text style={[styles.detailEmpty, { color: colors.secondary }]}>No additional notes for this salary.</Text>
      ) : (
        lines.map((line) => (
          <View key={line.label} style={styles.detailLine}>
            <Text style={[styles.detailKey, { color: colors.secondary }]}>{line.label}</Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>{line.value}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function DetailPair({
  label,
  value,
  negative,
  positive,
  muted,
  colors,
}: {
  label: string;
  value: string;
  negative?: boolean;
  positive?: boolean;
  muted?: boolean;
  colors: Palette;
}) {
  const color = negative ? colors.dangerFg : positive ? colors.paidFg : muted ? colors.muted : colors.text;
  return (
    <View style={styles.detailPair}>
      <Text style={[styles.detailKey, { color: colors.secondary }]}>{label}</Text>
      <Text style={[styles.money, { color }]}>{value}</Text>
    </View>
  );
}

type RowProps = {
  item: PayrollEntry;
  colors: Palette;
  table: boolean;
  expanded: boolean;
  isLast: boolean;
  canProcess: boolean;
  canAdjust: boolean;
  onToggle: () => void;
  onPay: () => void;
  onAdjust: () => void;
  onView: () => void;
};

function webTitle(title: string) {
  return Platform.OS === 'web' ? ({ title } as object) : null;
}

function PayrollRow({
  item,
  colors,
  table,
  expanded,
  isLast,
  canProcess,
  canAdjust,
  onToggle,
  onPay,
  onAdjust,
  onView,
}: RowProps) {
  const name = staffName(item);
  const role = staffRole(item);
  const paid = item.status === 'paid';
  const review = !paid && needsPaySetup(item);
  const deduction = formatDeduction(item.deductions);
  const adjustment = formatAdjustment(item.salary_adjustment);
  const payDate = formatPayDate(item.payment_date);
  const netZero = Math.abs(Number(item.net_salary) || 0) === 0;
  const baseZero = Math.abs(Number(item.base_salary ?? item.net_salary) || 0) === 0;
  const expandable = detailLines(item).length > 0 || !table;

  const actions = (
    <View style={[styles.actionCol, !table && styles.actionColCard]}>
      {paid ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View payment details for ${name}`}
          onPress={onView}
          style={(state) => [styles.secondaryBtn, styles.compactBtn, { borderColor: colors.border, backgroundColor: colors.surface }, pressStyle(state)]}
        >
          <Ionicons name="receipt-outline" size={15} color={colors.text} />
          <Text style={[styles.secondaryBtnText, { color: colors.text }]}>{table ? 'Receipt' : 'View payment details'}</Text>
        </Pressable>
      ) : (
        <>
          {canAdjust ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit adjustments for ${name}`}
              onPress={onAdjust}
              style={(state) => [styles.secondaryBtn, styles.compactBtn, { borderColor: colors.border, backgroundColor: colors.surface }, pressStyle(state)]}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>{table ? 'Adjust' : 'Edit adjustments'}</Text>
            </Pressable>
          ) : null}
          {canProcess ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Pay salary for ${name}, ${formatINR(item.net_salary)}`}
              onPress={onPay}
              style={(state) => [styles.primaryBtn, styles.compactBtn, { backgroundColor: colors.primary }, pressStyle(state)]}
            >
              <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Pay salary</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );

  if (!table) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, expanded && { borderColor: colors.primary }]}>
        <View style={styles.cardTop}>
          <StaffAvatar url={item.staff?.person?.photo_url} name={name} colors={colors} />
          <View style={styles.cardIdentity}>
            <Text style={[styles.staffName, { color: colors.text }]} numberOfLines={2}>{name}</Text>
            <Text style={[styles.roleText, { color: colors.secondary }]} numberOfLines={1}>{role}</Text>
          </View>
          <View style={styles.cardNet}>
            <Text style={[styles.cardNetLabel, { color: colors.secondary }]}>Net payable</Text>
            <MoneyText
              value={formatINR(item.net_salary)}
              emphasis
              muted={netZero}
              positive={paid && !netZero}
              colors={colors}
            />
          </View>
        </View>
        <View style={styles.cardStatusRow}>
          <StatusBadge paid={paid} review={review} colors={colors} date={payDate} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${expanded ? 'Hide' : 'Show'} salary details for ${name}`}
            accessibilityState={{ expanded }}
            onPress={onToggle}
            style={(state) => [styles.textBtn, pressStyle(state)]}
          >
            <Text style={[styles.textBtnLabel, { color: colors.primary }]}>{expanded ? 'Hide details' : 'Salary details'}</Text>
          </Pressable>
        </View>
        {actions}
        {expanded ? <DetailBlock item={item} colors={colors} includeBreakdown /> : null}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.tableRowWrap,
        {
          backgroundColor: expanded ? colors.selectedWash : colors.surface,
          borderColor: colors.border,
        },
        isLast && styles.tableRowLast,
        Platform.OS === 'web' && !expanded
          ? ({ ':hover': { backgroundColor: colors.hover } } as object)
          : null,
      ]}
    >
      <View style={styles.tableRow}>
        <View style={[styles.cell, styles.colStaff]}>
          <StaffAvatar url={item.staff?.person?.photo_url} name={name} colors={colors} />
          <View style={styles.staffText}>
            <View style={styles.nameLine}>
              <Text style={[styles.staffName, styles.nameLineText, { color: colors.text }]} numberOfLines={1}>{name}</Text>
              {expandable ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${expanded ? 'Hide' : 'Show'} salary details for ${name}`}
                  accessibilityState={{ expanded }}
                  onPress={onToggle}
                  {...webTitle(expanded ? 'Hide details' : 'Salary details')}
                  style={(state) => [styles.detailToggle, pressStyle(state)]}
                >
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
                </Pressable>
              ) : null}
            </View>
            {item.staff?.staff_code ? (
              <Text style={[styles.staffCode, { color: colors.muted }]} numberOfLines={1}>{item.staff.staff_code}</Text>
            ) : null}
          </View>
        </View>
        <View style={[styles.cell, styles.colRole]}>
          <Text style={[styles.roleText, { color: colors.secondary }]} numberOfLines={2}>{role}</Text>
        </View>
        <View style={[styles.cell, styles.colMoney]}>
          <MoneyText value={formatINR(item.base_salary ?? item.net_salary)} muted={baseZero} colors={colors} />
        </View>
        <View style={[styles.cell, styles.colMoney]}>
          <MoneyText value={deduction.text} negative={deduction.negative} muted={deduction.muted} colors={colors} />
        </View>
        <View style={[styles.cell, styles.colMoney]}>
          <MoneyText value={adjustment.text} negative={adjustment.negative} positive={adjustment.positive} muted={adjustment.muted} colors={colors} />
        </View>
        <View style={[styles.cell, styles.colMoney]}>
          <MoneyText value={formatINR(item.net_salary)} emphasis muted={netZero} positive={paid && !netZero} colors={colors} />
          {netZero && !paid ? (
            <Text style={[styles.netHint, { color: colors.muted }]}>Nothing due</Text>
          ) : null}
        </View>
        <View style={[styles.cell, styles.colStatus]}>
          <StatusBadge paid={paid} review={review} colors={colors} date={payDate} />
        </View>
        <View style={[styles.cell, styles.colActions]}>{actions}</View>
      </View>
      {expanded ? <DetailBlock item={item} colors={colors} includeBreakdown={false} /> : null}
    </View>
  );
}

function pressStyle(state: PressState) {
  return [
    state.pressed && { opacity: 0.86 },
    focusRing(state.focused),
    Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
  ];
}

function PayDialog({
  item,
  phase,
  error,
  reference,
  isAdmin,
  colors,
  onChangeReference,
  onClose,
  onConfirm,
}: {
  item: PayrollEntry | null;
  phase: PayPhase;
  error: string;
  reference: string;
  isAdmin: boolean;
  colors: Palette;
  onChangeReference: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!item) return null;
  const name = staffName(item);
  const month = periodLabel(item.payroll_month, item.payroll_year);
  const amount = formatINR(item.net_salary);
  const deduction = formatDeduction(item.deductions);
  const adjustment = formatAdjustment(item.salary_adjustment);
  const teacher = item.calculation_engine === 'teacher-salary-v1';
  const blocked = needsPaySetup(item);
  const force = blocked && isAdmin;
  const canConfirm = !blocked || isAdmin;
  const showReference = teacher && !blocked;
  const submitting = phase === 'submitting';
  const success = phase === 'success';
  const confirmLabel = force ? `Record forced payment of ${amount}` : `Confirm payment of ${amount}`;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!submitting) onClose();
      }}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close dialog"
          disabled={submitting}
          onPress={() => {
            if (!submitting) onClose();
          }}
          style={styles.backdropHit}
        />
        <View
          style={[styles.dialog, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityLabel={success ? `Payment recorded for ${name}` : `Review salary payment for ${name}`}
        >
          <View style={styles.dialogHead}>
            <Text style={[styles.dialogTitle, { color: colors.text }]} accessibilityRole="header">
              {success ? 'Payment recorded' : 'Review salary payment'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              disabled={submitting}
              onPress={onClose}
              style={(state) => [styles.iconBtn, pressStyle(state)]}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          {success ? (
            <View style={[styles.notice, { backgroundColor: colors.paidBg }]}>
              <Ionicons name="checkmark-circle" size={18} color={colors.paidFg} />
              <Text style={[styles.noticeText, { color: colors.paidFg }]}>
                {name} is marked paid for {month}. {amount} is recorded in the payroll register.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.dialogScroll} keyboardShouldPersistTaps="handled">
              <Text style={[styles.dialogLead, { color: colors.secondary }]}>
                Check this salary before recording the payment for {month}.
              </Text>
              <Text style={[styles.dialogName, { color: colors.text }]}>{name}</Text>
              <Text style={[styles.dialogRole, { color: colors.secondary }]}>{staffRole(item)} · {month}</Text>

              <View style={[styles.breakdown, { borderColor: colors.border }]}>
                <BreakdownRow label="Base salary" value={formatINR(item.base_salary ?? item.net_salary)} colors={colors} />
                <BreakdownRow label="Deductions" value={deduction.text} negative={deduction.negative} muted={deduction.muted} colors={colors} />
                <BreakdownRow label="Adjustments" value={adjustment.text} negative={adjustment.negative} positive={adjustment.positive} muted={adjustment.muted} colors={colors} />
                <BreakdownRow label="Net payable" value={amount} emphasis colors={colors} />
              </View>

              <Text style={[styles.dialogNote, { color: colors.secondary }]}>
                Confirming marks this salary as paid in the payroll register.
              </Text>

              {blocked ? (
                <View style={[styles.notice, { backgroundColor: colors.pendingBg }]} accessibilityLiveRegion="polite">
                  <Ionicons name="alert-circle" size={18} color={colors.pendingFg} />
                  <Text style={[styles.noticeText, { color: colors.pendingFg }]}>
                    {item.review_reason || 'Validate, approve, and lock this payslip before it can be paid.'}
                    {force ? ' You can still record a forced payment.' : ' An administrator needs to resolve this before payment.'}
                  </Text>
                </View>
              ) : null}

              {showReference ? (
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>Transaction reference</Text>
                  <AppTextInput
                    value={reference}
                    onChangeText={onChangeReference}
                    editable={!submitting}
                    placeholder="Reference for this payment"
                    placeholderTextColor={colors.secondary}
                    accessibilityLabel="Transaction reference"
                    autoCorrect={false}
                    autoCapitalize="none"
                    style={[styles.fieldInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                  />
                  <Text style={[styles.fieldHelp, { color: colors.secondary }]}>Required to record this payment.</Text>
                </View>
              ) : null}

              {phase === 'error' && error ? (
                <View style={[styles.notice, { backgroundColor: colors.dangerBg }]} accessibilityLiveRegion="polite">
                  <Ionicons name="alert-circle" size={18} color={colors.dangerFg} />
                  <Text style={[styles.noticeText, { color: colors.dangerFg }]}>{error}</Text>
                </View>
              ) : null}
            </ScrollView>
          )}

          <View style={styles.dialogActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={success ? 'Done' : 'Cancel'}
              disabled={submitting}
              onPress={onClose}
              style={(state) => [styles.secondaryBtn, styles.dialogBtn, { borderColor: colors.border }, pressStyle(state)]}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>{success ? 'Done' : 'Cancel'}</Text>
            </Pressable>
            {!success && canConfirm ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={confirmLabel}
                accessibilityState={{ disabled: submitting, busy: submitting }}
                disabled={submitting}
                onPress={onConfirm}
                style={(state) => [
                  styles.primaryBtn,
                  styles.dialogBtn,
                  { backgroundColor: colors.primary },
                  submitting && { opacity: 0.7 },
                  pressStyle(state),
                ]}
              >
                {submitting ? <ActivityIndicator color={colors.onPrimary} size="small" /> : null}
                <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
                  {submitting ? 'Recording payment…' : confirmLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function BreakdownRow({
  label,
  value,
  negative,
  positive,
  muted,
  emphasis,
  colors,
}: {
  label: string;
  value: string;
  negative?: boolean;
  positive?: boolean;
  muted?: boolean;
  emphasis?: boolean;
  colors: Palette;
}) {
  const color = negative ? colors.dangerFg : positive ? colors.paidFg : muted ? colors.muted : colors.text;
  return (
    <View style={[styles.breakdownRow, emphasis && styles.breakdownEmphasisRow, emphasis && { borderTopColor: colors.border, backgroundColor: colors.neutralBg }]}>
      <Text style={[styles.breakdownLabel, emphasis && styles.breakdownEmphasis, { color: emphasis ? colors.text : colors.secondary }]}>{label}</Text>
      <Text style={[styles.money, emphasis && styles.moneyEmphasis, { color }]}>{value}</Text>
    </View>
  );
}

function PaymentDetailsDialog({
  item,
  colors,
  onClose,
}: {
  item: PayrollEntry | null;
  colors: Palette;
  onClose: () => void;
}) {
  if (!item) return null;
  const name = staffName(item);
  const month = periodLabel(item.payroll_month, item.payroll_year);
  const deduction = formatDeduction(item.deductions);
  const adjustment = formatAdjustment(item.salary_adjustment);
  const payDate = formatPayDate(item.payment_date);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close dialog" onPress={onClose} style={styles.backdropHit} />
        <View
          style={[styles.dialog, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityLabel={`Payment details for ${name}`}
        >
          <View style={styles.dialogHead}>
            <Text style={[styles.dialogTitle, { color: colors.text }]} accessibilityRole="header">Payment details</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={(state) => [styles.iconBtn, pressStyle(state)]}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView style={styles.dialogScroll}>
            <Text style={[styles.dialogName, { color: colors.text }]}>{name}</Text>
            <Text style={[styles.dialogRole, { color: colors.secondary }]}>{staffRole(item)} · {month}</Text>
            <View style={styles.cardStatusRow}>
              <StatusBadge paid colors={colors} date={payDate} />
            </View>
            <View style={[styles.breakdown, { borderColor: colors.border }]}>
              <BreakdownRow label="Base salary" value={formatINR(item.base_salary ?? item.net_salary)} colors={colors} />
              <BreakdownRow label="Deductions" value={deduction.text} negative={deduction.negative} muted={deduction.muted} colors={colors} />
              <BreakdownRow label="Adjustments" value={adjustment.text} negative={adjustment.negative} positive={adjustment.positive} muted={adjustment.muted} colors={colors} />
              <BreakdownRow label="Amount recorded" value={formatINR(item.net_salary)} emphasis positive={item.status === 'paid'} colors={colors} />
            </View>
            {payDate ? <DetailLine label="Payment date" value={payDate} colors={colors} /> : null}
            {item.payment_method ? <DetailLine label="Payment method" value={item.payment_method} colors={colors} /> : null}
            {item.payment_reference ? <DetailLine label="Transaction reference" value={item.payment_reference} colors={colors} /> : null}
            {item.remarks ? <DetailLine label="Remarks" value={item.remarks} colors={colors} /> : null}
          </ScrollView>
          <View style={styles.dialogActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close payment details"
              onPress={onClose}
              style={(state) => [styles.primaryBtn, styles.dialogBtn, { backgroundColor: colors.primary }, pressStyle(state)]}
            >
              <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailLine({ label, value, colors }: { label: string; value: string; colors: Palette }) {
  return (
    <View style={styles.detailLine}>
      <Text style={[styles.detailKey, { color: colors.secondary }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

export interface PayrollScreenProps {
  isAdmin?: boolean;
  title?: string;
  showHeader?: boolean;
}

export default function PayrollScreen({ isAdmin = false, showHeader = true }: PayrollScreenProps) {
  const { isDark } = useTheme();
  const colors = palette(isDark);
  const { shellActive } = useAccountsWebChrome();
  const { width } = useWindowDimensions();
  const table = width >= 1100;
  const headerRow = width >= 1100;

  const {
    payrollData,
    loading,
    summary,
    selectedMonth,
    selectedYear,
    setSelectedMonth,
    setSelectedYear,
    fetchPayroll,
    markAsPaid,
    distributionBlocked,
    accountsDistributionBlocked,
    distributionLoading,
    setDistributionBlockedForAccounts,
  } = usePayroll({ isAdmin });

  const [adjustTarget, setAdjustTarget] = useState<PayrollEntry | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<PayrollEntry | null>(null);
  const [payTarget, setPayTarget] = useState<PayrollEntry | null>(null);
  const [payPhase, setPayPhase] = useState<PayPhase>('review');
  const [payError, setPayError] = useState('');
  const [payReference, setPayReference] = useState('');
  const submitLock = useRef(false);
  const [toggleSaving, setToggleSaving] = useState(false);
  const [staffPayslipsEnabled, setStaffPayslipsEnabled] = useState(true);
  const [payslipsToggleLoading, setPayslipsToggleLoading] = useState(false);
  const [payslipsToggleSaving, setPayslipsToggleSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchPayroll();
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    setPayslipsToggleLoading(true);
    AdminService.getStaffPayslipsSetting()
      .then((res) => {
        if (alive) setStaffPayslipsEnabled(res?.enabled !== false);
      })
      .catch(() => {
        if (alive) setStaffPayslipsEnabled(true);
      })
      .finally(() => {
        if (alive) setPayslipsToggleLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin && distributionBlocked) setSettingsOpen(true);
  }, [isAdmin, distributionBlocked]);

  const canProcess = isAdmin || !accountsDistributionBlocked;
  const now = new Date();
  const isCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear();

  const shiftMonth = (delta: number) => {
    const date = new Date(selectedYear, selectedMonth - 1 + delta, 1);
    setSelectedMonth(date.getMonth() + 1);
    setSelectedYear(date.getFullYear());
  };

  const goCurrentMonth = () => {
    setSelectedMonth(now.getMonth() + 1);
    setSelectedYear(now.getFullYear());
  };

  const openPay = (item: PayrollEntry) => {
    submitLock.current = false;
    setPayTarget(item);
    setPayPhase('review');
    setPayError('');
    setPayReference('');
  };

  const closePay = () => {
    if (payPhase === 'submitting') return;
    setPayTarget(null);
    setPayPhase('review');
    setPayError('');
  };

  const confirmPay = async () => {
    if (!payTarget || submitLock.current || payPhase === 'submitting' || payPhase === 'success') return;
    const teacher = payTarget.calculation_engine === 'teacher-salary-v1';
    const blocked = needsPaySetup(payTarget);
    if (blocked && !isAdmin) return;
    if (teacher && !blocked && !payReference.trim()) {
      setPayPhase('error');
      setPayError('Enter the transaction reference for this payment.');
      return;
    }
    submitLock.current = true;
    setPayPhase('submitting');
    setPayError('');
    const result = await markAsPaid(payTarget.id, {
      engine: payTarget.calculation_engine,
      paymentReference: payReference.trim() || undefined,
      force: blocked,
    });
    submitLock.current = false;
    if (!result.ok) {
      setPayPhase('error');
      setPayError(result.message || 'Payment was not recorded.');
      return;
    }
    setPayPhase('success');
    fetchPayroll();
  };

  const handleToggleDistribution = async (blocked: boolean) => {
    setToggleSaving(true);
    const res = await setDistributionBlockedForAccounts(blocked);
    setToggleSaving(false);
    if (!res.ok) alertCompat('Error', res.message || 'Failed to update setting.');
  };

  const handleToggleStaffPayslips = async (enabled: boolean) => {
    setPayslipsToggleSaving(true);
    try {
      const res = await AdminService.setStaffPayslipsEnabled(enabled);
      setStaffPayslipsEnabled(res?.enabled !== false);
    } catch (err: unknown) {
      alertCompat('Error', err instanceof Error ? err.message : 'Failed to update payslips setting.');
    } finally {
      setPayslipsToggleSaving(false);
    }
  };

  const paidCount = payrollData.filter((entry) => entry.status === 'paid').length;
  const pendingCount = payrollData.filter((entry) => entry.status === 'pending').length;
  const totalAmount = summary.total_paid + summary.total_pending;
  const amountPercent = totalAmount > 0 ? Math.round((summary.total_paid / totalAmount) * 100) : 0;
  const monthName = periodLabel(selectedMonth, selectedYear);
  const statusLine = payrollData.length === 0
    ? `Salaries for ${monthName}`
    : pendingCount === 0
      ? `Every salary for ${monthName} is paid.`
      : `${pendingCount} of ${payrollData.length} ${payrollData.length === 1 ? 'salary' : 'salaries'} still to pay for ${monthName}.`;

  const toggleSort = (key: SortKey) => {
    setSort((current) => {
      if (current?.key !== key) {
        const dir: SortDir = key === 'name' || key === 'role' ? 'asc' : 'desc';
        return { key, dir };
      }
      return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
    });
  };

  const filteredData = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = payrollData.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!needle) return true;
      const code = item.staff?.staff_code || '';
      return staffName(item).toLowerCase().includes(needle)
        || staffRole(item).toLowerCase().includes(needle)
        || code.toLowerCase().includes(needle);
    });
    if (!sort) return matched;
    return [...matched].sort((a, b) => comparePayroll(a, b, sort.key, sort.dir));
  }, [payrollData, statusFilter, query, sort]);

  const resetFilters = () => {
    setQuery('');
    setStatusFilter('all');
  };

  const filtersActive = query.trim().length > 0 || statusFilter !== 'all';

  const listHeader = (
    <View style={styles.headerBlock}>
      <View style={[styles.titleRow, headerRow && styles.titleRowWide]}>
        <View style={styles.titleCopy}>
          <Text style={[styles.crumb, { color: colors.secondary }]} accessibilityLabel="Breadcrumb, Finance, Payroll">
            Finance  /  Payroll
          </Text>
          <Text style={[styles.pageTitle, { color: colors.text }]} accessibilityRole="header">Staff Payroll</Text>
          <Text style={[styles.pageSub, { color: colors.secondary }]}>{statusLine}</Text>
        </View>

        <View style={styles.monthCluster}>
          <View style={[styles.monthBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              onPress={() => shiftMonth(-1)}
              style={(state) => [styles.iconBtn, pressStyle(state)]}
            >
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </Pressable>
            <Text style={[styles.monthLabel, { color: colors.text }]} accessibilityLabel={monthName}>{monthName}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              onPress={() => shiftMonth(1)}
              style={(state) => [styles.iconBtn, pressStyle(state)]}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.text} />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Current month"
            accessibilityState={{ disabled: isCurrentMonth }}
            disabled={isCurrentMonth}
            onPress={goCurrentMonth}
            style={(state) => [
              styles.secondaryBtn,
              { borderColor: colors.border, backgroundColor: colors.surface },
              isCurrentMonth && { opacity: 0.45 },
              pressStyle(state),
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Current month</Text>
          </Pressable>
          {(isAdmin || distributionBlocked) && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Payroll controls"
              accessibilityState={{ expanded: settingsOpen }}
              onPress={() => setSettingsOpen((open) => !open)}
              style={(state) => [
                styles.secondaryBtn,
                { borderColor: colors.border, backgroundColor: settingsOpen ? colors.selectedWash : colors.surface },
                pressStyle(state),
              ]}
            >
              <Ionicons name="options-outline" size={16} color={colors.text} />
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Controls</Text>
            </Pressable>
          )}
        </View>
      </View>

      {settingsOpen && isAdmin ? (
        <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.panelTitle, { color: colors.text }]}>Payroll controls</Text>
          <ControlRow
            label="Accounts can release pay"
            help={distributionBlocked ? 'Blocked. Accounts cannot record salary payments.' : 'Open. Accounts can record salary payments.'}
            value={!distributionBlocked}
            disabled={toggleSaving || distributionLoading}
            colors={colors}
            onChange={(next) => { void handleToggleDistribution(!next); }}
          />
          <ControlRow
            label="Staff portal payslips"
            help={staffPayslipsEnabled ? 'Visible to staff.' : 'Hidden from staff.'}
            value={staffPayslipsEnabled}
            disabled={payslipsToggleLoading || payslipsToggleSaving}
            colors={colors}
            onChange={(next) => { void handleToggleStaffPayslips(next); }}
          />
        </View>
      ) : null}

      {!isAdmin && distributionBlocked ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerBg }]}>
          <Ionicons name="lock-closed" size={18} color={colors.dangerFg} />
          <View style={styles.noticeCopy}>
            <Text style={[styles.noticeTitle, { color: colors.dangerFg }]}>Distribution paused</Text>
            <Text style={[styles.noticeText, { color: colors.dangerFg }]}>You can review payroll, but you cannot record salary payments.</Text>
          </View>
        </View>
      ) : null}

      <DisbursementHero
        totalAmount={totalAmount}
        paidAmount={summary.total_paid}
        pendingAmount={summary.total_pending}
        staffCount={payrollData.length}
        paidCount={paidCount}
        pendingCount={pendingCount}
        amountPercent={amountPercent}
        stacked={width < 760}
        colors={colors}
      />

      <View style={[styles.toolbar, width >= 900 && styles.toolbarWide]}>
        <View style={[styles.segment, { backgroundColor: colors.neutralBg, borderColor: colors.border }]} accessibilityRole="tablist">
          {([
            ['all', 'All', payrollData.length],
            ['pending', 'Pending', pendingCount],
            ['paid', 'Paid', paidCount],
          ] as const).map(([key, label, count]) => {
            const selected = statusFilter === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`${label}, ${count}`}
                onPress={() => setStatusFilter(key)}
                style={(state) => [
                  styles.segmentBtn,
                  selected && { backgroundColor: colors.surface, ...Shadows.sm },
                  pressStyle(state),
                ]}
              >
                <Text style={[styles.filterText, { color: selected ? colors.text : colors.secondary }]}>{label}</Text>
                <View style={[styles.countPill, { backgroundColor: selected ? colors.selectedWash : 'transparent' }]}>
                  <Text style={[styles.countPillText, { color: selected ? colors.primary : colors.secondary }]}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <AppTextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, role, or staff code"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search by staff name, role, or staff code"
            autoCorrect={false}
            autoCapitalize="none"
            style={[styles.searchInput, { color: colors.text }]}
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
              style={(state) => [styles.iconBtn, pressStyle(state)]}
            >
              <Ionicons name="close-circle" size={18} color={colors.secondary} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {filtersActive ? (
        <Text style={[styles.resultCount, { color: colors.secondary }]}>
          Showing {filteredData.length} of {payrollData.length} staff
        </Text>
      ) : null}
    </View>
  );

  const tableHead = table && filteredData.length > 0 ? (
    <View style={[styles.tableHead, { backgroundColor: colors.neutralBg, borderColor: colors.border }]}>
      <SortHeader label="Staff member" column="name" sort={sort} columnStyle={styles.colStaff} colors={colors} onSort={toggleSort} />
      <SortHeader label="Role" column="role" sort={sort} columnStyle={styles.colRole} colors={colors} onSort={toggleSort} />
      <SortHeader label="Base salary" column="base" sort={sort} align="right" columnStyle={styles.colMoney} colors={colors} onSort={toggleSort} />
      <SortHeader label="Deductions" column="deductions" sort={sort} align="right" columnStyle={styles.colMoney} colors={colors} onSort={toggleSort} />
      <SortHeader label="Adjustments" column="adjustment" sort={sort} align="right" columnStyle={styles.colMoney} colors={colors} onSort={toggleSort} />
      <SortHeader label="Net payable" column="net" sort={sort} align="right" columnStyle={styles.colMoney} colors={colors} onSort={toggleSort} />
      <SortHeader label="Status" column="status" sort={sort} columnStyle={styles.colStatus} colors={colors} onSort={toggleSort} />
      <Text style={[styles.headText, styles.colActions, styles.headRight, { color: colors.secondary }]}>Actions</Text>
    </View>
  ) : null;

  const emptyState = (
    <View style={[styles.empty, table && styles.emptyInTable, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.neutralBg }]}>
        <Ionicons name={filtersActive ? 'search-outline' : 'people-outline'} size={22} color={colors.secondary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {filtersActive ? 'No matching staff' : `No payroll for ${monthName}`}
      </Text>
      <Text style={[styles.emptyBody, { color: colors.secondary }]}>
        {filtersActive
          ? 'No staff match this search or status. Reset to see the full list.'
          : 'Salaries appear here once they are generated for this month.'}
      </Text>
      {filtersActive ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reset search and filters"
          onPress={resetFilters}
          style={(state) => [styles.primaryBtn, pressStyle(state), { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Reset search and filters</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.page, { backgroundColor: colors.page }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.page} />
      {showHeader && !shellActive ? <AdminHeader title="Staff Payroll" hideTitle showBackButton /> : null}

      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading && payrollData.length > 0} onRefresh={fetchPayroll} />}
      >
        {listHeader}
        {loading && payrollData.length === 0 ? (
          <View style={[styles.tableCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {[0, 1, 2, 3].map((key) => (
              <View key={key} style={[styles.skeleton, { backgroundColor: colors.neutralBg }]} />
            ))}
          </View>
        ) : (
          <View style={table ? [styles.tableCard, { backgroundColor: colors.surface, borderColor: colors.border }] : styles.cardList}>
            {tableHead}
            {filteredData.map((item, index) => (
              <PayrollRow
                key={item.id}
                item={item}
                colors={colors}
                table={table}
                expanded={expandedId === item.id}
                isLast={index === filteredData.length - 1}
                canProcess={canProcess}
                canAdjust={!['APPROVED', 'LOCKED', 'PAID'].includes(item.workflow_status || '')}
                onToggle={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                onPay={() => openPay(item)}
                onAdjust={() => setAdjustTarget(item)}
                onView={() => setDetailsTarget(item)}
              />
            ))}
            {filteredData.length === 0 ? emptyState : null}
          </View>
        )}
      </ScrollView>

      <PayDialog
        item={payTarget}
        phase={payPhase}
        error={payError}
        reference={payReference}
        isAdmin={isAdmin}
        colors={colors}
        onChangeReference={setPayReference}
        onClose={closePay}
        onConfirm={() => { void confirmPay(); }}
      />
      <PaymentDetailsDialog item={detailsTarget} colors={colors} onClose={() => setDetailsTarget(null)} />
      <PayrollAttendanceAdjustModal
        visible={!!adjustTarget}
        item={adjustTarget}
        isDark={isDark}
        onClose={() => setAdjustTarget(null)}
        onSaved={() => {
          fetchPayroll();
        }}
      />
    </View>
  );
}

function ControlRow({
  label,
  help,
  value,
  disabled,
  colors,
  onChange,
}: {
  label: string;
  help: string;
  value: boolean;
  disabled?: boolean;
  colors: Palette;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.controlRow, { borderTopColor: colors.border }]}>
      <View style={styles.controlCopy}>
        <Text style={[styles.controlLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.controlHelp, { color: colors.secondary }]}>{help}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: '#CBD5E1', true: '#C7D2FE' }}
        thumbColor={value ? colors.primary : '#FFFFFF'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 },
  headerBlock: { gap: 16, marginBottom: 16 },
  titleRow: { gap: 16 },
  titleRowWide: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleCopy: { flexShrink: 1, gap: 4, minWidth: 220 },
  crumb: { fontSize: 14, fontWeight: '600' },
  pageTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  pageSub: { fontSize: 16, lineHeight: 22 },
  monthCluster: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  monthBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 2,
  },
  monthLabel: { fontSize: 16, fontWeight: '700', minWidth: 148, textAlign: 'center' },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 14,
    ...Shadows.sm,
  },
  heroStats: { flexDirection: 'row', alignItems: 'stretch' },
  heroStatsStack: { flexDirection: 'column' },
  heroDivider: { width: 1, marginVertical: 10 },
  heroStat: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  heroStatLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  heroStatValue: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  heroStatHint: { fontSize: 13, fontWeight: '600' },
  heroMeter: { gap: 8, paddingHorizontal: 14 },
  heroMeterCaption: { fontSize: 13, fontWeight: '600' },
  meterTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: 999 },
  toolbar: { gap: 10 },
  toolbarWide: { flexDirection: 'row', alignItems: 'center' },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    gap: 2,
  },
  segmentBtn: {
    minHeight: 36,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countPill: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countPillText: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  filterText: { fontSize: 14, fontWeight: '700' },
  resultCount: { fontSize: 13, fontWeight: '600', marginTop: -6 },
  search: {
    flex: 1,
    minWidth: 220,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 8 },
  tableCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  cardList: { gap: 10 },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  headBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 40,
    paddingHorizontal: 8,
  },
  headBtnRight: { justifyContent: 'flex-end' },
  headText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  headRight: { textAlign: 'right', paddingRight: 8 },
  tableRowWrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  tableRowLast: { borderBottomWidth: 0 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8 },
  cell: { paddingHorizontal: 8, justifyContent: 'center' },
  colStaff: { flex: 2.2, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180 },
  colRole: { flex: 1, minWidth: 88 },
  colMoney: { flex: 1, alignItems: 'flex-end', minWidth: 92 },
  colStatus: { flex: 1.05, minWidth: 118 },
  colActions: { flex: 1.55, minWidth: 210, alignItems: 'flex-end' },
  staffText: { flex: 1, minWidth: 0, gap: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 0 },
  nameLineText: { flexShrink: 1 },
  detailToggle: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  staffName: { fontSize: 15, fontWeight: '700' },
  staffCode: { fontSize: 12, fontWeight: '600' },
  roleText: { fontSize: 14, lineHeight: 18 },
  netHint: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  money: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'], textAlign: 'right' },
  moneyEmphasis: { fontSize: 16, fontWeight: '700' },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 36, height: 36, borderRadius: 18 },
  avatarText: { fontSize: 13, fontWeight: '700' },
  badgeWrap: { gap: 4, alignItems: 'flex-start' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 13, fontWeight: '700' },
  paidDate: { fontSize: 13, fontWeight: '600' },
  actionCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'flex-end', width: '100%' },
  actionColCard: { marginTop: 4, justifyContent: 'flex-start' },
  primaryBtn: {
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  compactBtn: { minHeight: 36, paddingHorizontal: 10, borderRadius: 10 },
  primaryBtnText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: 'transparent',
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  iconBtnBorder: { borderWidth: 1, borderRadius: 10, width: 36, height: 36 },
  textBtn: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: 8 },
  textBtnInline: { minHeight: 28 },
  textBtnLabel: { fontSize: 13, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12, ...Shadows.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIdentity: { flex: 1, minWidth: 0, gap: 2 },
  cardNet: { alignItems: 'flex-end', gap: 2 },
  cardNetLabel: { fontSize: 13, fontWeight: '600' },
  cardStatusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  detailBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  detailPair: { minWidth: 120, gap: 2 },
  detailLine: { gap: 2 },
  detailKey: { fontSize: 13, fontWeight: '600' },
  detailValue: { fontSize: 14, lineHeight: 20 },
  detailEmpty: { fontSize: 14 },
  panel: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingBottom: 8 },
  panelTitle: { fontSize: 16, fontWeight: '700', paddingTop: 14, paddingBottom: 4 },
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  controlCopy: { flex: 1, gap: 2 },
  controlLabel: { fontSize: 15, fontWeight: '700' },
  controlHelp: { fontSize: 13, lineHeight: 18 },
  notice: { flexDirection: 'row', gap: 8, borderRadius: 8, padding: 12, alignItems: 'flex-start' },
  noticeCopy: { flex: 1, gap: 2 },
  noticeTitle: { fontSize: 15, fontWeight: '700' },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 20 },
  empty: { borderWidth: 1, borderRadius: 16, padding: 28, alignItems: 'flex-start', gap: 8, ...Shadows.sm },
  emptyInTable: { borderWidth: 0, borderRadius: 0, shadowOpacity: 0, elevation: 0, alignItems: 'flex-start' },
  emptyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 15, lineHeight: 22, maxWidth: 460 },
  skeleton: { height: 64, marginHorizontal: 12, marginVertical: 8, borderRadius: 10 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  backdropHit: { ...StyleSheet.absoluteFillObject },
  dialog: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 12,
    zIndex: 2,
  },
  dialogHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  dialogTitle: { flex: 1, fontSize: 20, fontWeight: '700' },
  dialogScroll: { flexGrow: 0 },
  dialogLead: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  dialogName: { fontSize: 18, fontWeight: '700' },
  dialogRole: { fontSize: 14, marginTop: 2, marginBottom: 12 },
  dialogNote: { fontSize: 14, lineHeight: 20, marginTop: 10 },
  breakdown: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  breakdownEmphasisRow: { borderTopWidth: 1, marginHorizontal: -12, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  breakdownLabel: { fontSize: 14, fontWeight: '600' },
  breakdownEmphasis: { fontSize: 15, fontWeight: '700' },
  field: { marginTop: 12, gap: 6 },
  fieldLabel: { fontSize: 14, fontWeight: '700' },
  fieldInput: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 15 },
  fieldHelp: { fontSize: 13 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
  dialogBtn: { paddingHorizontal: 14, flexShrink: 1 },
});
