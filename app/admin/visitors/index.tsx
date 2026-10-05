import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '@/src/utils/haptics';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService, type VisitorAnalytics, type VisitorRequest } from '@/src/services/visitorService';

export default function AdminVisitorsDashboardScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [analytics, setAnalytics] = useState<VisitorAnalytics | null>(null);
  const [pendingRequests, setPendingRequests] = useState<VisitorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [analyticsData, pendingData] = await Promise.all([
        visitorService.getAnalytics().catch(() => null),
        visitorService.getVisitorRequests({ status: 'PENDING' }).catch(() => []),
      ]);
      if (analyticsData) setAnalytics(analyticsData);
      setPendingRequests(pendingData);
    } catch (e) {
      console.warn('Failed to load admin visitor analytics:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadData();
  };

  const handleApprove = async (req: VisitorRequest) => {
    try {
      setProcessingId(req.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await visitorService.approveVisitorRequest(req.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPendingRequests((prev) => prev.filter((p) => p.id !== req.id));
      if (analytics) {
        setAnalytics({
          ...analytics,
          summary: {
            ...analytics.summary,
            pendingApprovals: Math.max(0, analytics.summary.pendingApprovals - 1),
          },
        });
      }
    } catch (err: any) {
      Alert.alert('Approval Failed', err?.message || 'Could not approve request.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (req: VisitorRequest) => {
    Alert.prompt
      ? Alert.prompt('Reject Visit Request', 'Reason for rejection (sent to visitor):', async (reason) => {
          if (reason) {
            try {
              setProcessingId(req.id);
              await visitorService.rejectVisitorRequest(req.id, reason);
              setPendingRequests((prev) => prev.filter((p) => p.id !== req.id));
              loadData();
            } catch (err: any) {
              Alert.alert('Rejection Error', err?.message || 'Could not reject request.');
            } finally {
              setProcessingId(null);
            }
          }
        })
      : Alert.alert('Reject Request', 'Reject this visit request?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reject',
            style: 'destructive',
            onPress: async () => {
              try {
                setProcessingId(req.id);
                await visitorService.rejectVisitorRequest(req.id, 'Administrative decision');
                setPendingRequests((prev) => prev.filter((p) => p.id !== req.id));
                loadData();
              } catch (e: any) {
                Alert.alert('Error', e?.message);
              } finally {
                setProcessingId(null);
              }
            },
          },
        ]);
  };

  const nav = (path: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path as any);
  };

  const bgColor = isDark ? '#0B0F17' : '#F8FAFC';
  const cardBg = isDark ? '#161E2E' : '#FFFFFF';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#26334A' : '#E2E8F0';

  const summary = analytics?.summary || {
    visitsToday: 0,
    currentlyInside: 0,
    expectedToday: 0,
    pendingApprovals: 0,
    rejectedToday: 0,
    overstayedNow: 0,
    deliveriesToday: 0,
    incidentsToday: 0,
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bgColor }]}>
      {/* Top Header */}
      <View style={[styles.topHeader, { borderBottomColor: borderColor }]}>
        <View style={styles.titleCol}>
          <TourTarget id="screen.admin-visitors.overview" native><Text style={[styles.pageTitle, { color: textColor }]}>Smart Campus Access & Visitors</Text></TourTarget>
          <Text style={[styles.pageSub, { color: subColor }]}>Perimeter Security & Gate Operations Control</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => nav('/admin/visitors/settings')}>
          <Ionicons name="settings-outline" size={20} color={subColor} />
        </TouchableOpacity>
      </View>

      {/* Admin Module Sub-Nav Bar */}
      <TourTarget id="screen.admin-visitors.workspace" native><View style={[styles.navTabsWrap, { backgroundColor: cardBg, borderColor }]}>
        <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navTabsScroll}>
          <TouchableOpacity style={[styles.navTab, styles.navTabActive]}>
            <Ionicons name="analytics" size={15} color="#10B981" />
            <Text style={[styles.navTabText, { color: '#10B981' }]}>Overview</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navTab} onPress={() => nav('/admin/visitors/approvals')}>
            <Ionicons name="time" size={15} color={subColor} />
            <Text style={[styles.navTabText, { color: textColor }]}>
              Approvals {summary.pendingApprovals > 0 ? `(${summary.pendingApprovals})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navTab} onPress={() => nav('/admin/visitors/live')}>
            <Ionicons name="people" size={15} color={subColor} />
            <Text style={[styles.navTabText, { color: textColor }]}>Live Campus</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navTab} onPress={() => nav('/admin/visitors/gates')}>
            <Ionicons name="git-network" size={15} color={subColor} />
            <Text style={[styles.navTabText, { color: textColor }]}>Gates</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navTab} onPress={() => nav('/admin/visitors/watchlist')}>
            <Ionicons name="shield-half" size={15} color={subColor} />
            <Text style={[styles.navTabText, { color: textColor }]}>Watchlist</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navTab} onPress={() => nav('/admin/visitors/settings')}>
            <Ionicons name="options" size={15} color={subColor} />
            <Text style={[styles.navTabText, { color: textColor }]}>Policies</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navTab} onPress={() => nav('/admin/visitors/history')}>
            <Ionicons name="time-outline" size={15} color={subColor} />
            <Text style={[styles.navTabText, { color: textColor }]}>History</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navTab} onPress={() => nav('/admin/visitors/incidents')}>
            <Ionicons name="warning-outline" size={15} color={subColor} />
            <Text style={[styles.navTabText, { color: textColor }]}>Incidents</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navTab} onPress={() => nav('/admin/visitors/emergency')}>
            <Ionicons name="flame-outline" size={15} color={subColor} />
            <Text style={[styles.navTabText, { color: textColor }]}>Emergency</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navTab} onPress={() => nav('/admin/visitors/policies')}>
            <Ionicons name="git-branch-outline" size={15} color={subColor} />
            <Text style={[styles.navTabText, { color: textColor }]}>Rules</Text>
          </TouchableOpacity>
        </TourScrollView>
      </View></TourTarget>

      <TourScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />}
      >
        {/* KPI Metrics Grid */}
        <View style={styles.kpiRow}>
          {/* Currently Inside */}
          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: cardBg, borderColor }]}
            onPress={() => nav('/admin/visitors/live')}
          >
            <View style={styles.kpiTop}>
              <View style={[styles.kpiIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                <Ionicons name="people" size={18} color="#10B981" />
              </View>
              <Text style={[styles.kpiValue, { color: '#10B981' }]}>{summary.currentlyInside}</Text>
            </View>
            <Text style={[styles.kpiTitle, { color: textColor }]}>Currently Inside</Text>
            <Text style={[styles.kpiSub, { color: subColor }]}>Active on campus right now</Text>
          </TouchableOpacity>

          {/* Pending Approvals */}
          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: cardBg, borderColor }]}
            onPress={() => nav('/admin/visitors/approvals')}
          >
            <View style={styles.kpiTop}>
              <View style={[styles.kpiIcon, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                <Ionicons name="hourglass" size={18} color="#F59E0B" />
              </View>
              <Text style={[styles.kpiValue, { color: '#F59E0B' }]}>{summary.pendingApprovals}</Text>
            </View>
            <Text style={[styles.kpiTitle, { color: textColor }]}>Pending Approvals</Text>
            <Text style={[styles.kpiSub, { color: subColor }]}>Awaiting admin/host signoff</Text>
          </TouchableOpacity>

          {/* Expected Today */}
          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: cardBg, borderColor }]}
            onPress={() => nav('/admin/visitors/live')}
          >
            <View style={styles.kpiTop}>
              <View style={[styles.kpiIcon, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                <Ionicons name="calendar" size={18} color="#3B82F6" />
              </View>
              <Text style={[styles.kpiValue, { color: '#3B82F6' }]}>{summary.expectedToday}</Text>
            </View>
            <Text style={[styles.kpiTitle, { color: textColor }]}>Expected Today</Text>
            <Text style={[styles.kpiSub, { color: subColor }]}>Pre-authorized entries</Text>
          </TouchableOpacity>

          {/* Overstay Alerts */}
          <TouchableOpacity
            style={[
              styles.kpiCard,
              {
                backgroundColor: cardBg,
                borderColor: summary.overstayedNow > 0 ? '#EF4444' : borderColor,
              },
            ]}
            onPress={() => nav('/admin/visitors/live')}
          >
            <View style={styles.kpiTop}>
              <View
                style={[
                  styles.kpiIcon,
                  {
                    backgroundColor:
                      summary.overstayedNow > 0
                        ? 'rgba(239,68,68,0.2)'
                        : 'rgba(148,163,184,0.12)',
                  },
                ]}
              >
                <Ionicons
                  name="alarm"
                  size={18}
                  color={summary.overstayedNow > 0 ? '#EF4444' : '#94A3B8'}
                />
              </View>
              <Text
                style={[
                  styles.kpiValue,
                  { color: summary.overstayedNow > 0 ? '#EF4444' : subColor },
                ]}
              >
                {summary.overstayedNow}
              </Text>
            </View>
            <Text style={[styles.kpiTitle, { color: textColor }]}>Overstay Alerts</Text>
            <Text style={[styles.kpiSub, { color: subColor }]}>Duration exceeded</Text>
          </TouchableOpacity>
        </View>

        {/* Pending Approvals Quick Action List */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Pending Visit Approvals ({pendingRequests.length})
            </Text>
            <TouchableOpacity onPress={() => nav('/admin/visitors/approvals')}>
              <Text style={styles.seeAllText}>View All →</Text>
            </TouchableOpacity>
          </View>

          {pendingRequests.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor }]}>
              <Ionicons name="checkmark-done-circle-outline" size={32} color="#10B981" />
              <Text style={[styles.emptyText, { color: subColor }]}>All visit requests are reviewed</Text>
            </View>
          ) : (
            pendingRequests.slice(0, 3).map((req) => {
              const isBusy = processingId === req.id;
              return (
                <View key={req.id} style={[styles.requestCard, { backgroundColor: cardBg, borderColor }]}>
                  <View style={styles.reqTop}>
                    <View>
                      <Text style={[styles.reqName, { color: textColor }]}>{req.visitor_name}</Text>
                      <Text style={[styles.reqMeta, { color: subColor }]}>
                        {req.visitor_mobile} • {req.visitor_type || 'Parent'}
                      </Text>
                    </View>
                    <View style={styles.pendingPill}>
                      <Text style={styles.pendingPillText}>PENDING</Text>
                    </View>
                  </View>

                  <Text style={[styles.reqPurpose, { color: textColor }]}>
                    Purpose: <Text style={styles.bold}>{req.purpose}</Text>
                  </Text>
                  <Text style={[styles.reqDetails, { color: subColor }]}>
                    Meeting: {req.destination_department || 'Class Teacher'} • Date: {req.visit_date} ({req.start_time} - {req.end_time})
                  </Text>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.rejectBtn, isBusy && styles.disabledBtn]}
                      onPress={() => handleReject(req)}
                      disabled={isBusy}
                    >
                      <Text style={styles.rejectBtnText}>Reject</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.approveBtn, isBusy && styles.disabledBtn]}
                      onPress={() => handleApprove(req)}
                      disabled={isBusy}
                    >
                      <Text style={styles.approveBtnText}>
                        {isBusy ? 'Processing...' : 'Approve & Issue Pass'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Analytics Breakdown Cards */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Visitor Breakdown & Influx</Text>
          <View style={[styles.breakdownCard, { backgroundColor: cardBg, borderColor }]}>
            {analytics?.categories && analytics.categories.length > 0 ? (
              analytics.categories.map((c, idx) => (
                <View key={idx} style={styles.categoryBarRow}>
                  <View style={styles.catLabelCol}>
                    <Text style={[styles.catName, { color: textColor }]}>{c.category}</Text>
                    <Text style={[styles.catCount, { color: subColor }]}>{c.count} visits</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.min(100, (c.count / (summary.visitsToday || 1)) * 100)}%`,
                          backgroundColor: idx === 0 ? '#10B981' : idx === 1 ? '#3B82F6' : '#F59E0B',
                        },
                      ]}
                    />
                  </View>
                </View>
              ))
            ) : (
              <Text style={[styles.emptyText, { color: subColor }]}>
                {summary.visitsToday} total visits recorded today across all campus gates.
              </Text>
            )}
          </View>
        </View>
      </TourScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleCol: { flex: 1 },
  pageTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  pageSub: { fontSize: 12, marginTop: 2 },
  settingsBtn: { padding: 8 },
  navTabsWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navTabsScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  navTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(150,150,150,0.08)',
  },
  navTabActive: { backgroundColor: 'rgba(16,185,129,0.15)' },
  navTabText: { fontSize: 13, fontWeight: '700' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  kpiCard: {
    width: '48.5%',
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  kpiTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  kpiIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: { fontSize: 24, fontWeight: '900' },
  kpiTitle: { fontSize: 13, fontWeight: '800' },
  kpiSub: { fontSize: 10, marginTop: 2 },
  sectionWrap: { marginBottom: 20 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  seeAllText: { color: '#10B981', fontSize: 13, fontWeight: '700' },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyText: { fontSize: 13 },
  requestCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    gap: 6,
  },
  reqTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reqName: { fontSize: 15, fontWeight: '800' },
  reqMeta: { fontSize: 12, marginTop: 2 },
  pendingPill: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pendingPillText: { color: '#F59E0B', fontSize: 10, fontWeight: '800' },
  reqPurpose: { fontSize: 13 },
  bold: { fontWeight: '700' },
  reqDetails: { fontSize: 12 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  rejectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  rejectBtnText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  approveBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  disabledBtn: { opacity: 0.6 },
  breakdownCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  categoryBarRow: { gap: 4 },
  catLabelCol: { flexDirection: 'row', justifyContent: 'space-between' },
  catName: { fontSize: 13, fontWeight: '700' },
  catCount: { fontSize: 12 },
  barTrack: {
    height: 8,
    backgroundColor: 'rgba(150,150,150,0.15)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
});
