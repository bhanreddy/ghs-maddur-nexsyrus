import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from '@/src/utils/haptics';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService, type VisitorRequest } from '@/src/services/visitorService';

const STATUS_FILTERS = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];

export default function AdminVisitorApprovalsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [requests, setRequests] = useState<VisitorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    try {
      const list = await visitorService.getVisitorRequests({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      });
      setRequests(list);
    } catch (e) {
      console.warn('Failed to load visit requests:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadRequests();
  };

  const handleApprove = async (req: VisitorRequest) => {
    try {
      setProcessingId(req.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await visitorService.approveVisitorRequest(req.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadRequests();
    } catch (err: any) {
      Alert.alert('Approval Failed', err?.message || 'Could not approve visit request.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (req: VisitorRequest) => {
    Alert.prompt
      ? Alert.prompt('Reject Request', 'Enter reason for denial:', async (reason) => {
          if (reason) {
            try {
              setProcessingId(req.id);
              await visitorService.rejectVisitorRequest(req.id, reason);
              loadRequests();
            } catch (err: any) {
              Alert.alert('Error', err?.message);
            } finally {
              setProcessingId(null);
            }
          }
        })
      : Alert.alert('Confirm Rejection', 'Reject this visit request?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reject',
            style: 'destructive',
            onPress: async () => {
              try {
                setProcessingId(req.id);
                await visitorService.rejectVisitorRequest(req.id, 'Administrative refusal');
                loadRequests();
              } catch (e: any) {
                Alert.alert('Error', e?.message);
              } finally {
                setProcessingId(null);
              }
            },
          },
        ]);
  };

  const filteredRequests = requests.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      r.visitor_name.toLowerCase().includes(q) ||
      r.visitor_mobile.includes(q) ||
      r.purpose.toLowerCase().includes(q) ||
      (r.student_name && r.student_name.toLowerCase().includes(q))
    );
  });

  const bgColor = isDark ? '#0B0F17' : '#F8FAFC';
  const cardBg = isDark ? '#161E2E' : '#FFFFFF';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#26334A' : '#E2E8F0';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bgColor }]}>
      {/* Header */}
      <TourTarget id="screen.admin-visitors-approvals.overview" native><View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: textColor }]}>Visitor Approvals</Text>
          <Text style={[styles.subTitle, { color: subColor }]}>Pre-registration Requests</Text>
        </View>
      </View></TourTarget>

      {/* Filter Chips */}
      <TourTarget id="screen.admin-visitors-approvals.workspace" native><View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => {
          const isSelected = statusFilter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isSelected ? '#10B981' : cardBg,
                  borderColor: isSelected ? '#10B981' : borderColor,
                },
              ]}
              onPress={() => setStatusFilter(f)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: isSelected ? '#FFFFFF' : textColor },
                ]}
              >
                {f}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View></TourTarget>

      {/* Search Input */}
      <View style={[styles.searchBox, { backgroundColor: cardBg, borderColor }]}>
        <Ionicons name="search" size={18} color={subColor} />
        <TextInput
          style={[styles.searchInput, { color: textColor }]}
          placeholder="Search visitor, student, phone..."
          placeholderTextColor={subColor}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={subColor} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={filteredRequests}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="documents-outline" size={54} color={subColor} />
            <Text style={[styles.emptyTitle, { color: textColor }]}>No Requests Found</Text>
            <Text style={[styles.emptySub, { color: subColor }]}>
              There are no visitor requests matching "{statusFilter}".
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isPending = item.approval_status === 'PENDING';
          const isApproved = item.approval_status === 'APPROVED';
          const isBusy = processingId === item.id;

          return (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={[styles.visitorName, { color: textColor }]}>{item.visitor_name}</Text>
                  <Text style={[styles.visitorMeta, { color: subColor }]}>
                    {item.visitor_mobile} • {item.visitor_type || 'Parent'}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: isApproved
                        ? 'rgba(16,185,129,0.15)'
                        : isPending
                        ? 'rgba(245,158,11,0.15)'
                        : 'rgba(239,68,68,0.15)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: isApproved ? '#10B981' : isPending ? '#F59E0B' : '#EF4444' },
                    ]}
                  >
                    {item.approval_status}
                  </Text>
                </View>
              </View>

              <Text style={[styles.purposeText, { color: textColor }]}>
                Purpose: <Text style={styles.bold}>{item.purpose}</Text>
              </Text>

              <View style={styles.detailsRow}>
                <Text style={[styles.detailText, { color: subColor }]}>
                  Meeting: {item.destination_department || 'School Office'}
                </Text>
                {item.student_name ? (
                  <Text style={[styles.detailText, { color: subColor }]}>
                    Student: {item.student_name}
                  </Text>
                ) : null}
              </View>

              <View style={styles.timeScheduleRow}>
                <Ionicons name="calendar-outline" size={14} color={subColor} />
                <Text style={[styles.scheduleText, { color: subColor }]}>
                  {item.visit_date} • {item.start_time} - {item.end_time} ({item.visitor_count || 1} Person)
                </Text>
              </View>

              {item.pass_code ? (
                <View style={styles.passCodePill}>
                  <Ionicons name="qr-code" size={13} color="#10B981" />
                  <Text style={styles.passCodeText}>Pass: {item.pass_code}</Text>
                </View>
              ) : null}

              {isPending && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.rejectBtn, isBusy && styles.btnDisabled]}
                    onPress={() => handleReject(item)}
                    disabled={isBusy}
                  >
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.approveBtn, isBusy && styles.btnDisabled]}
                    onPress={() => handleApprove(item)}
                    disabled={isBusy}
                  >
                    <Text style={styles.approveBtnText}>
                      {isBusy ? 'Processing...' : 'Approve & Issue Pass'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 6 },
  titleCol: { flex: 1, marginLeft: 10 },
  title: { fontSize: 18, fontWeight: '800' },
  subTitle: { fontSize: 12 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 12, fontWeight: '800' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  visitorName: { fontSize: 16, fontWeight: '800' },
  visitorMeta: { fontSize: 12, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusPillText: { fontSize: 10, fontWeight: '900' },
  purposeText: { fontSize: 13, lineHeight: 18 },
  bold: { fontWeight: '700' },
  detailsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  detailText: { fontSize: 12 },
  timeScheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  scheduleText: { fontSize: 12 },
  passCodePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16,185,129,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  passCodeText: { color: '#10B981', fontSize: 11, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  rejectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  rejectBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },
  approveBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 14 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6 },
});
