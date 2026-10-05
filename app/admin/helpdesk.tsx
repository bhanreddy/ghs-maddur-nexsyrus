import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
  Switch,
  Platform,
  useWindowDimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/services/apiClient';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import LogoLoader from '../../src/components/LogoLoader';

interface SupportTicket {
  id: string;
  ticket_number: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  parent_name: string;
  student_name?: string | null;
  admission_no?: string | null;
  class_name?: string | null;
  section_name?: string | null;
  assigned_staff_name?: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: string;
  sender_user_id: string;
  sender_name: string;
  message: string;
  is_sender_staff: boolean;
  is_internal_note: boolean;
  created_at: string;
}

interface TicketDetail extends SupportTicket {
  messages: TicketMessage[];
}

const CATEGORY_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  fees: { label: 'Fees', icon: 'wallet-outline', color: '#10B981' },
  transport: { label: 'Transport', icon: 'bus-outline', color: '#F59E0B' },
  academics: { label: 'Academics', icon: 'book-outline', color: '#6366F1' },
  facilities: { label: 'Facilities', icon: 'business-outline', color: '#8B5CF6' },
  other: { label: 'Other', icon: 'help-circle-outline', color: '#6B7280' },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  open: { label: 'New Open', color: '#3B82F6' },
  in_progress: { label: 'In Progress', color: '#F59E0B' },
  waiting_for_parent: { label: 'Waiting Parent', color: '#EC4899' },
  waiting_on_parent: { label: 'Waiting Parent', color: '#EC4899' },
  resolved: { label: 'Resolved', color: '#10B981' },
  closed: { label: 'Closed', color: '#6B7280' },
};

export default function AdminHelpdeskScreen() {
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Ticket State
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Message Composer State
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = { limit: '100' };
      if (categoryFilter) params.category = categoryFilter;
      if (statusFilter) params.status = statusFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await api.get<{ tickets: SupportTicket[] }>('/support/tickets', params);
      if (res?.tickets) {
        setTickets(res.tickets);
      }
    } catch (err: any) {
      console.warn('Failed to fetch support tickets', err?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryFilter, statusFilter, searchQuery]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTickets();
  };

  const openTicket = async (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setDetailLoading(true);
    try {
      const res = await api.get<TicketDetail>(`/support/tickets/${ticketId}`);
      setTicketDetail(res || null);
    } catch (err: any) {
      alertCompat('Error', 'Failed to load ticket details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!replyText.trim() || !selectedTicketId) return;
    try {
      setSending(true);
      await api.post(`/support/tickets/${selectedTicketId}/messages`, {
        message: replyText.trim(),
        is_internal_note: isInternalNote,
      });
      setReplyText('');
      setIsInternalNote(false);
      // Reload ticket detail and list
      const res = await api.get<TicketDetail>(`/support/tickets/${selectedTicketId}`);
      setTicketDetail(res || null);
      fetchTickets();
    } catch (err: any) {
      alertCompat('Error', err?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (nextStatus: string) => {
    if (!selectedTicketId) return;
    try {
      await api.patch(`/support/tickets/${selectedTicketId}/status`, {
        status: nextStatus,
      });
      const res = await api.get<TicketDetail>(`/support/tickets/${selectedTicketId}`);
      setTicketDetail(res || null);
      fetchTickets();
    } catch (err: any) {
      alertCompat('Error', err?.message || 'Failed to update ticket status');
    }
  };

  const styles = getStyles(isDark);

  return (
    <View style={styles.container}>
      <TourTarget id="screen.admin-helpdesk.overview"><AdminHeader title="Parent Support Help Desk" /></TourTarget>

      {/* Main Layout: Split view on Desktop, Stack on Mobile */}
      <View style={[styles.mainLayout, isDesktop && styles.desktopRow]}>
        {/* Left Column: Tickets Inbox */}
        <View style={[styles.inboxPane, isDesktop && styles.desktopInboxPane]}>
          {/* Filters & Search */}
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by ticket # or subject..."
              placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Category Chips */}
          <TourTarget id="screen.admin-helpdesk.workspace" native><TourScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
            <TouchableOpacity
              style={[styles.chip, categoryFilter === null && styles.chipActive]}
              onPress={() => setCategoryFilter(null)}
            >
              <Text style={[styles.chipText, categoryFilter === null && styles.chipTextActive]}>All</Text>
            </TouchableOpacity>
            {Object.entries(CATEGORY_META).map(([key, meta]) => (
              <TouchableOpacity
                key={key}
                style={[styles.chip, categoryFilter === key && styles.chipActive]}
                onPress={() => setCategoryFilter(categoryFilter === key ? null : key)}
              >
                <Text style={[styles.chipText, categoryFilter === key && styles.chipTextActive]}>
                  {meta.label}
                </Text>
              </TouchableOpacity>
            ))}
          </TourScrollView></TourTarget>

          {loading && !refreshing ? (
            <LogoLoader />
          ) : (
            <FlatList
              data={tickets}
              keyExtractor={item => item.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={{ gap: 8, paddingBottom: 20 }}
              renderItem={({ item }) => {
                const isSelected = selectedTicketId === item.id;
                const catMeta = CATEGORY_META[item.category] || CATEGORY_META.other;
                const statusMeta = STATUS_META[item.status] || STATUS_META.open;

                return (
                  <TouchableOpacity
                    style={[
                      styles.ticketRow,
                      isSelected && styles.ticketRowSelected,
                    ]}
                    onPress={() => openTicket(item.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.ticketHeader}>
                      <Text style={styles.ticketNum}>{item.ticket_number}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: `${statusMeta.color}20` }]}>
                        <Text style={[styles.statusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                      </View>
                    </View>

                    <Text style={styles.ticketSubject} numberOfLines={1}>{item.subject}</Text>
                    <Text style={styles.parentMeta}>
                      {item.parent_name} {item.student_name ? `(${item.student_name})` : ''}
                    </Text>

                    <View style={styles.ticketMetaRow}>
                      <View style={styles.catPill}>
                        <Ionicons name={catMeta.icon} size={11} color={catMeta.color} />
                        <Text style={[styles.catText, { color: catMeta.color }]}>{catMeta.label}</Text>
                      </View>
                      <Text style={styles.timeText}>
                        {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Ionicons name="mail-open-outline" size={36} color={isDark ? '#4B5563' : '#9CA3AF'} />
                  <Text style={styles.emptyTitle}>No support tickets</Text>
                  <Text style={styles.emptySub}>All parent requests have been addressed.</Text>
                </View>
              }
            />
          )}
        </View>

        {/* Right Column: Ticket Conversation Pane */}
        {(selectedTicketId || isDesktop) && (
          <View style={[styles.detailPane, isDesktop && styles.desktopDetailPane]}>
            {detailLoading ? (
              <LogoLoader />
            ) : ticketDetail ? (
              <View style={{ flex: 1 }}>
                {/* Header with status changer */}
                <View style={styles.detailHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailNumber}>{ticketDetail.ticket_number}</Text>
                    <Text style={styles.detailSubject}>{ticketDetail.subject}</Text>
                    <Text style={styles.detailParent}>
                      From: {ticketDetail.parent_name} · Student: {ticketDetail.student_name || 'N/A'} ({ticketDetail.class_name || ''})
                    </Text>
                  </View>

                  <View style={styles.statusActions}>
                    <TouchableOpacity
                      style={[styles.actionPill, { backgroundColor: '#F59E0B20' }]}
                      onPress={() => handleStatusChange('in_progress')}
                    >
                      <Text style={[styles.actionPillText, { color: '#D97706' }]}>In Progress</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionPill, { backgroundColor: '#10B98120' }]}
                      onPress={() => handleStatusChange('resolved')}
                    >
                      <Text style={[styles.actionPillText, { color: '#059669' }]}>Resolve</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Message Thread */}
                <FlatList
                  data={ticketDetail.messages || []}
                  keyExtractor={item => item.id}
                  contentContainerStyle={styles.messagesList}
                  renderItem={({ item }) => {
                    const isInternal = item.is_internal_note;
                    const isStaff = item.is_sender_staff;

                    return (
                      <View
                        style={[
                          styles.msgCard,
                          isInternal
                            ? styles.msgInternal
                            : isStaff
                            ? styles.msgStaff
                            : styles.msgParent,
                        ]}
                      >
                        <View style={styles.msgHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.msgSenderName}>{item.sender_name}</Text>
                            {isInternal && (
                              <View style={styles.internalBadge}>
                                <Ionicons name="lock-closed" size={10} color="#D97706" />
                                <Text style={styles.internalBadgeText}>STAFF NOTE</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.msgTime}>
                            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <Text style={styles.msgBody}>{item.message}</Text>
                      </View>
                    );
                  }}
                />

                {/* Composer */}
                <View style={styles.composerBox}>
                  <View style={styles.noteToggleRow}>
                    <Text style={[styles.noteToggleLabel, isInternalNote && { color: '#D97706', fontWeight: '700' }]}>
                      {isInternalNote ? '🔒 Private Internal Note (Invisible to parent)' : 'Public Reply (Parent will be notified)'}
                    </Text>
                    <Switch
                      value={isInternalNote}
                      onValueChange={setIsInternalNote}
                      trackColor={{ false: '#9CA3AF', true: '#F59E0B' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={styles.composerInputRow}>
                    <TextInput
                      style={[
                        styles.composerInput,
                        isInternalNote && { borderColor: '#F59E0B', backgroundColor: '#F59E0B10' },
                      ]}
                      placeholder={isInternalNote ? 'Write internal note for staff...' : 'Type response to parent...'}
                      placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                      value={replyText}
                      onChangeText={setReplyText}
                      multiline
                    />
                    <TouchableOpacity
                      style={[styles.composerSendBtn, (!replyText.trim() || sending) && { opacity: 0.5 }]}
                      onPress={handleSendMessage}
                      disabled={!replyText.trim() || sending}
                    >
                      <Ionicons name="send" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptyDetail}>
                <Ionicons name="chatbubbles-outline" size={48} color={isDark ? '#4B5563' : '#9CA3AF'} />
                <Text style={styles.emptyDetailText}>Select a ticket from the inbox to view thread</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const getStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#0B0F19' : '#F8FAFC',
    },
    mainLayout: {
      flex: 1,
      padding: 14,
    },
    desktopRow: {
      flexDirection: 'row',
      gap: 16,
    },
    inboxPane: {
      flex: 1,
    },
    desktopInboxPane: {
      flex: 1,
      maxWidth: 420,
      borderRightWidth: 1,
      borderRightColor: isDark ? '#374151' : '#E5E7EB',
      paddingRight: 16,
    },
    detailPane: {
      flex: 1,
      backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? '#374151' : '#E5E7EB',
      overflow: 'hidden',
    },
    desktopDetailPane: {
      flex: 2,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: isDark ? '#374151' : '#E5E7EB',
      marginBottom: 10,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: isDark ? '#F9FAFB' : '#111827',
      padding: 0,
    },
    chipsRow: {
      flexDirection: 'row',
      marginBottom: 12,
      maxHeight: 36,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
      marginRight: 6,
      borderWidth: 1,
      borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    chipActive: {
      backgroundColor: '#4F46E5',
      borderColor: '#4F46E5',
    },
    chipText: {
      fontSize: 12,
      color: isDark ? '#9CA3AF' : '#6B7280',
      fontWeight: '500',
    },
    chipTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    ticketRow: {
      backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    ticketRowSelected: {
      borderColor: '#4F46E5',
      backgroundColor: isDark ? '#4F46E515' : '#EEF2FF',
    },
    ticketHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    ticketNum: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#9CA3AF' : '#6B7280',
    },
    statusBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    statusText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    ticketSubject: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#F9FAFB' : '#111827',
      marginBottom: 2,
    },
    parentMeta: {
      fontSize: 12,
      color: isDark ? '#9CA3AF' : '#6B7280',
      marginBottom: 8,
    },
    ticketMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    catPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    catText: {
      fontSize: 11,
      fontWeight: '600',
    },
    timeText: {
      fontSize: 11,
      color: isDark ? '#6B7280' : '#9CA3AF',
    },
    detailHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#374151' : '#E5E7EB',
      backgroundColor: isDark ? '#111827' : '#F9FAFB',
    },
    detailNumber: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#9CA3AF' : '#6B7280',
    },
    detailSubject: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#F9FAFB' : '#111827',
      marginTop: 2,
    },
    detailParent: {
      fontSize: 12,
      color: isDark ? '#9CA3AF' : '#6B7280',
      marginTop: 2,
    },
    statusActions: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
    },
    actionPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
    },
    actionPillText: {
      fontSize: 11,
      fontWeight: '700',
    },
    messagesList: {
      padding: 16,
      gap: 12,
    },
    msgCard: {
      padding: 12,
      borderRadius: 12,
      maxWidth: '85%',
    },
    msgStaff: {
      alignSelf: 'flex-end',
      backgroundColor: '#4F46E515',
      borderRightWidth: 3,
      borderRightColor: '#4F46E5',
    },
    msgParent: {
      alignSelf: 'flex-start',
      backgroundColor: isDark ? '#111827' : '#F3F4F6',
      borderLeftWidth: 3,
      borderLeftColor: '#9CA3AF',
    },
    msgInternal: {
      alignSelf: 'stretch',
      maxWidth: '100%',
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
      borderWidth: 1,
      borderColor: '#F59E0B',
    },
    msgHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    msgSenderName: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#E5E7EB' : '#1F2937',
    },
    internalBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(245, 158, 11, 0.2)',
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
    },
    internalBadgeText: {
      fontSize: 9,
      fontWeight: '800',
      color: '#D97706',
    },
    msgTime: {
      fontSize: 10,
      color: isDark ? '#6B7280' : '#9CA3AF',
    },
    msgBody: {
      fontSize: 13,
      color: isDark ? '#F3F4F6' : '#111827',
      lineHeight: 18,
    },
    composerBox: {
      borderTopWidth: 1,
      borderTopColor: isDark ? '#374151' : '#E5E7EB',
      padding: 12,
      backgroundColor: isDark ? '#111827' : '#F9FAFB',
    },
    noteToggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    noteToggleLabel: {
      fontSize: 12,
      color: isDark ? '#9CA3AF' : '#6B7280',
    },
    composerInputRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
    },
    composerInput: {
      flex: 1,
      backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? '#374151' : '#E5E7EB',
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: isDark ? '#F9FAFB' : '#111827',
      maxHeight: 80,
    },
    composerSendBtn: {
      backgroundColor: '#4F46E5',
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
    },
    emptyTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#9CA3AF' : '#6B7280',
      marginTop: 8,
    },
    emptySub: {
      fontSize: 12,
      color: isDark ? '#6B7280' : '#9CA3AF',
      marginTop: 2,
    },
    emptyDetail: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    emptyDetailText: {
      fontSize: 14,
      color: isDark ? '#9CA3AF' : '#6B7280',
      marginTop: 10,
    },
  });
