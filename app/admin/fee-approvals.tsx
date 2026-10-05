import { TourTarget } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Switch,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import AdminHeader from '../../src/components/AdminHeader';
import LogoLoader from '../../src/components/LogoLoader';
import { useTheme } from '../../src/hooks/useTheme';
import { usePermissions } from '../../src/hooks/usePermissions';
import { useAuth } from '../../src/hooks/useAuth';
import { AdminService } from '../../src/services/adminService';
import { ApprovalService, ApprovalRequest } from '../../src/services/approvalService';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { APIError } from '../../src/services/apiClient';
import { Theme } from '../../src/theme/themes';

const isAndroid = Platform.OS === 'android';
const enter = (delay = 0) =>
  isAndroid ? undefined : FadeInDown.delay(delay).duration(320);

function formatInr(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN')}`;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

type StatTone = 'rose' | 'emerald' | 'slate' | 'amber';

function StatChip({
  label,
  value,
  tone,
  styles,
}: {
  label: string;
  value: number;
  tone: StatTone;
  styles: ReturnType<typeof getStyles>;
}) {
  const toneMap = {
    rose: { bg: styles.statRose, text: styles.statRoseText, dot: '#F43F5E' },
    emerald: { bg: styles.statEmerald, text: styles.statEmeraldText, dot: '#10B981' },
    slate: { bg: styles.statSlate, text: styles.statSlateText, dot: '#64748B' },
    amber: { bg: styles.statAmber, text: styles.statAmberText, dot: '#F59E0B' },
  }[tone];

  return (
    <View style={[styles.statChip, toneMap.bg]}>
      <View style={styles.statChipTop}>
        <View style={[styles.statDot, { backgroundColor: toneMap.dot }]} />
        <Text style={[styles.statLabel, toneMap.text]}>{label}</Text>
      </View>
      <Text style={[styles.statValue, toneMap.text]}>{value}</Text>
    </View>
  );
}

function EmptyQueue({
  icon,
  title,
  subtitle,
  tint,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  tint: 'emerald' | 'rose' | 'slate';
  styles: ReturnType<typeof getStyles>;
}) {
  const tintStyle =
    tint === 'emerald' ? styles.emptyTintEmerald : tint === 'rose' ? styles.emptyTintRose : styles.emptyTintSlate;
  const iconColor = tint === 'emerald' ? '#059669' : tint === 'rose' ? '#E11D48' : '#64748B';

  return (
    <View style={styles.emptyBlock}>
      <View style={[styles.emptyIconWrap, tintStyle]}>
        <Ionicons name={icon} size={28} color={iconColor} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySub}>{subtitle}</Text>
    </View>
  );
}

function SectionHeader({
  title,
  hint,
  count,
  countTone,
  styles,
}: {
  title: string;
  hint?: string;
  count?: number;
  countTone?: 'rose' | 'emerald' | 'slate';
  styles: ReturnType<typeof getStyles>;
}) {
  const badgeStyle =
    countTone === 'rose'
      ? styles.countRose
      : countTone === 'emerald'
        ? styles.countEmerald
        : styles.countSlate;
  const badgeText =
    countTone === 'rose'
      ? styles.countRoseText
      : countTone === 'emerald'
        ? styles.countEmeraldText
        : styles.countSlateText;

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      {typeof count === 'number' ? (
        <View style={[styles.countBadge, badgeStyle]}>
          <Text style={[styles.countBadgeText, badgeText]}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ActionRow({
  busy,
  onReject,
  onApprove,
  approveLabel,
  approveColors,
  styles,
}: {
  busy: boolean;
  onReject: () => void;
  onApprove: () => void;
  approveLabel: string;
  approveColors: [string, string];
  styles: ReturnType<typeof getStyles>;
}) {
  return (
    <View style={styles.actions}>
      <Pressable
        disabled={busy}
        onPress={onReject}
        style={({ pressed }) => [
          styles.rejectBtn,
          pressed && styles.pressed,
          busy && styles.disabled,
        ]}
      >
        <Ionicons name="close" size={16} color="#E11D48" />
        <Text style={styles.rejectText}>Reject</Text>
      </Pressable>
      <Pressable
        disabled={busy}
        onPress={onApprove}
        style={({ pressed }) => [
          styles.approveWrap,
          pressed && styles.pressed,
          busy && styles.disabled,
        ]}
      >
        <LinearGradient colors={approveColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.approveBtn}>
          <LinearGradient
            colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
            style={styles.approveSheen}
            pointerEvents="none"
          />
          {busy ? (
            <LogoLoader size={18} color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={styles.approveText}>{approveLabel}</Text>
            </>
          )}
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export default function FeeApprovalsScreen() {
  const { isDark, theme } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { width: viewportWidth } = useWindowDimensions();
  const useHistoryGrid = viewportWidth >= 1100;
  const { role } = useAuth();
  const { hasPermission } = usePermissions();
  const canManageSchoolSetting = role === 'admin' || role === 'principal';
  const canReviewApprovals = role === 'admin' || hasPermission('fee.underpayment.approve');
  const canReviewPaymentDeletions = role === 'admin';

  const [rows, setRows] = useState<ApprovalRequest[]>([]);
  const [deletionRows, setDeletionRows] = useState<ApprovalRequest[]>([]);
  const [historyRows, setHistoryRows] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [partialEnabled, setPartialEnabled] = useState(true);
  const [directCollectEnabled, setDirectCollectEnabled] = useState(false);
  const [loadingSetting, setLoadingSetting] = useState(true);
  const [savingSetting, setSavingSetting] = useState(false);
  const [savingDirectSetting, setSavingDirectSetting] = useState(false);

  const loadSetting = useCallback(async () => {
    if (!canManageSchoolSetting) {
      setLoadingSetting(false);
      return;
    }
    try {
      setLoadingSetting(true);
      const [partial, direct] = await Promise.all([
        AdminService.getPartialFeePaymentSetting(),
        AdminService.getPartialFeeDirectCollectSetting(),
      ]);
      setPartialEnabled(!!partial.enabled);
      setDirectCollectEnabled(!!direct.enabled);
    } catch {
      alertCompat('Error', 'Failed to load partial fee payment setting');
    } finally {
      setLoadingSetting(false);
    }
  }, [canManageSchoolSetting]);

  const loadApprovals = useCallback(async () => {
    if (!canReviewApprovals) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await ApprovalService.listPending({ type: 'fee_underpayment' });
      setRows(data);
    } catch {
      alertCompat('Error', 'Failed to load pending approvals');
    } finally {
      setLoading(false);
    }
  }, [canReviewApprovals]);

  const loadDeletionApprovals = useCallback(async () => {
    if (!canReviewPaymentDeletions) return;
    try {
      const data = await ApprovalService.listPending({ type: 'fee_payment_deletion' });
      setDeletionRows(data);
    } catch {
      alertCompat('Error', 'Failed to load payment deletion requests');
    }
  }, [canReviewPaymentDeletions]);

  const loadHistory = useCallback(async () => {
    if (!canReviewApprovals) {
      setHistoryLoading(false);
      return;
    }
    try {
      setHistoryLoading(true);
      const queries: Promise<ApprovalRequest[]>[] = [
        ApprovalService.list({ status: 'APPROVED', type: 'fee_underpayment' }),
        ApprovalService.list({ status: 'REJECTED', type: 'fee_underpayment' }),
      ];
      if (canReviewPaymentDeletions) {
        queries.push(
          ApprovalService.list({ status: 'APPROVED', type: 'fee_payment_deletion' }),
          ApprovalService.list({ status: 'REJECTED', type: 'fee_payment_deletion' }),
        );
      }
      const processed = (await Promise.all(queries)).flat();
      processed.sort((a, b) => {
        const aTime = new Date(a.reviewed_at || a.created_at).getTime();
        const bTime = new Date(b.reviewed_at || b.created_at).getTime();
        return bTime - aTime;
      });
      setHistoryRows(processed);
    } catch {
      alertCompat('Error', 'Failed to load approval history');
    } finally {
      setHistoryLoading(false);
    }
  }, [canReviewApprovals, canReviewPaymentDeletions]);

  useEffect(() => {
    void loadSetting();
    void loadApprovals();
    void loadDeletionApprovals();
    void loadHistory();
  }, [loadSetting, loadApprovals, loadDeletionApprovals, loadHistory]);

  const refreshAll = useCallback(() => {
    void loadSetting();
    void loadApprovals();
    void loadDeletionApprovals();
    void loadHistory();
  }, [loadSetting, loadApprovals, loadDeletionApprovals, loadHistory]);

  const handlePartialToggle = async (nextValue: boolean) => {
    const previous = partialEnabled;
    setPartialEnabled(nextValue);
    setSavingSetting(true);
    try {
      const res = await AdminService.setPartialFeePaymentEnabled(nextValue);
      setPartialEnabled(!!res.enabled);
    } catch (err) {
      setPartialEnabled(previous);
      const message = err instanceof APIError ? err.message : 'Failed to update setting';
      alertCompat('Error', message);
    } finally {
      setSavingSetting(false);
    }
  };

  const handleDirectCollectToggle = async (nextValue: boolean) => {
    const previous = directCollectEnabled;
    setDirectCollectEnabled(nextValue);
    setSavingDirectSetting(true);
    try {
      const res = await AdminService.setPartialFeeDirectCollectEnabled(nextValue);
      setDirectCollectEnabled(!!res.enabled);
    } catch (err) {
      setDirectCollectEnabled(previous);
      const message = err instanceof APIError ? err.message : 'Failed to update setting';
      alertCompat('Error', message);
    } finally {
      setSavingDirectSetting(false);
    }
  };

  const handleApprove = async (id: string) => {
    setActingId(id);
    try {
      await ApprovalService.approve(id);
      alertCompat('Approved', 'Partial payment has been enabled once for this student. Accounts must complete the collection flow to post it.');
      await Promise.all([loadApprovals(), loadHistory()]);
    } catch (err: any) {
      alertCompat('Error', err?.message || 'Could not approve request');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (id: string) => {
    alertCompat('Reject Payment', 'Reject this partial payment request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setActingId(id);
          try {
            await ApprovalService.reject(id);
            alertCompat('Rejected', 'No payment was posted.');
            await Promise.all([loadApprovals(), loadHistory()]);
          } catch (err: any) {
            alertCompat('Error', err?.message || 'Could not reject request');
          } finally {
            setActingId(null);
          }
        },
      },
    ]);
  };

  const handleDeletionApprove = async (id: string) => {
    setActingId(id);
    try {
      await ApprovalService.approve(id);
      alertCompat('Approved', 'Only the requesting accountant can now delete this exact payment.');
      await Promise.all([loadDeletionApprovals(), loadHistory()]);
    } catch (err: any) {
      alertCompat('Error', err?.message || 'Could not approve deletion');
    } finally {
      setActingId(null);
    }
  };

  const handleDeletionReject = (id: string) => {
    alertCompat('Reject deletion', 'Reject this payment deletion request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setActingId(id);
          try {
            await ApprovalService.reject(id);
            alertCompat('Rejected', 'The payment remains unchanged in the ledger.');
            await Promise.all([loadDeletionApprovals(), loadHistory()]);
          } catch (err: any) {
            alertCompat('Error', err?.message || 'Could not reject deletion');
          } finally {
            setActingId(null);
          }
        },
      },
    ]);
  };

  if (!canManageSchoolSetting && !canReviewApprovals) {
    return (
      <View style={styles.container}>
        <AdminHeader title="Fee Approvals" showBackButton />
        <View style={styles.center}>
          <View style={[styles.emptyIconWrap, styles.emptyTintSlate]}>
            <Ionicons name="lock-closed-outline" size={28} color="#64748B" />
          </View>
          <Text style={styles.emptyTitle}>Access restricted</Text>
          <Text style={styles.emptySub}>You do not have permission to manage fee collection settings.</Text>
        </View>
      </View>
    );
  }

  const overview = (
    <Animated.View entering={enter(0)} style={styles.overviewRow}>
      {canReviewPaymentDeletions ? (
        <StatChip label="Deletions" value={deletionRows.length} tone="rose" styles={styles} />
      ) : null}
      {canReviewApprovals ? (
        <StatChip label="Partials" value={rows.length} tone="emerald" styles={styles} />
      ) : null}
      {canReviewApprovals ? (
        <StatChip label="History" value={historyRows.length} tone="slate" styles={styles} />
      ) : null}
    </Animated.View>
  );

  const settingCard = canManageSchoolSetting ? (
    <Animated.View entering={enter(40)} style={styles.settingCard}>
      <View style={styles.settingAccent} />
      <View style={styles.settingInner}>
        <View style={styles.settingTop}>
          <View style={[styles.settingIcon, partialEnabled ? styles.settingIconOn : styles.settingIconOff]}>
            <Ionicons
              name={partialEnabled ? 'pie-chart' : 'lock-closed'}
              size={20}
              color={partialEnabled ? '#059669' : '#E11D48'}
            />
          </View>
          <View style={styles.settingBody}>
            <Text style={styles.settingTitle}>Partial fee collection</Text>
            <Text style={styles.settingDesc}>
              {partialEnabled
                ? 'Accounts may collect less than the full balance. Each partial needs your approval before posting.'
                : 'Full balance is required for direct collection. Accounts can still request a one-time partial approval.'}
            </Text>
          </View>
          {loadingSetting ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Switch
              value={partialEnabled}
              onValueChange={handlePartialToggle}
              disabled={savingSetting}
              trackColor={{ false: isDark ? '#374151' : '#E2E8F0', true: '#6EE7B7' }}
              thumbColor={partialEnabled ? '#059669' : isDark ? '#9CA3AF' : '#F8FAFC'}
              ios_backgroundColor={isDark ? '#374151' : '#E2E8F0'}
            />
          )}
        </View>
        <View style={[styles.statusPill, partialEnabled ? styles.statusPillOn : styles.statusPillOff]}>
          <View style={[styles.statusDot, { backgroundColor: partialEnabled ? '#10B981' : '#F43F5E' }]} />
          <Text style={[styles.statusPillText, partialEnabled ? styles.statusOnText : styles.statusOffText]}>
            {partialEnabled ? 'Partial payments allowed school-wide' : 'Full payment required school-wide'}
          </Text>
        </View>
      </View>
    </Animated.View>
  ) : null;

  const directCollectCard =
    canManageSchoolSetting && partialEnabled ? (
      <Animated.View entering={enter(60)} style={styles.settingCard}>
        <View style={[styles.settingAccent, { backgroundColor: directCollectEnabled ? '#6366F1' : '#94A3B8' }]} />
        <View style={styles.settingInner}>
          <View style={styles.settingTop}>
            <View
              style={[
                styles.settingIcon,
                directCollectEnabled ? styles.settingIconDirectOn : styles.settingIconOff,
              ]}
            >
              <Ionicons
                name={directCollectEnabled ? 'flash' : 'shield-checkmark'}
                size={20}
                color={directCollectEnabled ? '#4F46E5' : '#E11D48'}
              />
            </View>
            <View style={styles.settingBody}>
              <Text style={styles.settingTitle}>Direct partial collection</Text>
              <Text style={styles.settingDesc}>
                {directCollectEnabled
                  ? 'Accounts can post partial payments instantly — no approval request is sent to you.'
                  : 'Each partial payment is sent to you for approval before accounts can post it.'}
              </Text>
            </View>
            {loadingSetting ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Switch
                value={directCollectEnabled}
                onValueChange={handleDirectCollectToggle}
                disabled={savingDirectSetting}
                trackColor={{ false: isDark ? '#374151' : '#E2E8F0', true: '#A5B4FC' }}
                thumbColor={directCollectEnabled ? '#4F46E5' : isDark ? '#9CA3AF' : '#F8FAFC'}
                ios_backgroundColor={isDark ? '#374151' : '#E2E8F0'}
              />
            )}
          </View>
          <View style={[styles.statusPill, directCollectEnabled ? styles.statusPillIndigo : styles.statusPillOff]}>
            <View style={[styles.statusDot, { backgroundColor: directCollectEnabled ? '#6366F1' : '#F43F5E' }]} />
            <Text
              style={[
                styles.statusPillText,
                directCollectEnabled ? styles.statusIndigoText : styles.statusOffText,
              ]}
            >
              {directCollectEnabled ? 'Accounts collect partials directly' : 'Admin approval required for partials'}
            </Text>
          </View>
        </View>
      </Animated.View>
    ) : null;

  const deletionSection = canReviewPaymentDeletions ? (
    <Animated.View entering={enter(80)} style={styles.sectionBlock}>
      <SectionHeader
        title="Payment deletions"
        hint="Accountant requests to reverse a posted receipt"
        count={deletionRows.length}
        countTone="rose"
        styles={styles}
      />
      {deletionRows.length === 0 ? (
        <EmptyQueue
          icon="shield-checkmark"
          title="All clear"
          subtitle="No deletion requests waiting for review."
          tint="emerald"
          styles={styles}
        />
      ) : (
        deletionRows.map((item) => {
          const payload = item.payload || {};
          const busy = actingId === item.id;
          const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];
          const studentName = String(payload.student_name || 'Student');
          const admissionNo = payload.admission_no ? String(payload.admission_no) : '';
          const classLine = [payload.class_name, payload.section_name, payload.academic_year]
            .filter(Boolean)
            .map(String)
            .join(' · ');

          return (
            <View key={item.id} style={styles.requestCard}>
              <View style={[styles.cardAccent, styles.accentRose]} />
              <View style={styles.cardBody}>
                <View style={styles.cardHeader}>
                  <View style={[styles.typeIcon, styles.typeIconRose]}>
                    <Ionicons name="trash-outline" size={18} color="#E11D48" />
                  </View>
                  <View style={styles.cardHeaderText}>
                    <Text style={styles.cardEyebrow}>Delete posted payment</Text>
                    <Text style={styles.cardStudent} numberOfLines={1}>
                      {studentName}
                      {admissionNo ? `  ·  #${admissionNo}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.cardTime}>{formatWhen(item.created_at)}</Text>
                </View>

                <Text style={styles.amountHero}>{formatInr(payload.total_amount)}</Text>

                <View style={styles.metaRow}>
                  {classLine ? (
                    <View style={styles.metaChip}>
                      <Ionicons name="school-outline" size={12} color={theme.colors.textSecondary} />
                      <Text style={styles.metaChipText}>{classLine}</Text>
                    </View>
                  ) : null}
                  <View style={styles.metaChip}>
                    <Ionicons name="receipt-outline" size={12} color={theme.colors.textSecondary} />
                    <Text style={styles.metaChipText}>{String(payload.receipt_no || '—')}</Text>
                  </View>
                  <View style={styles.metaChip}>
                    <Ionicons name="layers-outline" size={12} color={theme.colors.textSecondary} />
                    <Text style={styles.metaChipText}>
                      {lineItems.length || 1} line{(lineItems.length || 1) === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.metaLine}>Requested by {item.requested_by_name || 'Accounts'}</Text>
                {lineItems.length > 1 ? (
                  <Text style={styles.metaLine}>Combined payment — all lines reverse together.</Text>
                ) : null}
                {lineItems.map((line: any, index: number) => (
                  <Text key={String(line.transaction_id || index)} style={styles.lineItem}>
                    {index + 1}. {String(line.fee_type || payload.fee_type || 'Fee')} — {formatInr(line.amount)}
                  </Text>
                ))}
                <View style={styles.reasonBox}>
                  <Text style={styles.reasonLabel}>Reason</Text>
                  <Text style={styles.reasonText}>{item.reason || 'No reason provided'}</Text>
                </View>

                <ActionRow
                  busy={busy}
                  onReject={() => handleDeletionReject(item.id)}
                  onApprove={() => handleDeletionApprove(item.id)}
                  approveLabel="Approve deletion"
                  approveColors={['#E11D48', '#BE123C']}
                  styles={styles}
                />
              </View>
            </View>
          );
        })
      )}
    </Animated.View>
  ) : null;

  const listHeader = (
    <>
      {overview}
      {settingCard}
      {directCollectCard}
      {deletionSection}
      {canReviewApprovals ? (
        <Animated.View entering={enter(120)}>
          <SectionHeader
            title="Partial collection"
            hint="One-time approvals before accounts post the payment"
            count={rows.length}
            countTone="emerald"
            styles={styles}
          />
        </Animated.View>
      ) : null}
    </>
  );

  const historySection = canReviewApprovals ? (
    <Animated.View entering={enter(160)} style={styles.historySection}>
      <SectionHeader
        title="Approval history"
        hint="Approved, rejected, and completed requests"
        count={historyRows.length}
        countTone="slate"
        styles={styles}
      />

      {historyLoading ? (
        <View style={styles.historyLoading}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.historyLoadingText}>Loading history…</Text>
        </View>
      ) : historyRows.length === 0 ? (
        <EmptyQueue
          icon="time-outline"
          title="Nothing processed yet"
          subtitle="Decisions you make will show up here for audit."
          tint="slate"
          styles={styles}
        />
      ) : (
        <View style={styles.historyGrid}>
          {historyRows.map((item) => {
            const payload = item.payload || {};
            const isDeletion = item.type === 'fee_payment_deletion';
            const consumed = Boolean(payload.consumed_at);
            const rejected = item.status === 'REJECTED';
            const stateLabel = rejected
              ? 'Rejected'
              : isDeletion
                ? consumed
                  ? 'Deleted'
                  : 'Approved — awaiting deletion'
                : consumed
                  ? 'Collected'
                  : 'Approved';
            const stateTone = rejected ? 'rose' : consumed ? 'emerald' : 'amber';
            const studentName = String(payload.student_name || 'Student');
            const admissionNo = payload.admission_no ? String(payload.admission_no) : '';
            const reviewDate = item.reviewed_at || item.created_at;

            return (
              <View
                key={item.id}
                style={[styles.historyCard, { width: useHistoryGrid ? '49.2%' : '100%' }]}
              >
                <View style={styles.historyTop}>
                  <View style={[styles.typeIcon, isDeletion ? styles.typeIconRose : styles.typeIconEmerald]}>
                    <Ionicons
                      name={isDeletion ? 'trash-outline' : 'wallet-outline'}
                      size={17}
                      color={isDeletion ? '#E11D48' : '#059669'}
                    />
                  </View>
                  <View style={styles.historyBody}>
                    <Text style={styles.historyTitle}>{isDeletion ? 'Payment deletion' : 'Partial collection'}</Text>
                    <Text style={styles.historyStudent} numberOfLines={1}>
                      {studentName}
                      {admissionNo ? ` (#${admissionNo})` : ''}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.historyStatus,
                      stateTone === 'rose'
                        ? styles.statusRose
                        : stateTone === 'emerald'
                          ? styles.statusEmerald
                          : styles.statusAmber,
                    ]}
                  >
                    <Text
                      style={[
                        styles.historyStatusText,
                        stateTone === 'rose'
                          ? styles.statusRoseText
                          : stateTone === 'emerald'
                            ? styles.statusEmeraldText
                            : styles.statusAmberText,
                      ]}
                    >
                      {stateLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.historyDetails}>
                  <Text style={styles.historyAmount}>
                    {isDeletion
                      ? formatInr(payload.total_amount)
                      : `${formatInr(payload.amount)} of ${formatInr(payload.amount_due)}`}
                  </Text>
                  <Text style={styles.cardTime}>{formatWhen(reviewDate)}</Text>
                </View>
                <Text style={styles.metaLine}>Requested by {item.requested_by_name || 'Accounts'}</Text>
                <Text style={styles.metaLine}>Reviewed by {item.reviewed_by_name || 'Admin'}</Text>
                {item.reason ? <Text style={styles.historyReason}>Reason: {item.reason}</Text> : null}
              </View>
            );
          })}
        </View>
      )}
    </Animated.View>
  ) : null;

  if (!canReviewApprovals) {
    return (
      <View style={styles.container}>
        <AdminHeader title="Fee Approvals" showBackButton />
        <View style={styles.staticContent}>
          {listHeader}
        </View>
      </View>
    );
  }

  return (
    <TourTarget id="screen.admin-fee-approvals.workspace" native><View style={styles.container}>
      <TourTarget id="screen.admin-fee-approvals.overview"><AdminHeader title="Fee Approvals" showBackButton /></TourTarget>

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <LogoLoader size={56} color={theme.colors.primary} />
          <Text style={styles.loadingHint}>Loading approvals…</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refreshAll}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          contentContainerStyle={styles.list}
          ListHeaderComponent={listHeader}
          ListFooterComponent={historySection}
          ListEmptyComponent={
            <Animated.View entering={isAndroid ? undefined : FadeInUp.duration(280)}>
              <EmptyQueue
                icon="checkmark-circle"
                title="Inbox zero"
                subtitle={
                  partialEnabled
                    ? 'Partial fee payments awaiting review will appear here.'
                    : 'Accounts partial payment requests awaiting review will appear here.'
                }
                tint="emerald"
                styles={styles}
              />
            </Animated.View>
          }
          renderItem={({ item, index }) => {
            const payload = item.payload || {};
            const busy = actingId === item.id;
            const studentName = typeof payload.student_name === 'string' ? payload.student_name : 'Student';
            const admissionNo = typeof payload.admission_no === 'string' ? payload.admission_no : '';
            const className = typeof payload.class_name === 'string' ? payload.class_name : '';
            const sectionName = typeof payload.section_name === 'string' ? payload.section_name : '';
            const feeType = typeof payload.fee_type === 'string' ? payload.fee_type : '';
            const paymentMethod = typeof payload.payment_method === 'string' ? payload.payment_method : '';
            const classLine = [className, sectionName, feeType].filter(Boolean).join(' · ');

            return (
              <Animated.View entering={enter(Math.min(index, 6) * 40)}>
                <View style={styles.requestCard}>
                  <View style={[styles.cardAccent, styles.accentEmerald]} />
                  <View style={styles.cardBody}>
                    <View style={styles.cardHeader}>
                      <View style={[styles.typeIcon, styles.typeIconEmerald]}>
                        <Ionicons name="wallet-outline" size={18} color="#059669" />
                      </View>
                      <View style={styles.cardHeaderText}>
                        <Text style={styles.cardEyebrow}>Partial fee payment</Text>
                        <Text style={styles.cardStudent} numberOfLines={1}>
                          {studentName}
                          {admissionNo ? `  ·  #${admissionNo}` : ''}
                        </Text>
                      </View>
                      <Text style={styles.cardTime}>{formatWhen(item.created_at)}</Text>
                    </View>

                    <Text style={styles.amountHero}>
                      {formatInr(payload.amount)}
                      <Text style={styles.amountOf}> of {formatInr(payload.amount_due)}</Text>
                    </Text>

                    <View style={styles.metaRow}>
                      {classLine ? (
                        <View style={styles.metaChip}>
                          <Ionicons name="school-outline" size={12} color={theme.colors.textSecondary} />
                          <Text style={styles.metaChipText}>{classLine}</Text>
                        </View>
                      ) : null}
                      {paymentMethod ? (
                        <View style={styles.metaChip}>
                          <Ionicons name="card-outline" size={12} color={theme.colors.textSecondary} />
                          <Text style={styles.metaChipText}>{paymentMethod.toUpperCase()}</Text>
                        </View>
                      ) : null}
                    </View>

                    <Text style={styles.metaLine}>Requested by {item.requested_by_name || 'Accounts'}</Text>
                    {item.reason ? (
                      <View style={styles.reasonBox}>
                        <Text style={styles.reasonLabel}>Reason</Text>
                        <Text style={styles.reasonText}>{item.reason}</Text>
                      </View>
                    ) : null}

                    <ActionRow
                      busy={busy}
                      onReject={() => handleReject(item.id)}
                      onApprove={() => handleApprove(item.id)}
                      approveLabel="Approve once"
                      approveColors={['#059669', '#047857']}
                      styles={styles}
                    />
                  </View>
                </View>
              </Animated.View>
            );
          }}
        />
      )}
    </View></TourTarget>
  );
}

const getStyles = (theme: Theme, isDark: boolean) => {
  const cardBg = isDark ? theme.colors.card : '#FFFFFF';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.22)';
  const softShadow =
    Platform.OS === 'ios'
      ? {
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.25 : 0.06,
          shadowRadius: 12,
        }
      : Platform.OS === 'web'
        ? ({
            boxShadow: isDark
              ? '0 8px 24px rgba(0,0,0,0.35)'
              : '0 8px 24px rgba(148,163,184,0.18), inset 0 1px 0 rgba(255,255,255,0.9)',
          } as any)
        : { elevation: 3 };

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    staticContent: { padding: 20, gap: 4 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 10,
    },
    loadingHint: {
      marginTop: 12,
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    list: { padding: 20, paddingBottom: 48, gap: 0 },

    overviewRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
    },
    statChip: {
      flex: 1,
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: border,
      ...softShadow,
    },
    statChipTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    statDot: { width: 7, height: 7, borderRadius: 4 },
    statLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
    statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.8 },
    statRose: { backgroundColor: isDark ? 'rgba(244,63,94,0.12)' : '#FFF1F2' },
    statRoseText: { color: isDark ? '#FDA4AF' : '#BE123C' },
    statEmerald: { backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5' },
    statEmeraldText: { color: isDark ? '#6EE7B7' : '#047857' },
    statSlate: { backgroundColor: isDark ? 'rgba(148,163,184,0.12)' : '#F8FAFC' },
    statSlateText: { color: isDark ? '#CBD5E1' : '#475569' },
    statAmber: { backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB' },
    statAmberText: { color: isDark ? '#FCD34D' : '#B45309' },

    settingCard: {
      flexDirection: 'row',
      backgroundColor: cardBg,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: border,
      marginBottom: 22,
      overflow: 'hidden',
      ...softShadow,
    },
    settingAccent: {
      width: 4,
      backgroundColor: '#10B981',
    },
    settingInner: { flex: 1, padding: 16 },
    settingTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    settingIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    settingIconOn: { backgroundColor: isDark ? 'rgba(16,185,129,0.18)' : '#D1FAE5' },
    settingIconDirectOn: { backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : '#E0E7FF' },
    settingIconOff: { backgroundColor: isDark ? 'rgba(244,63,94,0.18)' : '#FFE4E6' },
    settingBody: { flex: 1, paddingTop: 2, paddingRight: 4 },
    settingTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.textStrong,
      letterSpacing: -0.2,
      marginBottom: 6,
    },
    settingDesc: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textSecondary,
      fontWeight: '500',
    },
    statusPill: {
      marginTop: 14,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
    },
    statusPillOn: {
      backgroundColor: isDark ? 'rgba(16,185,129,0.14)' : '#ECFDF5',
      borderColor: isDark ? 'rgba(16,185,129,0.28)' : '#A7F3D0',
    },
    statusPillOff: {
      backgroundColor: isDark ? 'rgba(244,63,94,0.12)' : '#FFF1F2',
      borderColor: isDark ? 'rgba(244,63,94,0.28)' : '#FECDD3',
    },
    statusPillIndigo: {
      backgroundColor: isDark ? 'rgba(99,102,241,0.14)' : '#EEF2FF',
      borderColor: isDark ? 'rgba(99,102,241,0.28)' : '#C7D2FE',
    },
    statusPillText: { fontSize: 12, fontWeight: '700' },
    statusOnText: { color: isDark ? '#6EE7B7' : '#047857' },
    statusOffText: { color: isDark ? '#FDA4AF' : '#BE123C' },
    statusIndigoText: { color: isDark ? '#A5B4FC' : '#4338CA' },
    statusDot: { width: 6, height: 6, borderRadius: 3 },

    sectionBlock: { marginBottom: 22 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    sectionHeaderText: { flex: 1, gap: 3 },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: theme.colors.textStrong,
      letterSpacing: -0.2,
    },
    sectionHint: {
      fontSize: 12,
      fontWeight: '500',
      color: theme.colors.textTertiary,
      lineHeight: 17,
    },
    countBadge: {
      minWidth: 28,
      height: 28,
      paddingHorizontal: 9,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countBadgeText: { fontSize: 12, fontWeight: '800' },
    countRose: { backgroundColor: isDark ? 'rgba(244,63,94,0.18)' : '#FFE4E6' },
    countRoseText: { color: isDark ? '#FDA4AF' : '#E11D48' },
    countEmerald: { backgroundColor: isDark ? 'rgba(16,185,129,0.18)' : '#D1FAE5' },
    countEmeraldText: { color: isDark ? '#6EE7B7' : '#059669' },
    countSlate: { backgroundColor: isDark ? 'rgba(148,163,184,0.16)' : '#F1F5F9' },
    countSlateText: { color: isDark ? '#CBD5E1' : '#475569' },

    requestCard: {
      flexDirection: 'row',
      backgroundColor: cardBg,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: border,
      marginBottom: 12,
      overflow: 'hidden',
      ...softShadow,
    },
    cardAccent: { width: 4 },
    accentRose: { backgroundColor: '#F43F5E' },
    accentEmerald: { backgroundColor: '#10B981' },
    cardBody: { flex: 1, padding: 16 },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 12 },
    typeIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    typeIconRose: { backgroundColor: isDark ? 'rgba(244,63,94,0.16)' : '#FFE4E6' },
    typeIconEmerald: { backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : '#D1FAE5' },
    cardHeaderText: { flex: 1, minWidth: 0 },
    cardEyebrow: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.textTertiary,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 3,
    },
    cardStudent: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.textStrong,
      letterSpacing: -0.2,
    },
    cardTime: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.colors.textTertiary,
      maxWidth: 92,
      textAlign: 'right',
    },
    amountHero: {
      fontSize: 26,
      fontWeight: '800',
      color: theme.colors.textStrong,
      letterSpacing: -0.8,
      marginBottom: 10,
    },
    amountOf: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      letterSpacing: -0.2,
    },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
      borderWidth: 1,
      borderColor: border,
    },
    metaChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    metaLine: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.colors.textSecondary,
      marginBottom: 3,
    },
    lineItem: {
      fontSize: 12.5,
      fontWeight: '500',
      color: theme.colors.textTertiary,
      marginBottom: 2,
    },
    reasonBox: {
      marginTop: 10,
      padding: 12,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
      borderWidth: 1,
      borderColor: border,
    },
    reasonLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: theme.colors.textTertiary,
      marginBottom: 4,
    },
    reasonText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textStrong,
      lineHeight: 19,
    },

    actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    rejectBtn: {
      flex: 1,
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(244,63,94,0.12)' : '#FFF1F2',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(244,63,94,0.28)' : '#FECDD3',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    rejectText: { color: '#E11D48', fontWeight: '800', fontSize: 14 },
    approveWrap: { flex: 1.45, borderRadius: 14, overflow: 'hidden', minHeight: 48 },
    approveBtn: {
      flex: 1,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 12,
      overflow: 'hidden',
    },
    approveSheen: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 22,
    },
    approveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
    disabled: { opacity: 0.45 },

    emptyBlock: {
      alignItems: 'center',
      paddingVertical: 28,
      paddingHorizontal: 22,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: cardBg,
      gap: 6,
      marginBottom: 12,
      ...softShadow,
    },
    emptyIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    emptyTintEmerald: { backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : '#D1FAE5' },
    emptyTintRose: { backgroundColor: isDark ? 'rgba(244,63,94,0.16)' : '#FFE4E6' },
    emptyTintSlate: { backgroundColor: isDark ? 'rgba(148,163,184,0.14)' : '#F1F5F9' },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.textStrong,
      letterSpacing: -0.2,
    },
    emptySub: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
      maxWidth: 280,
    },

    historySection: { marginTop: 10 },
    historyLoading: {
      minHeight: 96,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: cardBg,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    historyLoadingText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    historyGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      alignItems: 'flex-start',
    },
    historyCard: {
      backgroundColor: cardBg,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: border,
      padding: 15,
      ...softShadow,
    },
    historyTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    historyBody: { flex: 1, minWidth: 0 },
    historyTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.colors.textStrong,
      letterSpacing: -0.1,
      marginBottom: 2,
    },
    historyStudent: {
      fontSize: 12.5,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    historyStatus: {
      maxWidth: '42%',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
    },
    historyStatusText: { fontSize: 11, fontWeight: '800', textAlign: 'center' },
    statusRose: {
      backgroundColor: isDark ? 'rgba(244,63,94,0.14)' : '#FFF1F2',
      borderColor: isDark ? 'rgba(244,63,94,0.28)' : '#FECDD3',
    },
    statusRoseText: { color: isDark ? '#FDA4AF' : '#BE123C' },
    statusEmerald: {
      backgroundColor: isDark ? 'rgba(16,185,129,0.14)' : '#ECFDF5',
      borderColor: isDark ? 'rgba(16,185,129,0.28)' : '#A7F3D0',
    },
    statusEmeraldText: { color: isDark ? '#6EE7B7' : '#047857' },
    statusAmber: {
      backgroundColor: isDark ? 'rgba(245,158,11,0.14)' : '#FFFBEB',
      borderColor: isDark ? 'rgba(245,158,11,0.28)' : '#FDE68A',
    },
    statusAmberText: { color: isDark ? '#FCD34D' : '#B45309' },
    historyDetails: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 12,
      marginBottom: 6,
    },
    historyAmount: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.textStrong,
      letterSpacing: -0.3,
    },
    historyReason: {
      fontSize: 12.5,
      lineHeight: 18,
      marginTop: 4,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
  });
};
