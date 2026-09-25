import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  StatusBar,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AdminHeader from '../../src/components/AdminHeader';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  LeaveService,
  LeaveApplication,
  LeavePayrollTreatment,
} from '../../src/services/commonServices';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
import { normalizeError } from '../../src/utils/error';

type AdminTab = 'pending' | 'history';
type ReviewDecision = LeavePayrollTreatment | 'REJECTED';

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  pending: { label: 'Pending', color: '#D97706', bg: 'rgba(245,158,11,0.12)', icon: 'hourglass-empty' },
  approved: { label: 'Approved', color: '#059669', bg: 'rgba(16,185,129,0.12)', icon: 'check-circle' },
  rejected: { label: 'Rejected', color: '#DC2626', bg: 'rgba(239,68,68,0.12)', icon: 'cancel' },
};

export default function AdminLeaves() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const [tab, setTab] = useState<AdminTab>('pending');
  const [pending, setPending] = useState<LeaveApplication[]>([]);
  const [history, setHistory] = useState<LeaveApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<LeaveApplication | null>(null);
  const [decision, setDecision] = useState<ReviewDecision>('PAID_CL');
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchLeaves = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (opts?.silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const all = await LeaveService.getAll({ limit: 200 });
      const pend = all.filter((l) => l.status === 'pending');
      const hist = all
        .filter((l) => l.status === 'approved' || l.status === 'rejected')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setPending(pend);
      setHistory(hist);
    } catch {
      setError('Failed to load leave requests');
    } finally {
      if (opts?.silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  const openReview = (leave: LeaveApplication) => {
    const hasClAvailable = (leave.payroll_months || []).some(
      (month) => month.available && (month.cl_remaining_days || 0) > 0,
    );
    setReviewing(leave);
    setDecision(hasClAvailable ? 'PAID_CL' : 'UNPAID');
    setReviewRemarks('');
  };

  const closeReview = () => {
    if (submitting) return;
    setReviewing(null);
    setReviewRemarks('');
  };

  const submitReview = async () => {
    if (!reviewing) return;
    try {
      setSubmitting(true);
      let payrollFollowUp: string | null = null;
      if (decision === 'REJECTED') {
        await LeaveService.reject(reviewing.id, reviewRemarks.trim() || undefined);
      } else {
        const result = await LeaveService.approve(reviewing.id, decision, reviewRemarks.trim() || undefined);
        payrollFollowUp = result.payroll_follow_up?.message || null;
      }
      setReviewing(null);
      setReviewRemarks('');
      alertCompat(
        'Decision saved',
        decision === 'PAID_CL'
          ? payrollFollowUp || 'Leave approved. Available CL will be paid and any excess will flow to payroll as unpaid leave.'
          : decision === 'UNPAID'
            ? payrollFollowUp || 'Leave approved without CL. Payroll will treat the approved days as unpaid.'
            : 'Leave request rejected.',
      );
      await fetchLeaves();
    } catch (err) {
      alertCompat('Could not save decision', normalizeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const formatDays = (value?: number) => {
    const days = Number(value || 0);
    return `${days} day${days === 1 ? '' : 's'}`;
  };

  const formatPayrollMonth = (key: string) => {
    const [year, month] = key.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  };

  const payrollTreatmentLabel = (treatment?: LeaveApplication['payroll_treatment']) => {
    if (treatment === 'PAID_CL') return 'Approved with CL';
    if (treatment === 'PAID_LEAVE') return 'Approved paid leave';
    if (treatment === 'UNPAID') return 'Approved without CL';
    return null;
  };

  const calculateDuration = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return `${diffDays} Day${diffDays > 1 ? 's' : ''}`;
  };

  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start).toLocaleDateString();
    const endDate = new Date(end).toLocaleDateString();
    if (startDate === endDate) return startDate;
    return `${startDate} – ${endDate}`;
  };

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return iso;
    }
  };

  const leaveTypeLabel = (code: string) => {
    const m: Record<string, string> = {
      sick: 'Sick Leave',
      casual: 'Casual Leave',
      other: 'Emergency',
      earned: 'Earned Leave',
      maternity: 'Maternity',
      paternity: 'Paternity',
      unpaid: 'Unpaid',
    };
    return m[code] || code;
  };

  const renderPendingItem = ({ item, index }: { item: LeaveApplication; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(400)}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Image
            source={{ uri: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' }}
            style={styles.avatar}
          />
          <View style={styles.info}>
            <Text style={styles.name}>{item.applicant_name || 'Unknown'}</Text>
            <Text style={styles.role}>
              {item.applicant_role
                ? item.applicant_role.charAt(0).toUpperCase() + item.applicant_role.slice(1)
                : 'Staff / Student'}
            </Text>
          </View>
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{calculateDuration(item.start_date, item.end_date)}</Text>
          </View>
        </View>
        <View style={styles.reasonBox}>
          <Text style={styles.leaveType}>
            {leaveTypeLabel(item.leave_type).toUpperCase()} • {formatDateRange(item.start_date, item.end_date)}
          </Text>
          <Text style={styles.metaMuted}>Applied {formatDateTime(item.created_at)}</Text>
          <Text style={styles.reasonText}>&quot;{item.reason}&quot;</Text>
        </View>
        {item.payroll_months?.map((month) => (
          <View key={month.month_key} style={styles.clSnapshot}>
            <View style={styles.clSnapshotIcon}>
              <MaterialIcons name={month.available ? 'account-balance-wallet' : 'info-outline'} size={18} color="#6366F1" />
            </View>
            <View style={styles.clSnapshotContent}>
              <Text style={styles.clSnapshotTitle}>{formatPayrollMonth(month.month_key)}</Text>
              {month.available ? (
                <>
                  <Text style={styles.clSnapshotStrong}>
                    Already used {formatDays(month.cl_used_days)} CL · {formatDays(month.cl_remaining_days)} remaining
                  </Text>
                  <Text style={styles.clSnapshotHint}>
                    This request contains {formatDays(month.requested_payroll_days)} payroll leave.
                    {(month.projected_unpaid_days || 0) > 0
                      ? ` If marked CL, ${formatDays(month.projected_unpaid_days)} will still be unpaid.`
                      : ' It fits within the available CL balance.'}
                  </Text>
                </>
              ) : (
                <Text style={styles.clSnapshotHint}>{month.unavailable_reason}</Text>
              )}
            </View>
          </View>
        ))}
        <TouchableOpacity style={styles.reviewButton} onPress={() => openReview(item)} activeOpacity={0.85}>
          <MaterialIcons name="rule" size={19} color="#FFFFFF" />
          <Text style={styles.reviewButtonText}>Review salary impact</Text>
          <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const renderHistoryItem = ({ item, index }: { item: LeaveApplication; index: number }) => {
    const sm = STATUS_META[item.status] || STATUS_META.pending;
    return (
      <Animated.View entering={FadeInDown.delay(index * 50).duration(380)}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Image
              source={{ uri: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' }}
              style={styles.avatar}
            />
            <View style={styles.info}>
              <Text style={styles.name}>{item.applicant_name || 'Unknown'}</Text>
              <Text style={styles.role}>
                {item.applicant_role
                  ? item.applicant_role.charAt(0).toUpperCase() + item.applicant_role.slice(1)
                  : 'Staff / Student'}
              </Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: sm.bg }]}>
              <MaterialIcons name={sm.icon} size={14} color={sm.color} />
              <Text style={[styles.statusPillText, { color: sm.color }]}>{sm.label}</Text>
            </View>
          </View>
          <View style={styles.reasonBox}>
            <Text style={styles.leaveType}>
              {leaveTypeLabel(item.leave_type).toUpperCase()} • {formatDateRange(item.start_date, item.end_date)}
            </Text>
            <Text style={styles.metaMuted}>{calculateDuration(item.start_date, item.end_date)}</Text>
            <Text style={styles.reasonText}>&quot;{item.reason}&quot;</Text>
            {payrollTreatmentLabel(item.payroll_treatment) ? (
              <View style={styles.payrollDecisionPill}>
                <MaterialIcons
                  name={item.payroll_treatment === 'UNPAID' ? 'money-off' : 'payments'}
                  size={14}
                  color={item.payroll_treatment === 'UNPAID' ? '#B45309' : '#047857'}
                />
                <Text style={[
                  styles.payrollDecisionText,
                  { color: item.payroll_treatment === 'UNPAID' ? '#B45309' : '#047857' },
                ]}>
                  {payrollTreatmentLabel(item.payroll_treatment)}
                </Text>
              </View>
            ) : null}
            <View style={styles.historyMetaBlock}>
              <Text style={styles.historyMetaLine}>
                <Text style={styles.historyMetaLabel}>Applied </Text>
                {formatDateTime(item.created_at)}
              </Text>
              {item.reviewed_at ? (
                <Text style={styles.historyMetaLine}>
                  <Text style={styles.historyMetaLabel}>Reviewed </Text>
                  {formatDateTime(item.reviewed_at)}
                  {item.reviewed_by_name ? ` · ${item.reviewed_by_name}` : ''}
                </Text>
              ) : null}
              {item.review_remarks ? (
                <Text style={styles.reviewRemarks}>
                  <Text style={styles.historyMetaLabel}>Note </Text>
                  {item.review_remarks}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </Animated.View>
    );
  };

  const listData = tab === 'pending' ? pending : history;
  const emptyMessage =
    tab === 'pending' ? 'No pending leave requests' : 'No processed leave history yet';

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <AdminHeader title="Leave Management" showBackButton={true} />

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'pending' && styles.tabActive]}
          onPress={() => setTab('pending')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, tab === 'pending' && styles.tabTextActive]}>Pending</Text>
          {pending.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{pending.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'history' && styles.tabActive]}
          onPress={() => setTab('history')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>History</Text>
          {history.length > 0 && (
            <View style={[styles.tabBadge, styles.tabBadgeMuted]}>
              <Text style={[styles.tabBadgeText, styles.tabBadgeTextMuted]}>{history.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <LogoLoader size={60} color="#6366F1" />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
          <Text style={[styles.emptyText, { marginBottom: 20 }]}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchLeaves()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          renderItem={tab === 'pending' ? renderPendingItem : renderHistoryItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={() => fetchLeaves({ silent: true })}
          ListHeaderComponent={
            listData.length > 0 ? (
              <Text style={styles.sectionTitle}>
                {tab === 'pending' ? `Pending requests (${pending.length})` : `History (${history.length})`}
              </Text>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.emptyText}>{emptyMessage}</Text>}
        />
      )}

      <Modal visible={Boolean(reviewing)} transparent animationType="fade" onRequestClose={closeReview}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalEyebrow}>LEAVE & PAYROLL DECISION</Text>
                <Text style={styles.modalTitle}>{reviewing?.applicant_name || 'Staff member'}</Text>
                {reviewing ? (
                  <Text style={styles.modalSubtitle}>
                    {formatDateRange(reviewing.start_date, reviewing.end_date)} · {calculateDuration(reviewing.start_date, reviewing.end_date)}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={closeReview} disabled={submitting}>
                <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
              {reviewing?.payroll_months?.map((month) => (
                <View key={month.month_key} style={styles.modalBalanceCard}>
                  <View style={styles.modalBalanceHeader}>
                    <Text style={styles.modalBalanceMonth}>{formatPayrollMonth(month.month_key)}</Text>
                    {month.available ? (
                      <Text style={styles.modalBalanceValue}>
                        {formatDays(month.cl_used_days)} / {formatDays(month.cl_entitlement_days)} used
                      </Text>
                    ) : null}
                  </View>
                  {month.available ? (
                    <>
                      <View style={styles.balanceTrack}>
                        <View
                          style={[
                            styles.balanceFill,
                            {
                              width: `${Math.min(
                                100,
                                ((month.cl_used_days || 0) / Math.max(month.cl_entitlement_days || 0, 1)) * 100,
                              )}%`,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.modalBalanceHint}>{month.entitlement_reason}</Text>
                    </>
                  ) : (
                    <Text style={styles.modalBalanceHint}>{month.unavailable_reason}</Text>
                  )}
                </View>
              ))}

              <Text style={styles.decisionHeading}>Choose how this affects salary</Text>

              <TouchableOpacity
                style={[styles.decisionOption, decision === 'PAID_CL' && styles.decisionOptionClActive]}
                onPress={() => setDecision('PAID_CL')}
                activeOpacity={0.85}
              >
                <View style={[styles.decisionIcon, styles.decisionIconCl]}>
                  <MaterialIcons name="event-available" size={21} color="#047857" />
                </View>
                <View style={styles.decisionCopy}>
                  <Text style={styles.decisionTitle}>Approve with CL</Text>
                  <Text style={styles.decisionHint}>
                    Use the available monthly CL first. Any days above the balance become unpaid automatically.
                  </Text>
                </View>
                <Ionicons name={decision === 'PAID_CL' ? 'radio-button-on' : 'radio-button-off'} size={22} color={decision === 'PAID_CL' ? '#10B981' : theme.colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.decisionOption, decision === 'UNPAID' && styles.decisionOptionUnpaidActive]}
                onPress={() => setDecision('UNPAID')}
                activeOpacity={0.85}
              >
                <View style={[styles.decisionIcon, styles.decisionIconUnpaid]}>
                  <MaterialIcons name="money-off" size={21} color="#B45309" />
                </View>
                <View style={styles.decisionCopy}>
                  <Text style={styles.decisionTitle}>Approve without CL</Text>
                  <Text style={styles.decisionHint}>
                    Approve the absence, but send all payroll leave days as a salary deduction.
                  </Text>
                </View>
                <Ionicons name={decision === 'UNPAID' ? 'radio-button-on' : 'radio-button-off'} size={22} color={decision === 'UNPAID' ? '#D97706' : theme.colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.decisionOption, decision === 'REJECTED' && styles.decisionOptionRejectActive]}
                onPress={() => setDecision('REJECTED')}
                activeOpacity={0.85}
              >
                <View style={[styles.decisionIcon, styles.decisionIconReject]}>
                  <MaterialIcons name="cancel" size={21} color="#DC2626" />
                </View>
                <View style={styles.decisionCopy}>
                  <Text style={styles.decisionTitle}>Reject request</Text>
                  <Text style={styles.decisionHint}>Do not create an approved leave record for these dates.</Text>
                </View>
                <Ionicons name={decision === 'REJECTED' ? 'radio-button-on' : 'radio-button-off'} size={22} color={decision === 'REJECTED' ? '#EF4444' : theme.colors.textTertiary} />
              </TouchableOpacity>

              <Text style={styles.noteLabel}>Decision note (optional)</Text>
              <TextInput
                value={reviewRemarks}
                onChangeText={setReviewRemarks}
                placeholder="Add a note for the staff member and payroll audit"
                placeholderTextColor={theme.colors.textTertiary}
                style={styles.noteInput}
                multiline
                maxLength={500}
              />

              {decision !== 'REJECTED' ? (
                <View style={styles.impactSummary}>
                  <MaterialIcons name="receipt-long" size={18} color="#6366F1" />
                  <Text style={styles.impactSummaryText}>
                    {decision === 'PAID_CL'
                      ? `Payroll preview: ${formatDays(reviewing?.payroll_months?.reduce((sum, month) => sum + (month.projected_paid_cl_days || 0), 0))} paid CL and ${formatDays(reviewing?.payroll_months?.reduce((sum, month) => sum + (month.projected_unpaid_days || 0), 0))} unpaid.`
                      : `Payroll preview: ${formatDays(reviewing?.payroll_months?.reduce((sum, month) => sum + (month.unpaid_days_without_cl || 0), 0))} unpaid.`}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelButton} onPress={closeReview} disabled={submitting}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  decision === 'REJECTED' && styles.confirmRejectButton,
                  submitting && styles.buttonDisabled,
                ]}
                onPress={submitReview}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
                  <>
                    <Ionicons name={decision === 'REJECTED' ? 'close-circle' : 'checkmark-circle'} size={19} color="#FFFFFF" />
                    <Text style={styles.confirmButtonText}>
                      {decision === 'REJECTED' ? 'Reject leave' : 'Confirm approval'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (theme: Theme, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    tabRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
      gap: 10,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : theme.colors.background,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    },
    tabActive: {
      borderColor: '#6366F1',
      backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.10)',
    },
    tabText: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    tabTextActive: {
      color: '#6366F1',
    },
    tabBadge: {
      minWidth: 22,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: '#6366F1',
      alignItems: 'center',
    },
    tabBadgeMuted: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    },
    tabBadgeText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#fff',
    },
    tabBadgeTextMuted: {
      color: theme.colors.text,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    retryButton: {
      backgroundColor: '#6366F1',
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
    },
    retryText: {
      color: '#fff',
      fontWeight: 'bold',
    },
    listContent: {
      padding: 20,
      paddingBottom: 32,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.colors.textSecondary,
      marginBottom: 14,
      marginLeft: 2,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    card: {
      backgroundColor: theme.colors.background,
      borderRadius: 16,
      padding: 15,
      marginBottom: 15,
      shadowColor: theme.colors.text,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'transparent',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 15,
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      marginRight: 15,
      backgroundColor: theme.colors.card,
    },
    info: {
      flex: 1,
    },
    name: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    role: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    durationBadge: {
      backgroundColor: theme.colors.card,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
    },
    durationText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.text,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
    },
    statusPillText: {
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    reasonBox: {
      backgroundColor: theme.colors.card,
      padding: 12,
      borderRadius: 12,
      marginBottom: 4,
    },
    leaveType: {
      fontSize: 12,
      color: '#6366F1',
      fontWeight: '600',
      marginBottom: 6,
    },
    metaMuted: {
      fontSize: 11,
      color: theme.colors.textTertiary,
      marginBottom: 8,
    },
    reasonText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      fontStyle: 'italic',
      lineHeight: 20,
    },
    historyMetaBlock: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      gap: 6,
    },
    historyMetaLine: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      lineHeight: 18,
    },
    historyMetaLabel: {
      fontWeight: '700',
      color: theme.colors.textTertiary,
    },
    reviewRemarks: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      lineHeight: 18,
      marginTop: 2,
    },
    payrollDecisionPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 12,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.8)',
    },
    payrollDecisionText: {
      fontSize: 12,
      fontWeight: '800',
    },
    clSnapshot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(129,140,248,0.25)' : '#E0E7FF',
      backgroundColor: isDark ? 'rgba(99,102,241,0.10)' : '#F5F7FF',
    },
    clSnapshotIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : '#E0E7FF',
    },
    clSnapshotContent: {
      flex: 1,
    },
    clSnapshotTitle: {
      color: '#6366F1',
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    clSnapshotStrong: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '800',
      marginTop: 3,
    },
    clSnapshotHint: {
      color: theme.colors.textSecondary,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 3,
    },
    reviewButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: '#6366F1',
    },
    reviewButtonText: {
      flex: 1,
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
      textAlign: 'center',
    },
    modalBackdrop: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 18,
      backgroundColor: 'rgba(15,23,42,0.62)',
    },
    modalCard: {
      width: '100%',
      maxWidth: 620,
      maxHeight: '92%',
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: theme.colors.background,
      borderWidth: isDark ? 1 : 0,
      borderColor: 'rgba(255,255,255,0.10)',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 20,
      paddingBottom: 15,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
    },
    modalHeaderText: {
      flex: 1,
    },
    modalEyebrow: {
      color: '#6366F1',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    modalTitle: {
      color: theme.colors.text,
      fontSize: 21,
      fontWeight: '900',
      marginTop: 4,
    },
    modalSubtitle: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      marginTop: 4,
    },
    modalClose: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: theme.colors.card,
    },
    modalScroll: {
      flexGrow: 0,
    },
    modalScrollContent: {
      padding: 20,
      paddingBottom: 10,
    },
    modalBalanceCard: {
      marginBottom: 10,
      padding: 13,
      borderRadius: 13,
      backgroundColor: isDark ? 'rgba(99,102,241,0.10)' : '#F5F7FF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(129,140,248,0.22)' : '#E0E7FF',
    },
    modalBalanceHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    modalBalanceMonth: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '800',
    },
    modalBalanceValue: {
      color: '#6366F1',
      fontSize: 12,
      fontWeight: '800',
    },
    balanceTrack: {
      height: 6,
      overflow: 'hidden',
      borderRadius: 3,
      marginTop: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : '#E2E8F0',
    },
    balanceFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: '#6366F1',
    },
    modalBalanceHint: {
      color: theme.colors.textSecondary,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 8,
    },
    decisionHeading: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '900',
      marginTop: 10,
      marginBottom: 10,
    },
    decisionOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 13,
      marginBottom: 9,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.09)' : '#E2E8F0',
      backgroundColor: theme.colors.card,
    },
    decisionOptionClActive: {
      borderColor: '#10B981',
      backgroundColor: isDark ? 'rgba(16,185,129,0.10)' : '#ECFDF5',
    },
    decisionOptionUnpaidActive: {
      borderColor: '#D97706',
      backgroundColor: isDark ? 'rgba(217,119,6,0.10)' : '#FFFBEB',
    },
    decisionOptionRejectActive: {
      borderColor: '#EF4444',
      backgroundColor: isDark ? 'rgba(239,68,68,0.10)' : '#FEF2F2',
    },
    decisionIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    decisionIconCl: {
      backgroundColor: '#D1FAE5',
    },
    decisionIconUnpaid: {
      backgroundColor: '#FEF3C7',
    },
    decisionIconReject: {
      backgroundColor: '#FEE2E2',
    },
    decisionCopy: {
      flex: 1,
    },
    decisionTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '800',
    },
    decisionHint: {
      color: theme.colors.textSecondary,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 3,
    },
    noteLabel: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '800',
      marginTop: 8,
      marginBottom: 7,
    },
    noteInput: {
      minHeight: 78,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.11)' : '#CBD5E1',
      backgroundColor: theme.colors.card,
      color: theme.colors.text,
      fontSize: 13,
      lineHeight: 19,
      textAlignVertical: 'top',
    },
    impactSummary: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 9,
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(99,102,241,0.10)' : '#EEF2FF',
    },
    impactSummaryText: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 18,
    },
    modalFooter: {
      flexDirection: 'row',
      gap: 10,
      padding: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
      backgroundColor: theme.colors.background,
    },
    cancelButton: {
      minWidth: 96,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: theme.colors.card,
    },
    cancelButtonText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontWeight: '800',
    },
    confirmButton: {
      flex: 1,
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: '#10B981',
    },
    confirmRejectButton: {
      backgroundColor: '#EF4444',
    },
    buttonDisabled: {
      opacity: 0.55,
    },
    confirmButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '900',
    },
    emptyText: {
      textAlign: 'center',
      marginTop: 50,
      color: theme.colors.textTertiary,
      fontSize: 16,
    },
  });
