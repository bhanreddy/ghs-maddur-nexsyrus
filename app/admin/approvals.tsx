import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Modal,
  TextInput,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import * as Haptics from '../../src/utils/haptics';
import { ApprovalService, ApprovalRequest } from '../../src/services/approvalService';

const TYPE_OPTIONS = [
  { id: 'all', label: 'All Types', icon: 'apps-outline' },
  { id: 'fee_underpayment', label: 'Underpayments', icon: 'wallet-outline' },
  { id: 'fee_payment_deletion', label: 'Payment Deletions', icon: 'trash-outline' },
  { id: 'leave', label: 'Staff Leaves', icon: 'calendar-outline' },
  { id: 'concession', label: 'Concessions', icon: 'pricetag-outline' },
  { id: 'expense', label: 'Expenses', icon: 'receipt-outline' },
  { id: 'marks_unlock', label: 'Marks Unlock', icon: 'lock-open-outline' },
];

const REJECT_PRESETS = [
  'Insufficient documentation / justification provided',
  'Exceeds school policy / entitlement limits',
  'Incorrect amount or calculation error',
  'Duplicate submission',
  'Declined as per management review',
];

export default function ApprovalsScreen() {
  const { isDark } = useTheme();

  const [activeTab, setActiveTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [selectedType, setSelectedType] = useState('all');
  const [search, setSearch] = useState('');
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Rejection modal
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [targetRequestId, setTargetRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Counts for tabs
  const [counts, setCounts] = useState<{ PENDING: number; APPROVED: number; REJECTED: number }>({
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
  });

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch with undefined if 'all' to prevent 403 authorization rejections
      const typeParam = selectedType === 'all' ? undefined : selectedType;
      const data = await ApprovalService.list({
        status: activeTab,
        type: typeParam,
      });
      const list = data || [];
      setRequests(list);

      // Update current tab count
      setCounts((prev) => ({
        ...prev,
        [activeTab]: list.length,
      }));
    } catch (err) {
      console.error('Failed to load approval requests', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, selectedType]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  // Client search filtering
  const filteredRequests = useMemo(() => {
    if (!search.trim()) return requests;
    const q = search.toLowerCase().trim();

    return requests.filter((r) => {
      const byUser = (r.requested_by_name || r.requested_by || '').toLowerCase();
      const reason = (r.reason || '').toLowerCase();
      const type = (r.type || '').toLowerCase();
      const payloadStr = JSON.stringify(r.payload || {}).toLowerCase();

      return (
        byUser.includes(q) ||
        reason.includes(q) ||
        type.includes(q) ||
        payloadStr.includes(q)
      );
    });
  }, [requests, search]);

  // Approve request
  const handleApprove = async (request: ApprovalRequest) => {
    Haptics.selectionAsync();
    try {
      setActionInProgress(request.id);
      await ApprovalService.approve(request.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      alertCompat(
        'Request Approved',
        `Successfully authorized ${formatTypeLabel(request.type)} request.`
      );
      fetchRequests();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg =
        err?.response?.data?.error === 'SELF_APPROVAL_PROHIBITED' || err?.response?.data?.message
          ? err.response.data.message || err.response.data.error
          : err.message || 'Failed to approve request';
      alertCompat('Action Prohibited', msg);
    } finally {
      setActionInProgress(null);
    }
  };

  // Open reject modal
  const openRejectModal = (request: ApprovalRequest) => {
    Haptics.selectionAsync();
    setTargetRequestId(request.id);
    setRejectReason('');
    setRejectModalVisible(true);
  };

  // Confirm reject
  const handleConfirmReject = async () => {
    if (!targetRequestId) return;
    try {
      setActionInProgress(targetRequestId);
      setRejectModalVisible(false);
      await ApprovalService.reject(targetRequestId, rejectReason.trim() || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      alertCompat('Request Rejected', 'The authorization request has been rejected.');
      fetchRequests();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg =
        err?.response?.data?.error === 'SELF_APPROVAL_PROHIBITED' || err?.response?.data?.message
          ? err.response.data.message || err.response.data.error
          : err.message || 'Failed to reject request';
      alertCompat('Action Prohibited', msg);
    } finally {
      setActionInProgress(null);
      setTargetRequestId(null);
    }
  };

  const formatTypeLabel = (type: string) => {
    return type
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  // Render structured domain-specific preview
  const renderPayloadSummary = (item: ApprovalRequest) => {
    const p: any = item.payload || {};
    const type = item.type;

    if (type === 'fee_underpayment' || type === 'concession') {
      return (
        <View style={[styles.payloadCard, isDark && styles.payloadCardDark]}>
          <View style={styles.payloadGrid}>
            {p.student_name && (
              <View style={styles.payloadItem}>
                <Text style={styles.payloadLabel}>Student</Text>
                <Text style={[styles.payloadVal, isDark && { color: '#f8fafc' }]}>
                  {p.student_name}
                </Text>
              </View>
            )}
            {p.amount_due != null && (
              <View style={styles.payloadItem}>
                <Text style={styles.payloadLabel}>Original Due</Text>
                <Text style={[styles.payloadVal, isDark && { color: '#f8fafc' }]}>
                  ₹{Number(p.amount_due).toLocaleString('en-IN')}
                </Text>
              </View>
            )}
            {(p.amount_paying != null || p.concession_amount != null) && (
              <View style={styles.payloadItem}>
                <Text style={styles.payloadLabel}>
                  {type === 'concession' ? 'Concession' : 'Paying Amount'}
                </Text>
                <Text style={[styles.payloadVal, { color: '#2563eb', fontWeight: '800' }]}>
                  ₹{Number(p.amount_paying ?? p.concession_amount).toLocaleString('en-IN')}
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    if (type === 'leave') {
      return (
        <View style={[styles.payloadCard, isDark && styles.payloadCardDark]}>
          <View style={styles.payloadGrid}>
            {p.staff_name && (
              <View style={styles.payloadItem}>
                <Text style={styles.payloadLabel}>Staff Member</Text>
                <Text style={[styles.payloadVal, isDark && { color: '#f8fafc' }]}>
                  {p.staff_name}
                </Text>
              </View>
            )}
            {p.leave_type && (
              <View style={styles.payloadItem}>
                <Text style={styles.payloadLabel}>Leave Type</Text>
                <Text style={[styles.payloadVal, isDark && { color: '#f8fafc' }]}>
                  {String(p.leave_type).toUpperCase()}
                </Text>
              </View>
            )}
            {p.days_count != null && (
              <View style={styles.payloadItem}>
                <Text style={styles.payloadLabel}>Duration</Text>
                <Text style={[styles.payloadVal, { color: '#f59e0b', fontWeight: '800' }]}>
                  {p.days_count} day{p.days_count > 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    if (type === 'marks_unlock') {
      return (
        <View style={[styles.payloadCard, isDark && styles.payloadCardDark]}>
          <View style={styles.payloadGrid}>
            {p.subject_name && (
              <View style={styles.payloadItem}>
                <Text style={styles.payloadLabel}>Subject</Text>
                <Text style={[styles.payloadVal, isDark && { color: '#f8fafc' }]}>
                  {p.subject_name}
                </Text>
              </View>
            )}
            {p.exam_title && (
              <View style={styles.payloadItem}>
                <Text style={styles.payloadLabel}>Examination</Text>
                <Text style={[styles.payloadVal, isDark && { color: '#f8fafc' }]}>
                  {p.exam_title}
                </Text>
              </View>
            )}
            {p.class_name && (
              <View style={styles.payloadItem}>
                <Text style={styles.payloadLabel}>Class & Sec</Text>
                <Text style={[styles.payloadVal, isDark && { color: '#f8fafc' }]}>
                  {p.class_name}
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    if (type === 'expense') {
      return (
        <View style={[styles.payloadCard, isDark && styles.payloadCardDark]}>
          <View style={styles.payloadGrid}>
            {p.amount != null && (
              <View style={styles.payloadItem}>
                <Text style={styles.payloadLabel}>Amount</Text>
                <Text style={[styles.payloadVal, { color: '#dc2626', fontWeight: '800' }]}>
                  ₹{Number(p.amount).toLocaleString('en-IN')}
                </Text>
              </View>
            )}
            {p.category && (
              <View style={styles.payloadItem}>
                <Text style={styles.payloadLabel}>Category</Text>
                <Text style={[styles.payloadVal, isDark && { color: '#f8fafc' }]}>
                  {p.category}
                </Text>
              </View>
            )}
            {p.vendor && (
              <View style={styles.payloadItem}>
                <Text style={styles.payloadLabel}>Vendor / Payee</Text>
                <Text style={[styles.payloadVal, isDark && { color: '#f8fafc' }]}>
                  {p.vendor}
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    // Generic fallback for any other types
    const keys = Object.keys(p);
    if (keys.length === 0) return null;

    return (
      <View style={[styles.payloadCard, isDark && styles.payloadCardDark]}>
        <View style={styles.payloadGrid}>
          {keys.slice(0, 4).map((k) => (
            <View key={k} style={styles.payloadItem}>
              <Text style={styles.payloadLabel}>{k.replace(/_/g, ' ')}</Text>
              <Text style={[styles.payloadVal, isDark && { color: '#f8fafc' }]} numberOfLines={1}>
                {typeof p[k] === 'object' ? JSON.stringify(p[k]) : String(p[k])}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, isDark ? styles.darkBg : styles.lightBg]}>
      <TourTarget id="screen.admin-approvals.overview"><AdminHeader
        title="Approvals Inbox"
        rightAction={{
          icon: 'refresh-outline',
          onPress: onRefresh,
        }}
      /></TourTarget>

      <FlatList
        data={filteredRequests}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2563eb"
            colors={['#2563eb']}
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            {/* Executive Status Tabs with counts */}
            <TourTarget id="screen.admin-approvals.workspace" native><View style={[styles.tabsRow, isDark ? styles.tabsRowDark : styles.tabsRowLight]}>
              {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((tab) => {
                const isActive = activeTab === tab;
                const tabColor =
                  tab === 'PENDING' ? '#f59e0b' : tab === 'APPROVED' ? '#10b981' : '#ef4444';

                return (
                  <TouchableOpacity
                    key={tab}
                    activeOpacity={0.7}
                    style={[
                      styles.tabBtn,
                      isActive && (isDark ? styles.tabBtnActiveDark : styles.tabBtnActiveLight),
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setActiveTab(tab);
                    }}
                  >
                    <View
                      style={[
                        styles.tabDot,
                        { backgroundColor: isActive ? tabColor : isDark ? '#64748b' : '#94a3b8' },
                      ]}
                    />
                    <Text
                      style={[
                        styles.tabBtnText,
                        isActive
                          ? isDark
                            ? styles.tabBtnTextActiveDark
                            : styles.tabBtnTextActiveLight
                          : isDark
                          ? styles.tabBtnTextInactiveDark
                          : styles.tabBtnTextInactiveLight,
                      ]}
                    >
                      {tab.charAt(0) + tab.slice(1).toLowerCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View></TourTarget>

            {/* Search Input */}
            <View
              style={[
                styles.searchContainer,
                isDark ? styles.searchContainerDark : styles.searchContainerLight,
              ]}
            >
              <Ionicons name="search" size={18} color={isDark ? '#94a3b8' : '#64748b'} />
              <TextInput
                style={[styles.searchInput, isDark && { color: '#f8fafc' }]}
                placeholder="Search by requester name, reason, or details..."
                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={18} color={isDark ? '#64748b' : '#94a3b8'} />
                </TouchableOpacity>
              )}
            </View>

            {/* Type Filter Chips */}
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={TYPE_OPTIONS}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.typeChipsScroll}
              renderItem={({ item }) => {
                const isSelected = selectedType === item.id;
                return (
                  <TouchableOpacity
                    style={[
                      styles.typeChip,
                      isSelected
                        ? styles.typeChipActive
                        : isDark
                        ? styles.typeChipDark
                        : styles.typeChipLight,
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedType(item.id);
                    }}
                  >
                    <Ionicons
                      name={item.icon as any}
                      size={14}
                      color={isSelected ? '#ffffff' : isDark ? '#94a3b8' : '#475569'}
                      style={{ marginRight: 5 }}
                    />
                    <Text
                      style={[
                        styles.typeChipText,
                        isSelected
                          ? styles.typeChipTextActive
                          : isDark
                          ? styles.typeChipTextDark
                          : styles.typeChipTextLight,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />

            {/* Section Count Header */}
            <View style={styles.listHeaderRow}>
              <Text style={[styles.listHeaderTitle, isDark && { color: '#f8fafc' }]}>
                {activeTab === 'PENDING'
                  ? 'Queue Pending Review'
                  : activeTab === 'APPROVED'
                  ? 'Authorized Records'
                  : 'Declined Submissions'}
                {' '}({filteredRequests.length})
              </Text>
              {(search || selectedType !== 'all') && (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSearch('');
                    setSelectedType('all');
                  }}
                >
                  <Text style={styles.resetFiltersText}>Clear Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const isPending = activeTab === 'PENDING';
          const isApproved = item.status === 'APPROVED';

          return (
            <View
              style={[
                styles.card,
                isDark ? styles.cardDark : styles.cardLight,
              ]}
            >
              {/* Card Top */}
              <View style={styles.cardTop}>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{formatTypeLabel(item.type)}</Text>
                </View>
                <Text style={[styles.dateText, isDark && { color: '#64748b' }]}>
                  {new Date(item.created_at).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>

              {/* Card Requester & Reason */}
              <View style={styles.requesterRow}>
                <View style={styles.requesterAvatar}>
                  <Text style={styles.requesterAvatarText}>
                    {(item.requested_by_name || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.requesterName, isDark && { color: '#f8fafc' }]}>
                    {item.requested_by_name || 'Staff Member'}
                  </Text>
                  <Text style={[styles.requesterSub, isDark && { color: '#94a3b8' }]}>
                    Initiated Authorization Request
                  </Text>
                </View>
              </View>

              {/* Justification / Reason */}
              {item.reason ? (
                <View style={[styles.reasonBox, isDark && styles.reasonBoxDark]}>
                  <Text style={[styles.reasonText, isDark && { color: '#cbd5e1' }]}>
                    "{item.reason}"
                  </Text>
                </View>
              ) : null}

              {/* Structured Domain-Specific Payload Preview */}
              {renderPayloadSummary(item)}

              {/* Reviewer Note if already decided */}
              {item.reviewed_by_name ? (
                <View style={styles.reviewedRow}>
                  <Ionicons
                    name={isApproved ? 'checkmark-circle' : 'close-circle'}
                    size={14}
                    color={isApproved ? '#10b981' : '#ef4444'}
                  />
                  <Text style={[styles.reviewedText, isDark && { color: '#94a3b8' }]}>
                    Reviewed by {item.reviewed_by_name} on{' '}
                    {item.reviewed_at
                      ? new Date(item.reviewed_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                        })
                      : 'N/A'}
                  </Text>
                </View>
              ) : null}

              {/* Actions for Pending */}
              {isPending && (
                <View style={[styles.actionsRow, isDark && { borderTopColor: 'rgba(255,255,255,0.06)' }]}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.rejectBtn]}
                    onPress={() => openRejectModal(item)}
                    disabled={actionInProgress === item.id}
                  >
                    <Ionicons name="close-circle-outline" size={16} color="#dc2626" />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.approveBtn]}
                    onPress={() => handleApprove(item)}
                    disabled={actionInProgress === item.id}
                  >
                    {actionInProgress === item.id ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#ffffff" />
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={[styles.emptySubtitle, isDark && { color: '#94a3b8' }]}>
                Loading approval requests...
              </Text>
            </View>
          ) : (
            <View style={[styles.emptyContainer, isDark ? styles.emptyDark : styles.emptyLight]}>
              <Ionicons
                name="shield-checkmark"
                size={54}
                color={activeTab === 'PENDING' ? '#10b981' : '#94a3b8'}
              />
              <Text
                style={[
                  styles.emptyTitle,
                  { color: activeTab === 'PENDING' ? '#10b981' : isDark ? '#f8fafc' : '#0f172a' },
                ]}
              >
                {activeTab === 'PENDING' ? 'All Clear — No Pending Items' : `No ${activeTab} Records`}
              </Text>
              <Text style={[styles.emptySubtitle, isDark && { color: '#94a3b8' }]}>
                {activeTab === 'PENDING'
                  ? 'Your approval inbox is completely up-to-date.'
                  : `There are no requests with ${activeTab.toLowerCase()} status matching the criteria.`}
              </Text>
            </View>
          )
        }
        ListFooterComponent={<View style={{ height: 40 }} />}
      />

      {/* Reject Modal with Presets */}
      <Modal visible={rejectModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isDark ? styles.modalCardDark : styles.modalCardLight]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconBox, { backgroundColor: '#fef2f2' }]}>
                <Ionicons name="close-circle" size={22} color="#dc2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, isDark && { color: '#f8fafc' }]}>
                  Reject Authorization Request
                </Text>
                <Text style={[styles.modalSubtitle, isDark && { color: '#94a3b8' }]}>
                  Provide an audit justification for this rejection.
                </Text>
              </View>
            </View>

            {/* Quick Reason Presets */}
            <Text style={[styles.modalInputLabel, isDark && { color: '#cbd5e1' }]}>
              Quick Reasons
            </Text>
            <View style={styles.presetsContainer}>
              {REJECT_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.presetPill,
                    rejectReason === preset && styles.presetPillActive,
                    isDark && styles.presetPillDark,
                  ]}
                  onPress={() => setRejectReason(preset)}
                >
                  <Text
                    style={[
                      styles.presetText,
                      rejectReason === preset && styles.presetTextActive,
                      isDark && rejectReason !== preset && { color: '#94a3b8' },
                    ]}
                  >
                    {preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modalInputLabel, isDark && { color: '#cbd5e1' }]}>
              Specific Justification Notes
            </Text>
            <TextInput
              style={[styles.modalInput, isDark ? styles.modalInputDark : styles.modalInputLight]}
              placeholder="Enter custom rejection reason..."
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, isDark && styles.modalCancelBtnDark]}
                onPress={() => setRejectModalVisible(false)}
              >
                <Text style={[styles.modalCancelText, isDark && { color: '#94a3b8' }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalRejectBtn}
                onPress={handleConfirmReject}
              >
                <Text style={styles.modalRejectText}>Confirm Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  lightBg: {
    backgroundColor: '#f8fafc',
  },
  darkBg: {
    backgroundColor: '#0b0f17',
  },
  listContent: {
    padding: 16,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
    borderWidth: 1,
  },
  tabsRowLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  tabsRowDark: {
    backgroundColor: '#161e2e',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  tabBtnActiveLight: {
    backgroundColor: '#eff6ff',
  },
  tabBtnActiveDark: {
    backgroundColor: 'rgba(37,99,235,0.2)',
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tabBtnTextActiveLight: {
    color: '#1d4ed8',
  },
  tabBtnTextActiveDark: {
    color: '#93c5fd',
  },
  tabBtnTextInactiveLight: {
    color: '#64748b',
  },
  tabBtnTextInactiveDark: {
    color: '#94a3b8',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    marginBottom: 12,
    gap: 10,
  },
  searchContainerLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  searchContainerDark: {
    backgroundColor: '#161e2e',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
  },
  typeChipsScroll: {
    gap: 6,
    paddingBottom: 12,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  typeChipLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  typeChipDark: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  typeChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  typeChipTextLight: {
    color: '#475569',
  },
  typeChipTextDark: {
    color: '#cbd5e1',
  },
  typeChipTextActive: {
    color: '#ffffff',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 2,
  },
  listHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  resetFiltersText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 16px rgba(15,23,42,0.04)',
      },
      default: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.04,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  cardLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  cardDark: {
    backgroundColor: '#161e2e',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
    textTransform: 'uppercase',
  },
  dateText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  requesterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  requesterAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requesterAvatarText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  requesterName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  requesterSub: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1,
  },
  reasonBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  reasonBoxDark: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  reasonText: {
    fontSize: 12.5,
    color: '#475569',
    fontStyle: 'italic',
  },
  payloadCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  payloadCardDark: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  payloadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  payloadItem: {
    minWidth: '45%',
    flex: 1,
  },
  payloadLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  payloadVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 2,
  },
  reviewedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
  },
  reviewedText: {
    fontSize: 11.5,
    color: '#64748b',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  rejectBtn: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  rejectBtnText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 13,
  },
  approveBtn: {
    backgroundColor: '#2563eb',
  },
  approveBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyContainer: {
    borderRadius: 16,
    padding: 36,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
  },
  emptyLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  emptyDark: {
    backgroundColor: '#161e2e',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 360,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  modalCardLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  modalCardDark: {
    backgroundColor: '#161e2e',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  modalIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  modalInputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  presetsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  presetPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  presetPillDark: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  presetPillActive: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  presetText: {
    fontSize: 11,
    color: '#475569',
  },
  presetTextActive: {
    color: '#dc2626',
    fontWeight: '600',
  },
  modalInput: {
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    borderWidth: 1,
    textAlignVertical: 'top',
    minHeight: 70,
    marginBottom: 16,
  },
  modalInputLight: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    color: '#0f172a',
  },
  modalInputDark: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#f8fafc',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalCancelBtnDark: {
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  modalRejectBtn: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  modalRejectText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
