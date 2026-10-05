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
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/services/apiClient';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import LogoLoader from '../../src/components/LogoLoader';

interface Ticket {
  id: string;
  ticket_number: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  student_name?: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
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

interface TicketDetail extends Ticket {
  messages: TicketMessage[];
}

const CATEGORY_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  fees: { label: 'Fees & Dues', icon: 'wallet-outline', color: '#10B981' },
  transport: { label: 'Transport & Bus', icon: 'bus-outline', color: '#F59E0B' },
  academics: { label: 'Academics & Timetable', icon: 'book-outline', color: '#6366F1' },
  facilities: { label: 'Facilities & Hostel', icon: 'business-outline', color: '#8B5CF6' },
  other: { label: 'General Help', icon: 'help-circle-outline', color: '#6B7280' },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  open: { label: 'Submitted', color: '#3B82F6' },
  in_progress: { label: 'Under Review', color: '#F59E0B' },
  waiting_for_parent: { label: 'Action Required', color: '#EC4899' },
  waiting_on_parent: { label: 'Action Required', color: '#EC4899' },
  resolved: { label: 'Resolved', color: '#10B981' },
  closed: { label: 'Closed', color: '#6B7280' },
};

export default function ParentHelpdeskScreen() {
  const { isDark } = useTheme();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // New Ticket Modal State
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [category, setCategory] = useState('other');
  const [subject, setSubject] = useState('');
  const [initialMessage, setInitialMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Thread Modal State
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ tickets: Ticket[] }>('/support/tickets/my');
      if (res?.tickets) {
        setTickets(res.tickets);
      }
    } catch (err: any) {
      console.warn('Failed to fetch parent tickets', err?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTickets();
  };

  const openThread = async (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setDetailLoading(true);
    try {
      const res = await api.get<TicketDetail>(`/support/tickets/${ticketId}`);
      setTicketDetail(res || null);
    } catch (err: any) {
      alertCompat('Error', 'Failed to load ticket conversation');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!subject.trim() || !initialMessage.trim()) {
      alertCompat('Missing Information', 'Please provide both a subject and a description of your query.');
      return;
    }

    try {
      setSubmitting(true);
      await api.post('/support/tickets', {
        category,
        subject: subject.trim(),
        initial_message: initialMessage.trim(),
      });
      setNewModalVisible(false);
      setSubject('');
      setInitialMessage('');
      alertCompat('Ticket Submitted', 'Your support ticket has been received. Our team will review and reply shortly.');
      fetchTickets();
    } catch (err: any) {
      alertCompat('Error', err?.message || 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicketId) return;
    try {
      setReplySending(true);
      await api.post(`/support/tickets/${selectedTicketId}/messages`, {
        message: replyText.trim(),
      });
      setReplyText('');
      // Refresh thread
      const res = await api.get<TicketDetail>(`/support/tickets/${selectedTicketId}`);
      setTicketDetail(res || null);
      fetchTickets();
    } catch (err: any) {
      alertCompat('Error', err?.message || 'Failed to send reply');
    } finally {
      setReplySending(false);
    }
  };

  const styles = getStyles(isDark);

  return (
    <TourTarget id="screen.screen-helpdesk.workspace" style={{ flex: 1 }}><ScreenLayout>
      <TourTarget id="screen.screen-helpdesk.overview"><StudentHeader title="Parent Help Desk" /></TourTarget>

      <View style={styles.container}>
        {/* Banner */}
        <LinearGradient
          colors={['#4F46E5', '#6366F1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>How can we assist you?</Text>
            <Text style={styles.heroSub}>
              Direct school assistance for fees, bus transportation, academics, and official queries.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.newTicketBtn}
            onPress={() => setNewModalVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle" size={18} color="#4F46E5" />
            <Text style={styles.newTicketBtnText}>New Ticket</Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* Ticket List */}
        {loading && !refreshing ? (
          <LogoLoader />
        ) : (
          <FlatList
            data={tickets}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => {
              const catMeta = CATEGORY_META[item.category] || CATEGORY_META.other;
              const statusMeta = STATUS_META[item.status] || STATUS_META.open;

              return (
                <TouchableOpacity
                  style={styles.ticketCard}
                  onPress={() => openThread(item.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.ticketTopRow}>
                    <View style={styles.categoryBadge}>
                      <Ionicons name={catMeta.icon} size={14} color={catMeta.color} />
                      <Text style={[styles.categoryText, { color: catMeta.color }]}>{catMeta.label}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: `${statusMeta.color}20` }]}>
                      <Text style={[styles.statusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                    </View>
                  </View>

                  <Text style={styles.ticketNumber}>{item.ticket_number}</Text>
                  <Text style={styles.ticketSubject}>{item.subject}</Text>

                  <View style={styles.ticketFooter}>
                    <Text style={styles.ticketDate}>
                      {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </Text>
                    <View style={styles.msgCountPill}>
                      <Ionicons name="chatbubble-outline" size={12} color={isDark ? '#9CA3AF' : '#6B7280'} />
                      <Text style={styles.msgCountText}>{item.message_count} replies</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={48} color={isDark ? '#4B5563' : '#9CA3AF'} />
                <Text style={styles.emptyTitle}>No support tickets yet</Text>
                <Text style={styles.emptySub}>
                  Have a question regarding fees, transport, or school events? Tap &apos;New Ticket&apos; to get in touch.
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* New Ticket Modal */}
      <Modal visible={newModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Open Support Request</Text>
              <TouchableOpacity onPress={() => setNewModalVisible(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#FFFFFF' : '#111827'} />
              </TouchableOpacity>
            </View>

            <TourScrollView contentContainerStyle={{ gap: 14 }}>
              <Text style={styles.fieldLabel}>Select Category</Text>
              <View style={styles.categoryGrid}>
                {Object.entries(CATEGORY_META).map(([key, meta]) => {
                  const active = category === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.categoryOption, active && styles.categoryOptionActive]}
                      onPress={() => setCategory(key)}
                    >
                      <Ionicons name={meta.icon} size={16} color={active ? '#FFFFFF' : meta.color} />
                      <Text style={[styles.categoryOptionText, active && { color: '#FFFFFF' }]}>
                        {meta.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Subject</Text>
              <TextInput
                style={styles.textInput}
                placeholder="E.g., Query regarding Term 2 Bus Route Fee"
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                value={subject}
                onChangeText={setSubject}
              />

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.textInput, { height: 100, textAlignVertical: 'top' }]}
                placeholder="Describe your issue or request in detail..."
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                value={initialMessage}
                onChangeText={setInitialMessage}
                multiline
              />

              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                onPress={handleCreateTicket}
                disabled={submitting}
              >
                <Text style={styles.submitBtnText}>{submitting ? 'Submitting...' : 'Submit Request'}</Text>
              </TouchableOpacity>
            </TourScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Conversation Thread Modal */}
      <Modal visible={Boolean(selectedTicketId)} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalCard, { height: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.threadNumber}>{ticketDetail?.ticket_number}</Text>
                <Text style={styles.threadSubject} numberOfLines={1}>{ticketDetail?.subject}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedTicketId(null)}>
                <Ionicons name="close" size={24} color={isDark ? '#FFFFFF' : '#111827'} />
              </TouchableOpacity>
            </View>

            {detailLoading ? (
              <LogoLoader />
            ) : (
              <FlatList
                data={ticketDetail?.messages || []}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.threadMessages}
                renderItem={({ item }) => {
                  const isStaff = item.is_sender_staff;
                  return (
                    <View style={[styles.messageBubble, isStaff ? styles.bubbleStaff : styles.bubbleParent]}>
                      <View style={styles.bubbleHeader}>
                        <Text style={[styles.senderName, isStaff && { color: '#4F46E5' }]}>
                          {item.sender_name} {isStaff ? '· School Staff' : ''}
                        </Text>
                        <Text style={styles.messageTime}>
                          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      <Text style={styles.messageText}>{item.message}</Text>
                    </View>
                  );
                }}
              />
            )}

            {/* Reply Composer */}
            <View style={styles.replyBar}>
              <TextInput
                style={styles.replyInput}
                placeholder="Type your reply..."
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                value={replyText}
                onChangeText={setReplyText}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!replyText.trim() || replySending) && { opacity: 0.5 }]}
                onPress={handleSendReply}
                disabled={!replyText.trim() || replySending}
              >
                <Ionicons name="send" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenLayout></TourTarget>
  );
}

const getStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
    },
    heroCard: {
      borderRadius: 16,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    heroTitle: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 4,
    },
    heroSub: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 12,
      lineHeight: 16,
    },
    newTicketBtn: {
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    newTicketBtnText: {
      color: '#4F46E5',
      fontSize: 13,
      fontWeight: '700',
    },
    listContent: {
      gap: 12,
      paddingBottom: 40,
    },
    ticketCard: {
      backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    ticketTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    categoryBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    categoryText: {
      fontSize: 12,
      fontWeight: '600',
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    statusText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    ticketNumber: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#9CA3AF' : '#6B7280',
      marginBottom: 2,
    },
    ticketSubject: {
      fontSize: 15,
      fontWeight: '600',
      color: isDark ? '#F9FAFB' : '#111827',
      marginBottom: 10,
    },
    ticketFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? '#374151' : '#E5E7EB',
      paddingTop: 8,
    },
    ticketDate: {
      fontSize: 11,
      color: isDark ? '#9CA3AF' : '#6B7280',
    },
    msgCountPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    msgCountText: {
      fontSize: 11,
      color: isDark ? '#9CA3AF' : '#6B7280',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      paddingHorizontal: 30,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#D1D5DB' : '#374151',
      marginTop: 12,
      marginBottom: 4,
    },
    emptySub: {
      fontSize: 13,
      color: isDark ? '#6B7280' : '#9CA3AF',
      textAlign: 'center',
      lineHeight: 18,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      maxHeight: '90%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#F9FAFB' : '#111827',
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#D1D5DB' : '#374151',
    },
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    categoryOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? '#111827' : '#F3F4F6',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    categoryOptionActive: {
      backgroundColor: '#4F46E5',
      borderColor: '#4F46E5',
    },
    categoryOptionText: {
      fontSize: 12,
      color: isDark ? '#D1D5DB' : '#374151',
      fontWeight: '500',
    },
    textInput: {
      backgroundColor: isDark ? '#111827' : '#F9FAFB',
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      color: isDark ? '#F9FAFB' : '#111827',
      borderWidth: 1,
      borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    submitBtn: {
      backgroundColor: '#4F46E5',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 10,
    },
    submitBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    threadNumber: {
      fontSize: 11,
      color: isDark ? '#9CA3AF' : '#6B7280',
      fontWeight: '700',
    },
    threadSubject: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#F9FAFB' : '#111827',
    },
    threadMessages: {
      gap: 12,
      paddingVertical: 12,
    },
    messageBubble: {
      borderRadius: 12,
      padding: 12,
      maxWidth: '85%',
    },
    bubbleStaff: {
      alignSelf: 'flex-start',
      backgroundColor: isDark ? '#111827' : '#F3F4F6',
      borderLeftWidth: 3,
      borderLeftColor: '#4F46E5',
    },
    bubbleParent: {
      alignSelf: 'flex-end',
      backgroundColor: '#4F46E520',
      borderRightWidth: 3,
      borderRightColor: '#4F46E5',
    },
    bubbleHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
      gap: 8,
    },
    senderName: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#D1D5DB' : '#374151',
    },
    messageTime: {
      fontSize: 10,
      color: isDark ? '#6B7280' : '#9CA3AF',
    },
    messageText: {
      fontSize: 13,
      color: isDark ? '#E5E7EB' : '#1F2937',
      lineHeight: 18,
    },
    replyBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? '#374151' : '#E5E7EB',
      paddingTop: 10,
    },
    replyInput: {
      flex: 1,
      backgroundColor: isDark ? '#111827' : '#F3F4F6',
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      fontSize: 13,
      color: isDark ? '#F9FAFB' : '#111827',
    },
    sendBtn: {
      backgroundColor: '#4F46E5',
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
